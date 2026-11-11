import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { exportPackage, importPackage, type Vault } from "@huhu/vault";
import { z } from "zod";
import { defineCapability, type CapabilityRegistry } from "./define.js";

const within = (root: string, p: string): boolean => {
  const rel = path.relative(root, p);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

/** 路径所在位置的真实路径（目标尚不存在时取最近的已存在祖先），用于判断是否落在 Vault 内。 */
function realish(p: string): string {
  let cur = path.resolve(p);
  const rest: string[] = [];
  while (!lexists(cur)) {
    // lstat：悬空符号链接也算存在，不能当作“不存在”继续往上找
    rest.unshift(path.basename(cur));
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  try {
    return path.join(realpathSync(cur), ...rest);
  } catch {
    throw errors.invalidInput("路径里含有无法解析的符号链接");
  }
}

function lexists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** vault.exportPackage / vault.importPackage（interfaces.md §2；仅桌面可用）。 */
export function registerPackageCapabilities(registry: CapabilityRegistry, vault: Vault): () => void {
  const desktop = { plugin: "kernel", exposable: false, defaultExposed: false } as const;
  const offs = [
    registry.register(
      defineCapability({
        name: "vault.exportPackage",
        ...desktop,
        scope: "admin",
        timeoutMs: 30 * 60_000,
        input: z.object({ dest: z.string().min(1), includeAttachments: z.boolean().default(true) }),
        output: z.object({ path: z.string(), size: z.number(), sha256: z.string(), files: z.number(), vaultId: z.string() }),
        handler: async (c, i) => {
          if (!path.isAbsolute(i.dest) || i.dest.includes("\0")) throw errors.invalidInput("导出路径必须是绝对路径");
          if (!i.dest.toLowerCase().endsWith(".zip")) throw errors.invalidInput("导出文件需要以 .zip 结尾");
          if (!existsSync(path.dirname(i.dest)) || !statSync(path.dirname(i.dest)).isDirectory()) throw errors.invalidInput("导出目录不存在");
          if (lexists(i.dest)) throw errors.invalidInput("目标文件已存在，不会覆盖"); // lstat：悬空符号链接也算已存在
          if (within(realpathSync(vault.root), realish(i.dest))) throw errors.invalidInput("不能把数据包导出到 Vault 自己的目录里");
          const m = await exportPackage(vault.root, i.dest, { includeAttachments: i.includeAttachments, signal: c.signal });
          return { path: i.dest, size: statSync(i.dest).size, sha256: await sha256File(i.dest), files: m.files.length, vaultId: m.vaultId };
        },
      }),
    ),
    registry.register(
      defineCapability({
        name: "vault.importPackage",
        ...desktop,
        scope: "admin",
        timeoutMs: 30 * 60_000,
        input: z.object({ zipPath: z.string().min(1), targetDir: z.string().min(1) }),
        output: z.object({ vaultId: z.string(), files: z.number(), targetDir: z.string() }),
        handler: (_c, i) => {
          if (!path.isAbsolute(i.zipPath) || !path.isAbsolute(i.targetDir) || i.zipPath.includes("\0") || i.targetDir.includes("\0")) throw errors.invalidInput("路径必须是绝对路径");
          if (!existsSync(i.zipPath) || !statSync(i.zipPath).isFile()) throw errors.invalidInput("数据包文件不存在");
          const root = realpathSync(vault.root);
          const target = realish(i.targetDir);
          if (within(root, target) || within(target, root)) throw errors.invalidInput("目标目录不能在当前 Vault 里面，也不能包含它");
          // 同 id 的 Vault 已经打开着：导入的副本生成新的 id，避免两个 Vault 共用一个标识
          const r = importPackage(i.zipPath, i.targetDir, { existingVaultIds: [vault.id] });
          return { vaultId: r.vaultId, files: r.files, targetDir: i.targetDir };
        },
      }),
    ),
  ];
  return () => offs.forEach((o) => o());
}
