import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "../e2e/helpers/launch.js";

/** 固定路径的 Vault（界面会显示 Vault 名称，随机目录名会让截图每次不同）。每次运行先清空重建。 */
export const FIXED_VAULT = path.join(tmpdir(), "huhu-visual", "固定库");

const HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(root, "resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");

export async function openFixedApp(seed: (vault: string) => void): Promise<{ app: ElectronApplication; page: Page; vault: string; close(): Promise<void> }> {
  rmSync(path.dirname(FIXED_VAULT), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  mkdirSync(FIXED_VAULT, { recursive: true });
  seed(FIXED_VAULT);
  const app = await electron.launch({
    args: [root, "--no-sandbox", "--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb", "--disable-gpu-rasterization"],
    env: { ...process.env, HUHU_VAULT: FIXED_VAULT, ...(existsSync(HERDR) ? { HUHU_HERDR_BIN: HERDR } : {}) },
  });
  const page = await app.firstWindow();
  return {
    app,
    page,
    vault: FIXED_VAULT,
    close: async () => {
      await app.close();
      rmSync(path.dirname(FIXED_VAULT), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    },
  };
}
