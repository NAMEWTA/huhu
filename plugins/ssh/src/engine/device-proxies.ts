import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Duplex } from "node:stream";
import { errors } from "@huhu/contracts";
import { z } from "zod";
import { OwnedHostId } from "./auth-profile.js";
import type { ManagedHost, SshCredentialHost } from "./host-configurations.js";
import { dialProxyCommand, expandProxyCommand } from "./proxy-command.js";
import { connectionIdentity } from "./workspace-target.js";

export const CommandTemplate = z.strictObject({ executable: z.string().min(1).max(4096), arguments: z.array(z.string().max(8192)).max(64) });
const Approval = z.strictObject({ hostId: OwnedHostId, revision: z.uuidv4(), route: z.string(), command: CommandTemplate });
type Approval = z.infer<typeof Approval>;

export class DeviceProxies {
  private readonly directory: string;
  private readonly active = new Map<string, Set<AbortController>>();

  constructor(host: Pick<SshCredentialHost, "localRoot" | "localVaultInstanceId">) {
    const scope = createHash("sha256").update(host.localVaultInstanceId).digest("hex");
    this.directory = path.join(host.localRoot, `ssh-proxy-${scope}`);
  }

  private file(hostId: string): string {
    return path.join(this.directory, OwnedHostId.parse(hostId) + ".json");
  }

  read(hostId: string): Approval | undefined {
    if (!OwnedHostId.safeParse(hostId).success) return;
    const directory = lstatSync(this.directory, { throwIfNoEntry: false });
    if (!directory) return;
    if (!directory.isDirectory()) throw errors.invalidInput("本机 SSH 代理批准目录无效");
    const file = this.file(hostId);
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat) return;
    if (!stat.isFile() || stat.size > 64 * 1024) throw errors.invalidInput("本机 SSH 代理批准文件无效");
    try {
      const parsed = Approval.parse(JSON.parse(readFileSync(file, "utf8")));
      if (parsed.hostId === hostId) return parsed;
    } catch {
      // Avoid exposing invalid file contents through capability errors.
    }
    throw errors.invalidInput("本机 SSH 代理批准文件无效");
  }

  approve(chain: readonly ManagedHost[], expectedRevision: string | null, command: z.infer<typeof CommandTemplate>): Approval {
    const first = chain[0]!;
    expandProxyCommand(command, first);
    const hostId = chain.at(-1)!.id;
    this.assertRevision(hostId, expectedRevision);
    const approval = { hostId, revision: randomUUID(), route: connectionIdentity(chain), command };
    mkdirSync(this.directory, { mode: 0o700, recursive: true });
    const file = this.file(hostId);
    const temporary = path.join(this.directory, `.${approval.revision}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(approval), { mode: 0o600, flag: "wx", flush: true });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.stop(hostId);
    return approval;
  }

  revoke(hostId: string, expectedRevision: string): void {
    this.assertRevision(hostId, expectedRevision);
    rmSync(this.file(hostId));
    this.stop(hostId);
  }

  private assertRevision(hostId: string, expectedRevision: string | null) {
    const revision = this.read(hostId)?.revision ?? null;
    if (revision !== expectedRevision) throw errors.versionConflict(revision ?? "");
  }

  private stop(hostId: string) {
    for (const controller of this.active.get(hostId) ?? []) controller.abort();
  }

  dispose() {
    for (const hostId of this.active.keys()) this.stop(hostId);
  }

  async dial(approval: Approval, chain: readonly ManagedHost[], signal: AbortSignal, assertCurrent: () => void): Promise<Duplex> {
    const { hostId, revision, route, command } = approval;
    if (route !== connectionIdentity(chain)) throw errors.invalidInput("SSH 路由已变更，请重新批准本机 ProxyCommand");
    const controller = new AbortController();
    const active = this.active.get(hostId) ?? new Set<AbortController>();
    active.add(controller);
    this.active.set(hostId, active);
    const release = () => {
      active.delete(controller);
      if (!active.size) this.active.delete(hostId);
    };
    try {
      const stream = await dialProxyCommand(command, chain[0]!, AbortSignal.any([signal, controller.signal]), () => {
        this.assertRevision(hostId, revision);
        assertCurrent();
      });
      const close = () => stream.destroy();
      controller.signal.addEventListener("abort", close, { once: true });
      stream.once("close", () => {
        controller.signal.removeEventListener("abort", close);
        release();
      });
      if (controller.signal.aborted || signal.aborted) close();
      return stream;
    } catch (error) {
      release();
      throw error;
    }
  }
}
