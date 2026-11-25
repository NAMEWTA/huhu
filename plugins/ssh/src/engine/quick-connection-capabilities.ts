import { errors } from "@huhu/contracts";
import { isIP } from "node:net";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { parseQuickEndpoint } from "../shared/quick-connection.js";
import { ConnectionStatus } from "../shared/trust.js";
import type { SshManager } from "./manager.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
const target = z.strictObject({ id: z.uuidv4() });
const state = z.strictObject({ status: ConnectionStatus, shellId: z.string().optional() }).nullable();

export const sshQuickConnectionDescriptors = {
  quickConnectionStart: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.quickConnections.start",
    title: "快速连接未保存的 SSH 目标",
    description: "打开一次性 SSH 终端。输入的认证信息只用于此次拨号。",
    scope: "execute",
    risk: "high",
    input: target.extend({ endpoint: z.string().min(1).max(400), password: z.string().max(4096).optional() }),
    output: z.strictObject({ hostId: z.string() }),
  }),
  quickConnectionStatus: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.quickConnections.status",
    title: "查询临时 SSH 连接",
    description: "查看此临时连接的信任、认证与终端状态。",
    scope: "read",
    risk: "normal",
    input: target,
    output: state,
  }),
  quickConnectionClose: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.quickConnections.close",
    title: "回收临时 SSH 连接",
    description: "取消拨号或关闭已连接的临时终端及 SSH 连接。",
    scope: "execute",
    risk: "normal",
    input: target,
    output: z.strictObject({ closed: z.boolean() }),
  }),
};

export function registerQuickConnections(api: HuhuApi, manager: SshManager) {
  const descriptors = sshQuickConnectionDescriptors;
  api.defineCapability(bindCapability(descriptors.quickConnectionStart, ({ signal }, { id, endpoint, password }) => {
    const address = parseQuickEndpoint(endpoint);
    if (!address || (address.host.includes(":") && isIP(address.host) !== 6)) throw errors.invalidInput("请输入 user@host[:port] 格式的 SSH 目标");
    signal.throwIfAborted();
    return manager.startQuick(id, address, password);
  }));
  api.defineCapability(bindCapability(descriptors.quickConnectionStatus, (_context, { id }) => manager.quickStatus(id)));
  api.defineCapability(bindCapability(descriptors.quickConnectionClose, (_context, { id }) => ({ closed: manager.closeQuick(id) })));
}
