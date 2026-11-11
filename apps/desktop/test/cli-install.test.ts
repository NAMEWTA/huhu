import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { PS_INSTALL, PS_READ, PS_UNINSTALL, cliInstall, cliStatus, cliUninstall, type CliDeps } from "../src/main/cli-install.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-cli-")); dirs.push(d); return d; };

function posix(over: Partial<CliDeps> = {}) {
  const home = tmp(); const res = tmp();
  mkdirSync(path.join(res, "bin"));
  const launcher = path.join(res, "bin", "huhu");
  writeFileSync(launcher, "#!/bin/sh\n", { mode: 0o755 });
  const deps: CliDeps = { platform: "linux", home, launcher, env: { PATH: "/usr/bin" }, ...over };
  return { deps, home, launcher, link: path.join(home, ".local", "bin", "huhu") };
}

describe.skipIf(process.platform === "win32")("命令行安装（macOS / Linux：符号链接）", () => {
  test("开发运行（没有启动脚本）：不支持并说明原因，安装抛错", () => {
    const { deps } = posix({ launcher: null });
    expect(cliStatus(deps)).toMatchObject({ supported: false, installed: false, reason: expect.stringContaining("开发") });
    expect(() => cliInstall(deps)).toThrow(/安装版/);
  });
  test("安装 → 状态已安装并指向启动脚本；重复安装幂等；~/.local/bin 不在 PATH 时 onPath=false", () => {
    const { deps, link, launcher } = posix();
    expect(cliStatus(deps)).toMatchObject({ supported: true, installed: false, method: "symlink", onPath: false });
    const st = cliInstall(deps);
    expect(st).toMatchObject({ installed: true, location: link });
    expect(readlinkSync(link)).toBe(launcher);
    expect(cliInstall(deps).installed).toBe(true);
    expect(cliStatus({ ...deps, env: { PATH: `/usr/bin${path.delimiter}${path.dirname(link)}` } }).onPath).toBe(true);
  });
  test("应用搬了位置：旧链接（指向某个 resources/bin/huhu）会被替换；指向别的程序或普通文件的不动", () => {
    const { deps, link } = posix();
    mkdirSync(path.dirname(link), { recursive: true });
    const oldRes = tmp(); mkdirSync(path.join(oldRes, "resources", "bin"), { recursive: true }); mkdirSync(path.join(oldRes, "resources", "cli"));
    const old = path.join(oldRes, "resources", "bin", "huhu"); writeFileSync(old, "x"); writeFileSync(path.join(oldRes, "resources", "cli", "cli.mjs"), "x");
    symlinkSync(old, link);
    expect(cliInstall(deps).installed).toBe(true); // 旧版 HUHU 的启动脚本（旁边有 cli/cli.mjs）：替换
    rmSync(link);
    symlinkSync(path.join(tmp(), "gone", "huhu"), link); // 悬空链接（旧版本被删了，或 AppImage 挂载点已消失）：替换
    expect(cliInstall(deps).installed).toBe(true);
    rmSync(link);
    const other = tmp(); mkdirSync(path.join(other, "resources", "bin"), { recursive: true });
    writeFileSync(path.join(other, "resources", "bin", "huhu"), "不是 HUHU"); // 形似但旁边没有 cli/cli.mjs
    symlinkSync(path.join(other, "resources", "bin", "huhu"), link);
    expect(() => cliInstall(deps)).toThrow(/别的程序/);
    rmSync(link);
    symlinkSync("/bin/ls", link);
    expect(() => cliInstall(deps)).toThrow(/别的程序/);
    expect(readlinkSync(link)).toBe("/bin/ls");
    rmSync(link);
    writeFileSync(link, "用户自己的文件");
    expect(() => cliInstall(deps)).toThrow(/不是符号链接/);
    expect(lstatSync(link).isFile()).toBe(true);
  });
  test("AppImage 等不支持的环境：给出原因，不创建链接", () => {
    const { deps, link } = posix({ launcher: null, unsupportedReason: "AppImage 每次启动都挂载在临时目录" });
    expect(cliStatus(deps)).toMatchObject({ supported: false, reason: expect.stringContaining("AppImage") });
    expect(() => cliInstall(deps)).toThrow();
    expect(existsSync(link)).toBe(false);
  });
  test("替换是原子的：安装后目录里没有残留的 .tmp 链接", () => {
    const { deps, link } = posix();
    cliInstall(deps); cliInstall(deps);
    expect(readdirSync(path.dirname(link))).toEqual(["huhu"]);
  });
  test("卸载只删指向本应用的链接；其他的不动；没装过也不报错", () => {
    const { deps, link } = posix();
    expect(cliUninstall(deps).installed).toBe(false);
    cliInstall(deps);
    expect(cliUninstall(deps).installed).toBe(false);
    expect(existsSync(link)).toBe(false);
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync("/bin/ls", link);
    cliUninstall(deps);
    expect(readlinkSync(link)).toBe("/bin/ls");
  });
});

describe("命令行安装（Windows：用户 PATH，PowerShell 用桩）", () => {
  function win() {
    let userPath = "C:\\Tools;C:\\Other";
    const scripts: { script: string; env: Record<string, string> }[] = [];
    const deps: CliDeps = {
      platform: "win32", home: "C:\\Users\\u", env: {}, launcher: "C:\\App\\resources\\bin\\huhu.cmd",
      powershell: (script, env) => {
        scripts.push({ script, env });
        const bin = (env["HUHU_BIN"] ?? "").toLowerCase();
        if (script === PS_READ) return userPath;
        if (script === PS_INSTALL) { if (!userPath.split(";").some((p) => p.toLowerCase() === bin)) userPath = `${userPath};${env["HUHU_BIN"]}`; return ""; }
        if (script === PS_UNINSTALL) { userPath = userPath.split(";").filter((p) => p && p.toLowerCase() !== bin).join(";"); return ""; }
        throw new Error("未知脚本");
      },
    };
    return { deps, scripts, get userPath() { return userPath; } };
  }
  test("目录经环境变量传给 PowerShell（不拼进脚本）；安装后在 PATH 里；重复安装不重复追加；卸载只移除自己的目录", () => {
    const w = win();
    expect(cliStatus(w.deps)).toMatchObject({ supported: true, installed: false, method: "path" });
    expect(cliInstall(w.deps).installed).toBe(true);
    expect(w.userPath).toBe("C:\\Tools;C:\\Other;C:\\App\\resources\\bin");
    cliInstall(w.deps);
    expect(w.userPath.split(";").filter((p) => p === "C:\\App\\resources\\bin")).toHaveLength(1);
    for (const s of w.scripts) expect(s.script).not.toContain("C:\\App"); // 路径只出现在环境变量里
    expect(PS_INSTALL).toContain("ExpandString"); // 保留 REG_EXPAND_SZ
    expect(PS_INSTALL).toContain("DoNotExpandEnvironmentNames");
    expect(cliUninstall(w.deps).installed).toBe(false);
    expect(w.userPath).toBe("C:\\Tools;C:\\Other");
  });
});
