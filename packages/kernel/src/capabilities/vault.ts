import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { errors, isWorkbenchCaller, KINDS, VaultListInput, VaultListOutput, VaultReadRangeInput, VaultReadRangeOutput } from "@huhu/contracts";
import { listDir, machineId, normalizeRelPath, OperationLog, protectedKindOf, readAsset, resolveReadableAsset, VaultIndex, type Vault } from "@huhu/vault";
import { z } from "zod";
import type { CapabilityRegistry } from "./define.js";
import { durableExternal, registerKernelCapability } from "./system.js";

const TreeEntry = z.object({ path: z.string(), type: z.enum(["file", "dir"]), size: z.number(), mtimeMs: z.number() });
const MAX_READ_BYTES = 10 * 1024 * 1024;

const DOMAIN_BY_DIR: Record<string, string> = Object.fromEntries(
  Object.values(KINDS).map((k) => [k.dir, k.plugin === "tasks" ? "tasks" : k.plugin === "inbox" ? "inbox" : k.plugin === "notes" ? "comments" : k.dir === "Automations" ? "automations" : "runs"]),
);
/** .huhu 下不作为“受管数据”列出的目录：运行态、历史仓库、缓存、草稿/回收站/操作日志（可靠性材料）、保险箱密文、界面状态。 */
const HIDDEN_STATE_DIRS = new Set(["runtime", "history", "cache", "drafts", "trash", "operations", "safe", "ui", "diagnostics", "tmp"]);
const MANAGED_EXT = new Set([".md", ".json"]);
const MAX_MANAGED = 20_000;
const VAULT_INFO_PATH = ".huhu/vault.json";
const publicOperationKinds = new Set([
  ...Object.keys(KINDS).flatMap((kind) => [`rename-${kind}`, `delete-${kind}`]),
  "attach",
  "duplicate-folder",
  "duplicate-file",
  "rename-case",
  "move-folder",
  "move-file",
  "trash-ids",
  "restore-ids",
  "archive-template-save",
]);

function assertPublicFile(root: string, relative: string): void {
  const normalized = normalizeRelPath(relative);
  resolveReadableAsset(root, normalized);
  let current = root;
  for (const part of normalized.split("/")) {
    current = path.join(current, part);
    const entry = lstatSync(current);
    if (entry.isSymbolicLink() || (entry.isFile() && entry.nlink !== 1)) throw errors.permissionDenied("外部入口不能读取链接");
  }
  if (!lstatSync(current).isFile()) throw errors.notFound("普通文件");
}

function domainOf(rel: string): string {
  const top = rel.split("/")[0] ?? "";
  if (top === ".huhu") return rel.startsWith(".huhu/guide/") ? "guide" : "config";
  if (top === "Archives") return "archives"; // 档案是 Archives/ 下的文件夹笔记：按路径前缀归入“档案”域
  return DOMAIN_BY_DIR[top] ?? "notes";
}

function walkState(root: string, dir: string, out: { path: string; size: number; mtimeMs: number }[]): void {
  let names: import("node:fs").Dirent[];
  try {
    names = readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of names) {
    if (out.length >= MAX_MANAGED) return;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (dir === ".huhu" && HIDDEN_STATE_DIRS.has(e.name)) continue;
      if (e.name === "backups") continue;
      walkState(root, rel, out);
    } else if (e.isFile() && MANAGED_EXT.has(path.extname(e.name).toLowerCase())) {
      try {
        const st = statSync(path.join(root, rel));
        out.push({ path: rel, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        /* 文件刚被删除 */
      }
    }
  }
}

/** 注册内核 vault.* 能力（interfaces.md §2 kernel 行）。返回注销函数。 */
export function registerVaultCapabilities(registry: CapabilityRegistry, vault: Vault, index: VaultIndex): () => void {
  let indexGeneration = randomUUID();
  let activeReindex: string | undefined;
  const infoVersion = () => vault.files.read(VAULT_INFO_PATH)?.version;
  const versionInput = z.object({ indexGeneration: z.string().optional() });
  function checkIndexGeneration(caller: string, expected: string | undefined): void {
    if (!isWorkbenchCaller(caller) && expected !== indexGeneration) throw errors.versionConflict(indexGeneration);
  }
  const offs = [
    registerKernelCapability(registry, {
      name: "vault.info",
      plugin: "kernel",
      scope: "read",
      input: z.object({ includeVersions: z.boolean().optional() }),
      output: z.object({
        id: z.string(),
        name: z.string(),
        readOnly: z.boolean(),
        formatVersion: z.number(),
        counts: z.record(z.string(), z.number()),
        indexing: z.boolean(),
        indexGeneration: z.string().optional(),
        version: z.string().optional(),
      }),
      exposable: true,
      defaultExposed: false,
      handler: (_context, { includeVersions }) => ({
        id: vault.id,
        name: vault.currentInfo().name,
        readOnly: vault.readOnly,
        formatVersion: vault.info.formatVersion,
        counts: index.counts(),
        indexing: index.indexing,
        ...(includeVersions && { indexGeneration, version: infoVersion() }),
      }),
    }),
    registerKernelCapability(registry, {
      name: "vault.update",
      plugin: "kernel",
      scope: "write",
      ...durableExternal,
      exposable: true,
      defaultExposed: false,
      input: z.strictObject({ name: z.string().optional(), description: z.string().optional(), vaultId: z.string().optional(), expectedVersion: z.string().optional() }),
      output: z.union([z.object({ name: z.string(), description: z.string() }), z.object({ vaultId: z.string(), version: z.string() })]),
      handler: ({ caller }, i) => {
        const workbench = isWorkbenchCaller(caller);
        if (!workbench) {
          if (i.vaultId !== vault.id) throw errors.invalidInput("Vault 不匹配");
          if (i.name === undefined && i.description === undefined) throw errors.invalidInput("请指定名称或描述");
          const version = infoVersion();
          if (!version || i.expectedVersion !== version) throw errors.versionConflict(version ?? "missing");
        }
        const r = vault.updateInfo({ ...(i.name !== undefined ? { name: i.name } : {}), ...(i.description !== undefined ? { description: i.description } : {}) });
        return workbench ? { name: r.name, description: r.description } : { vaultId: r.id, version: infoVersion()! };
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.location",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      exposable: true,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ root: z.string(), readOnly: z.boolean(), description: z.string(), engineDevice: z.string().optional() }),
      handler: ({ caller }) => ({
        root: vault.root,
        readOnly: vault.readOnly,
        description: vault.currentInfo().description,
        ...(!isWorkbenchCaller(caller) && { engineDevice: machineId() }),
      }),
    }),
    registerKernelCapability(registry, {
      name: "vault.indexEntries",
      plugin: "kernel",
      scope: "read",
      input: z.object({ prefix: z.string().default("") }),
      output: z.array(TreeEntry),
      exposable: true,
      defaultExposed: false,
      handler: (_c, i) => index.entries(i.prefix),
    }),
    registerKernelCapability(registry, {
      name: "vault.list",
      plugin: "kernel",
      scope: "read",
      input: VaultListInput,
      output: VaultListOutput,
      // 外部入口只拿目录元信息（名称 / 类型 / 大小 / 时间 / 受保护标记）；受保护目录不对外列出内容（见 handler）
      exposable: true,
      defaultExposed: false,
      handler: (c, i) => {
        if (!isWorkbenchCaller(c.caller) && i.includeProtected) throw errors.invalidInput("外部入口不能列出受保护目录");
        return listDir(vault.root, i.dir, { cursor: i.cursor, limit: i.limit, includeProtected: i.includeProtected });
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.readRange",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      input: VaultReadRangeInput.extend({ expectedVersion: z.string().optional() }),
      output: VaultReadRangeOutput.extend({ version: z.string() }),
      exposable: true,
      defaultExposed: false,
      handler: ({ caller }, i) => {
        if (!isWorkbenchCaller(caller)) assertPublicFile(vault.root, i.path);
        const { bytes, size, version } = readAsset(vault.root, i.path, i.offset, i.length, i.expectedVersion);
        return { path: i.path, offset: i.offset, length: bytes.length, size, version, base64: bytes.toString("base64"), eof: i.offset + bytes.length >= size };
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.managedFiles",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      input: z.object({}),
      output: z.object({ files: z.array(z.object({ path: z.string(), domain: z.string(), size: z.number(), mtimeMs: z.number() })), truncated: z.boolean() }),
      exposable: true,
      defaultExposed: false,
      handler: ({ caller }) => {
        const files: { path: string; domain: string; size: number; mtimeMs: number }[] = [];
        const workbench = isWorkbenchCaller(caller);
        for (const e of index.entries()) {
          if (e.type !== "file" || !MANAGED_EXT.has(path.extname(e.path).toLowerCase()) || (!workbench && protectedKindOf(e.path))) continue;
          files.push({ path: e.path, domain: domainOf(e.path), size: e.size, mtimeMs: e.mtimeMs });
        }
        if (workbench) {
          const state: { path: string; size: number; mtimeMs: number }[] = [];
          walkState(vault.root, ".huhu", state);
          for (const f of state) files.push({ ...f, domain: domainOf(f.path) });
        }
        files.sort((a, b) => a.path.localeCompare(b.path));
        return { files: files.slice(0, MAX_MANAGED), truncated: files.length > MAX_MANAGED };
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.pendingOperations",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      input: z.object({ opIds: z.array(z.string()).max(1000).optional() }),
      output: z.array(z.object({ opId: z.string(), kind: z.string(), state: z.string(), createdAt: z.string(), attention: z.array(z.string()) })),
      exposable: true,
      defaultExposed: false,
      // 未完成操作：写到一半的多文件操作（prepared）与需要人工处理的（needs_attention）；用于数据页与“关闭前备份”
      handler: ({ caller }, { opIds }) =>
        new OperationLog(vault.files, path.join(vault.stateDir, "operations"))
          .list()
          .filter((o) => o.state === "prepared" || o.state === "needs_attention")
          .filter((o) => (!opIds || opIds.includes(o.opId)) && (isWorkbenchCaller(caller) || publicOperationKinds.has(o.kind)))
          .map((o) => ({ opId: o.opId, kind: o.kind, state: o.state, createdAt: o.createdAt, attention: isWorkbenchCaller(caller) ? (o.attention ?? []) : [] })),
    }),
    registerKernelCapability(registry, {
      name: "vault.search",
      plugin: "kernel",
      scope: "read",
      input: z.object({ query: z.string().min(1), kind: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) }),
      output: z.object({ indexing: z.boolean(), hits: z.array(z.object({ path: z.string(), kind: z.string(), id: z.string().optional(), title: z.string(), score: z.number(), archive: z.boolean() })) }),
      exposable: true,
      defaultExposed: false,
      handler: (_c, i) => {
        const r = index.query(i.query, { limit: i.limit, ...(i.kind ? { kind: i.kind } : {}) });
        return { ...r, hits: r.hits.map((h) => ({ ...h, archive: h.path.startsWith("Archives/") })) }; // 档案是普通笔记，另加标记供命令面板分组
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.readBinary",
      plugin: "kernel",
      scope: "read",
      risk: "high",
      input: z.object({ path: z.string(), expectedVersion: z.string().optional() }),
      output: z.object({ path: z.string(), base64: z.string(), size: z.number(), version: z.string().optional() }),
      exposable: true,
      defaultExposed: false,
      handler: ({ caller }, i) => {
        const workbench = isWorkbenchCaller(caller);
        if (!workbench) assertPublicFile(vault.root, i.path);
        const { bytes, size, version } = readAsset(vault.root, i.path, 0, MAX_READ_BYTES, i.expectedVersion, MAX_READ_BYTES);
        return { path: i.path, base64: bytes.toString("base64"), size, ...(!workbench && { version }) };
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.readFile",
      plugin: "kernel",
      scope: "read",
      input: z.object({ path: z.string() }),
      output: z.object({ path: z.string(), text: z.string(), version: z.string() }),
      exposable: true,
      defaultExposed: false,
      handler: ({ caller }, i) => {
        if (!isWorkbenchCaller(caller)) assertPublicFile(vault.root, i.path);
        const f = vault.files.read(i.path); // 路径守卫在 abs() 内
        if (!f) throw errors.notFound(`文件不存在：${i.path}`);
        if (f.bytes.length > MAX_READ_BYTES) throw errors.invalidInput("文件超过 10 MiB，不支持读取");
        return { path: i.path, text: f.bytes.toString("utf8"), version: f.version };
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.reindex",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      ...durableExternal,
      input: versionInput,
      output: z.object({ completed: z.boolean(), runId: z.string().optional() }),
      exposable: true,
      defaultExposed: false,
      timeoutMs: 10 * 60_000,
      handler: async ({ caller, signal }, input) => {
        checkIndexGeneration(caller, input.indexGeneration);
        if (index.indexing) throw errors.invalidInput("正在建立索引");
        signal.throwIfAborted();
        const runId = randomUUID();
        indexGeneration = runId;
        activeReindex = runId;
        const cancel = () => index.cancel();
        signal.addEventListener("abort", cancel, { once: true });
        try {
          const completed = await index.reindex();
          return { completed, ...(!isWorkbenchCaller(caller) && { runId }) };
        } finally {
          signal.removeEventListener("abort", cancel);
          activeReindex = undefined;
          indexGeneration = randomUUID();
        }
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.clearIndex",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      ...durableExternal,
      input: versionInput,
      output: z.object({ cleared: z.boolean() }),
      exposable: true,
      defaultExposed: false,
      handler: ({ caller }, input) => {
        checkIndexGeneration(caller, input.indexGeneration);
        const cleared = index.clearSearch();
        if (cleared) indexGeneration = randomUUID();
        return { cleared };
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.reindexCancel",
      plugin: "kernel",
      scope: "admin",
      risk: "high",
      ...durableExternal,
      input: versionInput,
      output: z.object({ cancelled: z.boolean() }),
      exposable: true,
      defaultExposed: false,
      // 首次建立索引不可取消（没有旧索引可保留）
      handler: ({ caller }, input) => {
        checkIndexGeneration(caller, input.indexGeneration);
        const can = index.indexing && index.hasContentIndex && activeReindex !== undefined;
        if (can) index.cancel();
        return { cancelled: can };
      },
    }),
  ];
  return () => offs.forEach((off) => off());
}
