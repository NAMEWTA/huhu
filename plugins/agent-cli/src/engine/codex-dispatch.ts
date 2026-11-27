import { execFile } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { accessSync, closeSync, constants, createReadStream, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { errors, ExecutionReceiptAckSchema, ExecutionReceiptSchema, HuhuError, type ExecutionBinding, type ExecutionReceipt, type ExecutionReceiptAck, type TaskMcpAuthorization } from "@huhu/contracts";
import { executionReceiptIdentity, validateExecutionReceiptAck } from "@huhu/contracts/execution-receipt/engine";
import { z } from "zod";
import { entryOf, type AgentSettingsFile } from "../shared/settings.js";
import { launchHash } from "./launch-binding.js";
import { ProviderAcceptance, type DispatchLookup } from "./dispatch-store.js";
import { putReceiptFile } from "./execution-receipts.js";
import { answerFingerprint, NativeAnswerIntents, NativeAnswerStatus, type NativeAnswer } from "./native-answer.js";
import { NativeStopStatus, stopFingerprint, type NativeStop } from "./native-stop.js";
import type { LaunchInput } from "./sessions.js";

const Version = "codex-cli 0.171.0";
const WindowsNativeChoiceSha256 = "cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7";
const LinuxVersion = "codex-cli 0.170.0";
const LinuxNativeChoiceSha256 = "880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971";
const Id = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const HistoryProof = z.strictObject({ historyId: Digest, revision: Digest, source: Digest });
const Thread = z.strictObject({ attempt: Id, threadId: Id, address: Id, pid: z.number().int().positive(), protocol: z.literal(2).optional(), socket: z.string().max(103).optional(), history: HistoryProof.optional() });
const Resume = HistoryProof.extend({ threadId: z.uuid(), file: z.string().min(1), cwd: z.string().min(1), physical: z.string().min(1), dispatchId: z.string().min(1) });
const ResumeRefusal = z.strictObject({ attempt: Id, source: Digest, address: Id, pid: z.number().int().positive(), reason: z.literal("history_writer_busy") });
const LaunchConfiguration = z.object({
  node: z.string(),
  helper: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  home: z.string(),
  model: z.string().optional(),
  effort: z.string().optional(),
  fast: z.boolean(),
  binaryStamp: Digest,
  helperStamp: Digest,
  configStamp: Digest.nullable(),
});
const Launch = z.looseObject({ secret: Digest, attempt: Id, vaultId: Id, machineId: Id, sessionId: Id, coreId: Id, resume: Resume.optional() });
const Completion = z.strictObject({
  threadId: Id,
  turnId: Id,
  status: z.enum(["completed", "failed", "interrupted"]).optional(),
  error: z.strictObject({ message: z.string().max(8_000).regex(/\S/), code: Id.optional() }).optional(),
  withoutFinal: z.enum(["allowed", "unconfirmed"]).optional(),
});
export const nativeTerminalCodes = {
  interrupted: "codex_terminal_interrupted",
  stopped: "codex_terminal_user_stop",
  unconfirmed: "codex_terminal_result_unconfirmed",
} as const;
const AnswerAck = z.strictObject({ fingerprint: Digest });
const ResolvedAnswer = AnswerAck.extend({ turnId: Id, itemId: Id, questionId: Id, offset: z.int().nonnegative() });
const StopWrite = z.strictObject({ fingerprint: Digest, threadId: Id, turnId: Id });
const Item = z.strictObject({ threadId: Id, turnId: Id, itemId: Id });
const NativeReport = z.strictObject({
  source: z.discriminatedUnion("kind", [Item.extend({ kind: z.literal("question"), rpcId: z.union([z.int(), Id]), questionId: Id }), Item.extend({ kind: z.literal("result") })]),
  receipt: ExecutionReceiptSchema,
});
const exec = promisify(execFile);

export interface TaskMcpDispatch {
  key: DispatchLookup;
  authorization: TaskMcpAuthorization;
}

export interface CodexDispatchOptions {
  taskMcp?: {
    available(): boolean;
    issue(dispatch: TaskMcpDispatch, runtime: { live(): boolean; submitted(): boolean; cleanup(): void }): { url: string; token: string } | undefined;
  };
  root: string;
  helper?: string | undefined;
  nodeBin?: string | undefined;
  binary?: string | undefined;
  home?: string | undefined;
  /** Only used by the protocol fixture. Production runs the native executable directly. */
  fixtureArgs?: string[] | undefined;
}

type CodexPlan = {
  node: string;
  helper: string;
  command: string;
  args: string[];
  home: string;
  model?: string;
  effort?: string;
  fast: boolean;
  binaryStamp: string;
  helperStamp: string;
  configStamp: string | null;
  nativeChoiceBridge: boolean;
  workspace?: { root: string; rootIdentity: string; files: { path: string; stamp: string }[] };
  resume?: z.infer<typeof Resume>;
};
type Identity = Pick<z.infer<typeof Launch>, "vaultId" | "machineId" | "sessionId" | "coreId" | "attempt">;
type Control = z.infer<typeof Launch> & { directory: string };
type BoundSession = { id: string; coreId: string; attempt: string; address: string; pid: number };
type PendingReport = { receipt: ExecutionReceipt; acknowledge(ack: ExecutionReceiptAck): void };

const unavailable = () => new HuhuError("HEADLESS_UNSUPPORTED", "当前配置无法验证 Codex 受控派遣");
const signature = (key: string, purpose: string, data: unknown) =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update(JSON.stringify([purpose, data]))
    .digest("hex");
const authentic = (actual: unknown, expected: string) => typeof actual === "string" && Digest.safeParse(actual).success && timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
const pipe = (secret: string) => "\\\\.\\pipe\\huhu-codex-" + signature(secret, "socket", 1);
const stamp = (item: string) => {
  const stat = statSync(item, { bigint: true });
  if (!stat.isFile()) throw unavailable();
  return launchHash([item, stat.ino.toString(), stat.size.toString(), stat.mtimeNs.toString()]);
};

function signedFile<T>(control: Control, name: string, schema: z.ZodType<T>): T | null {
  try {
    const { data, mac } = JSON.parse(readFileSync(path.join(control.directory, name + ".json"), "utf8")) as { data: unknown; mac: unknown };
    return authentic(mac, signature(control.secret, name, data)) ? schema.parse(data) : null;
  } catch {
    return null;
  }
}

function runArtifact(execution: ExecutionBinding, name: "receipt" | "completed" | "stop-write", protocol?: 2): string {
  if (protocol !== 2) return name;
  const { vaultId, taskId, runId, attempt, dispatchId, sessionBinding: binding } = execution;
  const scope = [vaultId, taskId, runId, attempt, dispatchId, binding.machineId, binding.sessionId, binding.coreId, binding.coreAddress, binding.processGeneration, binding.provider, binding.nativeSessionId];
  return `run-${launchHash(scope)}-${name}`;
}

/** Codex 0.170 emits raw response events for thread/start only. A restored turn persists the same items in its rollout. */
function rolloutConfirmsAnswer(resume: z.infer<typeof Resume>, { turnId, itemId, questionId, offset }: z.infer<typeof ResolvedAnswer>, answer: string): boolean {
  let handle: number | undefined;
  try {
    handle = openSync(resume.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(handle, { bigint: true });
    const length = stat.size - BigInt(offset);
    if (!stat.isFile() || `${stat.dev}:${stat.ino}:${stat.birthtimeNs}` !== resume.physical || length <= 0n) return false;
    const bytes = Buffer.alloc(Math.min(Number(length), 8 * 1024 * 1024));
    const count = readSync(handle, bytes, 0, bytes.length, offset);
    const end = bytes.subarray(0, count).lastIndexOf(0x0a);
    if (end < 0) return false;
    const lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, end)).split("\n");
    const expected = JSON.stringify({ answers: { [questionId]: { answers: [answer] } } });
    let inTurn = false;
    let sawCall = false;
    let sawAnswer = false;
    for (const line of lines) {
      const { type, payload } = JSON.parse(line);
      if (type === "event_msg" && payload?.type === "task_started") {
        if (inTurn) return false;
        inTurn = payload.turn_id === turnId;
      }
      if (!inTurn) continue;
      if (type === "event_msg" && (payload?.type === "task_complete" || payload?.type === "turn_aborted")) return payload.turn_id === turnId && sawAnswer;
      if (type !== "response_item" || payload?.call_id !== itemId) continue;
      if (payload.type === "function_call") {
        if (sawCall || payload.name !== "request_user_input") return false;
        sawCall = true;
      } else if (payload.type === "function_call_output" && sawCall) {
        if (payload.name != null && payload.name !== "request_user_input") return false;
        const { output } = payload;
        const text = Array.isArray(output) && output.length === 1 && output[0]?.type === "input_text" ? output[0].text : output;
        if (sawAnswer || typeof text !== "string" || text.length > 16_000 || JSON.stringify(JSON.parse(text)) !== expected) return false;
        sawAnswer = true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
}

export class CodexDispatch {
  private versionCheck?: { stamp: string; result: Promise<{ nativeChoiceBridge: boolean } | null> };
  readonly answerIntents: NativeAnswerIntents;

  constructor(
    private readonly options: CodexDispatchOptions,
    private readonly settings: () => AgentSettingsFile,
  ) {
    this.answerIntents = new NativeAnswerIntents(path.join(options.root, "native-answer-intents.json"));
  }

  get taskMcpAvailable(): boolean {
    return this.options.taskMcp?.available() === true;
  }

  get configured(): boolean {
    const { binary, helper, home } = this.options;
    return ["win32", "linux", "darwin"].includes(process.platform) && !!(binary && helper && home);
  }

  get historyProfile(): string | undefined {
    const directory = this.options.home;
    if (!this.configured || !directory || !path.isAbsolute(directory)) return undefined;
    try {
      const home = realpathSync(directory);
      const linuxNative = process.platform === "linux" && !this.options.fixtureArgs?.length;
      const defaultHome = path.join(homedir(), ".codex");
      const globalHome = process.env["CODEX_HOME"];
      // Windows and default macOS volumes are usually case-insensitive.
      const fold = (value: string) => (process.platform === "linux" ? value : value.toLowerCase());
      const canonical = (candidate: string) => fold(statSync(candidate, { throwIfNoEntry: false }) ? realpathSync(candidate) : path.resolve(candidate));
      const homeKey = fold(home);
      const homeStat = statSync(home);
      if (
        !homeStat.isDirectory() ||
        (linuxNative && (homeStat.uid !== process.getuid?.() || (homeStat.mode & 0o077) !== 0)) ||
        [defaultHome, ...(globalHome ? [globalHome] : [])].some((candidate) => {
          const globalKey = canonical(candidate);
          return homeKey === globalKey || homeKey.startsWith(globalKey + path.sep) || globalKey.startsWith(homeKey + path.sep);
        })
      )
        return undefined;
      return home;
    } catch {
      return undefined;
    }
  }

  private configuration(input: Pick<LaunchInput, "model" | "effort" | "fast">): Omit<CodexPlan, "resume" | "nativeChoiceBridge"> {
    const settingsEntry = entryOf(this.settings(), "codex");
    if (settingsEntry.enabled === false) throw new HuhuError("AGENT_DISABLED", "Codex 已停用");
    if (!this.configured || settingsEntry.args?.length) throw unavailable();
    const model = input.model ?? settingsEntry.model;
    const effort = input.effort ?? settingsEntry.effort;
    const fast = input.fast ?? settingsEntry.fast ?? false;
    if ((model !== undefined && !Id.safeParse(model).success) || (effort !== undefined && !/^(none|minimal|low|medium|high|xhigh|ultra)$/.test(effort))) throw errors.invalidInput("Codex 模型或推理强度无效");
    const { binary, helper: file, fixtureArgs = [], nodeBin = process.execPath } = this.options;
    try {
      if (![binary!, file!, nodeBin, this.options.root].every(path.isAbsolute)) throw unavailable();
      const command = realpathSync(binary!);
      const helper = realpathSync(file!);
      const node = realpathSync(nodeBin);
      const home = this.historyProfile;
      if (!home) throw unavailable();
      // The interactive settings can point at this same isolated history profile. The helper still supplies its own environment.
      for (const [key, value] of Object.entries(settingsEntry.env ?? {})) {
        if (key !== "CODEX_HOME" || !path.isAbsolute(value) || path.relative(realpathSync(value), home) !== "") throw unavailable();
      }
      if (process.platform === "win32") {
        if ([binary!, command].some((candidate) => path.extname(candidate).toLowerCase() !== ".exe")) throw unavailable();
      } else {
        accessSync(command, constants.X_OK);
      }
      const binaryStamp = stamp(command);
      const helperStamp = stamp(helper);
      const config = path.join(home, "config.toml");
      const configStamp = statSync(config, { throwIfNoEntry: false }) ? stamp(config) : null;
      return { node, helper, command, args: fixtureArgs, home, ...(model && { model }), ...(effort && { effort }), fast, binaryStamp, helperStamp, configStamp };
    } catch {
      throw unavailable();
    }
  }

  async prepare(input: Pick<LaunchInput, "model" | "effort" | "fast" | "history" | "resumeDispatchId">, workspace?: CodexPlan["workspace"]): Promise<CodexPlan> {
    const configuration = this.configuration(input);
    const { command, args: fixtureArgs, home, binaryStamp } = configuration;
    const linuxNative = process.platform === "linux" && fixtureArgs.length === 0;
    try {
      if (this.versionCheck?.stamp !== binaryStamp) {
        const env = process.platform === "win32" ? undefined : { HOME: home, CODEX_HOME: home, PATH: process.env["PATH"] };
        const result = (async () => {
          const expected = process.arch === "x64" && fixtureArgs.length === 0 ? (linuxNative ? LinuxNativeChoiceSha256 : process.platform === "win32" ? WindowsNativeChoiceSha256 : undefined) : undefined;
          let verified = false;
          if (expected) {
            const hash = createHash("sha256");
            for await (const chunk of createReadStream(command)) hash.update(chunk);
            verified = hash.digest("hex") === expected && stamp(command) === binaryStamp;
          }
          // Only launch an installation that matches the tested Linux build.
          if (linuxNative && !verified) return null;
          const { stdout } = await exec(command, [...fixtureArgs, "--version"], { env, windowsHide: true, timeout: 4_000, maxBuffer: 4096 });
          return stdout.trim() === (linuxNative ? LinuxVersion : Version) ? { nativeChoiceBridge: verified } : null;
        })().catch(() => null);
        this.versionCheck = { stamp: binaryStamp, result };
      }
      const version = await this.versionCheck.result;
      if (!version) throw unavailable();
      if (workspace && (!linuxNative || !version.nativeChoiceBridge || input.history)) throw unavailable();
      let resume: CodexPlan["resume"];
      const history = input.history;
      if (history) {
        const verifiedResume = linuxNative && version.nativeChoiceBridge;
        if ((!verifiedResume && !fixtureArgs.length) || history.mode !== "resume" || history.profile !== home || !history.file || !history.sourceCwd || !history.revision || !input.resumeDispatchId) throw unavailable();
        const { file, sourceId: historyId, revision, sourceCwd: cwd, nativeId: threadId } = history;
        accessSync(file, constants.R_OK | constants.W_OK);
        accessSync(path.dirname(file), constants.W_OK);
        const stat = statSync(file, { bigint: true });
        if (!stat.isFile() || stat.ino === 0n || realpathSync(file) !== file) throw unavailable();
        const physical = `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
        const actual = createHash("sha256").update([physical, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":")).digest("hex");
        if (actual !== revision) throw unavailable();
        resume = Resume.parse({ threadId, file, cwd, physical, historyId, revision, dispatchId: input.resumeDispatchId, source: launchHash([home, file, cwd, threadId, physical]) });
      }
      return { ...configuration, nativeChoiceBridge: version.nativeChoiceBridge, ...(resume && { resume }), ...(workspace && { workspace }) };
    } catch {
      throw unavailable();
    }
  }

  private directory(vaultId: string, machineId: string, attempt: string): string {
    return path.join(this.options.root, launchHash([vaultId, machineId, attempt]));
  }

  start(plan: CodexPlan, identity: Identity, taskMcp?: TaskMcpDispatch): string[] {
    const directory = this.directory(identity.vaultId, identity.machineId, identity.attempt);
    mkdirSync(this.options.root, { recursive: true, mode: 0o700 });
    mkdirSync(directory, { mode: 0o700 });
    const file = path.join(directory, "launch.json");
    writeFileSync(file, JSON.stringify({ ...identity, ...plan, secret: randomBytes(32).toString("hex") }), { flag: "wx", flush: true, mode: 0o600 });
    if (taskMcp) {
      const tokenFile = path.join(directory, "task-mcp-token.json");
      const control = this.control(identity)!;
      const providerSettings = launchHash(entryOf(this.settings(), "codex"));
      const activeHelper = z.strictObject({ pid: z.int().positive(), processStart: z.string().optional() });
      const credential = this.options.taskMcp?.issue(taskMcp, {
        live: () => {
          const helper = signedFile(control, "task-mcp-active", activeHelper);
          if (!helper) return false;
          process.kill(helper.pid, 0);
          if (process.platform === "linux" && statSync(`/proc/${helper.pid}`, { bigint: true }).ino.toString() !== helper.processStart) return false;
          return launchHash(entryOf(this.settings(), "codex")) === providerSettings &&
            stamp(plan.command) === plan.binaryStamp && stamp(plan.helper) === plan.helperStamp &&
            (statSync(path.join(plan.home, "config.toml"), { throwIfNoEntry: false }) ? stamp(path.join(plan.home, "config.toml")) : null) === plan.configStamp;
        },
        submitted: () => !!signedFile(control, "task-mcp-submitted", activeHelper),
        cleanup: () => rmSync(tokenFile, { force: true }),
      });
      if (!credential) throw new HuhuError("PERMISSION_DENIED", "任务 MCP 授权已失效", { details: { reason: "task_mcp_authorization_inactive" } });
      writeFileSync(tokenFile, JSON.stringify({ ...credential, key: taskMcp.key }), { flag: "wx", flush: true, mode: 0o600 });
    }
    return [plan.node, plan.helper, file];
  }

  private control(identity: Identity): Control | null {
    try {
      const directory = this.directory(identity.vaultId, identity.machineId, identity.attempt);
      const saved = Launch.parse(JSON.parse(readFileSync(path.join(directory, "launch.json"), "utf8")));
      if (Object.entries(identity).some(([key, value]) => saved[key as keyof Identity] !== value)) return null;
      return { ...saved, directory };
    } catch {
      return null;
    }
  }

  private forSession(vaultId: string, machineId: string, session: BoundSession) {
    const control = this.control({ vaultId, machineId, sessionId: session.id, coreId: session.coreId, attempt: session.attempt });
    if (!control) return null;
    const thread = signedFile(control, "thread", Thread);
    if (!thread || thread.attempt !== control.attempt || thread.pid !== session.pid || thread.address !== session.address) return null;
    const resume = control.resume;
    if (resume) {
      if (thread.protocol !== 2 || thread.threadId !== resume.threadId || !thread.history || thread.history.historyId !== resume.historyId || thread.history.revision !== resume.revision || thread.history.source !== resume.source)
        return null;
    } else if (thread.history) return null;
    return { control, thread };
  }

  thread(vaultId: string, machineId: string, session: BoundSession) {
    return this.forSession(vaultId, machineId, session)?.thread ?? null;
  }

  assertResumeConfiguration(execution: ExecutionBinding, session: BoundSession): void {
    const { sessionBinding } = execution;
    const bound = this.forSession(execution.vaultId, sessionBinding.machineId, session);
    if (!bound || bound.control.resume?.dispatchId !== execution.dispatchId || bound.thread.threadId !== sessionBinding.nativeSessionId) throw unavailable();
    // Restore may have updated the rollout. The helper checks that file against its post-restore stamp.
    let current: ReturnType<CodexDispatch["configuration"]>;
    try {
      current = this.configuration({});
    } catch (error) {
      if (error instanceof HuhuError && error.code === "INVALID_INPUT") throw unavailable();
      throw error;
    }
    const saved = LaunchConfiguration.safeParse(bound.control);
    if (!saved.success || launchHash(saved.data) !== launchHash(current)) throw unavailable();
  }

  resumeWriterBusy(vaultId: string, machineId: string, session: BoundSession): boolean {
    const control = this.control({ vaultId, machineId, sessionId: session.id, coreId: session.coreId, attempt: session.attempt });
    if (!control?.resume) return false;
    const refusal = signedFile(control, "resume-refusal", ResumeRefusal);
    return !!refusal && refusal.attempt === control.attempt && refusal.source === control.resume.source && refusal.pid === session.pid && refusal.address === session.address;
  }

  evidence(execution: ExecutionBinding, session: BoundSession) {
    const { sessionBinding } = execution;
    const bound = this.forSession(execution.vaultId, sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== sessionBinding.nativeSessionId) return null;
    const proof = signedFile(bound.control, runArtifact(execution, "receipt", bound.thread.protocol), ProviderAcceptance);
    if (!proof?.nativeTurnId || launchHash(proof.execution) !== launchHash(execution)) return null;
    const completed = signedFile(bound.control, runArtifact(execution, "completed", bound.thread.protocol), Completion);
    const finished = completed?.threadId === bound.thread.threadId && completed.turnId === proof.nativeTurnId;
    return { proof, finished, terminalStatus: finished ? completed.status : undefined };
  }

  *reports(execution: ExecutionBinding, session: BoundSession, inputSha256: string, resultMode: "allow_no_update" | undefined, stopIntent: () => string | null): Iterable<PendingReport> {
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return;
    const { control } = bound;
    const proof = signedFile(control, runArtifact(execution, "receipt", bound.thread.protocol), ProviderAcceptance);
    if (!proof?.nativeTurnId || proof.inputSha256 !== inputSha256 || launchHash(proof.execution) !== launchHash(execution)) return;
    for (const file of readdirSync(control.directory).sort()) {
      const match = /^report-(codex-[a-f0-9]{64})\.json$/.exec(file);
      if (!match) continue;
      const report = signedFile(control, file.slice(0, -5), NativeReport);
      if (!report) continue;
      const { source, receipt } = report;
      if (receipt.receiptId !== match[1] || receipt.kind !== source.kind || source.threadId !== bound.thread.threadId || source.turnId !== proof.nativeTurnId || launchHash(receipt.execution) !== launchHash(execution)) continue;
      if (receipt.kind === "question" && receipt.payload.mode !== "native_deferred") continue;
      const pending = this.pendingReport(control, receipt);
      if (pending) yield pending;
    }
    const completion = signedFile(control, runArtifact(execution, "completed", bound.thread.protocol), Completion);
    if (completion?.threadId !== bound.thread.threadId || completion.turnId !== proof.nativeTurnId) return;
    const receipt = this.terminalReceipt(execution, session, completion, resultMode, stopIntent);
    const pending = receipt && this.pendingReport(control, receipt);
    if (pending) yield pending;
  }

  private terminalReceipt(execution: ExecutionBinding, session: BoundSession, completion: z.infer<typeof Completion>, resultMode: "allow_no_update" | undefined, stopIntent: () => string | null): ExecutionReceipt | undefined {
    const { threadId, turnId, status, error, withoutFinal } = completion;
    const receiptId = "codex-" + launchHash(["terminal", execution, threadId, turnId]);
    const base = { version: 1, receiptId, execution } as const;
    if (status === "failed") {
      return { ...base, kind: "failed", payload: { code: error?.code ? `codex_error_${error.code}` : "codex_failed", message: error?.message ?? "原生执行失败，未提供原因" } };
    }
    if (status === "interrupted") {
      const stopId = stopIntent();
      const stopped = stopId !== null && this.stopWritten({ execution, stopId }, session, turnId);
      return { ...base, kind: "failed", payload: stopped ? { code: nativeTerminalCodes.stopped, message: "用户已停止原生执行" } : { code: nativeTerminalCodes.interrupted, message: "原生执行被外部中断" } };
    }
    if (status !== "completed" || !withoutFinal) return;
    if (withoutFinal === "allowed" && resultMode === "allow_no_update") return { ...base, kind: "no_update", payload: {} };
    return { ...base, kind: "failed", payload: { code: nativeTerminalCodes.unconfirmed, message: "原生执行已结束，结果待核实" } };
  }

  private pendingReport(control: Control, receipt: ExecutionReceipt): PendingReport | undefined {
    const ackName = "agent-ack-" + receipt.receiptId;
    const ack = signedFile(control, ackName, ExecutionReceiptAckSchema);
    if (validateExecutionReceiptAck(ack, "agent_received", executionReceiptIdentity(receipt))) return;
    return { receipt, acknowledge: (acknowledgement) => this.acknowledgeReport(control, ackName, acknowledgement) };
  }

  acknowledgeReport(control: Control, name: string, ack: ExecutionReceiptAck): void {
    putReceiptFile(path.join(control.directory, name + ".json"), { data: ack, mac: signature(control.secret, name, ack) }, true);
  }

  answerAccepted(input: NativeAnswer, session: BoundSession): boolean {
    const { execution } = input;
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return false;
    const fingerprint = answerFingerprint(input);
    const { control, thread } = bound;
    if (signedFile(control, "answer-ack-" + fingerprint, AnswerAck)?.fingerprint === fingerprint) return true;
    if (!control.resume) return false;
    const resolved = signedFile(control, "answer-resolved-" + fingerprint, ResolvedAnswer);
    if (resolved?.fingerprint !== fingerprint) return false;
    const completion = signedFile(control, runArtifact(execution, "completed", thread.protocol), Completion);
    return completion?.threadId === thread.threadId && completion.turnId === resolved.turnId && rolloutConfirmsAnswer(control.resume, resolved, input.answer);
  }

  stopWritten(input: NativeStop, session: BoundSession, turnId: string): boolean {
    const { execution } = input;
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return false;
    const write = signedFile(bound.control, runArtifact(execution, "stop-write", bound.thread.protocol), StopWrite);
    return write?.threadId === bound.thread.threadId && write.turnId === turnId && write.fingerprint === stopFingerprint(input);
  }

  connectAnswer(input: NativeAnswer, session: BoundSession, signal: AbortSignal) {
    return this.connectControl("answer", NativeAnswerStatus, input, session, signal);
  }

  connectStop(input: NativeStop, session: BoundSession, signal: AbortSignal) {
    return this.connectControl("stop", NativeStopStatus, input, session, signal);
  }

  private async connectControl<S extends string>(kind: "answer" | "stop", schema: z.ZodType<S>, input: { execution: ExecutionBinding }, session: BoundSession, signal: AbortSignal) {
    const connection = await this.open(input.execution, session, signal);
    if (!connection) return null;
    const { socket, nonce, secret } = connection;
    return {
      exchange(action: "submit" | "inspect"): Promise<S | "unknown"> {
        if (socket.destroyed) return Promise.resolve("unknown");
        const data = { operation: `${kind}.${action}`, ...input };
        const result = controlResponse(socket, nonce, secret, `${kind}-response`, schema);
        socket.end(JSON.stringify({ data, mac: signature(secret, "input", [nonce, data]) }) + "\n");
        return result;
      },
      close: () => socket.destroy(),
    };
  }

  async connect(execution: ExecutionBinding, session: BoundSession, signal: AbortSignal): Promise<{ submit(input: string, resultMode?: "allow_no_update"): void; close(): void } | null> {
    const connection = await this.open(execution, session, signal);
    if (!connection) return null;
    const { socket, nonce, secret } = connection;
    return {
      submit(input, resultMode) {
        const data = { execution, input, resultMode };
        socket.end(JSON.stringify({ data, mac: signature(secret, "input", [nonce, data]) }) + "\n");
      },
      close: () => socket.destroy(),
    };
  }

  private async open(execution: ExecutionBinding, session: BoundSession, signal: AbortSignal) {
    signal.throwIfAborted();
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return null;
    const { secret } = bound.control;
    const endpoint = process.platform === "win32" ? pipe(secret) : bound.thread.socket;
    if (!endpoint || (process.platform !== "win32" && !path.isAbsolute(endpoint))) return null;
    const nonce = randomBytes(32).toString("hex");
    const socket = createConnection(endpoint);
    const abort = () => socket.destroy();
    signal.addEventListener("abort", abort, { once: true });
    socket.once("close", () => signal.removeEventListener("abort", abort));
    socket.on("error", () => socket.destroy());
    const authenticated = await authenticate(socket, nonce, secret);
    if (!authenticated || signal.aborted) {
      socket.destroy();
      return null;
    }
    return { socket, nonce, secret };
  }
}

function controlResponse<S extends string>(socket: Socket, nonce: string, secret: string, purpose: string, schema: z.ZodType<S>): Promise<S | "unknown"> {
  return new Promise((resolve) => {
    let buffer = "";
    const finish = (status: S | "unknown") => {
      clearTimeout(timer);
      socket.off("data", receive);
      socket.off("close", closed);
      resolve(status);
    };
    const closed = () => finish("unknown");
    const receive = (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 256) finish("unknown");
      else if (buffer.endsWith("\n")) {
        try {
          const frame = JSON.parse(buffer) as { status: unknown; mac: unknown };
          const status = schema.parse(frame.status);
          finish(authentic(frame.mac, signature(secret, purpose, [nonce, status])) ? status : "unknown");
        } catch {
          finish("unknown");
        }
      }
    };
    const timer = setTimeout(() => finish("unknown"), 2_000);
    socket.once("close", closed).on("data", receive);
  });
}

function authenticate(socket: Socket, nonce: string, secret: string): Promise<boolean> {
  return new Promise((resolve) => {
    let buffer = "";
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      socket.off("data", receive);
      socket.off("close", closed);
      resolve(ok);
    };
    const closed = () => finish(false);
    const receive = (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 65) finish(false);
      else if (buffer.endsWith("\n")) finish(authentic(buffer.slice(0, -1), signature(secret, "ready", nonce)));
    };
    const timer = setTimeout(() => finish(false), 2_000);
    socket
      .setEncoding("utf8")
      .once("connect", () => socket.write(nonce + "\n"))
      .on("data", receive)
      .once("close", closed);
  });
}
