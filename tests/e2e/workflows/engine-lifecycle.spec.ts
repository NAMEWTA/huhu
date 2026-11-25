import { _electron as electron, expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Vault } from "../../../packages/vault/src/index.js";
import { rmTree, root, USER_DATA_ARG } from "../helpers/launch.js";

const cli = path.resolve(import.meta.dirname, "../../../apps/cli/src/bin.ts");
const entry = path.resolve(import.meta.dirname, "../../../apps/engine/src/main.ts");
const tsx = createRequire(import.meta.url).resolve("tsx/cli");

test("TW7 桌面附着当前常驻 Engine，退出工作台后同一端点继续服务", async () => {
  test.skip(process.platform !== "linux");
  test.setTimeout(70_000);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-e2e-engine-lifecycle-"));
  const env = { ...process.env, HUHU_VAULT: vault, HUHU_ENGINE_ENTRY: entry, HUHU_WEB_ASSETS_DIR: path.join(root, "out", "web") };
  const command = async (action: string) => {
    const { stdout } = await promisify(execFile)(process.execPath, [tsx, cli, "engine", action, "--vault", vault, "--json"], { env, timeout: 20_000 });
    return JSON.parse(stdout) as { mode?: string; state: string; port?: number; pid?: number; vaultId?: string };
  };
  const launch = () => electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env });
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    await (await Vault.open(vault, { create: true })).close();
    const resident = await command("start");
    expect(resident).toMatchObject({ mode: "resident", state: "running", port: expect.any(Number), pid: expect.any(Number) });
    for (const _ of [0, 1]) {
      app = await launch();
      const page = await app.firstWindow();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
      const endpoint = await page.evaluate(() => window.huhuHost.engine());
      expect(endpoint).toMatchObject({ vaultId: resident.vaultId, baseUrl: `http://127.0.0.1:${resident.port}` });
      await app.close();
      app = undefined;
      expect(await command("status")).toEqual(resident);
    }
    expect(await command("stop")).toEqual({ state: "stopped" });
  } finally {
    try {
      await app?.close();
      await command("stop");
    } finally {
      rmTree(vault);
    }
  }
});
