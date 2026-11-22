import { errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import { z } from "zod";
import { TransferId, type TransferBatch, type TransferBatchRequest, type TransferChoice, type TransferEndpoint, type TransferJob, type TransferRequest } from "../shared/transfers.js";
import type { HostIntents } from "./host-intents.js";
import type { SshManager } from "./manager.js";
import type { PublicFileSessions } from "./public-files.js";
import { externalSshOwner, selectedSshHosts } from "./public-resources.js";
import { Transfers } from "./transfers.js";

const BatchId = z.strictObject({ batchId: z.uuid() });
const ClearReceipt = z.strictObject({ removed: z.int().nonnegative() });
type Addr = { transferId: string; intentKey?: string | undefined };
type Endpoints = { source: TransferEndpoint; target: TransferEndpoint };
type Control = "decide" | "cancel" | "pause" | "resume" | "retry" | "recheck";

export class PublicTransfers {
  private readonly queues = new Map<string, Transfers>();

  constructor(
    private readonly sessions: PublicFileSessions,
    private readonly manager: SshManager,
    private readonly intents: HostIntents | undefined,
    private readonly changed: (id: string) => void,
  ) {}

  async start(context: CapabilityContext, { intentKey, ...input }: TransferRequest & { intentKey?: string | undefined }) {
    const authorize = () => this.hosts(context, input);
    const hosts = authorize();
    const queue = this.queue(context, true);
    const { transferId } = await this.run(context, "start", intentKey, input, TransferId, hosts, authorize, async () => ({ transferId: queue.start(input).transferId }));
    authorize();
    return this.job(queue, transferId);
  }

  async startBatch(context: CapabilityContext, { intentKey, ...input }: TransferBatchRequest & { intentKey?: string | undefined }) {
    if (input.localFileSessionId !== undefined) throw errors.invalidInput("外部 SSH 传输不接受 Engine 本机会话");
    const authorize = () => this.hosts(context, input);
    const hosts = authorize();
    const queue = this.queue(context, true);
    const { batchId } = await this.run(context, "startBatch", intentKey, input, BatchId, hosts, authorize, async () => {
      const batch = await queue.startBatch(input, context.signal);
      return { batchId: batch.batchId };
    });
    authorize();
    const batch = queue.findBatch(batchId);
    if (!batch) throw this.unknown();
    return batch;
  }

  list(context: CapabilityContext) {
    selectedSshHosts(context);
    const snapshot = this.queues.get(externalSshOwner(context))?.list(false);
    const visible = (record: Endpoints) => this.visible(context, record);
    return snapshot ? { ...snapshot, jobs: snapshot.jobs.filter(visible), batches: snapshot.batches.filter(visible) } : { jobs: [], batches: [], liveLimit: 32, parallel: 1, canQueue: true };
  }

  workbenchList() {
    return [...this.queues.values()].map((queue) => queue.list(false));
  }

  workbenchCancel(transferId: string) {
    for (const queue of this.queues.values()) {
      if (queue.find(transferId)) return queue.cancel(transferId);
    }
  }

  releaseFileSession(id: string) {
    for (const queue of this.queues.values()) queue.releaseFileSession(id);
  }

  async control(context: CapabilityContext, action: Control, { transferId, intentKey, choice, conflictRevision }: Addr & { choice?: z.infer<typeof TransferChoice>; conflictRevision?: string | undefined }) {
    const queue = this.queue(context);
    const job = () => this.job(queue, transferId, true);
    const authorize = () => this.hosts(context, job());
    const hosts = authorize();
    await this.run(context, action, intentKey, { transferId, choice, conflictRevision }, TransferId, hosts, authorize, async () => {
      if (action === "decide") {
        const current = job();
        if (!choice || !conflictRevision || current.state !== "waiting" || current.conflictRevision !== conflictRevision) throw errors.notFound("原 SSH 传输冲突");
        queue.decide(transferId, choice);
      } else if (action === "recheck") {
        await queue.recheck(transferId, context.signal);
      } else {
        queue[action](transferId);
      }
      return { transferId };
    });
    authorize();
    return job();
  }

  async origin(context: CapabilityContext, { transferId, intentKey }: Addr) {
    const queue = this.queue(context);
    const authorize = () => this.hosts(context, this.job(queue, transferId, true));
    await this.run(context, "origin", intentKey, { transferId }, TransferId, authorize(), authorize, async () => ({ transferId }));
    authorize();
    return queue.openOrigin(transferId);
  }

  clear(context: CapabilityContext, intentKey?: string) {
    const queue = this.queues.get(externalSshOwner(context));
    const selected = selectedSshHosts(context);
    const visible = (item: TransferJob | TransferBatch) => this.visible(context, item);
    return this.run(
      context,
      "clearHistory",
      intentKey,
      {},
      ClearReceipt,
      [],
      () => [...selected],
      async () => queue?.clear(visible) ?? { removed: 0 },
    );
  }

  dispose() {
    for (const queue of this.queues.values()) queue.dispose();
    this.queues.clear();
  }

  private queue(context: CapabilityContext, create = false) {
    const owner = externalSshOwner(context);
    const existing = this.queues.get(owner);
    if (existing) return existing;
    if (!create) throw errors.notFound("SSH 传输任务");
    if (this.queues.size >= 16) {
      for (const [id, queue] of this.queues) if (!queue.list(false).jobs.length) this.queues.delete(id);
      if (this.queues.size >= 16) throw errors.invalidInput("外部 SSH 传输队列数量已达上限");
    }
    const queue = new Transfers(this.sessions.files, this.manager, this.changed, () => 1, true);
    this.queues.set(owner, queue);
    return queue;
  }

  private hosts(context: CapabilityContext, { source, target }: Endpoints): string[] {
    if (source.kind !== "remote" || target.kind !== "remote") throw errors.invalidInput("外部 SSH 传输只接受已绑定的远端文件会话");
    return [...new Set([...this.sessions.authorize(context, source.fileSessionId), ...this.sessions.authorize(context, target.fileSessionId)])];
  }

  private visible(context: CapabilityContext, input: Endpoints): boolean {
    try {
      this.hosts(context, input);
      return true;
    } catch (error) {
      if (!(error instanceof HuhuError)) throw error;
      return false;
    }
  }

  private job(queue: Transfers, id: string, addressed = false) {
    const job = queue.find(id);
    if (job) return job;
    if (addressed) throw errors.notFound("SSH 传输任务");
    throw this.unknown();
  }

  private run<T>(context: CapabilityContext, action: string, intentKey: string | undefined, input: unknown, output: z.ZodType<T>, hosts: readonly string[], authorize: () => readonly string[], work: () => Promise<T>) {
    if (!intentKey || !this.intents) throw errors.invalidInput("外部 SSH 传输需要稳定意图键");
    return this.intents.run(context, `ssh.transfers.${action}`, {
      hosts,
      intentKey,
      input,
      output,
      authorize,
      run: async () => {
        try {
          return await work();
        } catch (error) {
          if (error instanceof HuhuError && ["NOT_FOUND", "INVALID_INPUT", "VERSION_CONFLICT"].includes(error.code)) throw new HuhuError(error.code, "SSH 传输操作未完成");
          throw this.unknown();
        }
      },
    });
  }

  private unknown() {
    return new HuhuError("INTERNAL", "SSH 传输操作结果待核实", { retryable: false, details: { outcome: "unknown" } });
  }
}
