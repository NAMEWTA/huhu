import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { seedVault } from "./fixture.js";
import { openFixedApp } from "./launch.js";
import { SCREENS } from "./screens.js";

/**
 * Chromium CSS 规则覆盖率（DSC-12）：在固定 Vault 的全部屏幕上收集 CSS.startRuleUsageTracking，
 * 把“从未匹配任何元素”的规则列出来，写入 .visual/<VISUAL_NAME>/css-coverage.json。
 * 覆盖率为 0 不等于可删除（状态没走到），只是核查线索；与 PurgeCSS 的结论交叉见 .agents/dev 里 design-system-completion 的 progress.md（DSC-12）与 evidence/dsc12-zero-coverage-rules.json。
 */
const NAME = process.env["VISUAL_NAME"] ?? "scratch";

interface SheetInfo {
  id: string;
  url: string;
  isInline: boolean;
}

test("导出 CSS 规则覆盖率", async () => {
  const { page, close } = await openFixedApp(seedVault);
  const sheets = new Map<string, SheetInfo>();
  let unused: { sheet: string; selector: string; at: string }[] = [];
  let total = 0;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    const cdp = await page.context().newCDPSession(page);
    cdp.on("CSS.styleSheetAdded", (e: { header: { styleSheetId: string; sourceURL: string; isInline: boolean } }) => {
      sheets.set(e.header.styleSheetId, { id: e.header.styleSheetId, url: e.header.sourceURL, isInline: e.header.isInline });
    });
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await cdp.send("CSS.startRuleUsageTracking");
    for (const screen of SCREENS) {
      await screen.enter(page);
      await page.waitForTimeout(300);
      await screen.leave?.(page);
    }
    const { ruleUsage } = (await cdp.send("CSS.stopRuleUsageTracking")) as { ruleUsage: { styleSheetId: string; startOffset: number; endOffset: number; used: boolean }[] };
    // 注意：stopRuleUsageTracking 只返回“用过”的规则；没出现在结果里的才是覆盖率为 0 的规则，所以要自己枚举全部规则再相减
    for (const [id, info] of sheets) {
      if (info.isInline || !info.url) continue; // 只看打包出来的项目样式表（外链）；运行时注入的 <style> 不是本项目的规则
      let text: string;
      try {
        text = ((await cdp.send("CSS.getStyleSheetText", { styleSheetId: id })) as { text: string }).text;
      } catch {
        continue; // 重载页面前的旧样式表已经不存在
      }
      const usedStarts = new Set(ruleUsage.filter((u) => u.styleSheetId === id && u.used).map((u) => u.startOffset));
      const root = postcss.parse(text);
      root.walkRules((r) => {
        total++;
        const start = r.source?.start?.offset;
        if (start === undefined || usedStarts.has(start)) return;
        const at: string[] = [];
        for (let p = r.parent; p && p.type !== "root"; p = p.parent) if (p.type === "atrule") at.push(`@${(p as postcss.AtRule).name} ${(p as postcss.AtRule).params}`);
        unused.push({ sheet: path.basename(info.url), selector: r.selector.replace(/\s+/g, " "), at: at.reverse().join(" > ") });
      });
    }
  } finally {
    await close();
  }
  const dir = path.resolve(import.meta.dirname, "../../.visual", NAME);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "css-coverage.json"), JSON.stringify({ total, unusedCount: unused.length, unused }, null, 1));
  console.log(`规则 ${total} 条；固定 Vault 全部屏幕上从未匹配的项目规则 ${unused.length} 条`);
  expect(total).toBeGreaterThan(0);
});
