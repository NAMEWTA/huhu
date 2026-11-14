import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedVault } from "./fixture.js";
import { openFixedApp } from "./launch.js";
import { SCREENS } from "./screens.js";

/**
 * 导出运行时注入的样式表（不属于打包产物的 <style> 与 adoptedStyleSheets）：CodeMirror、sonner、xterm、mermaid 等。
 * 它们没有 @layer，永远压过分层规则，所以覆盖它们的规则不能放进层里（spec §3.2）。结果写入 .visual/<VISUAL_NAME>/runtime-styles.json。
 */
const NAME = process.env["VISUAL_NAME"] ?? "scratch";

test("导出运行时注入的样式表", async () => {
  const { page, close } = await openFixedApp(seedVault);
  const found = new Map<string, { source: string; rules: number; layered: number; selectors: string[]; screens: string[] }>();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    for (const screen of SCREENS) {
      await screen.enter(page);
      await page.waitForTimeout(300);
      const sheets = await page.evaluate(() => {
        const out: { source: string; key: string; rules: number; layered: number; selectors: string[] }[] = [];
        const all: { sheet: CSSStyleSheet; source: string }[] = [];
        for (const s of Array.from(document.styleSheets)) {
          const owner = s.ownerNode as HTMLElement | null;
          const isBundle = owner instanceof HTMLLinkElement;
          if (!isBundle) all.push({ sheet: s, source: owner ? `<${owner.tagName.toLowerCase()}${owner.id ? "#" + owner.id : ""}${owner.getAttribute("nonce") !== null ? " nonce" : ""}>` : "constructed" });
        }
        for (const s of document.adoptedStyleSheets) all.push({ sheet: s, source: "adopted" });
        for (const { sheet, source } of all) {
          let rules: CSSRule[] = [];
          try {
            rules = Array.from(sheet.cssRules);
          } catch {
            continue;
          }
          const sel: string[] = [];
          let layered = 0;
          for (const r of rules) {
            if (r.constructor.name === "CSSLayerBlockRule") layered++;
            const t = (r as CSSStyleRule).selectorText;
            if (t && sel.length < 6) sel.push(t.slice(0, 80));
          }
          out.push({ source, key: source + "|" + rules.length + "|" + (sel[0] ?? ""), rules: rules.length, layered, selectors: sel });
        }
        return out;
      });
      for (const s of sheets) {
        const e = found.get(s.key) ?? { source: s.source, rules: s.rules, layered: s.layered, selectors: s.selectors, screens: [] };
        e.screens.push(screen.id);
        found.set(s.key, e);
      }
      await screen.leave?.(page);
    }
  } finally {
    await close();
  }
  const dir = path.resolve(import.meta.dirname, "../../.visual", NAME);
  mkdirSync(dir, { recursive: true });
  const list = [...found.values()];
  writeFileSync(path.join(dir, "runtime-styles.json"), JSON.stringify(list, null, 2));
  for (const s of list) console.log(`RUNTIME ${s.source} rules=${s.rules} layered=${s.layered} screens=${s.screens.length} sel=${s.selectors.slice(0, 3).join(" | ")}`);
});
