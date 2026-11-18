import { _electron as electron, test } from "@playwright/test";
import path from "node:path";

test("debug：A → B → A 的控制台与页面错误", async () => {
  const app = await electron.launch({ args: [path.resolve(import.meta.dirname, "../../harness/electron-main.cjs")] });
  const page = await app.firstWindow();
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 500)));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e)}\n${(e.stack ?? "").slice(0, 1200)}`));
  await page.waitForFunction(() => Boolean((window as never as { __harness?: unknown }).__harness), null, { timeout: 30_000 });
  const h = (fn: string) => page.evaluate(fn);
  await h(`window.__harness.seed('A.md','# Alpha\\n\\nFirst paragraph.\\n'); window.__harness.seed('B.md','# Beta\\n\\nBeta body.\\n'); window.__harness.open('A.md')`);
  await page.waitForTimeout(2500);
  await h(`window.__harness.open('B.md')`);
  await page.waitForTimeout(2500);
  await h(`window.__harness.open('A.md')`);
  await page.waitForTimeout(3000);
  console.log("PM count", await page.locator(".ProseMirror").count(), "portal children", await page.locator("#portal > *").count());
  console.log((await page.locator("body").innerHTML()).replace(/<div class="ok-lint-tooltip".*$/s, "").slice(0, 1200));
  console.log(logs.filter((l) => !l.includes("Security Warning")).join("\n"));
  await app.close();
});
