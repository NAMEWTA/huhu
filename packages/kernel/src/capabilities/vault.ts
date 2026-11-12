import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { errors, KINDS } from "@huhu/contracts";
import { VaultIndex, type Vault } from "@huhu/vault";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";

const TreeEntry = z.object({ path: z.string(), type: z.enum(["file", "dir"]), size: z.number(), mtimeMs: z.number() });
const MAX_READ_BYTES = 10 * 1024 * 1024;

const DOMAIN_BY_DIR: Record<string, string> = Object.fromEntries(
  Object.values(KINDS).map((k) => [k.dir, k.plugin === "tasks" ? "tasks" : k.plugin === "archives" ? "archives" : k.plugin === "inbox" ? "inbox" : k.plugin === "notes" ? "comments" : k.dir === "Automations" ? "automations" : "runs"]),
);
/** .huhu 下不作为“受管数据”列出的目录：运行态、历史仓库、缓存、草稿/回收站/操作日志（可靠性材料）、保险箱密文、界面状态。 */
const HIDDEN_STATE_DIRS = new Set(["runtime", "history", "cache", "drafts", "trash", "operations", "safe", "ui", "diagnostics", "tmp"]);
const MANAGED_EXT = new Set([".md", ".json"]);
const MAX_MANAGED = 20_000;

function domainOf(rel: string): string {
  const top = rel.split("/")[0] ?? "";
  if (top === ".huhu") return rel.startsWith(".huhu/guide/") ? "guide" : "config";
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
  const offs = [
    registry.register(
      defineCapability({
        name: "vault.info",
        plugin: "kernel",
        scope: "read",
        input: z.object({}),
        output: z.object({ id: z.string(), name: z.string(), readOnly: z.boolean(), formatVersion: z.number(), counts: z.record(z.string(), z.number()), indexing: z.boolean() }),
        exposable: true,
        defaultExposed: true,
        handler: () => ({ id: vault.id, name: vault.currentInfo().name, readOnly: vault.readOnly, formatVersion: vault.info.formatVersion, counts: index.counts(), indexing: index.indexing }),
      }),
    ),
    // 以下两个只有桌面可用：改名称/描述；显示根目录路径与描述（外部入口不应知道本机路径和用户写的说明）
    registry.register(
      defineCapability({
        name: "vault.update",
        plugin: "kernel",
        scope: "write",
        exposable: false,
        defaultExposed: false,
        input: z.object({ name: z.string().optional(), description: z.string().optional() }),
        output: z.object({ name: z.string(), description: z.string() }),
        handler: (_c, i) => {
          const r = vault.updateInfo({ ...(i.name !== undefined ? { name: i.name } : {}), ...(i.description !== undefined ? { description: i.description } : {}) });
          return { name: r.name, description: r.description };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.location",
        plugin: "kernel",
        scope: "read",
        exposable: false,
        defaultExposed: false,
        input: z.object({}),
        output: z.object({ root: z.string(), readOnly: z.boolean(), description: z.string() }),
        handler: () => ({ root: vault.root, readOnly: vault.readOnly, description: vault.currentInfo().description }),
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.tree",
        plugin: "kernel",
        scope: "read",
        input: z.object({ prefix: z.string().default("") }),
        output: z.array(TreeEntry),
        exposable: true,
        defaultExposed: true,
        handler: (_c, i) => index.entries(i.prefix),
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.managedFiles",
        plugin: "kernel",
        scope: "read",
        input: z.object({}),
        output: z.object({ files: z.array(z.object({ path: z.string(), domain: z.string(), size: z.number(), mtimeMs: z.number() })), truncated: z.boolean() }),
        exposable: false,
        defaultExposed: false,
        handler: () => {
          const files: { path: string; domain: string; size: number; mtimeMs: number }[] = [];
          for (const e of index.entries()) if (e.type === "file" && MANAGED_EXT.has(path.extname(e.path).toLowerCase())) files.push({ path: e.path, domain: domainOf(e.path), size: e.size, mtimeMs: e.mtimeMs });
          const state: { path: string; size: number; mtimeMs: number }[] = [];
          walkState(vault.root, ".huhu", state);
          for (const f of state) files.push({ ...f, domain: domainOf(f.path) });
          files.sort((a, b) => a.path.localeCompare(b.path));
          return { files: files.slice(0, MAX_MANAGED), truncated: files.length > MAX_MANAGED };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.search",
        plugin: "kernel",
        scope: "read",
        input: z.object({ query: z.string().min(1), kind: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) }),
        output: z.object({ indexing: z.boolean(), hits: z.array(z.object({ path: z.string(), kind: z.string(), title: z.string(), score: z.number() })) }),
        exposable: true,
        defaultExposed: true,
        handler: (_c, i) => index.query(i.query, { limit: i.limit, ...(i.kind ? { kind: i.kind } : {}) }),
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.readBinary",
        plugin: "kernel",
        scope: "read",
        input: z.object({ path: z.string() }),
        output: z.object({ path: z.string(), base64: z.string(), size: z.number() }),
        exposable: false,
        defaultExposed: false,
        handler: (_c, i) => {
          const f = vault.files.read(i.path); // 路径守卫在 abs() 内
          if (!f) throw errors.notFound(`文件不存在：${i.path}`);
          if (f.bytes.length > MAX_READ_BYTES) throw errors.invalidInput("文件超过 10 MiB，不支持预览");
          return { path: i.path, base64: f.bytes.toString("base64"), size: f.bytes.length };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.readFile",
        plugin: "kernel",
        scope: "read",
        input: z.object({ path: z.string() }),
        output: z.object({ path: z.string(), text: z.string(), version: z.string() }),
        exposable: true,
        defaultExposed: false,
        handler: (_c, i) => {
          const f = vault.files.read(i.path); // 路径守卫在 abs() 内
          if (!f) throw errors.notFound(`文件不存在：${i.path}`);
          if (f.bytes.length > MAX_READ_BYTES) throw errors.invalidInput("文件超过 10 MiB，不支持读取");
          return { path: i.path, text: f.bytes.toString("utf8"), version: f.version };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.reindex",
        plugin: "kernel",
        scope: "admin",
        input: z.object({}),
        output: z.object({ completed: z.boolean() }),
        exposable: false,
        defaultExposed: false,
        timeoutMs: 10 * 60_000,
        handler: async (c) => {
          c.signal.addEventListener("abort", () => index.cancel(), { once: true });
          return { completed: await index.reindex() };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.reindexCancel",
        plugin: "kernel",
        scope: "admin",
        input: z.object({}),
        output: z.object({ cancelled: z.boolean() }),
        exposable: false,
        defaultExposed: false,
        // 首次建立索引不可取消（没有旧索引可保留）
        handler: () => {
          const can = index.indexing && index.hasContentIndex;
          if (can) index.cancel();
          return { cancelled: can };
        },
      }),
    ),
  ];
  return () => offs.forEach((off) => off());
}
