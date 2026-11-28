import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** 删除临时目录：Windows 上 Herdr Core 等后台进程可能还占着里面的文件（EPERM / EBUSY），重试几次，仍不行就留给系统清理，不让用例因此失败。 */
export function rmTree(p: string): void {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (e) {
    if (process.platform !== "win32") throw e;
  }
}

export const root = path.resolve(import.meta.dirname, "../../../apps/desktop");
const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(root, "resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");

export function linuxProtectedPtyEnvironment(): { HUHU_AGENT_PTY_HOST: string } {
  const helper = process.env["HUHU_AGENT_PTY_HOST"] ?? path.resolve(root, "../../native/agent-pty/bin/huhu-agent-pty");
  try {
    accessSync(helper, constants.X_OK);
  } catch (cause) {
    throw new Error("请将 HUHU_AGENT_PTY_HOST 指向已构建且可执行的 Linux 原生 PTY helper", { cause });
  }
  return { HUHU_AGENT_PTY_HOST: helper };
}

let historyRoot: string | undefined;
/**
 * Empty per-worker native history profiles. Without them the Engine scans the developer's real
 * ~/.codex, ~/.claude and ~/.pi history, which makes history and dashboard timing depend on the host.
 * They override the inherited environment (a runner started from Codex exports CODEX_HOME); a test override still wins.
 */
function isolatedHistory(): Record<string, string> {
  historyRoot ??= mkdtempSync(path.join(tmpdir(), "huhu-e2e-history-"));
  const dir = (name: string) => {
    const target = path.join(historyRoot!, name);
    mkdirSync(target, { recursive: true });
    return target;
  };
  const pi = dir("pi");
  return { CLAUDE_CONFIG_DIR: dir("claude"), CODEX_HOME: dir("codex"), PI_CODING_AGENT_DIR: pi, PI_CODING_AGENT_SESSION_DIR: path.join(pi, "sessions") };
}

/** 继承的环境之上覆盖隔离的 Agent 历史目录：运行者自己的 CODEX_HOME 等不得让应用扫描真实历史。用例需要的目录经 extraEnv 再覆盖。 */
export function testEnv(): Record<string, string | undefined> {
  return { ...process.env, ...isolatedHistory() };
}

/** 以临时 Vault 启动桌面应用；返回应用、首个窗口与清理函数。 */
export async function openApp(extraEnv: Record<string, string> = {}, prepareVault?: (vault: string) => void, applicationRoot = root): Promise<{ app: ElectronApplication; page: Page; vault: string; close(): Promise<void> }> {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    prepareVault?.(vault);
    clearProfileZoom();
    app = await electron.launch({ args: [applicationRoot, "--no-sandbox", USER_DATA_ARG], env: { ...testEnv(), HUHU_VAULT: vault, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}), ...extraEnv } });
    page = await app.firstWindow();
  } catch (error) {
    await app?.close().catch(() => {});
    rmTree(vault);
    throw error;
  }
  const application = app;
  return {
    app: application,
    page,
    vault,
    close: async () => {
      // Quit flushes through the Engine HTTP API. A route left by the test would hold those calls
      // while Playwright closes the context, and the desktop correctly keeps the window open.
      await Promise.all(application.windows().map((window) => window.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined)));
      await application.close();
      rmTree(vault);
    },
  };
}

/**
 * Chromium 把每个来源的缩放级别存进共享 userData 的 Preferences；放大过的用例会让后面的用例以 1.5× 打开、
 * 布局断点随之改变。每次启动前清掉保存的缩放，需要缩放的用例自己设置。
 */
export function clearProfileZoom(): void {
  const preferences = path.join(USER_DATA_DIR, "Preferences");
  try {
    const profile = JSON.parse(readFileSync(preferences, "utf8")) as { partition?: { per_host_zoom_levels?: unknown } };
    if (!profile.partition?.per_host_zoom_levels) return;
    delete profile.partition.per_host_zoom_levels;
    writeFileSync(preferences, JSON.stringify(profile));
  } catch {
    /* 还没有 Preferences（首次启动）就没有可清的缩放 */
  }
}

/** 本进程内共享的独立 userData 参数（relaunch 同一用例仍共享状态，与默认行为一致；不同 worktree / 进程互不抢单实例锁）。 */
const USER_DATA_DIR = path.join(tmpdir(), `huhu-ud-${process.pid}`);
export const USER_DATA_ARG = `--user-data-dir=${USER_DATA_DIR}`;
