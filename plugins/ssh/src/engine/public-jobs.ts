import { createHash, randomUUID } from "node:crypto";
import { CapabilityIntentKeySchema, HuhuError, errors } from "@huhu/contracts";
import type { OperationReceipts, CapabilityContext, HuhuApi } from "@huhu/kernel";
import type { Client, ClientChannel } from "ssh2";
import { z } from "zod";
import { interruptExecChannel } from "./exec-interrupt.js";
import { ExecOutput, unavailableOutput } from "./job-output.js";
import { StartPublicProbe, type PublicSshProbes } from "./public-probes.js";
import { externalSshOwner, readBoundRoute } from "./public-resources.js";

export const PrepareExecJob = StartPublicProbe.extend({
  intentKey: CapabilityIntentKeySchema,
  command: z
    .string()
    .min(1)
    .max(8192)
    .refine((command) => command.trim().length > 0 && !command.includes("\0")),
  timeoutSec: z.int().min(1).max(180).default(60),
});
export const ExecJobId = z.strictObject({ jobId: z.uuidv4() });
export const StartExecJob = StartPublicProbe.extend({ ...ExecJobId.shape, sessionId: z.uuidv4() });
const Cursor = z.int().nonnegative();
const StreamName = z.enum(["stdout", "stderr"]);
export const ReadExecOutput = ExecJobId.extend({ stream: StreamName, cursor: Cursor.default(0), limit: z.int().min(4).max(16384).default(4096) });
export const ExecOutputPage = z.strictObject({ fromCursor: Cursor, nextCursor: Cursor, endCursor: Cursor, skippedBytes: Cursor, truncated: z.boolean(), text: z.string() });

const Reason = z.enum([
  "exit-code",
  "remote-signal",
  "exec-rejected",
  "authentication-failed",
  "host-key-changed",
  "route-changed",
  "connection-failed",
  "connection-timeout",
  "ready-expired",
  "cancelled-before-dispatch",
  "dispatch-timeout",
  "disconnected",
  "exit-unreported",
  "cancel-unconfirmed",
  "timeout-unconfirmed",
  "engine-interrupted",
]);
const lifecycle = z.strictObject({
  ...ExecJobId.shape,
  ...StartPublicProbe.shape,
  attemptId: z.string().nullable(),
  sessionId: z.uuidv4().nullable(),
  state: z.enum(["connecting", "ready", "dispatching", "running", "stopping", "exited", "failed", "cancelled", "unknown"]),
  reason: Reason.nullable(),
  exitCode: z.int().nonnegative().nullable(),
  exitSignal: z.string().nullable(),
  stopRequested: z.enum(["cancel", "timeout"]).nullable(),
  stdoutEnd: Cursor,
  stderrEnd: Cursor,
});
export const ExecJobStatus = z.union([lifecycle, ExecJobId.extend({ state: z.literal("unknown"), reason: z.literal("engine-interrupted") })]);

type Status = z.infer<typeof lifecycle>;
type FinalState = "exited" | "failed" | "cancelled" | "unknown";
type End = { state: FinalState; reason: z.infer<typeof Reason>; exitCode?: number; exitSignal?: string };
type Claim = ReturnType<OperationReceipts["claim"]>["entry"];
type Job = {
  owner: string;
  claim: Extract<Claim, { phase: "accepted" }>;
  status: Status;
  command: string | undefined;
  timeoutSec: number;
  close?: () => void;
  detachOutput?: () => void;
  client?: Client;
  channel?: ClientChannel;
  remoteExit?: End;
  timer?: NodeJS.Timeout;
  endedAt?: number;
  releaseActivity?: () => void;
  streams: Record<z.infer<typeof StreamName>, ExecOutput>;
};

/** 受理 Exec 作业时持有、终态时释放的宿主活动登记（Engine 用它在作业运行期间保持存活）。 */
export type RetainActivity = () => () => void;

const capability = "ssh.jobs.prepare";
const recentLimit = 32;
const outputLifetime = 10 * 60_000;
const dispatchTimeout = 5000;
const stopGrace = 1500;

function connectionFailure(error: unknown): End {
  const code = error instanceof HuhuError ? error.code : undefined;
  if (code === "VERSION_CONFLICT" || code === "NOT_FOUND") return { state: "failed", reason: "route-changed" };
  if (code === "SSH_AUTH_FAILED") return { state: "failed", reason: "authentication-failed" };
  if (code === "SSH_HOST_KEY_MISMATCH") return { state: "failed", reason: "host-key-changed" };
  if (code === "SSH_TIMEOUT") return { state: "failed", reason: "connection-timeout" };
  return { state: "failed", reason: "connection-failed" };
}

/** Each accepted intent owns exactly one connection and can submit at most one Exec request. */
export class PublicExecJobs {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly probes: PublicSshProbes,
    private readonly receipts: OperationReceipts,
    private readonly vaultInstance: string,
    private readonly retainActivity?: RetainActivity,
  ) {}

  private owners(context: CapabilityContext) {
    const owner = externalSshOwner(context);
    const receiptOwner = createHash("sha256")
      .update(JSON.stringify([this.vaultInstance, owner]))
      .digest("hex");
    return { owner, receiptOwner };
  }

  prepare(context: CapabilityContext, { intentKey, ...input }: z.infer<typeof PrepareExecJob>) {
    const { owner, receiptOwner } = this.owners(context);
    context.signal.throwIfAborted();
    const lookup = { capability, intentKey };
    const earlier = this.receipts.lookup(receiptOwner, lookup);
    if (earlier) {
      const replay = this.receipts.claim(receiptOwner, capability, intentKey, input);
      if (replay.mismatch) throw errors.idempotencyMismatch();
      return { jobId: earlier.operationId };
    }
    this.files.assertWritable();
    readBoundRoute(this.files, input);
    this.trimOutput();
    const running = [...this.jobs.values()].filter((job) => job.endedAt === undefined);
    if (running.filter((job) => job.owner === owner).length >= 4 || running.length >= 16) throw errors.invalidInput("SSH 作业运行数量已达上限");
    context.signal.throwIfAborted();
    const { entry, fresh } = this.receipts.claim(receiptOwner, capability, intentKey, input);
    const { operationId: jobId } = entry;
    if (!fresh || entry.phase !== "accepted") return { jobId };
    const job: Job = {
      owner,
      claim: entry,
      command: input.command,
      timeoutSec: input.timeoutSec,
      streams: { stdout: new ExecOutput(), stderr: new ExecOutput() },
      status: {
        jobId,
        hostId: input.hostId,
        routeRevision: input.routeRevision,
        attemptId: null,
        sessionId: null,
        state: "connecting",
        reason: null,
        exitCode: null,
        exitSignal: null,
        stopRequested: null,
        stdoutEnd: 0,
        stderrEnd: 0,
      },
    };
    this.jobs.set(jobId, job);
    try {
      if (this.retainActivity) job.releaseActivity = this.retainActivity();
      const connection = this.probes.openForJob(owner, input);
      job.close = connection.close;
      job.status.attemptId = connection.attemptId;
      void connection.ready.then(
        (client) => {
          if (job.endedAt !== undefined) return;
          job.client = client;
          job.status.sessionId = randomUUID();
          job.status.state = "ready";
          client.once("close", () => {
            if (job.endedAt !== undefined) return;
            if (job.status.state === "ready") this.finish(job, { state: "failed", reason: "connection-failed" });
            else this.finish(job, this.uncertain(job, "disconnected"));
          });
          this.timer(job, 60_000, () => this.finish(job, { state: "failed", reason: "ready-expired" }));
        },
        (error) => this.finish(job, connectionFailure(error)),
      );
    } catch (error) {
      this.finish(job, connectionFailure(error));
    }
    return { jobId };
  }

  start(context: CapabilityContext, input: z.infer<typeof StartExecJob>) {
    const { job, status } = this.find(context, input.jobId);
    if (!("sessionId" in status) || status.sessionId !== input.sessionId || status.hostId !== input.hostId || status.routeRevision !== input.routeRevision) {
      throw errors.notFound("原 SSH 作业与会话");
    }
    if (status.state !== "ready") return { jobId: input.jobId };
    if (!job?.client || !job.command) throw errors.notFound("原 SSH 作业与会话");
    context.signal.throwIfAborted();
    this.files.assertWritable();
    try {
      readBoundRoute(this.files, input);
    } catch (error) {
      this.finish(job, connectionFailure(error));
      throw error;
    }
    const { client, command } = job;
    job.command = undefined;
    job.status.state = "dispatching";
    this.timer(job, dispatchTimeout, () => this.finish(job, this.uncertain(job, "dispatch-timeout")));
    try {
      client.exec(command, (error, channel) => {
        if (job.endedAt !== undefined) {
          channel?.close();
          return;
        }
        if (error) {
          this.finish(job, error.message === "Unable to exec" ? { state: "failed", reason: "exec-rejected" } : this.uncertain(job, "disconnected"));
          return;
        }
        this.observe(job, channel);
      });
    } catch (error) {
      const end: End = error instanceof Error && error.message === "Not connected" ? { state: "failed", reason: "connection-failed" } : this.uncertain(job, "disconnected");
      this.finish(job, end);
    }
    return { jobId: input.jobId };
  }

  private observe(job: Job, channel: ClientChannel) {
    job.channel = channel;
    const stdout = (data: Buffer) => job.streams.stdout.append(data);
    const stderr = (data: Buffer) => job.streams.stderr.append(data);
    channel.on("data", stdout);
    channel.stderr.on("data", stderr);
    channel.once("exit", (code: number | null, signal?: string) => {
      if (typeof code === "number" && Number.isInteger(code) && code >= 0) job.remoteExit = { state: "exited", reason: "exit-code", exitCode: code };
      else if (code === null) {
        const safeSignal = typeof signal === "string" && /^(?:SIG)?[A-Z0-9]{1,16}$/.test(signal);
        job.remoteExit = { state: "exited", reason: "remote-signal", ...(safeSignal && { exitSignal: signal }) };
      }
    });
    channel.once("close", () => this.finish(job, this.uncertain(job, "exit-unreported")));
    channel.on("error", () => this.finish(job, this.uncertain(job, "disconnected")));
    job.detachOutput = () => {
      channel.off("data", stdout);
      channel.stderr.off("data", stderr);
    };
    if (job.status.stopRequested) this.interrupt(job);
    else {
      job.status.state = "running";
      this.timer(job, job.timeoutSec * 1000, () => this.stop(job, "timeout"));
    }
  }

  get(context: CapabilityContext, jobId: string): z.infer<typeof ExecJobStatus> {
    return this.find(context, jobId).status;
  }

  read(context: CapabilityContext, input: z.infer<typeof ReadExecOutput>) {
    const { job, status } = this.find(context, input.jobId);
    if (!("stdoutEnd" in status)) throw new HuhuError("INTERNAL", "SSH 作业结果待核实", { retryable: false, details: { outcome: "unknown", jobId: input.jobId } });
    if (job && (job.endedAt === undefined || Date.now() - job.endedAt < outputLifetime)) return job.streams[input.stream].read(input.cursor, input.limit);
    return unavailableOutput(input.cursor, input.stream === "stdout" ? status.stdoutEnd : status.stderrEnd);
  }

  cancel(context: CapabilityContext, jobId: string) {
    const { job } = this.find(context, jobId);
    context.signal.throwIfAborted();
    if (!job || job.endedAt !== undefined || job.status.stopRequested) return { requested: false };
    this.stop(job, "cancel");
    return { requested: true };
  }

  private stop(job: Job, why: "cancel" | "timeout") {
    job.status.stopRequested = why;
    if (job.status.state === "connecting" || job.status.state === "ready") {
      this.finish(job, { state: "cancelled", reason: "cancelled-before-dispatch" });
      return;
    }
    job.status.state = "stopping";
    if (job.channel) this.interrupt(job);
  }

  private interrupt(job: Job) {
    if (job.channel && !job.remoteExit) interruptExecChannel(job.channel);
    this.timer(job, stopGrace, () => this.finish(job, this.uncertain(job, "exit-unreported")));
  }

  private uncertain(job: Job, reason: End["reason"]): End {
    const stop = job.status.stopRequested;
    return { state: "unknown", reason: stop === "cancel" ? "cancel-unconfirmed" : stop === "timeout" ? "timeout-unconfirmed" : reason };
  }

  private timer(job: Job, ms: number, run: () => void) {
    clearTimeout(job.timer);
    job.timer = setTimeout(run, ms);
    job.timer.unref();
  }

  private view(job: Job): Status {
    return { ...job.status, stdoutEnd: job.streams.stdout.endCursor, stderrEnd: job.streams.stderr.endCursor };
  }

  private finish(job: Job, fallback: End) {
    if (job.endedAt !== undefined) return;
    const end = job.remoteExit ?? fallback;
    job.endedAt = Date.now();
    try {
      clearTimeout(job.timer);
      job.command = undefined;
      job.detachOutput?.();
      delete job.detachOutput;
      job.streams.stdout.finish();
      job.streams.stderr.finish();
      job.status = { ...this.view(job), state: end.state, reason: end.reason, exitCode: end.exitCode ?? null, exitSignal: end.exitSignal ?? null };
      job.close?.();
      delete job.close;
      delete job.client;
      delete job.channel;
      try {
        this.receipts.complete(job.claim, end.state === "unknown" ? "unknown" : "completed", { ok: true, data: job.status });
      } catch {
        // Keep the live result. A restarted Engine sees the durable admission as unknown.
      }
      this.timer(job, outputLifetime, () => this.jobs.delete(job.status.jobId));
    } finally {
      job.releaseActivity?.();
      delete job.releaseActivity;
    }
  }

  private find(context: CapabilityContext, jobId: string): { job?: Job; status: z.infer<typeof ExecJobStatus> } {
    const { owner, receiptOwner } = this.owners(context);
    const job = this.jobs.get(jobId);
    if (job?.owner === owner) return { job, status: this.view(job) };
    const receipt = this.receipts.lookup(receiptOwner, { operationId: jobId });
    if (!receipt || receipt.capability !== capability) throw errors.notFound("SSH 作业");
    if (receipt.phase !== "accepted" && receipt.result.ok) {
      const terminal = lifecycle.safeParse(receipt.result.data);
      if (terminal.success) return { status: terminal.data };
    }
    return { status: { jobId, state: "unknown", reason: "engine-interrupted" } };
  }

  private trimOutput() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.endedAt === undefined || (now - job.endedAt < outputLifetime && this.jobs.size < recentLimit)) continue;
      clearTimeout(job.timer);
      this.jobs.delete(id);
    }
  }

  dispose(): void {
    for (const job of this.jobs.values()) {
      if (job.endedAt === undefined) {
        if (job.status.state === "connecting" || job.status.state === "ready") this.finish(job, { state: "cancelled", reason: "cancelled-before-dispatch" });
        else this.finish(job, this.uncertain(job, "engine-interrupted"));
      }
      clearTimeout(job.timer);
    }
    this.jobs.clear();
  }
}
