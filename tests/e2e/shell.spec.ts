import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

test("窗口启动、appInfo 可用、window.open 被拒绝", async () => {
  const root = path.resolve(import.meta.dirname, "../../apps/desktop");
  const app = await electron.launch({ args: [root, "--no-sandbox"] });
  const page = await app.firstWindow();
  await expect(page.getByTestId("boot")).toBeVisible();
  expect(await page.title()).toBe("HUHU");
  const info = await page.evaluate(() => window.huhuHost.appInfo());
  expect(info.name).toBe("HUHU");
  expect(info.version).toBe("0.0.1");
  const before = app.windows().length;
  await page.evaluate(() => window.open("file:///etc/passwd"));
  await page.waitForTimeout(500);
  expect(app.windows().length).toBe(before);
  await app.close();
});
