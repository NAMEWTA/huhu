import { randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { DraftConnectionResult } from "../shared/draft-connection.js";
import { ConfigureHost } from "./auth-profile.js";
import type { HostConfigurations, ManagedHost } from "./host-configurations.js";
import { validateHost } from "./hosts.js";
import type { SshManager } from "./manager.js";
import { routeForHost } from "./workspace-target.js";

export const sshDraftDescriptor = defineCapabilityDescriptor({
  plugin: "ssh",
  name: "ssh.hosts.testDraft",
  title: "测试 SSH 主机草稿",
  description: "使用当前未保存的主机资料做一次连接测试。",
  scope: "execute",
  risk: "normal",
  desktopOnly: true,
  exposable: true,
  defaultExposed: false,
  input: ConfigureHost,
  output: DraftConnectionResult,
});

export async function testSshDraft(hosts: HostConfigurations, manager: SshManager, input: ConfigureHost, signal: AbortSignal): Promise<DraftConnectionResult> {
  const { hostId, expectedRevision, authKind, credentials: _credentials, keyId: _keyId, ...profile } = input;
  if ((hostId === undefined) !== (expectedRevision === null)) throw errors.invalidInput("SSH 主机 ID 和预期版本必须一起提供");
  const existing = await hosts.list();
  signal.throwIfAborted();
  const saved = existing.find((host): host is ManagedHost => host.id === hostId && "revision" in host);
  if (hostId && !saved) throw errors.notFound("SSH 主机不存在");
  if (saved && saved.revision !== expectedRevision) throw errors.versionConflict(saved.revision);
  const id = hostId ?? "ssh-draft";
  const normalized = validateHost(profile, id, existing);
  const draft: ManagedHost = {
    ...normalized,
    id,
    revision: randomUUID(),
    configId: randomUUID(),
    auth: { kind: authKind, source: "ssh" },
    authState: {},
    configured: false,
  };
  const byId = new Map(existing.map((host) => [host.id, host]));
  byId.set(id, draft);
  const chain = routeForHost(byId, id);
  if (chain.some((host) => !("revision" in host))) throw errors.invalidInput("请先重新配置旧式跳板主机");
  return manager.testDraft(chain as ManagedHost[], (connect) => hosts.withDraftAuthentication({ ...input, ...normalized }, saved, connect), signal);
}

export function registerSshDraft(api: HuhuApi, hosts: HostConfigurations, manager: SshManager): void {
  api.defineCapability(bindCapability(sshDraftDescriptor, ({ caller, signal }, input) => {
    if (caller !== "desktop") throw errors.permissionDenied(sshDraftDescriptor.name);
    return testSshDraft(hosts, manager, input, signal);
  }));
}
