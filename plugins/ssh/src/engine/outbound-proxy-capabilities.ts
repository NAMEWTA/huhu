import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { errors } from "@huhu/contracts";
import { z } from "zod";
import { OutboundProxySummary, ProxyProfile, ProxyProfileRevision, ProxyRouting, SaveProxyProfile, SetDefaultProxy } from "../shared/outbound-proxy.js";
import { OwnedHostId } from "./auth-profile.js";
import type { HostConfigurations } from "./host-configurations.js";
import { effectiveOutboundProxy, summarizeOutboundProxy, type OutboundProxies } from "./outbound-proxies.js";
import { readPortableHosts } from "./public-resources.js";
import type { DeviceProxies } from "./device-proxies.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
export const sshOutboundProxyDescriptors = {
  outboundProxiesPreview: defineCapabilityDescriptor({
    plugin: "ssh",
    exposable: false,
    defaultExposed: false,
    name: "ssh.outboundProxies.preview",
    title: "预览 SSH 首段路径",
    description: "读取该主机下次连接采用的首段出站方式。",
    scope: "read",
    risk: "normal",
    input: z.strictObject({ hostId: OwnedHostId }),
    output: OutboundProxySummary,
  }),
  outboundProxiesList: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.outboundProxies.list",
    title: "读取 SSH 出站代理",
    description: "读取本 Vault 的默认出站代理和凭据状态。",
    scope: "read",
    risk: "normal",
    input: z.strictObject({}),
    output: z.strictObject({ routing: ProxyRouting, profiles: z.array(ProxyProfile) }),
  }),
  outboundProxiesSave: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.outboundProxies.save",
    title: "保存 SSH 出站代理",
    description: "保存协议、地址及本机加密的代理凭据。",
    scope: "write",
    risk: "high",
    input: SaveProxyProfile,
    output: ProxyProfile,
  }),
  outboundProxiesSetDefault: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.outboundProxies.setDefault",
    title: "设置 SSH 默认出站代理",
    description: "为继承默认设置的主机选择 SSH 第一段 TCP 所用代理。",
    scope: "write",
    risk: "high",
    input: SetDefaultProxy,
    output: ProxyRouting,
  }),
  outboundProxiesRemove: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.outboundProxies.remove",
    title: "删除未引用的 SSH 出站代理",
    description: "按版本删除已解除默认和主机关联的代理配置。",
    scope: "write",
    risk: "high",
    input: ProxyProfileRevision,
    output: z.strictObject({ removed: z.literal(true) }),
  }),
};

export function registerOutboundProxies(api: HuhuApi, proxies: OutboundProxies, hosts: HostConfigurations, device?: DeviceProxies): void {
  const descriptors = sshOutboundProxyDescriptors;
  const changed = () => api.events.publish("entity.changed", { kind: "ssh-outbound-proxy", id: "outbound", op: "updated" });
  api.defineCapability(
    bindCapability(descriptors.outboundProxiesPreview, ({ caller }, { hostId }) => {
      const [host] = readPortableHosts(api.vault.files, new Set([hostId]));
      if (!host) throw errors.notFound("SSH 主机");
      if (caller === "desktop" && device?.read(hostId)) return { source: "command" as const };
      return summarizeOutboundProxy(effectiveOutboundProxy(api.vault.files, host));
    }),
  );
  api.defineCapability(bindCapability(descriptors.outboundProxiesList, () => proxies.list()));
  api.defineCapability(
    bindCapability(descriptors.outboundProxiesSave, async ({ signal }, input) => {
      const profile = await proxies.save(input, signal);
      changed();
      return profile;
    }),
  );
  api.defineCapability(
    bindCapability(descriptors.outboundProxiesSetDefault, async ({ signal }, input) => {
      const routing = await proxies.setDefault(input, signal);
      changed();
      return routing;
    }),
  );
  api.defineCapability(
    bindCapability(descriptors.outboundProxiesRemove, ({ signal }, { id, revision }) =>
      hosts.withStableDirectory(async () => {
        await proxies.remove(id, revision, signal);
        changed();
        return { removed: true as const };
      }),
    ),
  );
}
