import { randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { DraftConnectionResult } from "../shared/draft-connection.js";
import { ConfigureHost, SshRouteRevision } from "./auth-profile.js";
import type { HostConfigurations, ManagedHost } from "./host-configurations.js";
import { validateHost } from "./hosts.js";
import type { SshManager } from "./manager.js";
import { externalSshOwner, readBoundRoute } from "./public-resources.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";

export const sshDraftDescriptor = defineCapabilityDescriptor({
  plugin: "ssh",
  name: "ssh.hosts.testDraft",
  title: "测试 SSH 主机草稿",
  description: "测试未保存的主机资料，外部工具须提供已授权主机及路由版本。",
  scope: "execute",
  risk: "normal",
  desktopOnly: true,
  exposable: true,
  defaultExposed: false,
  resourceGuarded: "ssh.hosts",
  input: ConfigureHost.extend({ routeRevision: SshRouteRevision.optional() }),
  output: DraftConnectionResult,
});

export async function testSshDraft(hosts: HostConfigurations, manager: SshManager, input: ConfigureHost, signal: AbortSignal, boundRoute?: () => ManagedHost[]): Promise<DraftConnectionResult> {
  const { hostId, expectedRevision, authKind, credentials: _credentials, keyId: _keyId, routeDisabled, outboundProxy, ...profile } = input;
  if ((hostId === undefined) !== (expectedRevision === null)) throw errors.invalidInput("SSH 主机 ID 和预期版本必须一起提供");
  const existing = await hosts.list();
  signal.throwIfAborted();
  const saved = existing.find((host): host is ManagedHost => host.id === hostId && "revision" in host);
  if (hostId && !saved) throw errors.notFound("SSH 主机不存在");
  if (saved && saved.revision !== expectedRevision) throw errors.versionConflict(saved.revision);
  const id = hostId ?? "ssh-draft";
  const disabled = routeDisabled ?? (profile.jumpHostIds.length > 0 && saved?.routeDisabled);
  const proxy = outboundProxy ?? saved?.outboundProxy;
  const normalized = validateHost({ ...profile, ...(disabled && { routeDisabled: true as const }), ...(proxy && { outboundProxy: proxy }) }, id, existing);
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
  const validate =
    boundRoute &&
    (() => {
      if (workspaceTarget(boundRoute()) !== workspaceTarget(chain)) throw errors.permissionDenied("SSH 草稿必须使用已授权的主机与路由");
    });
  validate?.();
  return manager.testDraft(chain as ManagedHost[], (connect) => hosts.withDraftAuthentication({ ...input, ...normalized }, saved, connect), signal, validate);
}

export function registerSshDraft(api: HuhuApi, hosts: HostConfigurations, manager: SshManager): void {
  api.defineCapability(
    bindCapability(sshDraftDescriptor, (context, { routeRevision, ...input }) => {
      if (context.caller === "desktop") return testSshDraft(hosts, manager, input, context.signal);
      externalSshOwner(context);
      const { hostId, expectedRevision, authKind, keyId, credentials } = input;
      if (!hostId || !expectedRevision || !routeRevision) throw errors.invalidInput("外部 SSH 草稿需要已授权主机、主机版本和路由版本");
      const boundRoute = () => {
        context.signal.throwIfAborted();
        const chain = readBoundRoute(api.vault.files, context, { hostId, routeRevision });
        const target = chain.at(-1)!;
        if (target.revision !== expectedRevision) throw errors.versionConflict(target.revision);
        return chain;
      };
      const target = boundRoute().at(-1)!;
      if (input.outboundProxy !== undefined) throw errors.permissionDenied("SSH 出站代理选择");
      if (keyId !== undefined || ((authKind === "agent" || authKind === "identity-file") && authKind !== target.auth.kind) || credentials.some(({ purpose }) => purpose === "identityFile")) {
        throw errors.permissionDenied("SSH 本机身份选择");
      }
      return testSshDraft(hosts, manager, input, context.signal, boundRoute);
    }),
  );
}
