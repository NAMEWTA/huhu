import { execFile } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { errors, ExecutionReceiptAckSchema, ExecutionReceiptSchema, HuhuError, type ExecutionBinding, type ExecutionReceipt, type ExecutionReceiptAck } from "@huhu/contracts";
import { executionReceiptIdentity, validateExecutionReceiptAck } from "@huhu/contracts/execution-receipt/engine";
import { z } from "zod";
import { entryOf, type AgentSettingsFile } from "../shared/settings.js";
import { launchHash } from "./launch-binding.js";
import { ProviderAcceptance } from "./dispatch-store.js";
import { putReceiptFile } from "./execution-receipts.js";
import { answerFingerprint, NativeAnswerIntents, NativeAnswerStatus, type NativeAnswer } from "./native-answer.js";
import { NativeStopStatus, stopFingerprint, type NativeStop } from "./native-stop.js";
import type { LaunchInput } from "./sessions.js";

const Version = "codex-cli 0.171.0";
const Id = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Thread = z.strictObject({ attempt: Id, threadId: Id, address: Id, pid: z.number().int().positive() });
const Launch = z.object({ secret: Digest, attempt: Id, vaultId: Id, machineId: Id, sessionId: Id, coreId: Id });
const Completion = z.strictObject({ threadId: Id, turnId: Id, status: z.enum(["completed", "failed", "interrupted"]).optional() });
const AnswerAck = z.strictObject({ fingerprint: Digest });
const StopWrite = z.strictObject({ fingerprint: Digest, threadId: Id, turnId: Id });
const Item = z.strictObject({ threadId: Id, turnId: Id, itemId: Id });
const NativeReport = z.strictObject({
  source: z.discriminatedUnion("kind", [Item.extend({ kind: z.literal("question"), rpcId: z.union([z.int(), Id]), questionId: Id }), Item.extend({ kind: z.literal("result") })]),
  receipt: ExecutionReceiptSchema,
});
const exec = promisify(execFile);

export interface CodexDispatchOptions {
  root: string;
  helper?: string | undefined;
  nodeBin?: string | undefined;
  binary?: string | undefined;
  home?: string | undefined;
  /** Only used by the protocol fixture. Production runs the native executable directly. */
  fixtureArgs?: string[] | undefined;
}

type CodexPlan = { node: string; helper: string; command: string; args: string[]; home: string; model?: string; effort?: string; fast: boolean; binaryStamp: string; helperStamp: string; configStamp: string | null };
type Identity = Omit<z.infer<typeof Launch>, "secret">;
type Control = Identity & { secret: string; directory: string };
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

export class CodexDispatch {
  private versionCheck?: { stamp: string; result: Promise<boolean> };
  readonly answerIntents: NativeAnswerIntents;

  constructor(
    private readonly options: CodexDispatchOptions,
    private readonly settings: () => AgentSettingsFile,
  ) {
    this.answerIntents = new NativeAnswerIntents(path.join(options.root, "native-answer-intents.json"));
  }

  get configured(): boolean {
    const { binary, helper, home } = this.options;
    return process.platform === "win32" && !!(binary && helper && home);
  }

  async prepare(input: Pick<LaunchInput, "model" | "effort" | "fast">): Promise<CodexPlan> {
    const settingsEntry = entryOf(this.settings(), "codex");
    if (settingsEntry.enabled === false) throw new HuhuError("AGENT_DISABLED", "Codex 已停用");
    if (!this.configured || settingsEntry.args?.length || Object.keys(settingsEntry.env ?? {}).length) throw unavailable();
    const model = input.model ?? settingsEntry.model;
    const effort = input.effort ?? settingsEntry.effort;
    const fast = input.fast ?? settingsEntry.fast ?? false;
    if ((model !== undefined && !Id.safeParse(model).success) || (effort !== undefined && !/^(none|minimal|low|medium|high|xhigh|ultra)$/.test(effort))) throw errors.invalidInput("Codex 模型或推理强度无效");
    const { binary, helper: file, home: directory, fixtureArgs = [], nodeBin = process.execPath } = this.options;
    try {
      if (![binary!, file!, directory!, nodeBin, this.options.root].every(path.isAbsolute) || path.extname(binary!).toLowerCase() !== ".exe") throw unavailable();
      const command = realpathSync(binary!);
      const helper = realpathSync(file!);
      const node = realpathSync(nodeBin);
      const home = realpathSync(directory!);
      const defaultHome = path.join(homedir(), ".codex");
      const globalHome = process.env["CODEX_HOME"];
      const canonical = (candidate: string) => (statSync(candidate, { throwIfNoEntry: false }) ? realpathSync(candidate) : path.resolve(candidate)).toLowerCase();
      const homeKey = home.toLowerCase();
      if (
        !statSync(home).isDirectory() ||
        [defaultHome, ...(globalHome ? [globalHome] : [])].some((candidate) => {
          const globalKey = canonical(candidate);
          return homeKey === globalKey || homeKey.startsWith(globalKey + path.sep) || globalKey.startsWith(homeKey + path.sep);
        })
      )
        throw unavailable();
      if (path.extname(command).toLowerCase() !== ".exe") throw unavailable();
      const binaryStamp = stamp(command);
      const helperStamp = stamp(helper);
      const config = path.join(home, "config.toml");
      const configStamp = statSync(config, { throwIfNoEntry: false }) ? stamp(config) : null;
      if (this.versionCheck?.stamp !== binaryStamp) {
        const result = exec(command, [...fixtureArgs, "--version"], { windowsHide: true, timeout: 4_000, maxBuffer: 4096 }).then(
          ({ stdout }) => stdout.trim() === Version,
          () => false,
        );
        this.versionCheck = { stamp: binaryStamp, result };
      }
      if (!(await this.versionCheck.result)) throw unavailable();
      return { node, helper, command, args: fixtureArgs, home, ...(model && { model }), ...(effort && { effort }), fast, binaryStamp, helperStamp, configStamp };
    } catch {
      throw unavailable();
    }
  }

  private directory(vaultId: string, machineId: string, attempt: string): string {
    return path.join(this.options.root, launchHash([vaultId, machineId, attempt]));
  }

  start(plan: CodexPlan, identity: Identity): string[] {
    const directory = this.directory(identity.vaultId, identity.machineId, identity.attempt);
    mkdirSync(this.options.root, { recursive: true, mode: 0o700 });
    mkdirSync(directory, { mode: 0o700 });
    const file = path.join(directory, "launch.json");
    writeFileSync(file, JSON.stringify({ ...identity, ...plan, secret: randomBytes(32).toString("hex") }), { flag: "wx", flush: true, mode: 0o600 });
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
    return { control, thread };
  }

  thread(vaultId: string, machineId: string, session: BoundSession): string | null {
    return this.forSession(vaultId, machineId, session)?.thread.threadId ?? null;
  }

  evidence(execution: ExecutionBinding, session: BoundSession) {
    const { sessionBinding } = execution;
    const bound = this.forSession(execution.vaultId, sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== sessionBinding.nativeSessionId) return null;
    const proof = signedFile(bound.control, "receipt", ProviderAcceptance);
    if (!proof?.nativeTurnId || launchHash(proof.execution) !== launchHash(execution)) return null;
    const completed = signedFile(bound.control, "completed", Completion);
    const finished = completed?.threadId === bound.thread.threadId && completed.turnId === proof.nativeTurnId;
    return { proof, finished, terminalStatus: finished ? completed.status : undefined };
  }

  *reports(execution: ExecutionBinding, session: BoundSession, inputSha256: string): Iterable<PendingReport> {
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return;
    const { control } = bound;
    const proof = signedFile(control, "receipt", ProviderAcceptance);
    if (!proof?.nativeTurnId || proof.inputSha256 !== inputSha256 || launchHash(proof.execution) !== launchHash(execution)) return;
    for (const file of readdirSync(control.directory).sort()) {
      const match = /^report-(codex-[a-f0-9]{64})\.json$/.exec(file);
      if (!match) continue;
      const report = signedFile(control, file.slice(0, -5), NativeReport);
      if (!report) continue;
      const { source, receipt } = report;
      if (receipt.receiptId !== match[1] || receipt.kind !== source.kind || source.threadId !== bound.thread.threadId || source.turnId !== proof.nativeTurnId) continue;
      if (receipt.kind === "question" && receipt.payload.mode !== "native_deferred") continue;
      const ackName = "agent-ack-" + receipt.receiptId;
      const ack = signedFile(control, ackName, ExecutionReceiptAckSchema);
      if (validateExecutionReceiptAck(ack, "agent_received", executionReceiptIdentity(receipt))) continue;
      yield { receipt, acknowledge: (acknowledgement) => this.acknowledgeReport(control, ackName, acknowledgement) };
    }
  }

  acknowledgeReport(control: Control, name: string, ack: ExecutionReceiptAck): void {
    putReceiptFile(path.join(control.directory, name + ".json"), { data: ack, mac: signature(control.secret, name, ack) }, true);
  }

  answerAccepted(input: NativeAnswer, session: BoundSession): boolean {
    const { execution } = input;
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return false;
    const fingerprint = answerFingerprint(input);
    return signedFile(bound.control, "answer-ack-" + fingerprint, AnswerAck)?.fingerprint === fingerprint;
  }

  stopWritten(input: NativeStop, session: BoundSession, turnId: string): boolean {
    const { execution } = input;
    const bound = this.forSession(execution.vaultId, execution.sessionBinding.machineId, session);
    if (!bound || bound.thread.threadId !== execution.sessionBinding.nativeSessionId) return false;
    const write = signedFile(bound.control, "stop-write", StopWrite);
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

  async connect(execution: ExecutionBinding, session: BoundSession, signal: AbortSignal): Promise<{ submit(input: string): void; close(): void } | null> {
    const connection = await this.open(execution, session, signal);
    if (!connection) return null;
    const { socket, nonce, secret } = connection;
    return {
      submit(input) {
        const data = { execution, input };
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
    const nonce = randomBytes(32).toString("hex");
    const socket = createConnection(pipe(secret));
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
