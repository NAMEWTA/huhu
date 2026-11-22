import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

export function runnable(candidate: string, platform: NodeJS.Platform = process.platform): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const exts = (env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] => (platform === "win32" ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase()) : [""]);

/** 在一组目录里查找可执行文件（Windows 考虑 PATHEXT）。 */
export function findInDirs(cmd: string, dirs: string[], env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const extensions = exts(env, platform);
  const suffixes = extensions.includes(path.extname(cmd).toLowerCase()) ? [""] : extensions;
  for (const dir of dirs) {
    for (const ext of suffixes) {
      const candidate = path.resolve(dir, cmd + ext);
      if (runnable(candidate, platform)) return candidate;
    }
  }
  return null;
}

/** 在 PATH 里查找可执行文件。 */
export function findOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const dirs = (env["PATH"] ?? env["Path"] ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  return findInDirs(cmd, dirs, env, platform);
}
