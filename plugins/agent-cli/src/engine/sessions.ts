import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { isValidNativeId, isWithin } from "./history/scanner.js";
import { agentById, type AgentId } from "../shared/catalog.js";
import { redactSecrets, shellCommand, type ShellName } from "../shared/shell.js";
import type { ResolvedLaunch, ResolveInput } from "./launch.js";
import { hasLaunchLabels, identifyCore, launchHash, launchLabels, processBinding, sameCore, sameProcess, type LaunchReceipt, type ProcessBinding, type Terminal } from "./launch-binding.js";
import type { SpaceStore } from "./spaces.js";

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
  terminalId: string | null;
  name: string;
  cwd: string;
  createdAt: string;
  /** 由历史恢复启动时记录 provider 原生会话 id。 */
  nativeSessionId?: string;
  /** 终端命令会话（automations 的 terminal 动作）：显示用，不含环境变量。 */
  command?: string;
  /** 启动时带了保险箱环境变量（只存布尔，不存值）：输出读取与终端清理都以它为准，不信任调用方的声明。 */
  hasEnv?: boolean;
  /** 变更审查意见（随会话记录保存）。 */
  reviewComments?: ReviewComment[];
  /** 程序经 OSC 7501 上报 blocked（等人工）的状态；`n` 是第几次进入 blocked，发生标识 = `<会话 id>:<n>`，重连、重启 Engine 不会重复处理。 */
  waiting?: WaitingInfo;
  error?: string;
}

export function publicSession({ launchReceipt: _launchReceipt, ...session }: SessionRecord): Omit<SessionRecord, "launchReceipt"> {
  return session;
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
  /** 恢复历史会话（仅内部调用：id 来自对历史的扫描结果，不由外部直接传入）。 */
  resumeSessionId?: string | undefined;
  /** 显式 cwd 必须是 Space 范围内的现有绝对目录。 */
  cwd?: string | undefined;
  /** 终端命令（只与 provider=shell 一起用）：以 `argv = [shell, -c, command]` 运行，能拿到退出码。 */
  command?: string | undefined;
  shell?: ShellName | undefined;
  /** 已由调用方（引擎侧）从保险箱解析好的环境变量；只传给 terminal.run，不落盘、不回显。 */
  env?: Record<string, string> | undefined;
  envRefs?: Record<string, string> | undefined;
}

type TerminalSnapshot = { kind: "available"; client: HerdrClient; core: Awaited<ReturnType<typeof identifyCore>>; terminals: Terminal[] } | { kind: "absent" | "unavailable" };
type LaunchIntent = { literalHash: string; resolvedHash: string | null };
type LaunchIndex = Pick<LaunchReceipt, "vaultId" | "machineId" | "intentHash" | "executionHash" | "literalIntentHash"> & { requestId: string; sessionId: string };

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
}

/** 交互会话：先持久化记录，再 terminal.run；响应丢失时按 huhu.launch 标签找回，绝不重复 run。 */
export class SessionsService {
  constructor(private readonly d: SessionsDeps) {}

  private file(id: string): string {
    return path.join(this.d.dir, `${id}.json`);
  }
  private save(s: SessionRecord): void {
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

  private readonly inflight = new Map<string, { intent: LaunchIntent; executionHash: string | undefined; result: Promise<SessionRecord> }>();

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

  async launch(input: LaunchInput): Promise<SessionRecord> {
    const intent = this.launchIntent(input);
    const previous = this.recordedLaunch(input.requestId);
    if (previous) this.verifyIntent(previous, intent);

    let prepared: Awaited<ReturnType<SessionsService["prepareLaunch"]>> | undefined;
    try {
      prepared = await this.prepareLaunch(input);
    } catch (error) {
      // A sent operation remains queryable even when its old directory or executable is gone.
      if (!previous?.launchReceipt?.attempt) throw error;
    }
    if (prepared && input.cwd !== undefined && this.launchIntent(input, prepared.cwd).resolvedHash !== intent.resolvedHash) {
      throw new HuhuError("VERSION_CONFLICT", "预检期间工作目录发生变化，请重新选择");
    }
    const executionHash =
      prepared &&
      launchHash({
        machineId: prepared.space.machineId,
        cwd: prepared.cwd,
        argv: prepared.argv,
        envNames: Object.keys(prepared.env ?? {}).sort(),
      });
    const running = this.inflight.get(input.requestId);
    if (running) {
      const sameIntent = intent.resolvedHash === null ? running.intent.literalHash === intent.literalHash : running.intent.resolvedHash === intent.resolvedHash;
      if (!sameIntent || (executionHash && running.executionHash && executionHash !== running.executionHash)) throw errors.idempotencyMismatch();
      return running.result;
    }
    const result = this.doLaunch(input, intent, executionHash, prepared).finally(() => this.inflight.delete(input.requestId));
    this.inflight.set(input.requestId, { intent, executionHash, result });
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

  private async prepareLaunch(input: Omit<LaunchInput, "requestId">) {
    const space = this.d.spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    // cmd.exe 把盘符的扩展路径当作 UNC。常规长度的本机路径可用普通盘符形式启动。
    const cwd = localDrivePath(this.launchDirectory(space.root, input.cwd));
    if (process.platform === "win32" && cwd.length > MAX_WINDOWS_CORE_CWD) {
      throw new HuhuError("INVALID_INPUT", "Windows 上的 Herdr Core 无法在此长度的工作目录中启动，请选择较短的目录", {
        details: { stage: "cwd", reason: "windows_cwd_too_long", maxLength: MAX_WINDOWS_CORE_CWD },
      });
    }
    if (input.resumeSessionId !== undefined && !isValidNativeId(input.resumeSessionId)) throw errors.invalidInput("会话 id 无效");
    let argv: string[] | undefined;
    let env: Record<string, string> | undefined;
    if (input.command !== undefined) {
      if (input.provider !== "shell") throw errors.invalidInput("command 只能与终端（shell）一起用");
      argv = shellCommand(input.shell ?? "default", input.command);
      if (input.env && Object.keys(input.env).length > 0) env = input.env;
    } else if (input.provider !== "shell") {
      const r = await this.d.resolve({ agentId: input.provider, mode: "interactive", model: input.model, effort: input.effort, fast: input.fast, prompt: input.prompt, resume: input.resumeSessionId });
      argv = [r.command, ...r.argv];
      env = Object.keys(r.env).length > 0 ? r.env : undefined;
    }
    return { space, cwd, argv, env };
  }

  /** 已保存配置的会话预览。Core 默认 shell 由 Core 配置选择。 */
  async preview(input: Omit<LaunchInput, "requestId" | "env" | "resumeSessionId">): Promise<{ machineId: string; cwd: string; command: string | null; argv: string[] }> {
    const { space, cwd, argv } = await this.prepareLaunch(input);
    const [command, ...args] = argv ?? [];
    return { machineId: space.machineId, cwd, command: command ?? null, argv: args };
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

  private async doLaunch(input: LaunchInput, intent: LaunchIntent, executionHash: string | undefined, prepared: Awaited<ReturnType<SessionsService["prepareLaunch"]>> | undefined): Promise<SessionRecord> {
    const previous = this.recordedLaunch(input.requestId);
    const priorReceipt = previous && this.verifyIntent(previous, intent, executionHash);
    if (previous && priorReceipt?.attempt) {
      this.recordLaunchRequest(previous, priorReceipt);
      if (previous.state === "exited") return previous;
      return this.findLaunch(previous);
    }
    if (!prepared || !executionHash || !intent.resolvedHash) throw errors.invalidInput("启动配置不可用");

    const { space, cwd, argv, env } = prepared;
    const receipt: LaunchReceipt = priorReceipt ?? {
      vaultId: this.d.vaultId,
      machineId: space.machineId,
      intentHash: intent.resolvedHash,
      literalIntentHash: intent.literalHash,
      executionHash,
      argvHash: argv ? launchHash(argv) : null,
    };
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
      ...(env ? { hasEnv: true } : {}),
      cwd,
      createdAt: this.d.now().toISOString(),
      ...(input.resumeSessionId ? { nativeSessionId: input.resumeSessionId } : {}),
      launchReceipt: receipt,
    };
    this.recordLaunchRequest(session, receipt);
    this.save(session);
    let client: HerdrClient;
    let core: Awaited<ReturnType<typeof identifyCore>>;
    try {
      client = await this.d.core();
      core = await identifyCore(client);
    } catch {
      throw this.confirmNotCreated(session, receipt, "connect", "连接 Herdr Core 失败，启动请求尚未发送");
    }
    const attempt = { id: randomUUID(), core };
    const pending: SessionRecord = { ...session, state: "launching", launchReceipt: { ...receipt, attempt } };
    delete pending.error;
    this.save(pending);
    if (env) this.secrets.set(session.id, Object.values(env));
    let terminal: Terminal | undefined;
    try {
      terminal = await client.call<Terminal>("terminal.run", { ...(argv ? { argv } : {}), cwd, ...(env ? { env } : {}), labels: launchLabels(this.d.vaultId, pending), name: session.id });
    } catch (error) {
      // JSON-RPC parameter rejection happens before terminal.run. spawn_failed also covers holder timeouts.
      if (error instanceof HerdrError && error.rpc.code === -32602 && error.kind === "invalid_params") {
        throw this.confirmNotCreated(pending, receipt, "run", "Herdr Core 拒绝了启动参数，未创建终端");
      }
    }
    const binding = terminal && this.verifyTerminal(pending, terminal);
    if (terminal && binding) return this.bind(pending, terminal, binding);
    if (terminal?.address && hasLaunchLabels(terminal, launchLabels(this.d.vaultId, pending))) {
      pending.launchReceipt = { ...receipt, attempt: { ...attempt, addressHint: terminal.address } };
      this.save(pending);
    }

    return this.findLaunch(pending);
  }

  private async findLaunch(session: SessionRecord): Promise<SessionRecord> {
    const snapshot = await this.snapshot();
    const updated = this.applySnapshot(session, snapshot);
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

  private verifyTerminal(session: SessionRecord, terminal: Terminal): ProcessBinding | null {
    const receipt = session.launchReceipt;
    if (!receipt || !hasLaunchLabels(terminal, launchLabels(this.d.vaultId, session))) return null;
    if (!terminal.cwd || localDrivePath(terminal.cwd) !== session.cwd) return null;
    if (receipt.argvHash !== null && (!Array.isArray(terminal.argv) || launchHash(terminal.argv) !== receipt.argvHash)) return null;
    return processBinding(terminal);
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
      launchReceipt: { ...receipt, attempt: { id: attempt.id, core: attempt.core, binding } },
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

  private async snapshot(): Promise<TerminalSnapshot> {
    try {
      const client = this.d.peekCore ? await this.d.peekCore() : await this.d.core();
      if (client === "absent") return { kind: "absent" };
      if (!client) return { kind: "unavailable" };
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

  private async terminalClient(session: SessionRecord): Promise<HerdrClient> {
    const attempt = session.launchReceipt?.attempt;
    const snapshot = await this.snapshot();
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
    return snapshot.client;
  }

  /**
   * 终端当前输出（屏幕 + 历史）。命令带环境变量时，只有本进程记得秘密值才能确认已抹掉回显——引擎重启后拿不到就不返回输出。
   * 是否带过环境变量以会话记录里的 `hasEnv` 为准。
   */
  async output(id: string, lines = 200): Promise<{ text: string; complete: boolean }> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    if (s.hasEnv && !this.secrets.has(id)) return { text: "（引擎重启过：无法确认环境变量值已从输出里抹掉，没有收录输出）", complete: false };
    const r = await (await this.terminalClient(s)).call<{ text?: string; screen?: string; history?: string }>("terminal.read", { terminal: s.terminalId, lines: Math.min(Math.max(lines, 1), 2000) });
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
   * 移除已结束的终端：Herdr 会把启动时的环境变量连同终端记录一起保存在状态文件里（restart_env），
   * 带保险箱环境变量的命令读完输出后必须移除终端，秘密值才不会留在 Vault 的运行目录里。
   */
  async release(id: string): Promise<void> {
    const s = this.get(id);
    this.secrets.delete(id);
    if (!s.terminalId) return;
    await (await this.terminalClient(s)).call("terminal.rm", { terminal: s.terminalId });
  }

  async interrupt(id: string): Promise<void> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    await (await this.terminalClient(s)).call("terminal.interrupt", { terminal: s.terminalId });
  }

  async kill(id: string): Promise<void> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    await (await this.terminalClient(s)).call("terminal.kill", { terminal: s.terminalId });
  }

  private lastReconcile = 0;

  /**
   * 用只读快照查回未确定的启动，并核对已绑定进程的退出。列表打开时调用，2 秒内只查一次。
   */
  async reconcile(): Promise<void> {
    const mine = this.list().filter((x) => !this.inflight.has(x.requestId) && ((x.state === "running" && x.terminalId) || (x.launchReceipt?.attempt && (x.state === "launching" || x.state === "unknown"))));
    if (mine.length === 0 || Date.now() - this.lastReconcile < 2000) return;
    this.lastReconcile = Date.now();
    const snapshot = await this.snapshot();
    for (const sess of mine) {
      if (this.inflight.has(sess.requestId)) continue;
      try {
        const current = this.get(sess.id);
        if (current.state !== sess.state || current.terminalId !== sess.terminalId || current.launchReceipt?.attempt?.id !== sess.launchReceipt?.attempt?.id) continue;
        if (current.launchReceipt) {
          this.applySnapshot(current, snapshot);
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
  expireWaiting(sessionId: string): void {
    const sess = this.get(sessionId);
    if (sess.waiting?.active) this.save({ ...sess, waiting: { ...sess.waiting, active: false, expired: true } });
  }

  markWaitingHandled(sessionId: string, n: number): void {
    const sess = this.get(sessionId);
    if (sess.waiting && sess.waiting.handled !== n) this.save({ ...sess, waiting: { ...sess.waiting, handled: n } });
  }

  setWaitingTask(sessionId: string, taskId: string): void {
    const sess = this.get(sessionId);
    if (sess.waiting && sess.waiting.taskId !== taskId) this.save({ ...sess, waiting: { ...sess.waiting, taskId } });
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
  async sendComments(id: string, ids?: string[], dryRun = false): Promise<{ sent: number; text: string }> {
    const s = this.get(id);
    if (!dryRun && (s.state !== "running" || !s.terminalId)) throw errors.invalidInput("会话没有在运行：恢复会话后再发送");
    if (this.sending.has(id)) throw errors.invalidInput("正在发送上一批意见，请稍候");
    const all = s.reviewComments ?? [];
    // 显式指定时也只允许“未发送”的（含发送状态未知的）；已确认发送过的不能再发
    const chosen = ids ? all.filter((c) => ids.includes(c.id) && c.sentAt === null) : all.filter((c) => c.sentAt === null && !c.sending);
    if (chosen.length === 0) throw errors.invalidInput("没有待发送的意见");
    const text = ["请根据以下审查意见继续工作：", ...chosen.map((c) => `${safePath(c.path)}:${c.side === "new" ? "新" : "旧"}${c.line} — ${c.text}`)].join("\n");
    if (dryRun) return { sent: 0, text };
    this.sending.add(id);
    try {
      const client = await this.terminalClient(s);
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
    }
  }

  rename(id: string, name: string): SessionRecord {
    if (!name.trim()) throw errors.invalidInput("名称必填");
    const next = { ...this.get(id), name: name.trim() };
    this.save(next);
    return next;
  }
}
