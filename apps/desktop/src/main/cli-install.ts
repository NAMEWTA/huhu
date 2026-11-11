import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

export interface CliStatus {
  /** 当前能否安装（开发运行时没有打包好的启动脚本）。 */
  supported: boolean;
  reason?: string;
  installed: boolean;
  /** symlink：~/.local/bin/huhu 指向应用内启动脚本；path：把应用 bin 目录加入用户 PATH（Windows）。 */
  method: "symlink" | "path";
  /** 符号链接位置 / 被加入 PATH 的目录。 */
  location: string;
  /** 安装后终端里是否能直接找到（POSIX：~/.local/bin 是否在 PATH 中）。 */
  onPath: boolean;
}

export interface CliDeps {
  platform: NodeJS.Platform;
  home: string;
  /** 应用内启动脚本（打包后才存在）；null 表示开发运行。 */
  launcher: string | null;
  /** launcher 为 null 时的原因（缺省：开发运行）。 */
  unsupportedReason?: string;
  env: NodeJS.ProcessEnv;
  /** Windows：执行 PowerShell 脚本并返回 stdout；脚本里用环境变量 HUHU_BIN 取目录。 */
  powershell?: (script: string, env: Record<string, string>) => string;
}

/** Windows：直接读写注册表的用户 PATH，保留 REG_EXPAND_SZ（%VAR% 仍会展开）；写完用一次空的环境变量变更触发 WM_SETTINGCHANGE 广播。 */
const PS_HEAD = "$ErrorActionPreference='Stop'; $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true); $p=[string]$key.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); $bin=$env:HUHU_BIN;";
const PS_SAVE = "$key.SetValue('Path',$new,[Microsoft.Win32.RegistryValueKind]::ExpandString); $key.Close(); [Environment]::SetEnvironmentVariable('HUHU_PATH_TOUCH',$null,'User');";
export const PS_READ = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment'); [string]$key.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); $key.Close()";
export const PS_INSTALL = `${PS_HEAD} $has=($p -split ';') | Where-Object { $_ -and $_.Trim('"').TrimEnd('\\') -ieq $bin.TrimEnd('\\') }; if (-not $has) { $new=(($p.TrimEnd(';') + ';' + $bin).TrimStart(';')); ${PS_SAVE} } else { $key.Close() }`;
export const PS_UNINSTALL = `${PS_HEAD} if ($p) { $keep=($p -split ';') | Where-Object { $_ -and $_.Trim('"').TrimEnd('\\') -ine $bin.TrimEnd('\\') }; $new=($keep -join ';'); ${PS_SAVE} } else { $key.Close() }`;

const linkPath = (d: CliDeps) => path.join(d.home, ".local", "bin", "huhu");

function winUserPath(d: CliDeps): string {
  return (d.powershell ?? realPowershell)(PS_READ, {}).trim();
}

function realPowershell(script: string, env: Record<string, string>): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`], { encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } });
}

const sameDir = (a: string, b: string) => path.win32.normalize(a).replace(/[\\/]+$/, "").toLowerCase() === path.win32.normalize(b).replace(/[\\/]+$/, "").toLowerCase();

export function cliStatus(d: CliDeps): CliStatus {
  if (d.platform === "win32") {
    const bin = d.launcher ? path.win32.dirname(d.launcher) : "";
    const installed = bin !== "" && winUserPath(d).split(";").some((p) => p && sameDir(p, bin));
    return { supported: d.launcher !== null, ...(d.launcher ? {} : { reason: d.unsupportedReason ?? "开发运行时没有打包好的命令行启动脚本" }), installed, method: "path", location: bin, onPath: installed };
  }
  const link = linkPath(d);
  let installed = false;
  try {
    installed = lstatSync(link).isSymbolicLink() && d.launcher !== null && path.resolve(path.dirname(link), readlinkSync(link)) === d.launcher;
  } catch { /* 不存在 */ }
  const onPath = (d.env["PATH"] ?? "").split(path.delimiter).some((p) => p && path.resolve(p) === path.dirname(link));
  return { supported: d.launcher !== null, ...(d.launcher ? {} : { reason: d.unsupportedReason ?? "开发运行时没有打包好的命令行启动脚本" }), installed, method: "symlink", location: link, onPath };
}

export function cliInstall(d: CliDeps): CliStatus {
  if (!d.launcher || (d.platform !== "win32" && !existsSync(d.launcher))) throw new Error("找不到应用内的命令行启动脚本，请使用安装版 HUHU");
  if (d.platform === "win32") {
    const bin = path.win32.dirname(d.launcher);
    (d.powershell ?? realPowershell)(PS_INSTALL, { HUHU_BIN: bin });
    return cliStatus(d);
  }
  const link = linkPath(d);
  mkdirSync(path.dirname(link), { recursive: true });
  let existing: ReturnType<typeof lstatSync> | null = null;
  try { existing = lstatSync(link); } catch { /* 不存在 */ }
  if (existing) {
    // 只替换指向旧版本应用的符号链接；用户自己的文件或别的链接不动
    if (!existing.isSymbolicLink()) throw new Error(`${link} 已存在且不是符号链接，没有改动`);
    const cur = path.resolve(path.dirname(link), readlinkSync(link));
    // 只替换：已经是本应用的、悬空的（旧版本被删/搬走了），或形如 …/resources/bin/huhu 且旁边有 cli/cli.mjs 的 HUHU 启动脚本
    const isHuhu = cur === d.launcher || !existsSync(cur) || (/[/\\][Rr]esources[/\\]bin[/\\]huhu$/.test(cur) && existsSync(path.join(path.dirname(cur), "..", "cli", "cli.mjs")));
    if (!isHuhu) throw new Error(`${link} 已经指向别的程序（${cur}），没有改动`);
  }
  // 先在同目录建临时链接再 rename 覆盖：任何时刻 ~/.local/bin/huhu 要么是旧链接要么是新链接
  const tmpLink = `${link}.tmp-${process.pid}`;
  rmSync(tmpLink, { force: true });
  symlinkSync(d.launcher, tmpLink);
  try { renameSync(tmpLink, link); } catch (e) { rmSync(tmpLink, { force: true }); throw e; }
  return cliStatus(d);
}

export function cliUninstall(d: CliDeps): CliStatus {
  if (d.platform === "win32") {
    if (!d.launcher) return cliStatus(d);
    (d.powershell ?? realPowershell)(PS_UNINSTALL, { HUHU_BIN: path.win32.dirname(d.launcher) });
    return cliStatus(d);
  }
  const link = linkPath(d);
  try {
    if (lstatSync(link).isSymbolicLink() && d.launcher !== null && path.resolve(path.dirname(link), readlinkSync(link)) === d.launcher) rmSync(link); // 只删指向本应用的链接
  } catch { /* 不存在 */ }
  return cliStatus(d);
}
