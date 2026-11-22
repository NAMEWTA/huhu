import { randomUUID } from "node:crypto";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import type { ClientChannel } from "ssh2";
import { z } from "zod";
import type { SshCredentialHost } from "./host-configurations.js";
import { type HostIntents, withIntentSeal } from "./host-intents.js";
import { ExecOutput } from "./job-output.js";
import { ReadOutputFields, ExecOutputPage } from "./public-jobs.js";
import { OwnedConnection, type PublicSshProbes } from "./public-probes.js";
import { externalSshOwner, selectedSshHosts } from "./public-resources.js";
import { openIntegratedShell, type ShellDirectory } from "./shell-directory.js";
import type { DirectoryFollowState } from "../shared/files.js";

export const ShellSize = { cols: z.int().min(1).max(500).default(80), rows: z.int().min(1).max(500).default(24) };
export const Shell = z.object({
  id: z.string(),
  hostId: z.string(),
  name: z.string(),
  state: z.enum(["running", "ended"]),
  createdAt: z.string(),
  source: z.literal("external").optional(),
  shellId: z.string().optional(),
});
const ShellId = z.strictObject({ shellId: z.string().regex(/^ssh-external-[0-9a-f-]{36}$/) });
const intentKey = CapabilityIntentKeySchema;
export const OpenOwnedShell = OwnedConnection.extend({ ...ShellSize, intentKey });
export const ReadOwnedShell = ShellId.extend(ReadOutputFields);
export const ShellOutputPage = ExecOutputPage.extend({ ended: z.boolean() });
export const ChangeOwnedShell = ShellId.extend({ intentKey });
export const ResizeOwnedShell = ChangeOwnedShell.extend(ShellSize);
const inputLimit = 16 * 1024;
const inputBytes = z
  .base64()
  .min(4)
  .max(Math.ceil(inputLimit / 3) * 4)
  .refine((value) => Buffer.byteLength(value, "base64") <= inputLimit);
export const WriteOwnedShell = ChangeOwnedShell.extend({ dataBase64: inputBytes });
export const ShellWriteReceipt = z.strictObject({ bytes: z.int().nonnegative().max(inputLimit) });
export const ShellResizeReceipt = z.strictObject({ resized: z.literal(true) });
export const ShellCloseReceipt = z.strictObject({ closed: z.boolean() });

type Owned = {
  view: z.infer<typeof Shell>;
  owner: string;
  binding: z.infer<typeof OwnedConnection>;
  hostIds: readonly string[];
  output: ExecOutput;
  directory?: ShellDirectory;
  channel?: ClientChannel;
  close?: () => void;
  timer?: NodeJS.Timeout;
};

export class PublicShells {
  private readonly shells = new Map<string, Owned>();
  private readonly pending = new Map<string, number>();

  constructor(
    private readonly connections: PublicSshProbes,
    private readonly intents: HostIntents | undefined,
    private readonly credentials: SshCredentialHost | undefined,
    private readonly changed: (id: string) => void,
  ) {}

  open(context: CapabilityContext, { intentKey, cols, rows, ...binding }: z.infer<typeof OpenOwnedShell>) {
    const owner = externalSshOwner(context);
    const connection = () => this.connections.connection(context, binding);
    const initial = connection();
    return this.intentStore().run(context, "ssh.shells.open", {
      hosts: initial.hostIds,
      intentKey,
      input: { ...binding, cols, rows },
      output: Shell,
      authorize: () => connection().hostIds,
      run: async (assertCurrent) => {
        const { client, signal } = connection();
        const running = [...this.shells.values()].filter(({ channel }) => channel);
        const opening = this.pending.get(owner) ?? 0;
        const totalPending = [...this.pending.values()].reduce((total, count) => total + count, 0);
        if (this.shells.size + totalPending >= 64 || running.length + totalPending >= 16 || running.filter((shell) => shell.owner === owner).length + opening >= 12) {
          throw errors.invalidInput("SSH 终端数量已达上限");
        }
        this.pending.set(owner, opening + 1);
        const lifetime = AbortSignal.any([signal, context.signal]);
        try {
          const pty = { term: "xterm-256color", cols, rows };
          const integrated = await openIntegratedShell(client, pty, lifetime);
          if (lifetime.aborted) integrated?.channel.close();
          return await new Promise<z.infer<typeof Shell>>((resolve, reject) => {
            const cancelled = () => reject(lifetime.reason);
            lifetime.throwIfAborted();
            lifetime.addEventListener("abort", cancelled, { once: true });
            try {
              const opened = (error: Error | undefined, channel: ClientChannel) => {
                lifetime.removeEventListener("abort", cancelled);
                try {
                  lifetime.throwIfAborted();
                  assertCurrent();
                  if (error) throw new HuhuError("SSH_DISCONNECTED", "无法打开 SSH 终端");
                  const id = `ssh-external-${randomUUID()}`;
                  const view = { id, shellId: id, hostId: binding.hostId, name: "SSH 终端", state: "running", source: "external", createdAt: new Date().toISOString() } as const;
                  const shell: Owned = { view, owner, binding, hostIds: initial.hostIds, channel, output: new ExecOutput(), ...(integrated && { directory: integrated.directory }) };
                  const close = () => {
                    if (!shell.channel) return;
                    delete shell.channel;
                    delete shell.close;
                    signal.removeEventListener("abort", close);
                    shell.output.finish();
                    shell.view = { ...shell.view, state: "ended" };
                    shell.timer = setTimeout(() => this.shells.delete(id), 300_000);
                    shell.timer.unref();
                    channel.close();
                    this.changed(id);
                  };
                  shell.close = close;
                  channel.on("data", (data: Buffer) => {
                    if (!shell.channel) return;
                    shell.directory?.output(data);
                    shell.output.append(data);
                  });
                  channel.stderr.on("data", (data: Buffer) => {
                    if (shell.channel) shell.output.append(data);
                  });
                  channel.on("error", close);
                  channel.once("close", close);
                  signal.addEventListener("abort", close, { once: true });
                  this.shells.set(id, shell);
                  this.changed(id);
                  resolve(view);
                } catch (cause) {
                  channel?.close();
                  reject(cause);
                }
              };
              if (integrated) opened(undefined, integrated.channel);
              else client.shell(pty, opened);
            } catch (error) {
              lifetime.removeEventListener("abort", cancelled);
              reject(error);
            }
          });
        } finally {
          const remaining = (this.pending.get(owner) ?? 1) - 1;
          if (remaining) this.pending.set(owner, remaining);
          else this.pending.delete(owner);
        }
      },
    });
  }

  list(context: CapabilityContext, hostId?: string) {
    const owner = externalSshOwner(context);
    const selected = selectedSshHosts(context);
    return [...this.shells.values()]
      .filter((shell) => {
        if (shell.owner !== owner || (hostId && shell.binding.hostId !== hostId) || shell.hostIds.some((id) => !selected.has(id))) return false;
        try {
          this.connections.connection(context, shell.binding);
          return true;
        } catch (error) {
          if (!(error instanceof HuhuError)) throw error;
          return false;
        }
      })
      .map(({ view }) => view);
  }

  workbenchList(hostId?: string) {
    return [...this.shells.values()].filter(({ view }) => !hostId || view.hostId === hostId).map(({ view }) => view);
  }

  state(id: string) {
    return this.shells.get(id)?.view.state;
  }

  bindDirectory(context: CapabilityContext, shellId: string, binding: z.infer<typeof OwnedConnection>) {
    const shell = this.get(context, shellId);
    if (shell.binding.attemptId !== binding.attemptId || shell.binding.hostId !== binding.hostId || shell.binding.routeRevision !== binding.routeRevision) throw errors.notFound("原 SSH 终端");
    this.liveChannel(shell);
    return {
      state: (): DirectoryFollowState => {
        if (!shell.channel) return { state: "ended", revision: 0 };
        return shell.directory?.state() ?? { state: "unsupported", revision: 0 };
      },
      follow: async (revision: number, directory: string): Promise<boolean> => {
        if (!shell.channel?.writable || shell.channel.destroyed || shell.channel.writableLength >= 64 * 1024) return false;
        const command = shell.directory?.command(revision, directory);
        if (!command) return false;
        await this.send(shell.channel, command);
        return true;
      },
    };
  }

  closeWorkbench(id: string): boolean {
    const close = this.shells.get(id)?.close;
    if (!close) return false;
    close();
    return true;
  }

  async read(context: CapabilityContext, input: z.infer<typeof ReadOwnedShell>) {
    const shell = this.get(context, input.shellId);
    await shell.output.wait(input.cursor, input.waitMs, context.signal);
    this.get(context, input.shellId);
    return { ...shell.output.read(input.cursor, input.limit), ended: !shell.channel };
  }

  async write(context: CapabilityContext, { dataBase64, ...request }: z.infer<typeof WriteOwnedShell>) {
    this.get(context, request.shellId);
    const digest = await withIntentSeal(this.credentials, (seal) => seal(["ssh.shells.write", dataBase64]));
    return this.mutate(context, "ssh.shells.write", request, { digest }, ShellWriteReceipt, async (shell) => {
      const channel = this.liveChannel(shell);
      if (channel.writableLength >= 64 * 1024) throw errors.invalidInput("SSH 终端输入缓冲区已满");
      const data = Buffer.from(dataBase64, "base64");
      shell.directory?.input(data);
      await this.send(channel, data);
      this.get(context, request.shellId);
      return { bytes: data.length };
    });
  }

  resize(context: CapabilityContext, { cols, rows, ...request }: z.infer<typeof ResizeOwnedShell>) {
    return this.mutate(context, "ssh.shells.resize", request, { cols, rows }, ShellResizeReceipt, async (shell) => {
      this.liveChannel(shell).setWindow(rows, cols, 0, 0);
      return { resized: true as const };
    });
  }

  close(context: CapabilityContext, request: z.infer<typeof ChangeOwnedShell>) {
    return this.mutate(context, "ssh.shells.close", request, {}, ShellCloseReceipt, async () => ({ closed: this.closeWorkbench(request.shellId) }));
  }

  dispose(): void {
    for (const [id, shell] of this.shells) {
      this.closeWorkbench(id);
      clearTimeout(shell.timer);
    }
    this.shells.clear();
  }

  private get(context: CapabilityContext, id: string): Owned {
    const shell = this.shells.get(id);
    if (shell?.owner !== externalSshOwner(context)) throw errors.notFound("SSH 终端");
    this.connections.connection(context, shell.binding);
    return shell;
  }

  private liveChannel(shell: Owned): ClientChannel {
    if (!shell.channel || !shell.channel.writable) throw new HuhuError("SSH_DISCONNECTED", "SSH 终端已结束");
    return shell.channel;
  }

  private send(channel: ClientChannel, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      channel.write(data, (error) => {
        if (error) reject(new HuhuError("INTERNAL", "SSH 终端输入状态待核实", { retryable: false, details: { outcome: "unknown" } }));
        else resolve();
      });
    });
  }

  private intentStore(): HostIntents {
    if (!this.intents) throw errors.invalidInput("此 Vault 无法保存 SSH 终端意图");
    return this.intents;
  }

  private mutate<T>(context: CapabilityContext, capability: string, { shellId, intentKey }: z.infer<typeof ChangeOwnedShell>, input: Record<string, unknown>, output: z.ZodType<T>, run: (shell: Owned) => Promise<T>) {
    const shell = this.get(context, shellId);
    return this.intentStore().run(context, capability, {
      hosts: shell.hostIds,
      intentKey,
      input: { shellId, ...input },
      output,
      authorize: () => this.get(context, shellId).hostIds,
      run: () => run(shell),
    });
  }
}
