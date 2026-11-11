import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "../../../apps/desktop");
const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(root, "resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");

/** 以临时 Vault 启动桌面应用；返回应用、首个窗口与清理函数。 */
export async function openApp(extraEnv: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page; vault: string; close(): Promise<void> }> {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-"));
  const app = await electron.launch({ args: [root, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}), ...extraEnv } });
  const page = await app.firstWindow();
  return {
    app,
    page,
    vault,
    close: async () => {
      await app.close();
      rmSync(vault, { recursive: true, force: true });
    },
  };
}
