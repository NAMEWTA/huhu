import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CredentialAction, type CredentialOwner, type CredentialSummary } from "@huhu/kernel";
import ssh2, { type ConnectConfig } from "ssh2";
import type { z } from "zod";
import { HostDefinition, OwnedHostId, purposes, type ConfigureHost, type CopyHost, type HostRevision, type ManagedHostView, type Purpose, type SshHostProfile } from "./auth-profile.js";
import { validateHost, type HostStore, type LegacyHost } from "./hosts.js";

export type SshCredentialHost = Pick<CredentialOwner<HostDefinition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;
export type ManagedHost = z.infer<typeof ManagedHostView> & { configId: string };
export type HostRecord = LegacyHost | ManagedHost;
export type ConnectionAuth = Pick<ConnectConfig, "password" | "privateKey" | "passphrase" | "agent">;

type StoredHost = CredentialSummary & { definition: HostDefinition };
type ImportRow = { index: number; hostId: string; profile: SshHostProfile; group: string[] };

function authError(reason: string): HuhuError {
  return new HuhuError("SSH_AUTH_FAILED", "SSH 本机认证不可用，请在主机配置中检查凭据", { details: { reason } });
}

function translate(error: unknown): never {
  if (!(error instanceof CredentialError)) throw error;
  switch (error.code) {
    case "invalid-input":
      throw errors.invalidInput("SSH 主机认证配置无效");
    case "not-found":
      throw errors.notFound("SSH 主机不存在");
    case "conflict":
      throw new HuhuError("VERSION_CONFLICT", "SSH 主机配置已更新");
    case "cancelled":
      throw new HuhuError("SSH_DISCONNECTED", "SSH 操作已取消");
    case "storage-failed":
      throw new HuhuError("INTERNAL", "SSH 认证配置写入或读取失败");
    default:
      throw authError(error.code);
  }
}

export function agentAuth(): ConnectionAuth {
  const agent = process.env["SSH_AUTH_SOCK"] ?? (process.platform === "win32" ? "\\\\.\\pipe\\openssh-ssh-agent" : undefined);
  return agent === undefined ? {} : { agent };
}

function buildAuth(kind: HostDefinition["authKind"], values: ReadonlyMap<string, string>): ConnectionAuth {
  if (kind === "agent") return agentAuth();
  if (kind === "password") return { password: values.get("password")! };
  let key = values.get("privateKey");
  if (kind === "identity-file") {
    try {
      const file = values.get("identityFile")!;
      const stats = statSync(file);
      if (!stats.isFile() || stats.size > 1024 * 1024) throw authError("identity-file-unavailable");
      key = readFileSync(file, "utf8");
    } catch {
      throw authError("identity-file-unavailable");
    }
  }
  const passphrase = values.get("passphrase");
  const candidates = ssh2.utils.parseKey(key!, passphrase);
  if (candidates instanceof Error || ![candidates].flat().some((candidate) => candidate.isPrivateKey())) throw authError("invalid-private-key-or-passphrase");
  return { privateKey: key!, ...(passphrase !== undefined ? { passphrase } : {}) };
}

function summary({ entityId, revision, authState }: CredentialSummary, authKind: HostDefinition["authKind"]) {
  const configured = purposes[authKind].every((name) => authState[name] === "configured" || (name === "passphrase" && authState[name] === "unconfigured"));
  return { hostId: entityId, revision, authKind, configured, authState };
}

function asHost(stored: StoredHost): ManagedHost {
  const { format: _format, authKind, ...profile } = stored.definition;
  const { hostId: id, revision, configured, authState } = summary(stored, authKind);
  return { ...profile, id, revision, configured, authState, auth: { kind: authKind, source: "ssh" } };
}

export class HostConfigurations {
  private readonly owner: ModuleCredentials<HostDefinition> | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly legacy: HostStore,
    host?: SshCredentialHost,
  ) {
    if (host) {
      this.owner = new ModuleCredentials({
        ...host,
        pluginId: "ssh",
        definition: HostDefinition,
        targets: (definition) => {
          const target = JSON.stringify([definition.host.toLowerCase(), definition.port, definition.user]);
          return Object.fromEntries(purposes[definition.authKind].map((purpose) => [purpose, target]));
        },
      });
    }
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next.catch(translate);
  }

  private credentials() {
    if (!this.owner) throw authError("local-protection-unavailable");
    return this.owner;
  }

  async list(): Promise<HostRecord[]> {
    const managed = (await this.owner?.list().catch(translate)) ?? [];
    const legacy = this.legacy.list().filter((host) => !OwnedHostId.safeParse(host.id).success);
    return [...legacy, ...managed.map(asHost)].sort((left, right) => left.name.localeCompare(right.name));
  }

  withStableDirectory<T>(operation: () => Promise<T>): Promise<T> {
    return this.mutate(operation);
  }

  private async assertUnused(id: string) {
    if ((await this.list()).some((host) => host.jumpHostIds.includes(id))) throw errors.invalidInput("该主机仍被用作跳板");
  }

  private checkRevision(hostId: string, revision: string | null, existing: readonly StoredHost[]) {
    const host = existing.find((item) => item.entityId === hostId);
    if (!host && revision !== null) throw errors.notFound("SSH 主机不存在");
    if (host && host.revision !== revision) throw errors.versionConflict(host.revision);
    return host;
  }

  configure(input: ConfigureHost, signal: AbortSignal) {
    return this.mutate(async () => {
      const { hostId, expectedRevision, authKind, credentials, ...profile } = input;
      if ((hostId === undefined) !== (expectedRevision === null)) throw errors.invalidInput("SSH 主机 ID 和预期版本必须一起提供");
      const owner = this.credentials();
      const existing = await owner.list();
      const id = hostId ?? `host-owned-${randomUUID().replaceAll("-", "")}`;
      const old = this.checkRevision(id, expectedRevision, existing);
      const settings = validateHost(profile, id, [...this.legacy.list(), ...existing.map(asHost)]);
      const definition: HostDefinition = { ...settings, authKind, configId: randomUUID(), format: 1 };
      const applicable = new Set<Purpose>(purposes[authKind]);
      const actions = new Map<string, CredentialAction>();
      for (const patch of credentials) {
        if (actions.has(patch.purpose) || !applicable.has(patch.purpose)) throw errors.invalidInput("SSH 凭据补丁与认证方式不符");
        if (patch.purpose === "identityFile" && patch.action === "replace" && (!path.isAbsolute(patch.value) || /^(?:\\\\|\/\/)/.test(patch.value))) throw errors.invalidInput("SSH 身份文件需要本机绝对路径");
        actions.set(patch.purpose, patch);
      }
      for (const purpose of applicable) if (!actions.has(purpose)) actions.set(purpose, { purpose, action: "keep" });
      if (old) {
        for (const purpose of purposes[old.definition.authKind]) {
          if (!applicable.has(purpose) && old.authState[purpose] !== "unconfigured") actions.set(purpose, { purpose, action: "clear" });
        }
      }
      return summary(await owner.save({ entityId: id, expectedRevision, definition, actions: [...actions.values()], signal }), authKind);
    });
  }

  importProfiles(prepare: (hosts: HostRecord[]) => ImportRow[], signal: AbortSignal): Promise<ImportRow[]> {
    return this.mutate(async () => {
      const owner = this.credentials();
      const current = await this.list();
      const rows = prepare(current);
      const present = new Set(current.map(({ id }) => id));
      for (const row of rows) {
        signal.throwIfAborted();
        if (present.has(row.hostId)) continue;
        const profile = validateHost(row.profile, row.hostId, current);
        const definition = { ...profile, configId: randomUUID(), format: 1 as const, authKind: "agent" as const };
        await owner.save({ entityId: row.hostId, expectedRevision: null, definition, actions: [], signal });
      }
      return rows;
    });
  }

  copy(input: z.infer<typeof CopyHost>, signal: AbortSignal) {
    return this.mutate(async () => {
      const owner = this.credentials();
      const existing = await owner.list();
      const from = this.checkRevision(input.hostId, input.expectedRevision, existing)!;
      const entityId = `host-owned-${randomUUID().replaceAll("-", "")}`;
      const definition = validateHost({ ...from.definition, name: input.name, configId: randomUUID() }, entityId, [...this.legacy.list(), ...existing.map(asHost)]);
      const actions = purposes[definition.authKind].map((purpose) => ({ purpose, action: "keep" as const }));
      return summary(await owner.save({ entityId, expectedRevision: null, definition, actions, signal }), definition.authKind);
    });
  }

  remove({ hostId, expectedRevision }: z.infer<typeof HostRevision>, signal: AbortSignal, assertUnused?: () => void) {
    return this.mutate(async () => {
      const owner = this.credentials();
      this.checkRevision(hostId, expectedRevision, await owner.list());
      await this.assertUnused(hostId);
      assertUnused?.();
      await owner.delete(hostId, expectedRevision, signal);
    });
  }

  async withAuthentication(host: ManagedHost, connect: (auth: ConnectionAuth) => Promise<void>): Promise<void> {
    const required = purposes[host.auth.kind].filter((purpose) => purpose !== "passphrase" || host.authState[purpose] !== "unconfigured");
    const result = await this.credentials()
      .use(host.id, required, async (definition, values) => {
        try {
          if (definition.configId !== host.configId) throw new HuhuError("VERSION_CONFLICT", "SSH 主机配置已更新，请重新连接");
          await connect(buildAuth(definition.authKind, values));
          return null;
        } catch (error) {
          return error instanceof HuhuError ? error : authError("connection-setup-failed");
        }
      })
      .catch(translate);
    if (result) throw result;
  }
}
