import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import path from "node:path";
import { errors, VaultListOutput } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { publicAgentTool } from "./tool-access.js";
import { filesystemIdentity, listDir, protectedKindOf, resolveReadableAsset } from "@huhu/vault";
import { z } from "zod";
import type { SpaceStore } from "./spaces.js";

const target = z.strictObject({ spaceId: z.string().min(1).max(128), spaceRevision: z.int().nonnegative() });
const limit = 256 * 1024;

const details = z.strictObject({ path: z.string(), relativeToVault: z.string().nullable(), size: z.number().nonnegative() });

export const agentWorkspaceFileDescriptors = {
  workspaceFilesList: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.files.list",
    scope: "read",
    risk: "normal",
    title: "列出工作区文件",
    description: "列出已绑定目录下的文件。",
    input: target.extend({ directory: z.string().max(4096), cursor: z.string().max(1024).optional() }),
    output: VaultListOutput,
  }),
  workspaceFilesOpen: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.files.open",
    scope: "read",
    risk: "high",
    title: "预览工作区文件",
    description: "有界读取已绑定目录中的普通文件。",
    input: target.extend({ path: z.string().min(1).max(4096) }),
    output: z.discriminatedUnion("kind", [details.extend({ kind: z.literal("text"), text: z.string() }), details.extend({ kind: z.literal("unsupported"), reason: z.enum(["size", "encoding"]) })]),
  }),
};

function insideRoot(root: string, target: string): string | null {
  const relative = path.relative(root, target);
  return path.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path.sep) ? null : relative.split(path.sep).join("/");
}

function readPreview(root: string, relative: string) {
  const real = resolveReadableAsset(root, relative);
  const original = lstatSync(real, { bigint: true, throwIfNoEntry: false });
  if (!original?.isFile()) throw errors.invalidInput("请选择普通文件");
  const identity = filesystemIdentity(original);
  let fd: number;
  try {
    const flags = process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW;
    fd = openSync(real, flags);
  } catch {
    throw errors.notFound("无法打开此文件，可能已被移走");
  }
  try {
    const info = fstatSync(fd, { bigint: true });
    const size = Number(info.size);
    if (!info.isFile() || !identity || filesystemIdentity(info) !== identity || resolveReadableAsset(root, relative) !== real) throw errors.invalidInput("文件已变化，请重新打开");
    const base = { path: real, size };
    if (size > limit) return { ...base, kind: "unsupported" as const, reason: "size" as const };
    const bytes = Buffer.alloc(size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null);
      if (read === 0) break;
      length += read;
    }
    const after = lstatSync(real, { bigint: true, throwIfNoEntry: false });
    if (length !== size || !after || filesystemIdentity(after) !== identity || after.mtimeNs !== info.mtimeNs || resolveReadableAsset(root, relative) !== real) throw errors.invalidInput("文件已变化，请重新打开");
    if (bytes.subarray(0, length).includes(0)) return { ...base, kind: "unsupported" as const, reason: "encoding" as const };
    try {
      return { ...base, kind: "text" as const, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)) };
    } catch {
      return { ...base, kind: "unsupported" as const, reason: "encoding" as const };
    }
  } finally {
    closeSync(fd);
  }
}

export function registerWorkspaceFiles(api: HuhuApi, spaces: SpaceStore) {
  const vault = api.vault.files.root;
  const bound = (caller: string, input: z.infer<typeof target>) => {
    const space = spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    const inside = insideRoot(vault, space.root);
    if (inside === null && caller !== "desktop") throw errors.permissionDenied("在桌面打开 Vault 外的工作区文件");
    const archivePath = inside ?? space.root.split(path.sep).slice(1).join("/");
    if (protectedKindOf(archivePath)) throw errors.permissionDenied("工作区根位于受保护目录");
    return { space, inside };
  };
  api.defineCapability(
    bindCapability(agentWorkspaceFileDescriptors.workspaceFilesList, ({ caller }, input) => listDir(bound(caller, input).space.root, input.directory, { limit: 100, ...(input.cursor === undefined ? {} : { cursor: input.cursor }) })),
  );
  api.defineCapability(
    bindCapability(agentWorkspaceFileDescriptors.workspaceFilesOpen, ({ caller }, input) => {
      const { space, inside } = bound(caller, input);
      const preview = readPreview(space.root, input.path);
      return { ...preview, relativeToVault: inside === null ? null : insideRoot(vault, preview.path) };
    }),
  );
}
