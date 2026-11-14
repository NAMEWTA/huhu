import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { seedVault } from "./fixture.js";
import { openFixedApp } from "./launch.js";
import { MASKS, NOISE_PIXELS, SCREEN_TOLERANCE } from "./masks.js";
import { MODES, SCREENS, THEMES } from "./screens.js";
import { collectDefault, collectStates, diffSnap, type Snap, type StateDelta } from "./snapshot.js";

/**
 * 样式等价性：HUHU 的“渲染没变”证明。
 *   pnpm visual:baseline <name>  生成基线 .visual/<name>/（计算样式快照 + 截图）
 *   pnpm visual:compare  <name>  与基线逐元素、逐像素比对，有差异即失败
 * 环境变量：VISUAL_NAME（基线名）、VISUAL_MODE（baseline | compare）、VISUAL_THEMES（逗号分隔，默认 claude）、VISUAL_STATES=0 关闭状态矩阵。
 */
const NAME = process.env["VISUAL_NAME"] ?? "scratch";
const MODE = process.env["VISUAL_MODE"] === "compare" ? "compare" : "baseline";
const THEME_LIST = (process.env["VISUAL_THEMES"] ?? "claude").split(",").filter((t) => (THEMES as readonly string[]).includes(t));
const STATES = process.env["VISUAL_STATES"] !== "0";
const DIR = path.resolve(import.meta.dirname, "../../.visual", NAME, "snap");
const ONLY = process.env["VISUAL_SCREENS"]?.split(",").filter(Boolean);
const ONLY_MODE = process.env["VISUAL_MODE_ONLY"];
const FIXED_TIME = new Date("2026-11-14T08:00:00Z");

const write = (f: string, data: unknown) => writeFileSync(f, gzipSync(JSON.stringify(data)));
const read = <T>(f: string): T => JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as T;

test("样式等价性快照", async () => {
  mkdirSync(DIR, { recursive: true });
  const { page, close } = await openFixedApp(seedVault);
  const failures: string[] = [];
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.clock.setFixedTime(FIXED_TIME);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // 验证验证工具本身：VISUAL_INJECT 注入一段样式，应当被比对发现（见 verification.md §6）
    if (process.env["VISUAL_INJECT"]) await page.addStyleTag({ content: process.env["VISUAL_INJECT"] });
    const t0 = Date.now();
    for (const screen of SCREENS.filter((x) => !ONLY || ONLY.includes(x.id))) {
      await screen.enter(page);
      for (const theme of THEME_LIST) {
        for (const mode of MODES.filter((m) => !ONLY_MODE || m === ONLY_MODE)) {
          const combo = `${screen.id}--${theme}-${mode}`;
          await page.evaluate(
            ([t, m]) => {
              const d = document.documentElement.dataset;
              d["theme"] = t;
              d["mode"] = m;
            },
            [theme, mode],
          );
          await page.mouse.move(0, 0);
          await page.waitForTimeout(250);
          // 等所有有限的过渡 / 动画结束（切换主题会触发颜色过渡），避免读到中间态
          await page.evaluate(() =>
            Promise.all(
              document
                .getAnimations()
                .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => undefined)),
            ),
          );
          const { snap, interactive } = await collectDefault(page);
          const states: StateDelta = STATES && theme === "claude" ? await collectStates(page, cdp, interactive) : {};
          await page.evaluate("document.querySelectorAll('[data-vq-i]').forEach(e=>e.removeAttribute('data-vq-i'))");
          const file = path.join(DIR, `${combo}.json.gz`);
          if (MODE === "baseline") {
            write(file, { snap, states });
          } else {
            if (!existsSync(file)) {
              failures.push(`缺少基线 ${combo}`);
            } else {
              const base = read<{ snap: Snap; states: StateDelta }>(file);
              const d = diffSnap(base.snap, snap);
              if (d.length) failures.push(`[${combo}] 默认状态计算样式差异：\n  ${d.join("\n  ")}`);
              for (const k of new Set([...Object.keys(base.states), ...Object.keys(states)])) {
                const sd = diffSnap(base.states[k] ?? {}, states[k] ?? {}, 10);
                if (sd.length) failures.push(`[${combo}] 状态 ${k} 差异：\n  ${sd.join("\n  ")}`);
              }
            }
          }
          console.log(`${combo}: ${Object.keys(snap).length} 元素，${Object.keys(states).length} 个状态增量`);
          await expect.soft(page).toHaveScreenshot(`${combo}.png`, { animations: "disabled", caret: "hide", threshold: 0, maxDiffPixels: SCREEN_TOLERANCE[screen.id]?.pixels ?? NOISE_PIXELS, mask: MASKS.map((m) => m.locate(page)) });
        }
      }
      await screen.leave?.(page);
    }
    console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    await close();
  }
  console.log(`计算样式失败项 ${failures.length}`);
  expect(failures, failures.join("\n")).toEqual([]);
});
