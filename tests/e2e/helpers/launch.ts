import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { accessSync, constants, existsSync, mkdtempSync, rmSync } from "node:fs";
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

/** 以临时 Vault 启动桌面应用；返回应用、首个窗口与清理函数。 */
export async function openApp(extraEnv: Record<string, string> = {}, prepareVault?: (vault: string) => void, applicationRoot = root): Promise<{ app: ElectronApplication; page: Page; vault: string; close(): Promise<void> }> {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    prepareVault?.(vault);
    app = await electron.launch({ args: [applicationRoot, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}), ...extraEnv } });
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

/** 本进程内共享的独立 userData 参数（relaunch 同一用例仍共享状态，与默认行为一致；不同 worktree / 进程互不抢单实例锁）。 */
export const USER_DATA_ARG = `--user-data-dir=${path.join(tmpdir(), `huhu-ud-${process.pid}`)}`;
