import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { EDIT_MAX_BYTES, FileDirectory, FileDocument, FileDocumentRevision, FileDocumentVersion, FileSessionId, FileProperties, FileAttributes, RemoteFilePath } from "../shared/files.js";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { list, realpath, remove } from "./sftp.js";
import { assertEntryRevision } from "./public-files.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
const sudoInput = FileSessionId.extend({ sudoSessionId: z.uuid().optional() });
const pathInput = sudoInput.extend({ path: z.string().max(4096) });
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

const propertyInput = sudoInput.extend({ path: RemoteFilePath });
const properties = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.properties",
  title: "读取 sudo 文件属性",
  description: "经文件会话的提权 SFTP 读取属性与变更版本。",
  scope: "read",
  risk: "high",
  input: propertyInput,
  output: FileProperties,
});
const revisioned = propertyInput.extend({ expectedRevision: FileProperties.shape.revision });
const attributes = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.changeProperties",
  title: "修改 sudo 文件属性",
  description: "在原文件版本上变更权限或属主。",
  scope: "write",
  risk: "high",
  input: revisioned.extend({ change: FileAttributes }),
  output: FileProperties,
});
const move = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.moveEntry",
  title: "移动 sudo 文件",
  description: "核对原文件版本，移动或重命名一个目录条目。",
  scope: "write",
  risk: "high",
  input: revisioned.extend({ destination: RemoteFilePath }),
  output: z.object({ ok: z.literal(true) }),
});
const erase = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.delete",
  title: "删除 sudo 文件",
  description: "核对原文件版本后删除一个文件或空目录。",
  scope: "write",
  risk: "high",
  input: revisioned,
  output: z.object({ ok: z.literal(true) }),
});

const authenticate = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.authenticate",
  title: "一次性认证 sudo 文件会话",
  description: "只向此 SSH 文件连接提交一次口令，保留已认证的 SFTP 通道。",
  scope: "execute", risk: "high", idempotency: "handler",
  input: FileSessionId.extend({ password: z.string().min(1).max(4096).regex(/^[^\0\r\n]+$/u) }),
  output: z.object({ sudoSessionId: z.uuid() }),
});
const end = defineCapabilityDescriptor({
  ...desktop,
  name: "ssh.fileSessions.sudo.close",
  title: "关闭一次性 sudo 文件会话",
  description: "结束已认证通道和绑定到此代的传输操作。",
  scope: "execute", risk: "high", idempotency: "handler",
  input: FileSessionId.extend({ sudoSessionId: z.uuid() }),
  output: z.object({ ok: z.literal(true) }),
});

export const sshPrivilegedFileDescriptors = { sudoFileProbe: probe, sudoFileList: browse, sudoFileRead: read, sudoFileSave: save, sudoFileProperties: properties, sudoFileAttributes: attributes, sudoFileMove: move, sudoFileDelete: erase, sudoFileAuthenticate: authenticate, sudoFileClose: end };

export function registerPrivilegedFiles(api: HuhuApi, files: FileSessions, manager: SshManager) {
  const source = (caller: string, id: string, sudoSessionId?: string) => {
    if (caller !== "desktop" || files.get(id).source === "external") throw errors.permissionDenied("本机 SSH 文件 sudo");
    return files.sudoSource(id, { sudoSessionId });
  };
  api.defineCapability(bindCapability(authenticate, ({ caller, signal }, input) => {
    source(caller, input.fileSessionId);
    const pending = files.authenticateSudo(input.fileSessionId, input.password, signal);
    input.password = "";
    return pending;
  }));
  api.defineCapability(bindCapability(end, ({ caller }, { fileSessionId, sudoSessionId }) => {
    if (caller !== "desktop") throw errors.permissionDenied("本机 SSH 文件 sudo");
    files.closeSudo(fileSessionId, sudoSessionId);
    return { ok: true as const };
  }));
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
  api.defineCapability(bindCapability(browse, ({ caller, signal }, { fileSessionId, path, sudoSessionId }) =>
    manager.withSftp(source(caller, fileSessionId, sudoSessionId), "sudo.list", path, (channel) => list(channel, path), { signal, elevated: true }),
  ));
  api.defineCapability(bindCapability(read, ({ caller, signal }, { fileSessionId, path, sudoSessionId }) => {
    source(caller, fileSessionId);
    return files.readDocument(fileSessionId, path, signal, { sudoSessionId });
  }));
  api.defineCapability(bindCapability(save, ({ caller, signal }, { fileSessionId, path, text, expectedVersion, sudoSessionId }) => {
    source(caller, fileSessionId);
    return files.writeDocument(fileSessionId, path, text, expectedVersion, signal, undefined, { sudoSessionId });
  }));
  api.defineCapability(bindCapability(properties, ({ caller, signal }, { fileSessionId, path, sudoSessionId }) => {
    source(caller, fileSessionId);
    return files.properties(fileSessionId, path, signal, { sudoSessionId });
  }));
  api.defineCapability(bindCapability(attributes, ({ caller, signal }, { fileSessionId, path, expectedRevision, change, sudoSessionId }) => {
    source(caller, fileSessionId);
    return files.changeProperties(fileSessionId, path, expectedRevision, change, signal, undefined, { sudoSessionId });
  }));
  api.defineCapability(bindCapability(move, ({ caller, signal }, { fileSessionId, path, expectedRevision, destination, sudoSessionId }) => {
    source(caller, fileSessionId);
    return files.moveEntry(fileSessionId, path, expectedRevision, destination, signal, undefined, { sudoSessionId });
  }));
  api.defineCapability(bindCapability(erase, async ({ caller, signal }, { fileSessionId, path, expectedRevision, sudoSessionId }) => {
    await manager.withSftp(source(caller, fileSessionId, sudoSessionId), "sudo.delete", path, async (channel, active) => {
      await assertEntryRevision(channel, path, expectedRevision);
      await remove(channel, path, () => active.throwIfAborted());
    }, { signal, elevated: true });
    return { ok: true as const };
  }));
}
