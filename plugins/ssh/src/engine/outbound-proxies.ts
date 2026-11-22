import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import { errors, HuhuError } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CredentialAction, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { ProxyDefinition, ProxyRouting, type ProxyProfile, type SaveProxyProfile, type SetDefaultProxy } from "../shared/outbound-proxy.js";
import { HostDefinition, type SshHostProfile } from "./auth-profile.js";
import type { SshCredentialHost } from "./host-configurations.js";

type Files = HuhuApi["vault"]["files"];
type SavedProxy = ProxyDefinition & { id: string; revision: string };
type ProxyCredentials = { username: string; password: string };
type Destination = { host: string; port: number };
export type ProxyDial = (proxy: Destination & { protocol: ProxyDefinition["protocol"]; credentials?: ProxyCredentials }, target: Destination, signal: AbortSignal) => Promise<Duplex>;
export type EffectiveProxy = { source: "inherit" | "direct" | "profile"; profile?: SavedProxy };

const defaultFile = ".huhu/ssh/outbound-proxy.json";
const settings = ProxyRouting.pick({ defaultProfileId: true }).extend({ format: z.literal(1) });
const credentialModule = "ssh.proxy";
const purposes = ["username", "password"] as const;

function routing(files: Files): ProxyRouting {
  const file = files.read(defaultFile);
  if (!file) {
    if (files.exists(defaultFile)) throw errors.invalidInput("SSH 出站代理设置路径应为普通文件");
    return { defaultProfileId: null, revision: null };
  }
  try {
    return { defaultProfileId: settings.parse(JSON.parse(file.bytes.toString("utf8"))).defaultProfileId, revision: file.version };
  } catch {
    throw errors.invalidInput("SSH 出站代理设置格式无效");
  }
}

function profileRows(files: Files) {
  try {
    return ModuleCredentials.readPortableDefinitions(files, credentialModule, ProxyDefinition);
  } catch (error) {
    if (error instanceof CredentialError) throw errors.invalidInput("SSH 出站代理配置无法读取");
    throw error;
  }
}

export function requireOutboundProfile(files: Files, id: string): SavedProxy {
  const row = profileRows(files).find(({ entityId }) => entityId === id);
  if (!row) throw errors.notFound("SSH 出站代理配置");
  return { ...row.definition, id, revision: row.revision };
}

export function effectiveOutboundProxy(files: Files, host: Pick<SshHostProfile, "outboundProxy">): EffectiveProxy {
  const policy = host.outboundProxy;
  if (policy?.mode === "direct") return { source: "direct" };
  if (policy?.mode === "profile") return { source: "profile", profile: requireOutboundProfile(files, policy.profileId) };
  const { defaultProfileId } = routing(files);
  return defaultProfileId ? { source: "inherit", profile: requireOutboundProfile(files, defaultProfileId) } : { source: "inherit" };
}

/** The absence of a proxy policy preserves the route revision of older Vaults. */
export function outboundProxyVersion({ source, profile }: EffectiveProxy): string | undefined {
  if (profile) return JSON.stringify([source, profile.id, profile.revision]);
  return source === "direct" ? source : undefined;
}

function proxyError(error: unknown): never {
  if (!(error instanceof CredentialError)) throw error;
  if (error.code === "conflict") throw new HuhuError("VERSION_CONFLICT", "SSH 出站代理配置已更新");
  if (error.code === "not-found") throw errors.notFound("SSH 出站代理配置");
  if (error.code === "cancelled") throw new HuhuError("SSH_DISCONNECTED", "SSH 出站代理操作已取消");
  throw new HuhuError("SSH_AUTH_FAILED", "本机 SSH 出站代理配置或凭据不可用", { details: { reason: error.code, stage: "proxy" } });
}

function targetOf(profile: ProxyDefinition): string {
  return JSON.stringify([profile.protocol, profile.host.toLowerCase(), profile.port]);
}

export class OutboundProxies {
  private readonly owner: ModuleCredentials<ProxyDefinition> | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly files: Files,
    host?: SshCredentialHost,
  ) {
    if (host)
      this.owner = new ModuleCredentials({
        ...host,
        pluginId: credentialModule,
        definition: ProxyDefinition,
        targets: (definition) => (definition.authenticated ? { username: targetOf(definition), password: targetOf(definition) } : {}),
      });
  }

  private credentialStore() {
    if (!this.owner) throw new HuhuError("SSH_AUTH_FAILED", "SSH 本机凭据保护不可用");
    return this.owner;
  }

  private mutate<T>(change: () => Promise<T>): Promise<T> {
    const result = this.tail.then(change);
    this.tail = result.catch(() => undefined);
    return result.catch(proxyError);
  }

  async list(): Promise<{ routing: ProxyRouting; profiles: ProxyProfile[] }> {
    const names = await this.owner?.list().catch(proxyError);
    const profiles = names
      ? names.map(({ entityId: id, revision, definition, authState }) => ({ ...definition, id, revision, available: !definition.authenticated || purposes.every((purpose) => authState[purpose] === "configured") }))
      : profileRows(this.files).map(({ entityId: id, revision, definition }) => ({ ...definition, id, revision, available: !definition.authenticated }));
    return { routing: routing(this.files), profiles: profiles.sort((left, right) => left.name.localeCompare(right.name)) };
  }

  save(input: z.infer<typeof SaveProxyProfile>, signal: AbortSignal): Promise<ProxyProfile> {
    return this.mutate(async () => {
      const { id, expectedRevision, authentication, ...requested } = input;
      if ((id === undefined) !== (expectedRevision === null)) throw errors.invalidInput("SSH 出站代理 ID 和预期版本必须一起提供");
      const current = id ? profileRows(this.files).find(({ entityId }) => entityId === id) : undefined;
      if (id && !current) throw errors.notFound("SSH 出站代理配置");
      if (current && current.revision !== expectedRevision) throw errors.versionConflict(current.revision);
      const host = requested.host.replace(/^\[([^\]]+)\]$/u, "$1");
      if (/[:[\]%]/u.test(host) && isIP(host) !== 6) throw errors.invalidInput("SSH 出站代理地址无效");
      const definition = { ...requested, host, authenticated: authentication.action !== "none" };
      const actions: CredentialAction[] = [];
      if (authentication.action === "keep") {
        if (!current?.definition.authenticated || targetOf(current.definition) !== targetOf(definition)) throw errors.invalidInput("请重新输入此代理地址的凭据");
        for (const purpose of purposes) actions.push({ purpose, action: "keep" });
      } else if (authentication.action === "replace") {
        if (authentication.username.includes(":") && definition.protocol === "http-connect") throw errors.invalidInput("HTTP 代理用户名不能包含冒号");
        if (definition.protocol === "socks5" && purposes.some((purpose) => Buffer.byteLength(authentication[purpose]) > 255)) throw errors.invalidInput("SOCKS5 代理账号和口令各最多 255 字节");
        for (const purpose of purposes) actions.push({ purpose, action: "replace", value: authentication[purpose], reconfigure: true });
      } else {
        for (const purpose of current?.configured ?? []) actions.push({ purpose, action: "clear" });
      }
      const saved = await this.credentialStore().save({ entityId: id ?? randomUUID(), expectedRevision, definition, actions, signal });
      return { ...definition, id: saved.entityId, revision: saved.revision, available: !definition.authenticated || purposes.every((purpose) => saved.authState[purpose] === "configured") };
    });
  }

  setDefault(input: z.infer<typeof SetDefaultProxy>, signal: AbortSignal): Promise<ProxyRouting> {
    return this.mutate(async () => {
      const current = routing(this.files);
      if (current.revision !== input.expectedRevision) throw errors.versionConflict(current.revision ?? "");
      if (input.defaultProfileId) requireOutboundProfile(this.files, input.defaultProfileId);
      const { version } = await this.files.write(defaultFile, Buffer.from(JSON.stringify({ format: 1, defaultProfileId: input.defaultProfileId }) + "\n"), {
        expectedVersion: input.expectedRevision,
        beforeCommit: () => signal.throwIfAborted(),
      });
      return { defaultProfileId: input.defaultProfileId, revision: version };
    });
  }

  remove(id: string, revision: string, signal: AbortSignal): Promise<void> {
    return this.mutate(async () => {
      const defaultProfile = routing(this.files).defaultProfileId;
      const hosts = ModuleCredentials.readPortableDefinitions(this.files, "ssh", HostDefinition);
      if (defaultProfile === id || hosts.some(({ definition }) => definition.outboundProxy?.mode === "profile" && definition.outboundProxy.profileId === id)) {
        throw errors.invalidInput("请先移除对此 SSH 出站代理的引用");
      }
      await this.credentialStore().delete(id, revision, signal);
    });
  }

  async dial(profile: SavedProxy, target: Destination, signal: AbortSignal, establish: ProxyDial, assertCurrent: () => void): Promise<Duplex> {
    const { host, port, protocol } = profile;
    const connect = (credentials?: ProxyCredentials) => {
      signal.throwIfAborted();
      assertCurrent();
      return establish({ host, port, protocol, ...(credentials && { credentials }) }, target, signal);
    };
    if (!profile.authenticated) return connect();
    const result = await this.credentialStore()
      .use(profile.id, purposes, async (_definition, values, revision) => {
        try {
          if (revision !== profile.revision) throw errors.versionConflict(revision);
          return { stream: await connect({ username: values.get("username")!, password: values.get("password")! }) };
        } catch (error) {
          return { error };
        }
      })
      .catch(proxyError);
    if ("error" in result) throw result.error;
    return result.stream;
  }
}
