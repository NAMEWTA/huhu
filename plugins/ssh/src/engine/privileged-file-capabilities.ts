import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { EDIT_MAX_BYTES, FileDirectory, FileDocument, FileDocumentRevision, FileDocumentVersion, FileSessionId } from "../shared/files.js";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { list, realpath } from "./sftp.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
const pathInput = FileSessionId.extend({ path: z.string().max(4096) });
const probe = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.probe",
  title: "探测 sudo 文件后端",
  description: "在原 SSH 连接上检查免交互 sudo SFTP 是否能完成握手。",
  scope: "read",
  risk: "normal",
  input: FileSessionId,
  output: z.object({ available: z.boolean() }),
});
const browse = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.list",
  title: "浏览 sudo 文件目录",
  description: "经原 SSH 文件会话的 sudo SFTP 后端读取目录。",
  scope: "read",
  risk: "high",
  input: pathInput,
  output: FileDirectory,
});
const read = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.read",
  title: "读取需 sudo 的 SSH 文件",
  description: "读取选中的 UTF-8 文件以及当前版本。",
  scope: "read",
  risk: "high",
  input: pathInput,
  output: FileDocument,
});
const save = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.save",
  title: "保存需 sudo 的 SSH 文件",
  description: "核对原版本，再经 sudo SFTP 原子替换并保留权限与属主。",
  scope: "write",
  risk: "high",
  input: pathInput.extend({ text: z.string().max(EDIT_MAX_BYTES), expectedVersion: FileDocumentVersion }),
  output: FileDocumentRevision,
});

export const sshPrivilegedFileDescriptors = { sudoFileProbe: probe, sudoFileList: browse, sudoFileRead: read, sudoFileSave: save };

export function registerPrivilegedFiles(api: HuhuApi, files: FileSessions, manager: SshManager) {
  const source = (caller: string, id: string) => {
    if (caller !== "desktop" || files.get(id).source === "external") throw errors.permissionDenied("本机 SSH 文件 sudo");
    return files.source({ fileSessionId: id });
  };
  api.defineCapability(bindCapability(probe, async ({ caller, signal }, { fileSessionId }) => {
    const session = source(caller, fileSessionId);
    try {
      await manager.withSftp(session, "sudo.probe", "sudo SFTP", (channel) => realpath(channel, "."), { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), elevated: true });
      return { available: true };
    } catch {
      signal.throwIfAborted();
      return { available: false };
    }
  }));
  api.defineCapability(bindCapability(browse, ({ caller, signal }, { fileSessionId, path }) =>
    manager.withSftp(source(caller, fileSessionId), "sudo.list", path, (channel) => list(channel, path), { signal, elevated: true }),
  ));
  api.defineCapability(bindCapability(read, ({ caller, signal }, { fileSessionId, path }) => {
    source(caller, fileSessionId);
    return files.readDocument(fileSessionId, path, signal, true);
  }));
  api.defineCapability(bindCapability(save, ({ caller, signal }, { fileSessionId, path, text, expectedVersion }) => {
    source(caller, fileSessionId);
    return files.writeDocument(fileSessionId, path, text, expectedVersion, signal, undefined, true);
  }));
}
