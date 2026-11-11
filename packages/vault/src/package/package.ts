import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { errors, newVaultId } from "@huhu/contracts";
import { Zip, ZipDeflate, unzipSync } from "fflate";
import { z } from "zod";
import { normalizeRelPath } from "../paths.js";
import { HUHU_DIR, VaultJsonSchema } from "../vault.js";

export const PACKAGE_MANIFEST = "huhu-package.json";
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

const ManifestSchema = z.object({
  format: z.literal("huhu-package"),
  version: z.literal(1),
  vaultId: z.string(),
  vaultName: z.string(),
  createdAt: z.string(),
  files: z.array(z.object({ path: z.string(), sha256: z.string(), size: z.number().int().min(0) })),
});
export type PackageManifest = z.infer<typeof ManifestSchema>;

const EXCLUDED_HUHU = new Set(["runtime", "cache", "ui", "history"]);
const IGNORED_ROOT = new Set([".git", "node_modules", ".agents"]);

function collect(root: string, includeAttachments: boolean): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const ent of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (!rel && IGNORED_ROOT.has(ent.name)) continue;
        if (rel === HUHU_DIR && EXCLUDED_HUHU.has(ent.name)) continue;
        if (rel === HUHU_DIR && ent.name === "writer.lock") continue;
        walk(childRel);
      } else if (ent.isFile()) {
        if (ent.name === ".DS_Store" || ent.name === "Thumbs.db" || childRel === `${HUHU_DIR}/writer.lock`) continue;
        const isText = /\.(md|txt|json|ndjson|yaml|yml)$/i.test(ent.name) || childRel.startsWith(`${HUHU_DIR}/`);
        if (!isText && !includeAttachments) continue;
        out.push(childRel);
      }
    }
  };
  walk("");
  return out.sort();
}

/**
 * 导出受管数据包（zip）：逐个文件读取、压缩并写出，内存里只有当前文件；文件之间让出事件循环，
 * 所以大 Vault 导出不会让 Engine 长时间无响应。`signal` 触发时不留下半成品。
 */
export async function exportPackage(root: string, dest: string, opts: { includeAttachments?: boolean; signal?: AbortSignal } = {}): Promise<PackageManifest> {
  const vault = VaultJsonSchema.parse(JSON.parse(readFileSync(path.join(root, HUHU_DIR, "vault.json"), "utf8")));
  const files = collect(root, opts.includeAttachments ?? true);
  const entries: PackageManifest["files"] = [];
  const cancelled = () => { if (opts.signal?.aborted) throw errors.invalidInput("导出已取消"); };
  // 随机临时名 + 排他创建：不会跟随事先放好的符号链接，也不会覆盖已有文件
  const tmp = `${dest}.${randomBytes(6).toString("hex")}.partial`;
  const fd = openSync(tmp, "wx", 0o600);
  let closed = false;
  try {
    const zip = new Zip((err, chunk) => {
      if (err) throw err;
      for (let off = 0; off < chunk.length; ) off += writeSync(fd, chunk, off); // writeSync 可能只写一部分
    });
    const addFile = async (name: string, bytes: Uint8Array) => {
      const f = new ZipDeflate(name, { level: 6 });
      zip.add(f);
      const CHUNK = 1024 * 1024;
      for (let off = 0; off < bytes.length || off === 0; off += CHUNK) {
        const end = Math.min(bytes.length, off + CHUNK);
        f.push(bytes.subarray(off, end), end >= bytes.length);
        if (end >= bytes.length) break;
        await new Promise((r) => setImmediate(r)); // 大文件分块压缩，中间让出
        cancelled();
      }
    };
    let n = 0;
    for (const rel of files) {
      cancelled();
      const bytes = readFileSync(path.join(root, rel));
      entries.push({ path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
      await addFile(rel, bytes);
      if (++n % 20 === 0) await new Promise((r) => setImmediate(r));
    }
    const manifest: PackageManifest = { format: "huhu-package", version: 1, vaultId: vault.id, vaultName: vault.name, createdAt: new Date().toISOString(), files: entries };
    await addFile(PACKAGE_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.end();
    cancelled();
    closed = true; // 无论 close 是否成功，finally 里都不再关第二次
    closeSync(fd);
    renameSync(tmp, dest);
    return manifest;
  } finally {
    if (!closed) { closed = true; try { closeSync(fd); } catch { /* 保留原始错误 */ } }
    rmSync(tmp, { force: true });
  }
}

function reject(msg: string): never {
  throw errors.invalidInput(`数据包无效：${msg}`);
}

/**
 * 导入数据包到空目录 `targetRoot`：先完整校验，再解压到临时目录，最后移动；任何失败都不留文件。
 * 目标已含同 id 的 Vault 时生成新 id（`existingVaultIds`）。
 */
export function importPackage(zipPath: string, targetRoot: string, opts: { existingVaultIds?: string[]; regenerateId?: boolean } = {}): { vaultId: string; files: number } {
  if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) reject("目标目录必须为空");
  const zipBytes = readFileSync(zipPath);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes, { filter: (f) => f.originalSize <= MAX_FILE_BYTES || reject(`文件过大：${f.name}`) });
  } catch (e) {
    if (e instanceof Error && e.name === "HuhuError") throw e;
    return reject("不是有效的 zip 文件");
  }
  const rawManifest = entries[PACKAGE_MANIFEST];
  if (!rawManifest) reject("缺少 huhu-package.json");
  const parsed = ManifestSchema.safeParse(JSON.parse(Buffer.from(rawManifest).toString("utf8")));
  if (!parsed.success) reject("清单格式错误");
  const manifest = parsed.data;

  const seen = new Set<string>();
  let total = 0;
  for (const f of manifest.files) {
    let rel: string;
    try {
      rel = normalizeRelPath(f.path);
    } catch {
      return reject(`非法路径：${f.path}`);
    }
    if (rel !== f.path) reject(`路径不规范：${f.path}`);
    if (seen.has(f.path.toLowerCase())) reject(`重复路径：${f.path}`);
    seen.add(f.path.toLowerCase());
    if (f.size > MAX_FILE_BYTES) reject(`文件过大：${f.path}`);
    total += f.size;
    if (total > MAX_TOTAL_BYTES) reject("解压后总大小超过 4 GiB");
    const data = entries[f.path];
    if (!data) reject(`缺少文件：${f.path}`);
    if (data.length !== f.size || createHash("sha256").update(data).digest("hex") !== f.sha256) reject(`哈希不符：${f.path}`);
  }
  for (const name of Object.keys(entries)) {
    if (name !== PACKAGE_MANIFEST && !seen.has(name.toLowerCase())) reject(`清单之外的文件：${name}`);
  }
  if (!seen.has(`${HUHU_DIR}/vault.json`)) reject("缺少 .huhu/vault.json");

  const parent = path.dirname(path.resolve(targetRoot));
  mkdirSync(parent, { recursive: true });
  const tmp = mkdtempSync(path.join(parent, ".huhu-import-"));
  try {
    for (const f of manifest.files) {
      const dest = path.join(tmp, ...f.path.split("/"));
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, entries[f.path] as Uint8Array);
    }
    const vjPath = path.join(tmp, HUHU_DIR, "vault.json");
    const vj = VaultJsonSchema.parse(JSON.parse(readFileSync(vjPath, "utf8")));
    if (opts.regenerateId || opts.existingVaultIds?.includes(vj.id)) {
      vj.id = newVaultId();
      writeFileSync(vjPath, JSON.stringify(vj, null, 2) + "\n");
    }
    if (existsSync(targetRoot)) rmSync(targetRoot, { recursive: true });
    renameSync(tmp, targetRoot);
    return { vaultId: vj.id, files: manifest.files.length };
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }
}

