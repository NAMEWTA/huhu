import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { HuhuError, errors, newId, type ExecutionBinding } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { isValidNativeId, isWithin, isPiHistoryFile } from "./history/scanner.js";
import { agentById, type AgentId } from "../shared/catalog.js";
import { redactSecrets, shellCommand, type ShellName } from "../shared/shell.js";
import { matchesProtectedDirectory, type ProtectedDirectory, type ProtectedLaunch } from "./protected-launch.js";
import type { HistoryLaunch, ResolvedLaunch, ResolveInput } from "./launch.js";
import { hasLaunchLabels, identifyCore, launchHash, launchLabels, processBinding, sameCore, sameProcess, type LaunchAttempt, type LaunchReceipt, type ProcessBinding, type Terminal } from "./launch-binding.js";
import type { SpaceStore } from "./spaces.js";
import type { InputOwnership } from "./input-ownership.js";
import type { CodexDispatch } from "./codex-dispatch.js";
import type { NativeAnswer, NativeAnswerStatus } from "./native-answer.js";
import type { NativeStop, NativeStopStatus } from "./native-stop.js";
import type { AgentEnvironmentApproval, AgentEnvironmentSelection, InteractiveEnvironment, InteractiveNativePlan } from "./interactive-environment.js";
import { nativeAgentEnvironment, nativeHostPlatform, NativePtyBroker, type ApprovedLinuxShell, type BrokerOutcome, type NativeLaunchPlan } from "./native-pty.js";

export interface SessionRecord {
  id: string;
  spaceId: string;
  provider: AgentId | "shell";
  model: string | null;
  state: "launching" | "running" | "exited" | "failed" | "unknown";
  /** state=exited：程序的退出码（拿不到为 null）与结束时间。 */
  exitCode?: number | null;
  exitedAt?: string;
  requestId: string;
  launchReceipt?: LaunchReceipt;
  controlled?: "codex";
  terminalId: string | null;
  name: string;
  cwd: string;
  createdAt: string;
  /** 由历史恢复启动时记录 provider 原生会话 id。 */
  nativeSessionId?: string;
  /** Exact local history reference when the session was opened from a record. */
  historyId?: string;
  /** 终端命令会话（automations 的 terminal 动作）：显示用，不含环境变量。 */
  command?: string;
  /** 启动时带受保护环境变量。只存布尔值，用于输出脱敏与终端清理。 */
  hasEnv?: boolean;
  /** 变更审查意见（随会话记录保存）。 */
  reviewComments?: ReviewComment[];
  /** 程序经 OSC 7501 上报 blocked（等人工）的状态；`n` 是第几次进入 blocked，发生标识 = `<会话 id>:<n>`，重连、重启 Engine 不会重复处理。 */
  waiting?: WaitingInfo;
  error?: string;
}

export function publicSession({ launchReceipt: _launchReceipt, controlled: _controlled, ...session }: SessionRecord): Omit<SessionRecord, "launchReceipt" | "controlled"> {
  if (!session.waiting) return session;
  const { ownerDispatchId: _, ...waiting } = session.waiting;
  return { ...session, waiting };
}

export function sessionGeneration(session: SessionRecord): string | undefined {
  const attempt = session.launchReceipt?.attempt;
  return attempt?.binding && launchHash({ attemptId: attempt.id, core: attempt.core, process: attempt.binding });
}

export interface ReviewComment {
  id: string;
  path: string;
  side: "old" | "new";
  line: number;
  text: string;
  createdAt: string;
  sentAt: string | null;
  /** 正在发送：崩溃后停留在这个状态说明“是否已送达未知”，需要用户明确选择再发。 */
  sending?: boolean;
}

export interface WaitingInfo {
  n: number;
  /** 当前是否仍在等待。 */
  active: boolean;
  /** 终端结束时仍未解除：提示过期。 */
  expired?: boolean;
  kind: string | null;
  msg: string | null;
  app: string | null;
  since: string;
  /** 独立会话自动建立的 human 任务。 */
  taskId?: string;
  /** 本次等待发生所属的原任务与运行。 */
  taskRun?: { taskId: string; runId: string };
  /** 一旦看到归属，仅能核对本次等待的原派遣。 */
  ownerDispatchId?: string;
  /** 已完成通知 / 评论的最近一次发生（等于 n 表示这次已处理；不等说明上次处理失败，重连后重试）。 */
  handled?: number;
}
export interface ProgramStatus {
  state: string;
  kind?: string | null;
  msg?: string | null;
  app?: string | null;
}

const MAX_COMMENTS = 200;
// Core 0.1.19 on Windows fails at 259 UTF-16 code units, including with an extended path.
const MAX_WINDOWS_CORE_CWD = 258;
const localDrivePath = (directory: string): string => (process.platform === "win32" ? directory.replace(/^\\\\\?\\(?=[a-z]:\\)/i, "") : directory);
const hasControl = (s: string): boolean => {
  for (const ch of s) {
    const n = ch.codePointAt(0) as number;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
};
/** 写进终端的路径：只保留字母数字（含中文等）和 . _ - / @ + ~ 空格，其余一律换成 _（文件名里的 ; $ ` | 等不能被 shell 解释）。 */
const safePath = (p: string): string => Array.from(p, (ch) => (/[\p{L}\p{N}._\-/@+~ ]/u.test(ch) ? ch : "_")).join("");
/** C0、DEL 与 C1 控制字符（如 U+009B）都不进终端：替换成空格并压缩空白。 */
const noControl = (s: string): string =>
  Array.from(s, (ch) => {
    const c = ch.codePointAt(0) as number;
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

export interface LaunchInput {
  spaceId: string;
  spaceRevision: number;
  provider: AgentId | "shell";
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
  prompt?: string | undefined;
  requestId: string;
  /** 分栏发起的启动只可使用首次接受的工作区操作重查。 */
  workspaceIntent?: string;
  /** 恢复历史会话（仅内部调用：id 来自对历史的扫描结果，不由外部直接传入）。 */
  resumeSessionId?: string | undefined;
  history?: (HistoryLaunch & { sourceId: string; revision?: string }) | undefined;
  /** 显式 cwd 必须是 Space 范围内的现有绝对目录。 */
  cwd?: string | undefined;
  /** 终端命令（只与 provider=shell 一起用）：以 `argv = [shell, -c, command]` 运行，能拿到退出码。 */
  command?: string | undefined;
  shell?: ShellName | undefined;
  /** 由经过授权的 Engine 调用者解析，在目标子进程启动时使用。 */
  env?: Record<string, string> | undefined;
  /** 私有受保护启动票据的批准工作目录。 */
  approvedDirectory?: ProtectedDirectory;
  /** Private proof supplied by the approved Linux terminal-rule service. */
  approvedShell?: ApprovedLinuxShell;
  expectedConfigurationId?: string;
  controlled?: "codex";
  environment?: AgentEnvironmentApproval;
}

type TerminalSnapshot = { kind: "available"; client: HerdrClient; core: Awaited<ReturnType<typeof identifyCore>>; terminals: Terminal[] } | { kind: "absent" | "unavailable" };
type LaunchIntent = { literalHash: string; resolvedHash: string | null };
type LaunchIndex = Pick<LaunchReceipt, "vaultId" | "machineId" | "intentHash" | "executionHash" | "literalIntentHash"> & { requestId: string; sessionId: string };
type ApprovedShellInput = Pick<LaunchInput, "spaceId" | "spaceRevision" | "requestId" | "shell"> & {
  provider: "shell";
  command: string;
  names: readonly string[];
  use: NativeDelivery["use"];
  onPending: NonNullable<NativeDelivery["onPending"]>;
  approvedDirectory: ProtectedDirectory;
  approvedShell: ApprovedLinuxShell;
};
type NativeDelivery = Pick<InteractiveNativePlan, "helper" | "launch" | "approval"> & {
  use(consumer: (values: ReadonlyMap<string, string>) => Promise<BrokerOutcome>, signal: AbortSignal): Promise<BrokerOutcome>;
  onPending?: (completion: Promise<SessionRecord>) => void;
};
type NativeBroker = Pick<NativePtyBroker, "waiting" | "hostArgv" | "inspectHost" | "start" | "revoke">;
type VerifiedNativeHost = { terminal: Terminal; binding: ProcessBinding; host: NonNullable<Awaited<ReturnType<NativeBroker["inspectHost"]>>> };

export interface SessionsDeps {
  dir: string;
  vaultId: string;
  spaces: SpaceStore;
  core(): Promise<HerdrClient>;
  /** 只读检查用：Core 在运行才返回客户端，不启动它（缺省退回 core()）。 */
  peekCore?(): Promise<HerdrClient | "absent" | null>;
  /** 合成启动命令（agent-cli 的 resolveAgentLaunch，已绑定当前 Vault 的设置与检测结果）。 */
  resolve(input: ResolveInput): Promise<ResolvedLaunch>;
  now(): Date;
  inputOwnership?: InputOwnership;
  codex?: CodexDispatch | undefined;
  protectedLaunch?: ProtectedLaunch | undefined;
  interactiveEnvironment?: InteractiveEnvironment;
  nativeBroker?: (helper: NativeDelivery["helper"], signal?: AbortSignal) => NativeBroker;
  signal?: AbortSignal;
}

/** 交互会话：先持久化记录，再 terminal.run；响应丢失时按 huhu.launch 标签找回，绝不重复 run。 */
export class SessionsService {
  constructor(private readonly d: SessionsDeps) {}

  private file(id: string): string {
    return path.join(this.d.dir, `${id}.json`);
  }
  private save(s: SessionRecord): void {
    this.d.signal?.throwIfAborted();
    mkdirSync(this.d.dir, { recursive: true });
    const tmp = `${this.file(s.id)}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2), { flush: true });
    renameSync(tmp, this.file(s.id)); // 原子替换：崩溃时不会留下写到一半的记录（“发送中”标记依赖它）
  }

  private requestFile(requestId: string): string {
    return path.join(path.dirname(this.d.dir), "launch-requests", launchHash(requestId) + ".json");
  }

  private readSessionFile(name: string): SessionRecord {
    const session = JSON.parse(readFileSync(path.join(this.d.dir, name), "utf8")) as SessionRecord | null;
    if (!session || typeof session.id !== "string" || name !== session.id + ".json" || typeof session.requestId !== "string" || typeof session.createdAt !== "string") {
      throw new Error("Session file has no verifiable identity");
    }
    return session;
  }

  private recordLaunchRequest(session: SessionRecord, { vaultId, machineId, intentHash, executionHash, literalIntentHash }: LaunchReceipt): void {
    const file = this.requestFile(session.requestId);
    if (existsSync(file)) {
      if (this.recordedLaunch(session.requestId)?.id !== session.id) throw this.unknown(session, "launch_receipt_unavailable");
      return;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    const index: LaunchIndex = { vaultId, machineId, intentHash, executionHash, ...(literalIntentHash ? { literalIntentHash } : {}), requestId: session.requestId, sessionId: session.id };
    // The request remains recognizable even if its session file is later interrupted, damaged or removed.
    try {
      writeFileSync(file, JSON.stringify(index), { flag: "wx", flush: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw this.unknown(session, "launch_receipt_unavailable");
      throw error;
    }
  }

  private recordedLaunch(requestId: string): SessionRecord | undefined {
    const unavailable = (id?: string) => this.unknown({ requestId, ...(id ? { id } : {}) }, "launch_receipt_unavailable");
    let contents: string | undefined;
    try {
      contents = readFileSync(this.requestFile(requestId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw unavailable();
    }
    if (contents !== undefined) {
      let id: string | undefined;
      try {
        const index = JSON.parse(contents) as LaunchIndex;
        if (index.requestId !== requestId || index.vaultId !== this.d.vaultId || index.machineId !== this.d.spaces.machineId || !/^sess-[a-z0-9-]+$/i.test(index.sessionId)) {
          throw unavailable();
        }
        id = index.sessionId;
        const session = this.readSessionFile(id + ".json");
        const receipt = session.launchReceipt;
        if (
          session.requestId !== requestId ||
          !receipt ||
          receipt.vaultId !== index.vaultId ||
          receipt.machineId !== index.machineId ||
          receipt.intentHash !== index.intentHash ||
          receipt.executionHash !== index.executionHash ||
          (index.literalIntentHash !== undefined && receipt.literalIntentHash !== index.literalIntentHash)
        )
          throw unavailable(id);
        return session;
      } catch {
        throw unavailable(id);
      }
    }

    // Before the index existed, a damaged file could contain the very request being retried.
    const files = this.sessionFiles();
    let match: SessionRecord | undefined;
    let unreadable = false;
    for (const file of files) {
      let session: SessionRecord;
      try {
        session = this.readSessionFile(file);
      } catch {
        unreadable = true;
        continue;
      }
      if (session.requestId !== requestId) continue;
      if (match || (session.launchReceipt && !this.localReceipt(session.launchReceipt))) throw unavailable();
      match = session;
    }
    if (unreadable && !match?.launchReceipt?.attempt) throw unavailable(match?.id);
    return match;
  }

  private sessionFiles(): string[] {
    try {
      return readdirSync(this.d.dir).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private localReceipt(receipt: LaunchReceipt): boolean {
    return receipt.vaultId === this.d.vaultId && receipt.machineId === this.d.spaces.machineId;
  }

  list(spaceId?: string): SessionRecord[] {
    return this.sessionFiles()
      .flatMap((f) => {
        try {
          return [this.readSessionFile(f)];
        } catch {
          return [];
        }
      }) // 单个记录损坏不拖垮整个列表
      .filter((s) => (!s.launchReceipt || this.localReceipt(s.launchReceipt)) && (!spaceId || s.spaceId === spaceId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): SessionRecord {
    const s = this.list().find((x) => x.id === id);
    if (!s) throw errors.notFound("会话不存在");
    return s;
  }

  private readonly inflight = new Map<string, { intent: LaunchIntent; executionHash: string | undefined; signal: AbortSignal | undefined; result: Promise<SessionRecord> }>();
  private readonly nativeAttempts = new Map<string, string>();

  private launchIntent({ requestId: _requestId, env: _env, cwd, ...intent }: LaunchInput, preparedCwd?: string): LaunchIntent {
    const literal = cwd && path.isAbsolute(cwd) ? localDrivePath(path.normalize(cwd)) : cwd;
    const literalHash = launchHash({ ...intent, cwd: literal });
    if (preparedCwd !== undefined) return { literalHash, resolvedHash: launchHash({ ...intent, cwd: preparedCwd }) };
    if (cwd && path.isAbsolute(cwd)) {
      try {
        return { literalHash, resolvedHash: launchHash({ ...intent, cwd: localDrivePath(realpathSync(cwd)) }) };
      } catch {
        return { literalHash, resolvedHash: null };
      }
    }
    return { literalHash, resolvedHash: literalHash };
  }

  async launchApprovedShell(input: ApprovedShellInput, signal?: AbortSignal): Promise<SessionRecord> {
    const { names, use, onPending, ...launch } = input;
    const { argv, executable } = launch.approvedShell;
    if (
      nativeHostPlatform() !== "linux" ||
      input.provider !== "shell" ||
      input.shell !== "sh" ||
      argv.length !== 3 ||
      argv[0] !== executable.path ||
      argv[1] !== "-c" ||
      argv[2] !== input.command ||
      !path.isAbsolute(executable.path) ||
      path.normalize(executable.path) !== executable.path
    ) {
      throw errors.permissionDenied("无法使用已批准的 Linux sh 执行映像");
    }
    if (!names.length || names.length > 32 || new Set(names).size !== names.length || names.some((name) => !/^HUHU_RULE_SECRET_[A-Z0-9_]{1,80}$/.test(name))) {
      throw errors.invalidInput("已批准的规则环境无效");
    }
    return this.launch(launch, signal, { names, use, onPending });
  }

  async launch(input: LaunchInput, callerSignal?: AbortSignal, approvedDelivery?: Pick<ApprovedShellInput, "names" | "use" | "onPending">): Promise<SessionRecord> {
    const signal = callerSignal && this.d.signal ? AbortSignal.any([callerSignal, this.d.signal]) : (callerSignal ?? this.d.signal);
    signal?.throwIfAborted();
    const intent = this.launchIntent(input);
    const previous = this.recordedLaunch(input.requestId);
    if (previous) this.verifyIntent(previous, intent);
    if (previous?.launchReceipt?.attempt && input.history) return this.doLaunch(input, intent, undefined, undefined, signal, undefined);

    const canTrackPi = input.provider === "pi" && !input.environment && !input.history && !input.resumeSessionId && !input.expectedConfigurationId;
    const newPiId = canTrackPi ? `huhu-${launchHash([this.d.vaultId, input.spaceId, input.requestId])}` : undefined;
    const trackPi = !previous || previous.nativeSessionId === newPiId ? newPiId : undefined;
    let prepared: Awaited<ReturnType<SessionsService["prepareLaunch"]>> | undefined;
    let native: NativeDelivery | undefined;
    let environmentApproval: string | undefined;
    try {
      prepared = await this.prepareLaunch(input, trackPi);
      if (previous?.launchReceipt?.attempt && trackPi && prepared.nativeSessionId !== trackPi) {
        // The original process is still authoritative when the current Pi probe cannot reconstruct its command.
        prepared = undefined;
      }
      if (prepared && input.environment && !previous?.launchReceipt?.attempt) {
        const plan = await this.prepareEnvironment(input, input.environment, prepared);
        if (plan.approval !== input.environment.approval) throw new HuhuError("VERSION_CONFLICT", "程序、目录或环境已变化，请重新预览");
        if (plan.kind === "native") {
          native = {
            ...plan,
            use: async (consumer, waiting) => {
              waiting.throwIfAborted();
              return this.d.interactiveEnvironment!.use(plan, consumer);
            },
          };
        } else {
          prepared = { ...prepared, env: Object.keys(plan.env).length ? plan.env : undefined };
          environmentApproval = plan.approval;
        }
      } else if (prepared && input.approvedShell && !previous?.launchReceipt?.attempt) {
        if (!approvedDelivery) throw errors.permissionDenied("缺少已批准的保护值领取操作");
        native = await this.prepareApprovedShell(input, prepared.cwd, approvedDelivery);
      }
    } catch (error) {
      // A sent operation remains queryable even when its old directory or executable is gone.
      if (!previous?.launchReceipt?.attempt) throw error;
    }
    signal?.throwIfAborted();
    if (prepared && input.cwd !== undefined && this.launchIntent(input, prepared.cwd).resolvedHash !== intent.resolvedHash) {
      throw new HuhuError("VERSION_CONFLICT", "预检期间工作目录发生变化，请重新选择");
    }
    const executionHash = (input.environment || input.approvedShell) && previous?.launchReceipt?.attempt ? undefined : prepared && (native?.approval ?? environmentApproval ?? this.configurationId(prepared));
    if (input.expectedConfigurationId && prepared?.env) this.rejectDispatchEnvironment();
    if (input.expectedConfigurationId && executionHash && input.expectedConfigurationId !== executionHash) {
      throw new HuhuError("VERSION_CONFLICT", "已冻结的启动配置发生变化");
    }
    const running = this.inflight.get(input.requestId);
    if (running) {
      const sameIntent = intent.resolvedHash === null ? running.intent.literalHash === intent.literalHash : running.intent.resolvedHash === intent.resolvedHash;
      if (!sameIntent || (executionHash && running.executionHash && executionHash !== running.executionHash)) throw errors.idempotencyMismatch();
      if (!running.signal?.aborted) return running.result;
    }
    const result = this.doLaunch(input, intent, executionHash, prepared, signal, native).finally(() => {
      if (this.inflight.get(input.requestId)?.result === result) this.inflight.delete(input.requestId);
    });
    this.inflight.set(input.requestId, { intent, executionHash, result, signal });
    return result;
  }

  private launchDirectory(root: string, cwd: string | undefined): string {
    if (cwd === undefined) return root;
    if (path.isAbsolute(cwd)) {
      try {
        const explicit = realpathSync(cwd);
        if (isWithin(localDrivePath(realpathSync(root)), localDrivePath(explicit)) && statSync(explicit).isDirectory()) return explicit;
      } catch {
        // 不存在或不可访问。
      }
    }
    throw errors.invalidInput("启动目录必须是 Space 内现有的绝对目录");
  }

  private async prepareLaunch(input: Omit<LaunchInput, "requestId">, newPiId?: string) {
    const space = this.d.spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    // cmd.exe 把盘符的扩展路径当作 UNC。常规长度的本机路径可用普通盘符形式启动。
    const cwd = localDrivePath(this.launchDirectory(space.root, input.cwd));
    const approvedDirectory = input.approvedDirectory;
    if (approvedDirectory && !matchesProtectedDirectory(cwd, approvedDirectory)) throw this.approvedDirectoryChanged();
    if (process.platform === "win32" && cwd.length > MAX_WINDOWS_CORE_CWD) {
      throw new HuhuError("INVALID_INPUT", "Windows 上的 Herdr Core 无法在此长度的工作目录中启动，请选择较短的目录", {
        details: { stage: "cwd", reason: "windows_cwd_too_long", maxLength: MAX_WINDOWS_CORE_CWD },
      });
    }
    if (input.resumeSessionId !== undefined && !isValidNativeId(input.resumeSessionId)) throw errors.invalidInput("会话 id 无效");
    let argv: string[] | undefined;
    let env: Record<string, string> | undefined;
    let nativeSessionId: string | undefined;
    let controlled: Awaited<ReturnType<CodexDispatch["prepare"]>> | undefined;
    if (input.controlled) {
      if (!this.d.codex || input.provider !== "codex" || input.prompt !== undefined || input.resumeSessionId !== undefined || input.history !== undefined || input.command !== undefined || input.env !== undefined)
        throw errors.invalidInput("受控 Codex 仅支持新会话");
      controlled = await this.d.codex.prepare(input);
    } else if (input.command !== undefined) {
      if (input.provider !== "shell") throw errors.invalidInput("command 只能与终端（shell）一起用");
      argv = input.approvedShell?.argv ?? shellCommand(input.shell ?? "default", input.command);
      if (input.env && Object.keys(input.env).length > 0) env = input.env;
    } else if (input.provider !== "shell") {
      const r = await this.d.resolve({ agentId: input.provider, mode: "interactive", model: input.model, effort: input.effort, fast: input.fast, prompt: input.prompt, resume: input.resumeSessionId, history: input.history, newPiId });
      argv = [r.command, ...r.argv];
      env = Object.keys(r.env).length > 0 ? r.env : undefined;
      nativeSessionId = r.nativeSessionId;
    }
    if (approvedDirectory && (input.provider !== "shell" || !(env || input.approvedShell) || !argv)) throw errors.invalidInput("批准的工作目录仅用于受保护终端命令");
    return { space, cwd, argv, env, controlled, nativeSessionId };
  }

  private async prepareApprovedShell(input: LaunchInput, cwd: string, delivery: Pick<ApprovedShellInput, "names" | "use" | "onPending">): Promise<NativeDelivery> {
    const { approvedDirectory, approvedShell } = input;
    const host = this.d.interactiveEnvironment;
    if (!host || !approvedDirectory || !approvedShell) throw errors.permissionDenied("本机 Linux sh 受保护宿主不可用");
    const helper = await host.pinHelper();
    const identity = (value: string, created: string) => {
      const match = /^(\d{1,20}):(\d{1,20})$/.exec(value);
      if (!match || !/^\d{1,20}$/.test(created)) throw errors.invalidInput("Linux sh 的批准文件身份无效");
      return { volume: match[1]!, index: match[2]!, created };
    };
    const { executable, argv } = approvedShell;
    const launch: NativeLaunchPlan = {
      approvedShell: executable,
      directory: { path: cwd, id: identity(approvedDirectory.identity, approvedDirectory.birthtimeNs) },
      image: { path: executable.path, sha256: executable.sha256, id: identity(executable.identity, executable.ctimeNs) },
      files: [],
      argv,
      ordinary: nativeAgentEnvironment(process.env, {}),
      protect: [...delivery.names].sort(),
    };
    return { helper, launch, approval: launchHash({ helper, launch }), use: delivery.use, onPending: delivery.onPending };
  }

  private async prepareEnvironment(input: Omit<LaunchInput, "requestId" | "environment">, selection: AgentEnvironmentSelection, prepared: Awaited<ReturnType<SessionsService["prepareLaunch"]>>) {
    const { interactiveEnvironment } = this.d;
    if (!interactiveEnvironment || input.controlled || input.command !== undefined || input.env !== undefined || input.approvedDirectory) throw errors.invalidInput("当前启动方式无法使用本机环境");
    return interactiveEnvironment.prepare(selection, input.provider, prepared.cwd, prepared.argv, prepared.env);
  }

  async previewEnvironment(input: Omit<LaunchInput, "requestId" | "environment">, selection: AgentEnvironmentSelection) {
    const prepared = await this.prepareLaunch(input);
    const plan = await this.prepareEnvironment(input, selection, prepared);
    const environment = { ...selection, approval: plan.approval };
    if (plan.kind === "ordinary") return { environment, cwd: prepared.cwd, argv: prepared.argv ?? [], ordinaryNames: Object.keys(plan.env).sort(), protectedNames: [] };
    const { launch } = plan;
    return { environment, cwd: launch.directory.path, argv: launch.argv, ordinaryNames: Object.keys(launch.ordinary).sort(), protectedNames: launch.protect };
  }

  /** 已保存配置的会话预览。Core 默认 shell 由 Core 配置选择。 */
  async preview(input: Omit<LaunchInput, "requestId" | "env" | "resumeSessionId">): Promise<{ machineId: string; cwd: string; command: string | null; argv: string[] }> {
    const { space, cwd, argv } = await this.prepareLaunch(input);
    const [command, ...args] = argv ?? [];
    return { machineId: space.machineId, cwd, command: command ?? null, argv: args };
  }

  async freezeLaunch(input: Omit<LaunchInput, "requestId">): Promise<string> {
    const prepared = await this.prepareLaunch(input);
    if (prepared.env) this.rejectDispatchEnvironment();
    return this.configurationId(prepared);
  }

  private rejectDispatchEnvironment(): never {
    throw errors.invalidInput("受控派遣暂不支持额外环境变量", { reason: "dispatch_environment_unavailable" });
  }

  private configurationId(prepared: Awaited<ReturnType<SessionsService["prepareLaunch"]>>): string {
    return launchHash({
      machineId: prepared.space.machineId,
      cwd: prepared.cwd,
      argv: prepared.argv,
      controlled: prepared.controlled,
      envNames: Object.keys(prepared.env ?? {}).sort(),
    });
  }

  private unknown(session: { requestId: string; id?: string }, reason: string): HuhuError {
    return new HuhuError("RUN_UNKNOWN", "启动结果待核实，请用原启动请求重查", {
      retryable: true,
      details: { stage: "run", reason, requestId: session.requestId, ...(session.id ? { sessionId: session.id } : {}) },
    });
  }

  private verifyIntent(session: SessionRecord, intent: LaunchIntent, executionHash?: string): LaunchReceipt {
    const receipt = session.launchReceipt;
    if (!receipt) throw this.unknown(session, "legacy_record");
    const sameIntent = intent.resolvedHash === null ? !!receipt.attempt && receipt.literalIntentHash === intent.literalHash : receipt.intentHash === intent.resolvedHash;
    if (!sameIntent || (executionHash && receipt.executionHash !== executionHash)) throw errors.idempotencyMismatch();
    return receipt;
  }

  private async doLaunch(
    input: LaunchInput,
    intent: LaunchIntent,
    executionHash: string | undefined,
    prepared: Awaited<ReturnType<SessionsService["prepareLaunch"]>> | undefined,
    signal: AbortSignal | undefined,
    native: NativeDelivery | undefined,
  ): Promise<SessionRecord> {
    const previous = this.recordedLaunch(input.requestId);
    const priorReceipt = previous && this.verifyIntent(previous, intent, executionHash);
    if (previous && priorReceipt?.attempt) {
      this.recordLaunchRequest(previous, priorReceipt);
      if (previous.state === "exited") return previous;
      return this.findLaunch(previous, signal);
    }
    if (!prepared || !executionHash || !intent.resolvedHash) throw errors.invalidInput("启动配置不可用");

    const { space, cwd, env, controlled } = prepared;
    const redactEnv = env && !native && !input.environment ? env : undefined;
    this.d.spaces.validateForLaunch(space.id, input.spaceRevision);
    let { argv } = prepared;
    const receipt: LaunchReceipt = priorReceipt ?? {
      vaultId: this.d.vaultId,
      machineId: space.machineId,
      intentHash: intent.resolvedHash,
      literalIntentHash: intent.literalHash,
      executionHash,
      argvHash: argv ? launchHash(argv) : null,
    };
    const history = input.history;
    const nativeSessionId = history ? (history.mode === "resume" ? history.nativeId : history.forkId) : (prepared.nativeSessionId ?? input.resumeSessionId);
    if (history?.file && !isPiHistoryFile(history.file, history.nativeId, history.sourceId, history.revision)) throw errors.notFound("原 Pi 会话文件已变化，请重新选择");
    const session: SessionRecord = previous ?? {
      id: newId("cap").replace(/^cap-/, "sess-"),
      spaceId: space.id,
      provider: input.provider,
      model: input.model ?? null,
      state: "launching",
      requestId: input.requestId,
      terminalId: null,
      name: input.command !== undefined ? "命令：" + input.command.replace(/\s+/g, " ").slice(0, 40) : input.provider === "shell" ? "终端" : (agentById(input.provider)?.displayName ?? input.provider),
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.approvedShell || redactEnv ? { hasEnv: true } : {}),
      cwd,
      createdAt: this.d.now().toISOString(),
      ...(nativeSessionId ? { nativeSessionId } : {}),
      ...(history?.mode === "resume" ? { historyId: history.sourceId } : {}),
      ...(input.controlled ? { controlled: input.controlled } : {}),
      launchReceipt: receipt,
    };
    this.recordLaunchRequest(session, receipt);
    this.save(session);
    let client: HerdrClient;
    let core: Awaited<ReturnType<typeof identifyCore>>;
    let protectedPort: number | undefined;
    try {
      if (!native && input.command !== undefined && env) {
        if (!this.d.protectedLaunch) throw new Error("Missing protected shell launcher");
        protectedPort = await this.d.protectedLaunch.listen();
      }
      client = await this.d.core();
      signal?.throwIfAborted();
      core = await identifyCore(client);
    } catch {
      signal?.throwIfAborted();
      const current = this.currentLaunch(session, intent, executionHash);
      if (current.launchReceipt?.attempt) return this.findLaunch(current, signal);
      throw this.confirmNotCreated(current, receipt, "connect", "连接 Herdr Core 失败，启动请求尚未发送");
    }
    signal?.throwIfAborted();
    if (native) return this.launchNative(native, session, receipt, intent, client, core, signal);
    if (input.environment) {
      try {
        const currentPlan = await this.prepareEnvironment(input, input.environment, prepared);
        if (currentPlan.kind !== "ordinary" || currentPlan.approval !== executionHash) throw new HuhuError("VERSION_CONFLICT", "启动环境已变化，请重新预览");
        signal?.throwIfAborted();
      } catch (error) {
        const current = this.currentLaunch(session, intent, executionHash);
        if (current.launchReceipt?.attempt) return this.findLaunch(current, signal);
        this.save({ ...current, state: "failed", error: "启动环境未通过提交前复核，启动请求尚未发送。" });
        throw error;
      }
    }
    // The Vault writer makes this read, claim and synchronous RPC submission a single turn.
    // Another service may have claimed the same request while this connection was opening.
    const current = this.currentLaunch(session, intent, executionHash);
    if (current.launchReceipt?.attempt) return this.findLaunch(current, signal);
    this.d.spaces.validateForLaunch(space.id, input.spaceRevision);
    if (history?.file && !isPiHistoryFile(history.file, history.nativeId, history.sourceId, history.revision)) {
      throw this.confirmNotCreated(current, receipt, "run", "原 Pi 会话文件已变化，启动请求尚未发送");
    }
    if (input.approvedDirectory && !matchesProtectedDirectory(cwd, input.approvedDirectory)) {
      const changed = this.approvedDirectoryChanged();
      this.save({ ...current, state: "failed", error: changed.message });
      throw changed;
    }
    const attempt = { id: randomUUID(), core };
    if (controlled) {
      argv = this.d.codex!.start(controlled, { vaultId: receipt.vaultId, machineId: receipt.machineId, sessionId: session.id, attempt: attempt.id, coreId: core.id });
    }
    const ticket = protectedPort && env && argv ? this.d.protectedLaunch!.issue(protectedPort, argv, env, input.approvedDirectory) : undefined;
    if (ticket) argv = ticket.argv;
    let pending: SessionRecord = { ...current, state: "launching", launchReceipt: { ...receipt, ...((controlled || ticket) && { argvHash: launchHash(argv) }), attempt } };
    try {
      delete pending.error;
      this.save(pending);
    } catch (error) {
      ticket?.revoke();
      throw error;
    }
    if (redactEnv) this.secrets.set(session.id, Object.values(redactEnv));
    let terminal: Terminal | undefined;
    let rejectedBeforeCreation = false;
    try {
      const terminalEnv = controlled || ticket ? { ELECTRON_RUN_AS_NODE: "1" } : env;
      terminal = await client.call<Terminal>("terminal.run", { ...(argv ? { argv } : {}), cwd, ...(terminalEnv ? { env: terminalEnv } : {}), labels: launchLabels(this.d.vaultId, pending), name: session.id });
    } catch (error) {
      // JSON-RPC parameter rejection happens before terminal.run. spawn_failed also covers holder timeouts.
      rejectedBeforeCreation = error instanceof HerdrError && error.rpc.code === -32602 && error.kind === "invalid_params";
    }
    if (signal?.aborted) {
      ticket?.revoke();
      throw this.unknown(pending, "launch_scope_ended");
    }
    pending = this.currentLaunch(pending, intent, executionHash);
    if (pending.launchReceipt?.attempt?.id !== attempt.id) throw this.unknown(pending, "attempt_changed");
    if (pending.launchReceipt.attempt.binding && (pending.state === "running" || pending.state === "exited")) return pending;
    if (rejectedBeforeCreation) {
      ticket?.revoke();
      throw this.confirmNotCreated(pending, receipt, "run", "Herdr Core 拒绝了启动参数，未创建终端");
    }
    const binding = terminal && this.verifyTerminal(pending, terminal);
    if (terminal && binding) return this.bind(pending, terminal, binding);
    if (terminal?.address && hasLaunchLabels(terminal, launchLabels(this.d.vaultId, pending))) {
      pending.launchReceipt = { ...pending.launchReceipt!, attempt: { ...attempt, addressHint: terminal.address } };
      this.save(pending);
    }

    return this.findLaunch(pending, signal);
  }

  private async launchNative(
    native: NativeDelivery,
    session: SessionRecord,
    receipt: LaunchReceipt,
    intent: LaunchIntent,
    client: HerdrClient,
    core: Awaited<ReturnType<typeof identifyCore>>,
    signal: AbortSignal | undefined,
  ): Promise<SessionRecord> {
    const broker = this.d.nativeBroker ? this.d.nativeBroker(native.helper, signal) : new NativePtyBroker(native.helper, signal);
    let releaseBroker = () => broker.revoke();
    let retained = false;
    try {
      const argv = await broker.hostArgv();
      signal?.throwIfAborted();
      const current = this.currentLaunch(session, intent, receipt.executionHash);
      if (current.launchReceipt?.attempt) return this.findLaunch(current, signal);
      const attempt: LaunchAttempt = { id: randomUUID(), core, nativeStatus: "waiting-host" };
      const pending: SessionRecord = { ...current, state: "launching", launchReceipt: { ...receipt, argvHash: launchHash(argv), attempt } };
      delete pending.error;
      this.save(pending);
      this.nativeAttempts.set(pending.requestId, attempt.id);
      releaseBroker = () => {
        broker.revoke();
        if (this.nativeAttempts.get(pending.requestId) === attempt.id) this.nativeAttempts.delete(pending.requestId);
      };
      const latest = (phase: "waiting-host" | "delivering") => {
        const entry = this.currentLaunch(pending, intent, receipt.executionHash);
        const active = entry.launchReceipt?.attempt;
        if (this.nativeAttempts.get(pending.requestId) !== attempt.id || active?.id !== attempt.id || active.nativeStatus !== phase) {
          throw this.unknown(entry, "attempt_changed");
        }
        return entry;
      };

      let terminal: Terminal | undefined;
      try {
        terminal = await client.call<Terminal>("terminal.run", { argv, cwd: session.cwd, labels: launchLabels(this.d.vaultId, pending), name: session.id, no_parent: true, keep: false });
      } catch (error) {
        if (error instanceof HerdrError && error.rpc.code === -32602 && error.kind === "invalid_params") {
          throw this.confirmNotCreated(pending, receipt, "run", "Herdr Core 拒绝了启动参数，未创建终端");
        }
      }
      if (terminal?.address && this.matchesTerminal(pending, terminal)) {
        const entry = latest("waiting-host");
        const binding = processBinding(terminal);
        this.save({ ...entry, launchReceipt: { ...entry.launchReceipt!, attempt: { ...entry.launchReceipt!.attempt!, addressHint: terminal.address, ...(binding && { binding }) } } });
      }

      const checkHost = async (reply?: Terminal) => {
        if (broker.waiting.aborted) return "unavailable" as const;
        const entry = latest("waiting-host");
        const candidate = reply && this.verifyTerminal(entry, reply) ? reply : this.nativeHostCandidate(entry, await this.snapshot());
        if (broker.waiting.aborted) return "unavailable" as const;
        if (!candidate || candidate === "unavailable") return candidate;
        const binding = this.verifyTerminal(entry, candidate);
        if (!binding) return undefined;
        if (candidate.state !== "live") return "unavailable" as const;
        const current = latest("waiting-host");
        const receipt = current.launchReceipt!;
        if (!receipt.attempt!.binding) this.save({ ...current, launchReceipt: { ...receipt, attempt: { ...receipt.attempt!, addressHint: binding.address, binding } } });
        const host = await broker.inspectHost(binding.pid);
        if (broker.waiting.aborted) return "unavailable" as const;
        return host ? { terminal: candidate, binding, host } : undefined;
      };
      const finish = (candidate: VerifiedNativeHost | "unavailable") => (candidate === "unavailable" ? this.failNativeBeforeStart(latest("waiting-host")) : this.deliverNative(native, broker, candidate, latest));
      const first = await checkHost(terminal);
      if (first) {
        const result = await finish(first);
        if (result.state === "failed") throw errors.invalidInput(result.error!);
        return result;
      }

      this.markUnknown(latest("waiting-host"), "native_host_unverified");
      const waitForHost = async () => {
        while (!broker.waiting.aborted) {
          await delay(200, undefined, { signal: broker.waiting }).catch(() => undefined);
          const candidate = await checkHost();
          if (candidate) return finish(candidate);
        }
        return finish("unavailable");
      };
      const completion = waitForHost().finally(releaseBroker);
      // The original caller can return while this one broker still owns the attempt.
      retained = true;
      void completion.catch(() => undefined);
      native.onPending?.(completion);
      throw this.unknown(pending, "native_host_unverified");
    } finally {
      if (!retained) releaseBroker();
    }
  }

  private nativeHostCandidate(session: SessionRecord, snapshot: TerminalSnapshot): Terminal | "unavailable" | undefined {
    const attempt = session.launchReceipt!.attempt!;
    if (snapshot.kind !== "available") return undefined;
    if (!sameCore(attempt.core, snapshot.core)) return "unavailable";
    const matches = snapshot.terminals.filter((item) => hasLaunchLabels(item, launchLabels(this.d.vaultId, session)));
    if (matches.length > 1) return "unavailable";
    const candidate = matches[0];
    if (!candidate || candidate.reason === "spawn_pending") return undefined;
    const binding = this.verifyTerminal(session, candidate);
    if (!binding || (attempt.addressHint && attempt.addressHint !== binding.address) || (attempt.binding && !sameProcess(attempt.binding, binding))) return "unavailable";
    return candidate;
  }

  private failNativeBeforeStart(session: SessionRecord): SessionRecord {
    const receipt = session.launchReceipt!;
    const failed: SessionRecord = {
      ...session,
      state: "failed",
      terminalId: null,
      error: "受保护进程未启动，请检查当前启动环境并重新选择。",
      launchReceipt: { ...receipt, attempt: { ...receipt.attempt!, nativeStatus: "failed", nativeCleanup: "pending" } },
    };
    this.save(failed);
    return failed;
  }

  private async deliverNative(native: NativeDelivery, broker: NativeBroker, { terminal, binding, host }: VerifiedNativeHost, latest: (phase: "waiting-host" | "delivering") => SessionRecord): Promise<SessionRecord> {
    let phase: "waiting-host" | "delivering" = "waiting-host";
    let resolveDelivery!: (outcome: BrokerOutcome) => void;
    const delivery = new Promise<BrokerOutcome>((resolve) => {
      resolveDelivery = resolve;
    });
    const stopWaiting = () => {
      if (phase === "waiting-host") resolveDelivery("not-started");
    };
    broker.waiting.addEventListener("abort", stopWaiting, { once: true });
    if (broker.waiting.aborted) stopWaiting();
    const take = async () => {
      broker.waiting.throwIfAborted();
      return native.use((values) => {
        broker.waiting.throwIfAborted();
        if (
          native.launch.approvedShell &&
          (values.size !== native.launch.protect.length ||
            native.launch.protect.some((name) => {
              const value = values.get(name);
              return !value || native.launch.argv.some((arg) => arg.includes(value)) || native.launch.directory.path.includes(value);
            }))
        )
          throw errors.invalidInput("已批准的规则环境无效");
        const entry = latest("waiting-host");
        const receipt = entry.launchReceipt!;
        // The only private write is preceded by a durable record tied to this host.
        this.save({ ...entry, launchReceipt: { ...receipt, attempt: { ...receipt.attempt!, addressHint: binding.address, binding, nativeStatus: "delivering" } } });
        phase = "delivering";
        return broker.start(host, native.launch, values, () => {
          const current = latest("delivering");
          const pinned = current.launchReceipt!;
          this.save({ ...current, launchReceipt: { ...pinned, attempt: { ...pinned.attempt!, nativeConsumed: true } } });
        });
      }, broker.waiting);
    };
    void take().then(resolveDelivery, () => resolveDelivery(phase === "delivering" ? "unknown" : "not-started"));
    const outcome = await delivery;
    broker.waiting.removeEventListener("abort", stopWaiting);
    const current = latest(phase);
    if (outcome === "unknown") throw this.unknown(this.markUnknown(current, "native_start_unknown"), "native_start_unknown");
    if (outcome === "not-started") return this.failNativeBeforeStart(current);
    const receipt = current.launchReceipt!;
    return this.bind({ ...current, launchReceipt: { ...receipt, attempt: { ...receipt.attempt!, nativeStatus: "started", nativeConsumed: true } } }, terminal, binding);
  }

  private currentLaunch(session: SessionRecord, intent: LaunchIntent, executionHash: string | undefined): SessionRecord {
    const current = this.recordedLaunch(session.requestId);
    if (current?.id !== session.id) throw this.unknown(session, "launch_receipt_unavailable");
    this.verifyIntent(current, intent, executionHash);
    return current;
  }

  async recover(id: string, signal: AbortSignal): Promise<SessionRecord> {
    const session = this.get(id);
    const origin = this.recordedLaunch(session.requestId);
    if (origin?.id !== id || !origin.launchReceipt?.attempt) throw errors.invalidInput("没有可核对的原启动请求");
    return this.findLaunch(origin, signal);
  }

  hasLaunchAttempt(requestId: string): boolean {
    return this.recordedLaunch(requestId)?.launchReceipt?.attempt !== undefined;
  }

  private async findLaunch(session: SessionRecord, signal: AbortSignal | undefined): Promise<SessionRecord> {
    if (session.state === "exited") return session;
    if (session.launchReceipt?.attempt?.nativeStatus === "failed") throw errors.invalidInput(session.error ?? "受保护进程未启动");
    const snapshot = await this.snapshot();
    if (signal?.aborted) throw this.unknown(session, "launch_scope_ended");
    const current = this.recordedLaunch(session.requestId);
    const attempt = session.launchReceipt?.attempt;
    if (current?.id !== session.id || current.launchReceipt?.attempt?.id !== attempt?.id) throw this.unknown(session, "attempt_changed");
    if (current.state === "exited") return current;
    if (launchHash(current.launchReceipt?.attempt) !== launchHash(attempt)) {
      if (current.state === "running" && current.launchReceipt?.attempt?.binding) return current;
      throw this.unknown(current, current.launchReceipt?.attempt?.issue ?? "attempt_changed");
    }
    const updated = this.applySnapshot(current, snapshot);
    if (updated.state === "failed") throw errors.invalidInput(updated.error ?? "受保护进程未启动");
    if (snapshot.kind === "unavailable") throw this.unknown(updated, "snapshot_unavailable");
    if (updated.state === "running" || updated.state === "exited") return updated;
    throw this.unknown(updated, updated.launchReceipt?.attempt?.issue ?? "snapshot_unavailable");
  }

  private confirmNotCreated(session: SessionRecord, receipt: LaunchReceipt, stage: "connect" | "run", message: string): HuhuError {
    this.secrets.delete(session.id);
    this.save({ ...session, state: "failed", launchReceipt: receipt, error: message });
    return new HuhuError("HERDR_UNAVAILABLE", message, {
      details: { stage, reason: "confirmed_not_created", requestId: session.requestId, sessionId: session.id },
    });
  }

  private approvedDirectoryChanged(): HuhuError {
    return new HuhuError("SPACE_INVALID", "受保护的终端工作目录已变化，命令未启动。", { details: { reason: "approved_directory_changed" } });
  }

  private matchesTerminal(session: SessionRecord, terminal: Terminal): boolean {
    const receipt = session.launchReceipt;
    if (!receipt || !hasLaunchLabels(terminal, launchLabels(this.d.vaultId, session))) return false;
    if (!terminal.cwd || localDrivePath(terminal.cwd) !== session.cwd) return false;
    return receipt.argvHash === null || (Array.isArray(terminal.argv) && launchHash(terminal.argv) === receipt.argvHash);
  }

  private verifyTerminal(session: SessionRecord, terminal: Terminal): ProcessBinding | null {
    return this.matchesTerminal(session, terminal) ? processBinding(terminal) : null;
  }

  private bind(session: SessionRecord, terminal: Terminal, binding: ProcessBinding): SessionRecord {
    const finished = terminal.state === "finished";
    if (session.state === "running" && !finished) return session;
    const receipt = session.launchReceipt!;
    const attempt = receipt.attempt!;
    const next: SessionRecord = {
      ...session,
      terminalId: binding.address,
      state: finished ? "exited" : "running",
      launchReceipt: { ...receipt, attempt: { id: attempt.id, core: attempt.core, binding, ...(attempt.nativeStatus && { nativeStatus: attempt.nativeStatus }), ...(attempt.nativeConsumed && { nativeConsumed: true }) } },
      ...(finished ? { exitCode: terminal.exit_code ?? null, exitedAt: terminal.finished_ms ? new Date(terminal.finished_ms).toISOString() : this.d.now().toISOString() } : {}),
    };
    delete next.error;
    this.save(next);
    return next;
  }

  private markUnknown(session: SessionRecord, issue: string): SessionRecord {
    const receipt = session.launchReceipt!;
    if (session.state === "unknown" && receipt.attempt?.issue === issue) return session;
    const next: SessionRecord = {
      ...session,
      state: "unknown",
      terminalId: null,
      launchReceipt: { ...receipt, attempt: { ...receipt.attempt!, issue } },
    };
    this.save(next);
    return next;
  }

  private async snapshot(observer?: HerdrClient): Promise<TerminalSnapshot> {
    if (this.d.signal?.aborted) return { kind: "unavailable" };
    try {
      const client = observer ?? (this.d.peekCore ? await this.d.peekCore() : await this.d.core());
      if (client === "absent") return { kind: "absent" };
      if (!client) return { kind: "unavailable" };
      this.d.signal?.throwIfAborted();
      const core = await identifyCore(client);
      const { terminals } = await client.call<{ terminals: Terminal[] }>("terminal.list", { all: true, labels: { "huhu.vault": this.d.vaultId } });
      return Array.isArray(terminals) ? { kind: "available", client, core, terminals } : { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  private applySnapshot(session: SessionRecord, snapshot: TerminalSnapshot): SessionRecord {
    const attempt = session.launchReceipt?.attempt;
    if (!attempt) return session;
    if (attempt.nativeStatus === "failed") return session;
    if (this.nativeAttempts.get(session.requestId) === attempt.id) return session;
    if (attempt.nativeStatus === "waiting-host") return this.failNativeBeforeStart(session);
    if (attempt.nativeStatus && attempt.nativeStatus !== "started") return this.markUnknown(session, "native_start_unknown");
    if (snapshot.kind !== "available") {
      if (snapshot.kind === "unavailable" && attempt.binding) return session;
      return this.markUnknown(session, snapshot.kind === "absent" ? "core_absent" : "snapshot_unavailable");
    }
    if (!sameCore(attempt.core, snapshot.core)) return this.markUnknown(session, "core_changed");
    const labels = launchLabels(this.d.vaultId, session);
    const candidates = snapshot.terminals.filter((terminal) => hasLaunchLabels(terminal, labels));
    if (candidates.length > 1) return this.markUnknown(session, "multiple_matches");
    const candidate = candidates[0];
    if (!candidate) return this.markUnknown(session, attempt.binding ? "binding_lost" : "no_match");
    if (attempt.addressHint && candidate.address !== attempt.addressHint) return this.markUnknown(session, "binding_lost");
    if (candidate.reason === "spawn_pending") return this.markUnknown(session, "spawn_pending");
    const binding = this.verifyTerminal(session, candidate);
    if (!binding) return this.markUnknown(session, "process_unverified");
    if (attempt.binding && !sameProcess(attempt.binding, binding)) return this.markUnknown(session, "binding_lost");
    return this.bind(session, candidate, binding);
  }

  /** Only the process that received the actual launch can be used to redact its output. */
  private readonly secrets = new Map<string, string[]>();

  private async verifiedTerminal(session: SessionRecord, observer?: HerdrClient): Promise<{ client: HerdrClient; terminal: Terminal }> {
    const attempt = session.launchReceipt?.attempt;
    if (observer && !attempt?.binding) throw this.unknown(session, "process_unverified");
    const snapshot = await this.snapshot(observer);
    if (snapshot.kind !== "available") throw this.unknown(session, "snapshot_unavailable");
    if (attempt && !sameCore(attempt.core, snapshot.core)) throw this.unknown(session, "core_changed");
    const labels = launchLabels(this.d.vaultId, session);
    const candidates = snapshot.terminals.filter((terminal) => hasLaunchLabels(terminal, labels));
    const terminal = candidates.length === 1 ? candidates[0] : undefined;
    if (!terminal || terminal.address !== session.terminalId) throw this.unknown(session, "binding_lost");
    if (attempt?.binding) {
      const binding = this.verifyTerminal(session, terminal);
      if (!binding || !sameProcess(attempt.binding, binding)) throw this.unknown(session, "binding_lost");
    }
    return { client: snapshot.client, terminal };
  }

  private async terminalClient(session: SessionRecord, observer?: HerdrClient): Promise<HerdrClient> {
    const { client } = await this.verifiedTerminal(session, observer);
    this.d.signal?.throwIfAborted();
    return client;
  }

  async executionSession(id: string, observer?: HerdrClient): Promise<{ binding: ExecutionBinding["sessionBinding"]; finished: boolean; spaceId: string; nativeExisting?: boolean } | null> {
    const session = this.list().find((item) => item.id === id);
    if (!session?.terminalId || session.provider === "shell") return null;
    const owner = this.executionOwner(session);
    if (!owner) return null;
    const verified = await this.verifiedTerminal(session, observer).catch(() => null);
    if (!verified) return null;
    const machineId = this.d.spaces.machineId;
    const thread = session.controlled ? this.d.codex?.thread(this.d.vaultId, machineId, owner) : null;
    if (session.controlled && !thread) return null;
    return {
      spaceId: session.spaceId,
      finished: verified.terminal.state === "finished" || verified.terminal.finished_ms != null,
      ...(thread && { nativeExisting: thread.protocol === 2 }),
      binding: {
        machineId,
        sessionId: session.id,
        coreId: owner.coreId,
        coreAddress: owner.address,
        processGeneration: owner.generation,
        provider: session.provider,
        nativeSessionId: thread?.threadId ?? null,
      },
    };
  }

  private executionOwner(session: SessionRecord) {
    const attempt = session.launchReceipt?.attempt;
    if (!attempt?.binding) return null;
    return {
      id: session.id,
      coreId: attempt.core.id,
      attempt: attempt.id,
      ...attempt.binding,
      generation: sessionGeneration(session)!,
    };
  }

  private matchesExecution(owner: NonNullable<ReturnType<SessionsService["executionOwner"]>>, { vaultId, sessionBinding: binding }: ExecutionBinding): boolean {
    return vaultId === this.d.vaultId && binding.machineId === this.d.spaces.machineId && owner.generation === binding.processGeneration && owner.address === binding.coreAddress && owner.coreId === binding.coreId;
  }

  private nativeOwner(execution: ExecutionBinding) {
    const session = this.list().find(({ id }) => id === execution.sessionBinding.sessionId);
    if (!session?.controlled || this.recordedLaunch(session.requestId)?.id !== session.id) return null;
    const owner = this.executionOwner(session);
    if (!owner || !this.matchesExecution(owner, execution)) return null;
    return owner;
  }

  nativeEvidence(execution: ExecutionBinding) {
    const owner = this.nativeOwner(execution);
    if (!owner) return null;
    return this.d.codex?.evidence(execution, owner) ?? null;
  }

  nativeReports(execution: ExecutionBinding, inputSha256: string) {
    const owner = this.nativeOwner(execution);
    return owner && this.d.codex ? this.d.codex.reports(execution, owner, inputSha256) : [];
  }

  async answerNative(input: NativeAnswer, send: boolean, signal: AbortSignal, ownsInput: () => boolean): Promise<NativeAnswerStatus> {
    const { execution } = input;
    const { codex } = this.d;
    if (!codex) return "unsupported";
    const owner = this.nativeOwner(execution);
    const { answerIntents } = codex;
    const persisted = (): NativeAnswerStatus | null => {
      const intent = answerIntents.lookup(input);
      if (intent === "occupied") return "stale";
      if (intent === "original") return owner && codex.answerAccepted(input, owner) ? "accepted" : "unknown";
      return null;
    };
    const prior = persisted();
    if (prior) return prior;
    if (!owner) return "stale";

    const { sessionId } = execution.sessionBinding;
    const session = this.list().find(({ id }) => id === sessionId);
    if (session?.state !== "running" || !ownsInput()) return "stale";
    const inspect = await codex.connectAnswer(input, owner, signal);
    if (!inspect) return persisted() ?? "unknown";
    let observed: NativeAnswerStatus;
    try {
      const terminal = await this.verifiedTerminal(session).catch(() => null);
      signal.throwIfAborted();
      if (!terminal || terminal.terminal.state === "finished" || terminal.terminal.finished_ms != null || !ownsInput()) return persisted() ?? "stale";
      observed = await inspect.exchange("inspect");
    } finally {
      inspect.close();
    }
    const afterInspect = persisted();
    if (afterInspect) return afterInspect;
    signal.throwIfAborted();
    if (observed !== "not_sent" || !send) return observed === "accepted" ? "unknown" : observed;

    const submit = await codex.connectAnswer(input, owner, signal);
    if (!submit) return persisted() ?? "unknown";
    try {
      const terminal = await this.verifiedTerminal(session).catch(() => null);
      signal.throwIfAborted();
      if (!terminal || terminal.terminal.state === "finished" || terminal.terminal.finished_ms != null || !ownsInput()) return persisted() ?? "stale";
      if (!this.nativeOwner(execution)) return persisted() ?? "stale";
      // There is no await between the Vault intent and the first possible socket write.
      if (!answerIntents.claim(input)) return persisted() ?? "unknown";
      const result = await submit.exchange("submit");
      if (codex.answerAccepted(input, owner)) return "accepted";
      return result === "stale" || result === "unsupported" ? result : "unknown";
    } finally {
      submit.close();
    }
  }

  async stopNative(input: NativeStop, send: boolean, signal: AbortSignal, control: { inputSha256: string; intent(): string | null; ownsInput(): boolean; claim(): boolean }): Promise<NativeStopStatus> {
    const { execution, stopId } = input;
    const { codex } = this.d;
    if (!codex) return "unsupported";
    const owner = this.nativeOwner(execution);
    const original = () => {
      const evidence = owner && codex.evidence(execution, owner);
      return evidence?.proof.inputSha256 === control.inputSha256 ? evidence : null;
    };
    const persisted = (): NativeStopStatus | null => {
      const id = control.intent();
      const evidence = original();
      if (evidence?.terminalStatus === "completed" || evidence?.terminalStatus === "failed") return "completed";
      if (id !== null && id !== stopId) return "stale";
      if (id === stopId) {
        if (owner && evidence?.terminalStatus === "interrupted" && evidence.proof.nativeTurnId && codex.stopWritten(input, owner, evidence.proof.nativeTurnId)) return "stopped";
        return "unknown";
      }
      if (evidence?.terminalStatus === "interrupted") return "stale";
      return evidence?.finished ? "unknown" : null;
    };
    const prior = persisted();
    if (prior) return prior;
    const session = this.list().find(({ id }) => id === execution.sessionBinding.sessionId);
    if (!owner || session?.state !== "running" || !control.ownsInput()) return "stale";
    if (!original()) return "unknown";

    const channel = await codex.connectStop(input, owner, signal);
    try {
      const verified = await this.verifiedTerminal(session).catch((error: unknown) => {
        return error instanceof HuhuError && (error.details?.reason === "core_changed" || error.details?.reason === "binding_lost") ? "stale" : "unknown";
      });
      signal.throwIfAborted();
      const latest = persisted();
      if (latest) return latest;
      if (typeof verified === "string") return verified;
      if (verified.terminal.state === "finished" || verified.terminal.finished_ms != null || !this.nativeOwner(execution) || !control.ownsInput()) return "stale";
      if (!channel) return "unknown";
      // Hold the claim durably before the first possible socket write, with no await between them.
      if (send && !control.claim()) return persisted() ?? "unknown";
      const result = await channel.exchange(send ? "submit" : "inspect");
      return persisted() ?? (!send && (result === "not_sent" || result === "stale" || result === "unsupported") ? result : "unknown");
    } finally {
      channel?.close();
    }
  }

  async writeExecutionInput(execution: ExecutionBinding, text: string, signal: AbortSignal, claim: () => boolean): Promise<"core_written" | "not_sent" | "unknown" | "busy"> {
    signal.throwIfAborted();
    const { sessionBinding: binding } = execution;
    const previous = this.list().find(({ id }) => id === binding.sessionId);
    if (!previous) return "not_sent";
    const priorOwner = this.executionOwner(previous);
    if (!priorOwner || !this.matchesExecution(priorOwner, execution) || !!previous.controlled !== !!binding.nativeSessionId) return "not_sent";
    const channel = previous.controlled && (await this.d.codex?.connect(execution, priorOwner, signal));
    if (previous.controlled && !channel) return "not_sent";
    let nativeSubmitted = false;
    try {
      const verified = await this.verifiedTerminal(previous).catch(() => null);
      signal.throwIfAborted();
      if (!verified || verified.terminal.state === "finished" || verified.terminal.finished_ms != null) return "not_sent";
      const session = this.list().find(({ id }) => id === binding.sessionId);
      if (session?.state !== "running" || session.provider !== binding.provider || session.controlled !== previous.controlled || session.terminalId !== binding.coreAddress) return "not_sent";
      const owner = this.executionOwner(session);
      if (!owner || !this.matchesExecution(owner, execution)) return "not_sent";
      // Claim and submit in one synchronous turn after verifying the original process.
      if (!claim()) return "busy";
      try {
        if (channel) {
          channel.submit(text);
          nativeSubmitted = true;
          return "unknown";
        }
        await verified.client.call("terminal.send", { terminal: binding.coreAddress, text });
        return "core_written";
      } catch {
        return "unknown";
      }
    } finally {
      if (channel && !nativeSubmitted) channel.close();
    }
  }

  reviewInputPending(id: string): boolean {
    return this.list().some((s) => s.id === id && s.reviewComments?.some((comment) => comment.sending));
  }

  private async controlTerminal(session: SessionRecord, method: string, generation?: string): Promise<void> {
    if (generation !== undefined && sessionGeneration(session) !== generation) throw new HuhuError("VERSION_CONFLICT", "会话进程代次已变化");
    if (this.d.inputOwnership?.hasTask(session.id)) throw errors.invalidInput("该会话由任务持有输入权");
    const client = await this.terminalClient(session);
    this.d.signal?.throwIfAborted();
    if (this.d.inputOwnership?.hasTask(session.id)) throw errors.invalidInput("该会话由任务持有输入权");
    if (generation !== undefined && sessionGeneration(this.get(session.id)) !== generation) throw new HuhuError("VERSION_CONFLICT", "会话进程代次已变化");
    const release = generation === undefined ? undefined : this.d.inputOwnership?.take(session.id, "manual");
    if (generation !== undefined && this.d.inputOwnership && !release) throw errors.invalidInput("该会话的输入权当前已被占用");
    try {
      await client.call(method, { terminal: session.terminalId });
    } finally {
      release?.();
    }
  }

  /**
   * 终端当前输出（屏幕 + 历史）。命令带环境变量时，只有本进程记得秘密值才能确认已抹掉回显——引擎重启后拿不到就不返回输出。
   * 是否带过环境变量以会话记录里的 `hasEnv` 为准。
   */
  async output(id: string, lines = 200, observer?: HerdrClient): Promise<{ text: string; complete: boolean }> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    if (s.hasEnv && !s.launchReceipt?.attempt?.nativeStatus && !this.secrets.has(id)) return { text: "（引擎重启过：无法确认环境变量值已从输出里抹掉，没有收录输出）", complete: false };
    const r = await (await this.terminalClient(s, observer)).call<{ text?: string; screen?: string; history?: string }>("terminal.read", { terminal: s.terminalId, lines: Math.min(Math.max(lines, 1), 2000) });
    const text = r.text ?? [r.history, r.screen].filter(Boolean).join("\n");
    return {
      text: redactSecrets(text, this.secrets.get(id) ?? [])
        .trim()
        .split("\n")
        .slice(-lines)
        .join("\n"),
      complete: true,
    };
  }

  /**
   * 受保护命令读完脱敏输出后移除终端并清理本进程的脱敏材料。
   */
  async release(id: string, requestId: string, signal?: AbortSignal): Promise<void> {
    const s = this.recordedLaunch(requestId);
    if (!s || s.id !== id || !s.hasEnv || (s.state !== "exited" && s.state !== "failed") || this.d.inputOwnership?.hasTask(id)) {
      throw errors.permissionDenied("无法确认已结束的受保护会话");
    }
    this.secrets.delete(id);
    const attempt = s.launchReceipt?.attempt;
    if (attempt?.nativeCleanup) {
      if (attempt.nativeCleanup === "complete" || (await this.cleanupNativeHost(s, await this.snapshot(), signal))) return;
      throw this.unknown(s, "native_host_cleanup_pending");
    }
    if (!s.terminalId && !attempt) return;
    if (!s.terminalId || !attempt?.binding) throw this.unknown(s, "binding_lost");
    const snapshot = await this.snapshot();
    if (snapshot.kind !== "available") throw this.unknown(s, "snapshot_unavailable");
    if (!sameCore(attempt.core, snapshot.core)) throw this.unknown(s, "core_changed");
    const labels = launchLabels(this.d.vaultId, s);
    const candidates = snapshot.terminals.filter((terminal) => hasLaunchLabels(terminal, labels));
    // 若前一次释放已完成但回包丢失，同一 Core 的快照应已没有原会话。
    if (!candidates.length && !snapshot.terminals.some(({ address }) => address === s.terminalId)) return;
    const terminal = candidates.length === 1 ? candidates[0] : undefined;
    const binding = terminal && this.verifyTerminal(s, terminal);
    if (!binding || !sameProcess(attempt.binding, binding) || terminal?.state !== "finished") throw this.unknown(s, "binding_lost");
    signal?.throwIfAborted();
    this.d.signal?.throwIfAborted();
    const current = this.recordedLaunch(requestId);
    const currentAttempt = current?.launchReceipt?.attempt;
    if (
      current?.id !== id ||
      current.terminalId !== binding.address ||
      !current.hasEnv ||
      currentAttempt?.id !== attempt.id ||
      !currentAttempt.binding ||
      !sameProcess(currentAttempt.binding, binding) ||
      (current.state !== "exited" && current.state !== "failed") ||
      this.d.inputOwnership?.hasTask(id)
    ) {
      throw this.unknown(s, "binding_lost");
    }
    await snapshot.client.call("terminal.rm", { terminal: binding.address });
  }

  private async cleanupNativeHost(session: SessionRecord, snapshot: TerminalSnapshot, signal?: AbortSignal): Promise<boolean> {
    const attempt = session.launchReceipt?.attempt;
    if (attempt?.nativeStatus !== "failed" || attempt.nativeCleanup !== "pending" || snapshot.kind !== "available" || !sameCore(attempt.core, snapshot.core)) return false;
    const host = this.nativeHostCandidate(session, snapshot);
    if (host === "unavailable") return false;
    const binding = host && this.verifyTerminal(session, host);
    const absent = !host && !!attempt.binding && !snapshot.terminals.some((terminal) => terminal.address === attempt.binding!.address || hasLaunchLabels(terminal, launchLabels(this.d.vaultId, session)));
    if (!binding && !absent) return false;
    const current = () => {
      signal?.throwIfAborted();
      this.d.signal?.throwIfAborted();
      const entry = this.recordedLaunch(session.requestId);
      return entry?.id === session.id && launchHash(entry.launchReceipt?.attempt) === launchHash(attempt) ? entry : undefined;
    };
    const entry = current();
    if (!entry) return false;
    if (binding && !attempt.binding) {
      // Preserve the identity before cleanup so a lost remove reply can be reconciled.
      this.save({ ...entry, launchReceipt: { ...entry.launchReceipt!, attempt: { ...attempt, addressHint: binding.address, binding } } });
      return this.cleanupNativeHost(this.get(entry.id), snapshot, signal);
    }
    if (host?.state === "live") {
      await snapshot.client.call("terminal.kill", { terminal: host.address });
      return false;
    }
    if (binding) await snapshot.client.call("terminal.rm", { terminal: binding.address });
    const final = current();
    if (!final) return false;
    this.save({ ...final, launchReceipt: { ...final.launchReceipt!, attempt: { ...attempt, nativeCleanup: "complete" } } });
    return true;
  }

  async interrupt(id: string, generation?: string): Promise<void> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    await this.controlTerminal(s, "terminal.interrupt", generation);
  }

  async kill(id: string, generation?: string): Promise<void> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    await this.controlTerminal(s, "terminal.kill", generation);
  }

  private lastReconcile = 0;

  /**
   * 用只读快照查回未确定的启动，并核对已绑定进程的退出。列表打开时调用，2 秒内只查一次。
   */
  async reconcile(): Promise<void> {
    const mine = this.list().filter(
      (x) =>
        !this.inflight.has(x.requestId) &&
        !this.nativeAttempts.has(x.requestId) &&
        ((x.state === "running" && x.terminalId) || (x.launchReceipt?.attempt && (x.state === "launching" || x.state === "unknown" || x.launchReceipt.attempt.nativeCleanup === "pending"))),
    );
    if (mine.length === 0 || Date.now() - this.lastReconcile < 2000) return;
    this.lastReconcile = Date.now();
    const snapshot = await this.snapshot();
    for (const sess of mine) {
      if (this.inflight.has(sess.requestId) || this.nativeAttempts.has(sess.requestId)) continue;
      try {
        const current = this.get(sess.id);
        if (current.state !== sess.state || current.terminalId !== sess.terminalId || current.launchReceipt?.attempt?.id !== sess.launchReceipt?.attempt?.id) continue;
        if (current.launchReceipt) {
          const updated = this.applySnapshot(current, snapshot);
          if (updated.launchReceipt?.attempt?.nativeCleanup === "pending") await this.cleanupNativeHost(updated, snapshot);
          continue;
        }
        if (snapshot.kind === "unavailable") continue;
        const t = snapshot.kind === "available" ? snapshot.terminals.find((x) => x.address === current.terminalId && hasLaunchLabels(x, launchLabels(this.d.vaultId, current))) : undefined;
        if (t && t.state !== "finished" && t.finished_ms == null) continue;
        const at = t?.finished_ms ? new Date(t.finished_ms).toISOString() : this.d.now().toISOString();
        this.save({ ...current, state: "exited", exitCode: t?.exit_code ?? null, exitedAt: at, ...(t ? {} : { error: "终端已不存在（Herdr Core 没有在运行，或已重启过）" }) });
      } catch {
        /* 单条记录读写失败不影响其他会话和列表 */
      }
    }
  }

  // ---- 等人工（Herdr 状态订阅）----

  /** 终端对应的运行中会话（核对 huhu.session 标签由调用方负责）。 */
  byTerminal(terminalId: string, sessionLabel?: string): SessionRecord | null {
    return this.list().find((x) => x.terminalId === terminalId && x.state === "running" && (!sessionLabel || x.id === sessionLabel)) ?? null;
  }

  /** 应用一条程序状态：返回是否发生了“进入 blocked”或“离开 blocked”。同一次 blocked 重复到达（重连、快照）不产生新的发生标识。 */
  applyStatus(sessionId: string, status: ProgramStatus | null): { session: SessionRecord; transition: "blocked" | "cleared" | null } {
    const sess = this.get(sessionId);
    const w = sess.waiting;
    if (status?.state === "blocked") {
      if (w?.active) {
        const next = { ...w, kind: status.kind ?? null, msg: status.msg ?? null, app: status.app ?? w.app };
        if (JSON.stringify(next) !== JSON.stringify(w)) this.save({ ...sess, waiting: next });
        return { session: this.get(sessionId), transition: null };
      }
      this.save({
        ...sess,
        waiting: {
          n: (w?.n ?? 0) + 1,
          active: true,
          kind: status.kind ?? null,
          msg: status.msg ?? null,
          app: status.app ?? null,
          since: this.d.now().toISOString(),
          ...(w?.taskId ? { taskId: w.taskId } : {}),
          ...(w?.handled !== undefined ? { handled: w.handled } : {}),
        },
      });
      return { session: this.get(sessionId), transition: "blocked" };
    }
    if (w?.active) {
      this.save({ ...sess, waiting: { ...w, active: false } });
      return { session: this.get(sessionId), transition: "cleared" };
    }
    return { session: sess, transition: null };
  }

  /** 终端结束：未解除的等待标为过期。 */
  expireWaiting(sessionId: string): boolean {
    const sess = this.get(sessionId);
    if (!sess.waiting?.active) return false;
    this.save({ ...sess, waiting: { ...sess.waiting, active: false, expired: true } });
    return true;
  }

  markWaitingHandled(sessionId: string, n: number): void {
    const sess = this.get(sessionId);
    if (sess.waiting?.n === n && sess.waiting.handled !== n) this.save({ ...sess, waiting: { ...sess.waiting, handled: n } });
  }

  setWaitingTask(sessionId: string, taskId: string): void {
    const sess = this.get(sessionId);
    if (sess.waiting && sess.waiting.taskId !== taskId) this.save({ ...sess, waiting: { ...sess.waiting, taskId } });
  }

  setWaitingTaskRun(sessionId: string, occurrence: number, taskRun: NonNullable<WaitingInfo["taskRun"]>): boolean {
    const session = this.get(sessionId);
    const waiting = session.waiting;
    if (!waiting?.active || waiting.n !== occurrence) return false;
    if (waiting.taskRun?.taskId === taskRun.taskId && waiting.taskRun.runId === taskRun.runId) return false;
    this.save({ ...session, waiting: { ...waiting, taskRun } });
    return true;
  }

  pinWaitingOwner(sessionId: string, occurrence: number, dispatchId: string): boolean {
    const session = this.get(sessionId);
    const waiting = session.waiting;
    if (!waiting?.active || waiting.n !== occurrence) return false;
    if (waiting.ownerDispatchId) return waiting.ownerDispatchId === dispatchId;
    this.save({ ...session, waiting: { ...waiting, ownerDispatchId: dispatchId } });
    return true;
  }

  // ---- 变更审查意见 ----

  comments(id: string): ReviewComment[] {
    return this.get(id).reviewComments ?? [];
  }

  addComment(id: string, c: { path: string; side: "old" | "new"; line: number; text: string }): ReviewComment {
    const s = this.get(id);
    const text = noControl(c.text);
    if (!text) throw errors.invalidInput("意见不能为空");
    if (text.length > 2000) throw errors.invalidInput("意见最多 2000 个字");
    if (!c.path || hasControl(c.path) || c.path.startsWith("/") || c.path.split("/").includes("..") || c.path.length > 1000) throw errors.invalidInput("文件路径无效");
    if (!Number.isInteger(c.line) || c.line < 1 || c.line > 10_000_000) throw errors.invalidInput("行号无效");
    const list = s.reviewComments ?? [];
    if (list.length >= MAX_COMMENTS) throw errors.invalidInput(`每个会话最多 ${MAX_COMMENTS} 条意见，请先删除已发送的`);
    const comment: ReviewComment = { id: newId("cap").replace(/^cap-/, "rc-"), path: c.path, side: c.side, line: c.line, text, createdAt: this.d.now().toISOString(), sentAt: null };
    this.save({ ...s, reviewComments: [...list, comment] });
    return comment;
  }

  deleteComment(id: string, commentId: string): void {
    const s = this.get(id);
    const list = s.reviewComments ?? [];
    if (!list.some((x) => x.id === commentId)) throw errors.notFound("意见不存在");
    this.save({ ...s, reviewComments: list.filter((x) => x.id !== commentId) });
  }

  private sending = new Set<string>();

  /** 把意见整理成一段文本写入会话输入（terminal.send，会自动回车提交）；dryRun 只返回将要发送的文本。成功后才标记已发送。 */
  async sendComments(id: string, ids?: string[], dryRun = false, generation?: string): Promise<{ sent: number; text: string }> {
    const s = this.get(id);
    if (!dryRun && s.controlled) throw errors.invalidInput("受控 Codex 会话只支持任务原生输入");
    if (!dryRun && (s.state !== "running" || !s.terminalId)) throw errors.invalidInput("会话没有在运行：恢复会话后再发送");
    if (this.sending.has(id)) throw errors.invalidInput("正在发送上一批意见，请稍候");
    const all = s.reviewComments ?? [];
    // 显式指定时也只允许“未发送”的（含发送状态未知的）；已确认发送过的不能再发
    const chosen = ids ? all.filter((c) => ids.includes(c.id) && c.sentAt === null && (generation === undefined || !c.sending)) : all.filter((c) => c.sentAt === null && !c.sending);
    if (generation !== undefined && ids && chosen.length !== new Set(ids).size) throw errors.invalidInput("审查意见已发送、状态待核实或不属于这个会话");
    if (chosen.length === 0) throw errors.invalidInput("没有待发送的意见");
    const text = ["请根据以下审查意见继续工作：", ...chosen.map((c) => `${safePath(c.path)}:${c.side === "new" ? "新" : "旧"}${c.line} — ${c.text}`)].join("\n");
    if (dryRun) return { sent: 0, text };
    const release = this.d.inputOwnership?.take(id, "review");
    if (this.d.inputOwnership && !release) throw errors.invalidInput("该会话的输入权当前已被占用");
    this.sending.add(id);
    try {
      const client = await this.terminalClient(s);
      if (generation !== undefined) {
        const latest = this.get(id);
        if (sessionGeneration(latest) !== generation || launchHash(latest.reviewComments ?? []) !== launchHash(all)) throw errors.versionConflict(launchHash(latest));
      }
      const mark = (patch: (c: ReviewComment) => ReviewComment) => {
        const cur = this.get(id);
        this.save({ ...cur, reviewComments: (cur.reviewComments ?? []).map((c) => (chosen.some((x) => x.id === c.id) ? patch(c) : c)) });
      };
      const clear = (c: ReviewComment): ReviewComment => {
        const { sending: _s, ...rest } = c;
        return rest;
      };
      // 先落盘“发送中”：发送期间崩溃时，重启后能看出这批意见送达状态未知，而不是静默重发
      mark((c) => ({ ...c, sending: true }));
      try {
        await client.call("terminal.send", { terminal: s.terminalId, text });
      } catch (e) {
        if (e instanceof HerdrError) {
          mark(clear); // Core 明确拒绝了：没有送达
          const msg = `${e.message} ${e.kind ?? ""}`;
          if (/not.?found|unknown terminal|no such terminal|no terminal|has finished|finished/i.test(msg)) throw errors.invalidInput("会话的终端已经结束：恢复会话后再发送");
          throw e;
        }
        // 超时或连接中断：请求可能已经送达。保留“发送中”，由用户确认后再决定是否重发
        throw new HuhuError("INTERNAL", "发送结果未知（连接中断或超时）：这批意见标记为“发送状态未知”，确认终端里没有收到后再重发", { retryable: false });
      }
      const at = this.d.now().toISOString();
      mark((c) => ({ ...clear(c), sentAt: at }));
      return { sent: chosen.length, text };
    } finally {
      this.sending.delete(id);
      release?.();
    }
  }

  rename(id: string, name: string): SessionRecord {
    if (!name.trim()) throw errors.invalidInput("名称必填");
    const next = { ...this.get(id), name: name.trim() };
    this.save(next);
    return next;
  }
}
