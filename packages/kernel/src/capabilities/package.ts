import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { directoryInstance, exportPackage, importPackage, protectedKindOf, type ValidatePackageStaging, type Vault } from "@huhu/vault";
import { z } from "zod";
import type { CapabilityRegistry } from "./define.js";
import { durableExternal, registerKernelCapability } from "./system.js";

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

type ExportSelection = Pick<NonNullable<Parameters<typeof exportPackage>[2]>, "includeFile" | "verifyFiles"> & { externalFiles?: ReadonlySet<string> };
type PackageOptions = {
  withSnapshot?: <T>(read: (signal: AbortSignal, selection?: ExportSelection) => Promise<T>, signal: AbortSignal) => Promise<T>;
  validateStaging?: ValidatePackageStaging;
};
const packageId = z.uuidv4();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

function privateChild(parent: string, name: string, create: boolean): string {
  const child = path.join(parent, name);
  if (create) {
    try {
      mkdirSync(child, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const entry = lstatSync(child, { throwIfNoEntry: false });
  const uid = process.getuid?.();
  if (!entry?.isDirectory() || (uid !== undefined && (entry.uid !== uid || (entry.mode & 0o077) !== 0))) throw errors.invalidInput("数据包目录不存在或不可信");
  return child;
}

export function registerPackageCapabilities(registry: CapabilityRegistry, vault: Vault, { withSnapshot, validateStaging }: PackageOptions = {}): () => void {
  const publicTool = { plugin: "kernel", exposable: true, defaultExposed: false, desktopOnly: true } as const;
  const exporting = new Set<string>();
  function packageDirectory(caller: string, subject: string | undefined, create: boolean): string {
    const root = realpathSync(vault.root);
    const parent = path.dirname(root);
    if (parent === root) throw errors.invalidInput("当前 Vault 没有可用的相邻数据包目录");
    const binding = createHash("sha256")
      .update(JSON.stringify([root, vault.id, directoryInstance(root)]))
      .digest("hex")
      .slice(0, 24);
    const owner = createHash("sha256")
      .update(JSON.stringify([caller, subject]))
      .digest("hex");
    return privateChild(privateChild(parent, `.huhu-packages-${binding}`, create), owner, create);
  }

  const offs = [
    registerKernelCapability(registry, {
      name: "vault.exportPackage",
      ...publicTool,
      scope: "admin",
      risk: "high",
      ...durableExternal,
      timeoutMs: 30 * 60_000,
      input: z.strictObject({ dest: z.string().min(1).optional(), packageId: packageId.optional(), includeAttachments: z.boolean().default(true) }),
      output: z.object({ path: z.string(), size: z.number(), sha256: z.string(), files: z.number(), vaultId: z.string() }),
      handler: async (c, i) => {
        if (isWorkbenchCaller(c.caller) && c.caller !== "desktop") throw errors.permissionDenied("数据包导出");
        const external = c.caller !== "desktop";
        c.signal.throwIfAborted();
        let dest: string;
        if (external && i.packageId && !i.dest) dest = path.join(packageDirectory(c.caller, c.subject, true), `${i.packageId}.zip`);
        else if (!external && i.dest && !i.packageId) dest = i.dest;
        else throw errors.invalidInput("工作台应提供目标路径，外部入口应提供数据包 ID");
        if (!path.isAbsolute(dest) || dest.includes("\0")) throw errors.invalidInput("导出路径必须是绝对路径");
        if (!dest.toLowerCase().endsWith(".zip")) throw errors.invalidInput("导出文件需要以 .zip 结尾");
        if (!existsSync(path.dirname(dest)) || !statSync(path.dirname(dest)).isDirectory()) throw errors.invalidInput("导出目录不存在");
        if (lexists(dest) || exporting.has(dest)) throw errors.invalidInput("目标文件已存在或正在导出");
        if (within(realpathSync(vault.root), realish(dest))) throw errors.invalidInput("不能把数据包导出到 Vault 自己的目录里");
        const build = (signal: AbortSignal, selection?: ExportSelection) =>
          exportPackage(vault.root, dest, {
            includeAttachments: i.includeAttachments,
            signal,
            ...selection,
            ...(external && {
              includeFile: (relative: string) => {
                if (selection?.includeFile?.(relative) === false) return false;
                if (!protectedKindOf(relative) || selection?.externalFiles?.has(relative)) return true;
                const state = relative.toLowerCase();
                return state === ".huhu/vault.json" || state.startsWith(".huhu/home/") || state.startsWith(".huhu/guide/") || (!!selection && (state.startsWith(".huhu/safe/") || state.startsWith(".huhu/mail/")));
              },
            }),
          });
        exporting.add(dest);
        try {
          const m = await (withSnapshot ? withSnapshot(build, c.signal) : build(c.signal));
          return { path: dest, size: statSync(dest).size, sha256: await sha256File(dest), files: m.files.length, vaultId: m.vaultId };
        } finally {
          exporting.delete(dest);
        }
      },
    }),
    registerKernelCapability(registry, {
      name: "vault.importPackage",
      ...publicTool,
      scope: "admin",
      risk: "high",
      ...durableExternal,
      timeoutMs: 30 * 60_000,
      input: z.strictObject({ zipPath: z.string().min(1).optional(), targetDir: z.string().min(1).optional(), packageId: packageId.optional(), restoreId: packageId.optional(), expectedSha256: sha256.optional() }),
      output: z.object({ vaultId: z.string(), files: z.number(), targetDir: z.string() }),
      handler: async (c, i) => {
        if (isWorkbenchCaller(c.caller) && c.caller !== "desktop") throw errors.permissionDenied("数据包导入");
        const external = c.caller !== "desktop";
        let zipPath: string;
        let targetDir: string;
        if (!external && i.zipPath && i.targetDir && !i.packageId && !i.restoreId && !i.expectedSha256) {
          zipPath = i.zipPath;
          targetDir = i.targetDir;
        } else if (external && i.packageId && i.restoreId && i.expectedSha256 && !i.zipPath && !i.targetDir) {
          const directory = packageDirectory(c.caller, c.subject, false);
          zipPath = path.join(directory, `${i.packageId}.zip`);
          targetDir = path.join(directory, `restored-${i.restoreId}`);
          const archive = lstatSync(zipPath, { throwIfNoEntry: false });
          if (!archive?.isFile() || archive.nlink !== 1) throw errors.notFound("数据包");
          if (lexists(targetDir)) throw errors.invalidInput("恢复目标已存在");
          if ((await sha256File(zipPath)) !== i.expectedSha256) throw errors.invalidInput("数据包摘要不符");
        } else {
          throw errors.invalidInput("外部导入必须提供已保存的数据包 ID、摘要和恢复 ID");
        }
        c.signal.throwIfAborted();
        if (!path.isAbsolute(zipPath) || !path.isAbsolute(targetDir) || zipPath.includes("\0") || targetDir.includes("\0")) throw errors.invalidInput("路径必须是绝对路径");
        if (!existsSync(zipPath) || !statSync(zipPath).isFile()) throw errors.invalidInput("数据包文件不存在");
        if (external && lexists(targetDir)) throw errors.invalidInput("恢复目标已存在");
        const root = realpathSync(vault.root);
        const target = realish(targetDir);
        if (within(root, target) || within(target, root)) throw errors.invalidInput("目标目录不能在当前 Vault 里面，也不能包含它");
        // 同 id 的 Vault 已经打开着：导入的副本生成新的 id，避免两个 Vault 共用一个标识
        const r = importPackage(zipPath, targetDir, { existingVaultIds: [vault.id], regenerateId: external, ...(validateStaging && { validateStaging }) });
        return { vaultId: r.vaultId, files: r.files, targetDir };
      },
    }),
  ];
  return () => offs.forEach((o) => o());
}
