import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { downloadScp } from "./scp-download.js";
import { captureSshCommand } from "./ssh-exec.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
const binding = z.strictObject({ fileSessionId: z.uuid() });
export const sshScpDescriptors = {
  scpDownloadSupport: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.fileSessions.scp.support",
    title: "探测原连接的 SCP 下载",
    description: "探测原 SSH 主机是否有 SCP 源程序。",
    scope: "read",
    risk: "normal",
    input: binding,
    output: z.strictObject({ available: z.boolean() }),
  }),
  scpDownload: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.fileSessions.scp.download",
    title: "通过原 SSH 连接下载单个文件",
    description: "通过 SCP 下载远端普通文件到新的本机路径，完成确认后提交文件。",
    scope: "execute",
    risk: "high",
    timeoutMs: 5 * 60_000,
    input: binding.extend({ remote: z.string().min(1).max(4096), local: z.string().min(1).max(4096) }),
    output: z.strictObject({ size: z.int().nonnegative() }),
  }),
};

export function registerScp(api: HuhuApi, sessions: FileSessions, manager: SshManager) {
  const source = (caller: string, fileSessionId: string, signal: AbortSignal) => {
    if (caller !== "desktop") throw errors.permissionDenied("本机 SCP 下载");
    const saved = sessions.source({ fileSessionId });
    if (typeof saved === "string" || saved.externalClient) throw errors.permissionDenied("使用当前工作台的文件会话");
    const getClient = () => manager.boundTransport(saved.hostId, saved.connectionId);
    return { getClient, signal: AbortSignal.any([signal, saved.signal]) };
  };
  api.defineCapability(bindCapability(sshScpDescriptors.scpDownloadSupport, async ({ caller, signal }, { fileSessionId }) => {
    const current = source(caller, fileSessionId, signal);
    const client = current.getClient();
    try {
      const result = await captureSshCommand(client, "command -v scp >/dev/null 2>&1", AbortSignal.any([current.signal, AbortSignal.timeout(5000)]), 4096);
      return { available: result.code === 0 };
    } catch {
      signal.throwIfAborted();
      return { available: false };
    }
  }));
  api.defineCapability(bindCapability(sshScpDescriptors.scpDownload, ({ caller, signal }, { fileSessionId, remote, local }) => {
    const current = source(caller, fileSessionId, signal);
    const client = current.getClient();
    return downloadScp(client, remote, local, current.signal, current.getClient);
  }));
}
