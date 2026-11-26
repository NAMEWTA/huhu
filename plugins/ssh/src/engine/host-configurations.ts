import { purposes, type Purpose } from "../shared/host-auth.js";
import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CredentialAction, type CredentialOwner, type CredentialSummary } from "@huhu/kernel";
import ssh2, { type ConnectConfig } from "ssh2";
import { prepareSshPrivateKey } from "./putty-key.js";
import type { z } from "zod";
import { HostDefinition, OwnedHostId, type ConfigureHost, type CopyHost, type HostRevision, type ManagedHostView, type SshHostProfile } from "./auth-profile.js";
import { validateHost, type HostStore, type LegacyHost } from "./hosts.js";
import { readIdentityCertificate } from "./identity-certificate.js";
import { KeyLibrary } from "./key-library.js";
import { requireOutboundProfile } from "./outbound-proxies.js";
import { EditHostRoutes, type HostRouteEditResult } from "./route-edits.js";
import type { AddSshKey, SshKeySummary } from "../shared/key-library.js";
import { routeForHost } from "../shared/route.js";

export type SshCredentialHost = Pick<CredentialOwner<HostDefinition>, "vault" | "localRoot" | "localVaultInstanceId" | "protection">;
export type ManagedHost = z.infer<typeof ManagedHostView> & { configId: string };
export type HostRecord = LegacyHost | ManagedHost;
export type ConnectionAuth = Pick<ConnectConfig, "password" | "privateKey" | "passphrase" | "agent"> & { publicKeyCertificate?: string };

type StoredHost = CredentialSummary & { definition: HostDefinition };
type ImportRow = { index: number; hostId: string; profile: SshHostProfile; group: string[] };
const hostModule = "ssh";

export function hostPackageFile(files: SshCredentialHost["vault"]["files"]) {
  return ModuleCredentials.portablePackageFile(files, hostModule, HostDefinition);
}

function routeCommitGuard(assertCurrent: (() => void) | undefined) {
  if (!assertCurrent) return {};
  return {
    isCurrent() {
      try {
        assertCurrent();
        return true;
      } catch {
        return false;
      }
    },
  };
}

function authError(reason: string): HuhuError {
  const message = reason === "identity-file-unavailable" ? "本机身份文件不可用，请检查路径和文件权限" : reason === "invalid-private-key-or-passphrase" ? "无法解锁私钥，请检查文件格式和口令" : "SSH 本机认证不可用，请在主机配置中检查凭据";
  return new HuhuError("SSH_AUTH_FAILED", message, { details: { reason } });
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

async function buildAuth(kind: HostDefinition["authKind"], values: ReadonlyMap<string, string>): Promise<ConnectionAuth> {
  if (kind === "agent") return agentAuth();
  if (kind === "password") return { password: values.get("password")! };
  let key = values.get("privateKey");
  const identity = kind === "identity-file" ? values.get("identityFile") : undefined;
  if (kind === "identity-file") {
    try {
      const stats = statSync(identity!);
      if (!stats.isFile() || stats.size > 1024 * 1024) throw authError("identity-file-unavailable");
      key = readFileSync(identity!, "utf8");
    } catch {
      throw authError("identity-file-unavailable");
    }
  }
  const prepared = await prepareSshPrivateKey(key!, values.get("passphrase")).catch(() => { throw authError("invalid-private-key-or-passphrase"); });
  const candidates = ssh2.utils.parseKey(prepared.privateKey, prepared.passphrase);
  if (candidates instanceof Error) throw authError("invalid-private-key-or-passphrase");
  const signer = Array.isArray(candidates) ? candidates[0] : candidates;
  if (!signer?.isPrivateKey()) throw authError("invalid-private-key-or-passphrase");
  const certificate = identity ? readIdentityCertificate(identity, signer.type, signer.getPublicSSH()) : undefined;
  return { privateKey: prepared.privateKey, ...(prepared.passphrase !== undefined ? { passphrase: prepared.passphrase } : {}), ...(certificate !== undefined ? { publicKeyCertificate: certificate } : {}) };
}

function summary({ entityId, revision, authState }: CredentialSummary, authKind: HostDefinition["authKind"]) {
  const configured = purposes[authKind].every((name) => authState[name] === "configured" || (name === "passphrase" && authState[name] === "unconfigured"));
  return { hostId: entityId, revision, authKind, configured, authState };
}

function asHost(stored: StoredHost, keys?: ReadonlyMap<string, boolean>): ManagedHost {
  const { format: _format, authKind, ...profile } = stored.definition;
  const { hostId: id, revision, configured, authState } = summary(stored, authKind);
  const available = profile.keyId ? keys?.get(profile.keyId) === true : configured;
  const state = profile.keyId ? ({ privateKey: available ? "configured" : "temporarily-unavailable" } as const) : authState;
  return { ...profile, id, revision, configured: available, authState: state, auth: { kind: authKind, source: "ssh" } };
}

export class HostConfigurations {
  private readonly owner: ModuleCredentials<HostDefinition> | undefined;
  private readonly keys: KeyLibrary;
  private readonly vaultFiles: SshCredentialHost["vault"]["files"] | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly legacy: HostStore,
    host?: SshCredentialHost,
  ) {
    this.keys = new KeyLibrary(host);
    this.vaultFiles = host?.vault.files;
    if (host) {
      this.owner = new ModuleCredentials({
        ...host,
        pluginId: hostModule,
        definition: HostDefinition,
        targets: (definition) => {
          if (definition.keyId) return {};
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
    const keys = managed.some(({ definition }) => definition.keyId) ? new Map((await this.keys.list()).map(({ id, available }) => [id, available])) : undefined;
    return [...legacy, ...managed.map((host) => asHost(host, keys))].sort((left, right) => left.name.localeCompare(right.name));
  }

  async listKeys(): Promise<SshKeySummary[]> {
    const [keys, hosts] = await Promise.all([this.keys.list(), this.owner?.list().catch(translate)]);
    const referenced = new Set(hosts?.map(({ definition }) => definition.keyId));
    return keys.map((key) => ({ ...key, referenced: referenced.has(key.id) }));
  }

  async addKey(input: AddSshKey, signal: AbortSignal): Promise<SshKeySummary> {
    return { ...(await this.keys.add(input, signal)), referenced: false };
  }

  removeKey(id: string, revision: string, signal: AbortSignal): Promise<void> {
    return this.mutate(async () => {
      if ((await this.credentials().list()).some(({ definition }) => definition.keyId === id)) throw errors.invalidInput("请先移除主机对该密钥的引用");
      await this.keys.remove(id, revision, signal);
    });
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

  configure(input: ConfigureHost, signal: AbortSignal, assertCurrent?: () => void) {
    return this.mutate(async () => {
      const { hostId, expectedRevision, authKind, keyId: selectedKey, credentials, routeDisabled, outboundProxy, viaShell, ...profile } = input;
      if ((hostId === undefined) !== (expectedRevision === null)) throw errors.invalidInput("SSH 主机 ID 和预期版本必须一起提供");
      const owner = this.credentials();
      const existing = await owner.list();
      const id = hostId ?? `host-owned-${randomUUID().replaceAll("-", "")}`;
      const old = this.checkRevision(id, expectedRevision, existing);
      if (assertCurrent && (selectedKey !== undefined || (old?.definition.keyId && credentials.some(({ action }) => action !== "keep")))) throw errors.permissionDenied("SSH 密钥库关联");
      if (assertCurrent && routeDisabled !== undefined && routeDisabled !== Boolean(old?.definition.routeDisabled)) throw errors.permissionDenied("SSH 跳板路由状态");
      if (assertCurrent && outboundProxy !== undefined) throw errors.permissionDenied("SSH 出站代理选择");
      if (assertCurrent && viaShell !== undefined) throw errors.permissionDenied("SSH ViaShell 设置");
      if (selectedKey && authKind !== "key") throw errors.invalidInput("只可为私钥认证选择密钥库");
      const keyId = authKind === "key" ? (selectedKey === undefined ? old?.definition.keyId : selectedKey) : undefined;
      const selected = keyId ? (await this.keys.list()).find((key) => key.id === keyId) : undefined;
      if (keyId && (!selected || (!selected.available && keyId !== old?.definition.keyId))) throw errors.invalidInput("所选密钥在本机不可用");
      const disabled = routeDisabled ?? (profile.jumpHostIds.length > 0 && old?.definition.routeDisabled);
      const shell = viaShell ?? (old && profile.jumpHostIds.length > 0 && old.definition.jumpHostIds[0] === profile.jumpHostIds[0] && old.definition.viaShell);
      const proxy = outboundProxy ?? old?.definition.outboundProxy;
      if (proxy?.mode === "profile") {
        if (!this.vaultFiles) throw errors.invalidInput("此 Vault 无法读取 SSH 出站代理");
        requireOutboundProfile(this.vaultFiles, proxy.profileId);
      }
      const settings = validateHost({ ...profile, ...(disabled && { routeDisabled: true as const }), ...(shell && { viaShell: true as const }), ...(proxy && { outboundProxy: proxy }) }, id, [...this.legacy.list(), ...existing.map((host) => asHost(host))]);
      const definition: HostDefinition = { ...settings, authKind, ...(keyId && { keyId }), configId: randomUUID(), format: 1 };
      const applicable = new Set<Purpose>(keyId ? [] : purposes[authKind]);
      const actions = new Map<string, CredentialAction>();
      for (const patch of credentials) {
        if (keyId && patch.action === "keep" && purposes.key.includes(patch.purpose)) continue;
        if (actions.has(patch.purpose) || !applicable.has(patch.purpose)) throw errors.invalidInput("SSH 凭据补丁与认证方式不符");
        if (patch.purpose === "identityFile" && patch.action === "replace" && (!path.isAbsolute(patch.value) || /^(?:\\\\|\/\/)/.test(patch.value))) throw errors.invalidInput("SSH 身份文件需要本机绝对路径");
        actions.set(patch.purpose, patch);
      }
      for (const purpose of applicable) if (!actions.has(purpose)) actions.set(purpose, { purpose, action: "keep" });
      if (old) {
        for (const purpose of purposes[old.definition.authKind]) {
          if (!applicable.has(purpose) && old.authState[purpose] && old.authState[purpose] !== "unconfigured") actions.set(purpose, { purpose, action: "clear" });
        }
      }
      assertCurrent?.();
      const saved = summary(await owner.save({ entityId: id, expectedRevision, definition, actions: [...actions.values()], signal, ...routeCommitGuard(assertCurrent) }), authKind);
      return selected ? { ...saved, configured: selected.available, authState: { privateKey: selected.available ? "configured" : "temporarily-unavailable" } } : saved;
    });
  }

  editRoutes(input: EditHostRoutes, signal: AbortSignal, assertCurrent?: () => void): Promise<HostRouteEditResult> {
    return this.mutate(async () => {
      const parsed = EditHostRoutes.safeParse(input);
      if (!parsed.success) throw errors.invalidInput("批量路由需要 1–100 个不同的有效主机、预期版本和有效操作", parsed.error.issues);
      const { targets, change } = parsed.data;
      const updated = await this.credentials().editDefinitions(
        targets.map(({ hostId, expectedRevision }) => ({ entityId: hostId, expectedRevision })),
        (entries) => {
          assertCurrent?.();
          const graph = new Map(entries.filter(({ entityId }) => OwnedHostId.safeParse(entityId).success).map(({ entityId, definition }) => [entityId, definition]));
          const next = new Map<string, HostDefinition>();
          if (change.action === "associate" && !graph.has(change.jumpHostId)) throw errors.notFound("所选 SSH 跳板不存在或需要修复");
          for (const { hostId } of targets) {
            const host = graph.get(hostId)!;
            const directJump = host.jumpHostIds[0];
            if (change.action === "associate") {
              if ((directJump && change.ifExists === "skip") || directJump === change.jumpHostId) continue;
              if (hostId === change.jumpHostId) throw errors.invalidInput(`「${host.name}」不能用自身作为跳板`);
              const { viaShell: _oldTransport, ...definition } = host;
              next.set(hostId, { ...definition, jumpHostIds: [change.jumpHostId] });
            } else {
              if (!directJump) throw errors.invalidInput(`「${host.name}」尚未设置跳板，无法启停路由`);
              if (change.enabled === !host.routeDisabled) continue;
              const { routeDisabled: _disabled, ...definition } = host;
              next.set(hostId, change.enabled ? definition : { ...definition, routeDisabled: true });
            }
          }
          if (next.size) {
            for (const [id, definition] of next) graph.set(id, definition);
            // Validate configured edges, including stopped routes, against the whole proposed graph.
            const configured = new Map([...graph].map(([id, definition]) => [id, { id, jumpHostIds: definition.jumpHostIds }]));
            const checked = new Set<string>();
            const unchecked = {
              get(id: string) {
                return checked.has(id) ? { id, jumpHostIds: [] } : configured.get(id);
              },
            };
            for (const [id, definition] of graph) {
              if (checked.has(id)) continue;
              try {
                for (const node of routeForHost(unchecked, id)) checked.add(node.id);
              } catch (error) {
                if (!(error instanceof HuhuError)) throw error;
                throw errors.invalidInput(`「${definition.name}」的路由无效。 ${error.message}`);
              }
            }
          }
          return next;
        },
        signal,
        routeCommitGuard(assertCurrent).isCurrent,
      );
      const changed = new Set(updated);
      return { updated, skipped: targets.map(({ hostId }) => hostId).filter((id) => !changed.has(id)) };
    });
  }

  importProfiles(prepare: (hosts: HostRecord[]) => ImportRow[], signal: AbortSignal, assertCurrent?: () => void): Promise<ImportRow[]> {
    return this.mutate(async () => {
      const owner = this.credentials();
      const current = await this.list();
      const rows = prepare(current);
      const present = new Set(current.map(({ id }) => id));
      let published = false;
      try {
        for (const row of rows) {
          signal.throwIfAborted();
          if (present.has(row.hostId)) continue;
          const profile = validateHost(row.profile, row.hostId, current);
          const definition = { ...profile, configId: randomUUID(), format: 1 as const, authKind: "agent" as const };
          assertCurrent?.();
          await owner.save({ entityId: row.hostId, expectedRevision: null, definition, actions: [], signal, ...routeCommitGuard(assertCurrent) });
          published = true;
        }
      } catch (error) {
        if (assertCurrent && published) throw new HuhuError("INTERNAL", "SSH 主机导入结果待核实", { retryable: false, details: { outcome: "unknown" } });
        throw error;
      }
      return rows;
    });
  }

  copy(input: z.infer<typeof CopyHost>, signal: AbortSignal, assertCurrent?: () => void) {
    return this.mutate(async () => {
      const owner = this.credentials();
      const existing = await owner.list();
      const from = this.checkRevision(input.hostId, input.expectedRevision, existing)!;
      const entityId = `host-owned-${randomUUID().replaceAll("-", "")}`;
      const { keyId: _keyId, ...source } = from.definition;
      const definition = validateHost({ ...source, name: input.name, configId: randomUUID() }, entityId, [...this.legacy.list(), ...existing.map((host) => asHost(host))]);
      const actions = purposes[definition.authKind].map((purpose) => ({ purpose, action: "keep" as const }));
      assertCurrent?.();
      return summary(await owner.save({ entityId, expectedRevision: null, definition, actions, signal, ...routeCommitGuard(assertCurrent) }), definition.authKind);
    });
  }

  remove({ hostId, expectedRevision }: z.infer<typeof HostRevision>, signal: AbortSignal, assertUnused?: () => void, assertCurrent?: () => void) {
    return this.mutate(async () => {
      const owner = this.credentials();
      this.checkRevision(hostId, expectedRevision, await owner.list());
      await this.assertUnused(hostId);
      assertUnused?.();
      assertCurrent?.();
      await owner.delete(hostId, expectedRevision, signal, routeCommitGuard(assertCurrent).isCurrent);
    });
  }

  async syncIdentityFile(host: ManagedHost): Promise<string | null> {
    if (host.auth.kind !== "identity-file" || host.authState.identityFile === "unconfigured") return null;
    if (host.authState.identityFile !== "configured") throw authError("identity-file-unavailable");
    const result = await this.credentials()
      .use(host.id, ["identityFile"], async (_definition, values, revision) => ({
        revision,
        path: values.get("identityFile")!,
      }))
      .catch(translate);
    if (result.revision !== host.revision) throw errors.versionConflict(result.revision);
    return result.path;
  }

  /** Existing secrets are eligible only at their saved endpoint, even when omitted in the draft. */
  async withDraftAuthentication(input: ConfigureHost, saved: ManagedHost | undefined, connect: (auth: ConnectionAuth) => Promise<void>): Promise<void> {
    const sameTarget = saved?.revision === input.expectedRevision && saved.auth.kind === input.authKind && saved.host.toLowerCase() === input.host.toLowerCase() && saved.port === input.port && saved.user === input.user;
    if (input.keyId && input.authKind !== "key") throw errors.invalidInput("只可为私钥认证选择密钥库");
    const keyId = input.authKind === "key" ? (input.keyId === undefined && sameTarget ? saved.keyId : input.keyId) : undefined;
    const applicable = purposes[input.authKind];
    const patches = new Map(input.credentials.map((patch) => [patch.purpose, patch]));
    if (patches.size !== input.credentials.length || [...patches.keys()].some((purpose) => !applicable.includes(purpose))) throw errors.invalidInput("SSH 凭据补丁与认证方式不符");
    const identity = patches.get("identityFile");
    if (identity?.action === "replace" && (!path.isAbsolute(identity.value) || /^(?:\\\\|\/\/)/.test(identity.value))) throw errors.invalidInput("SSH 身份文件需要本机绝对路径");
    if (keyId) return this.keys.use(keyId, connect);
    const retained = sameTarget && !saved.keyId ? applicable.filter((purpose) => saved.authState[purpose] === "configured" && (!patches.has(purpose) || patches.get(purpose)?.action === "keep")) : [];
    const applyDraft = async (kept: ReadonlyMap<string, string>) => {
      const values = new Map(kept);
      for (const patch of patches.values()) {
        if (patch.action === "replace") values.set(patch.purpose, patch.value);
      }
      const primary = applicable[0];
      if (primary && !values.has(primary)) await connect({});
      else await connect(await buildAuth(input.authKind, values));
    };
    if (!saved || !retained.length) return applyDraft(new Map());
    const result = await this.credentials()
      .use(saved.id, retained, async (_definition, values, revision) => {
        try {
          if (revision !== saved.revision) throw errors.versionConflict(revision);
          await applyDraft(values);
          return null;
        } catch (error) {
          return error instanceof HuhuError ? error : authError("connection-setup-failed");
        }
      })
      .catch(translate);
    if (result) throw result;
  }

  async withAuthentication(host: ManagedHost, connect: (auth: ConnectionAuth) => Promise<void>): Promise<void> {
    const required = host.keyId ? [] : purposes[host.auth.kind].filter((purpose) => purpose !== "passphrase" || host.authState[purpose] !== "unconfigured");
    const result = await this.credentials()
      .use(host.id, required, async (definition, values, revision) => {
        try {
          if (revision !== host.revision || definition.configId !== host.configId) throw new HuhuError("VERSION_CONFLICT", "SSH 主机配置已更新，请重新连接");
          if (definition.keyId) await this.keys.use(definition.keyId, connect);
          else await connect(await buildAuth(definition.authKind, values));
          return null;
        } catch (error) {
          return error instanceof HuhuError ? error : authError("connection-setup-failed");
        }
      })
      .catch(translate);
    if (result) throw result;
  }
}
