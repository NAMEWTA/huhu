import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { OwnedHostId } from "./auth-profile.js";
import { CommandTemplate, type DeviceProxies } from "./device-proxies.js";
import { readResourceRoute } from "./public-resources.js";
import { connectionIdentity } from "./workspace-target.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
const target = z.strictObject({ hostId: OwnedHostId });
const revision = z.uuidv4();
const approval = z.strictObject({ revision, command: CommandTemplate, current: z.boolean() });
const state = z.strictObject({
  supported: z.boolean(),
  routeRevision: z.string(),
  firstHop: z.strictObject({ name: z.string(), host: z.string(), port: z.number(), user: z.string() }),
  approval: approval.nullable(),
});
export type DeviceProxyState = z.infer<typeof state>;

export const sshDeviceProxyDescriptors = {
  deviceProxyRead: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.proxyCommand.read",
    title: "读取本机 SSH ProxyCommand",
    description: "查看第一跳及此设备保存的代理程序批准。",
    scope: "read",
    risk: "normal",
    input: target,
    output: state,
  }),
  deviceProxyApprove: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.proxyCommand.approve",
    title: "批准本机 SSH ProxyCommand",
    description: "在本机批准指定路由使用一个程序及其参数。",
    scope: "admin",
    risk: "high",
    idempotency: "handler",
    input: target.extend({ routeRevision: z.string(), expectedRevision: revision.nullable(), command: CommandTemplate }),
    output: state,
  }),
  deviceProxyRevoke: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.proxyCommand.revoke",
    title: "撤销本机 SSH ProxyCommand",
    description: "撤销本机批准并关闭该批准启动的连接。",
    scope: "admin",
    risk: "high",
    input: target.extend({ expectedRevision: revision }),
    output: z.strictObject({ revoked: z.literal(true) }),
  }),
};

export function registerDeviceProxies(api: HuhuApi, proxies: DeviceProxies | undefined) {
  const assertDesktop = (caller: string) => {
    if (caller !== "desktop") throw errors.permissionDenied("本机 SSH ProxyCommand 批准");
  };
  function read(hostId: string): z.infer<typeof state> {
    const { chain, view } = readResourceRoute(api.vault.files, hostId);
    const { name, host, port, user } = chain[0]!;
    const saved = proxies?.read(hostId);
    return {
      supported: Boolean(proxies) && process.platform === "linux" && !api.vault.files.readOnly,
      routeRevision: view.routeRevision,
      firstHop: { name, host, port, user },
      approval: saved ? { revision: saved.revision, command: saved.command, current: saved.route === connectionIdentity(chain) } : null,
    };
  }

  api.defineCapability(bindCapability(sshDeviceProxyDescriptors.deviceProxyRead, ({ caller }, { hostId }) => {
    assertDesktop(caller);
    return read(hostId);
  }));
  api.defineCapability(
    bindCapability(sshDeviceProxyDescriptors.deviceProxyApprove, ({ caller, signal }, input) => {
      assertDesktop(caller);
      const { hostId, expectedRevision, routeRevision, command } = input;
      if (!proxies || process.platform !== "linux") throw errors.invalidInput("本机 SSH ProxyCommand 仅在受支持的 Linux 桌面可用");
      api.vault.files.assertWritable();
      signal.throwIfAborted();
      const { chain, view } = readResourceRoute(api.vault.files, hostId);
      if (view.routeRevision !== routeRevision) throw errors.versionConflict(view.routeRevision);
      proxies.approve(chain, expectedRevision, command);
      return read(hostId);
    }),
  );
  api.defineCapability(
    bindCapability(sshDeviceProxyDescriptors.deviceProxyRevoke, ({ caller, signal }, { hostId, expectedRevision }) => {
      assertDesktop(caller);
      if (!proxies) throw errors.invalidInput("本机 SSH ProxyCommand 批准目录不可用");
      api.vault.files.assertWritable();
      signal.throwIfAborted();
      proxies.revoke(hostId, expectedRevision);
      return { revoked: true as const };
    }),
  );
}
