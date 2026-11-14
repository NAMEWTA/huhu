import { expect, test } from "@playwright/test";
import * as fsx from "node:fs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { seedVault } from "./fixture.js";
import { openFixedApp } from "./launch.js";
import { SCREENS } from "./screens.js";
import { collectDefault, diffSnap, type Snap } from "./snapshot.js";

/**
 * 宽度矩阵与特殊模式：只取默认状态的计算样式（不截图）。
 * - 宽度：覆盖现有 @media 断点两侧（见 BREAKPOINT_WIDTHS 与 checkBreakpointCoverage），分层最容易在断点处翻转。
 * - 特殊模式：compact 密度、减少动效（均在 1440 宽下）。
 */
const NAME = process.env["VISUAL_NAME"] ?? "scratch";
const MODE = process.env["VISUAL_MODE"] === "compare" ? "compare" : "baseline";
const DIR = path.resolve(import.meta.dirname, "../../.visual", NAME, "snap-widths");
const WIDTHS = [1920, 1440, 1280, 1100, 1000, 900, 760, 700, 620, 520];
const ONLY = process.env["VISUAL_SCREENS"]?.split(",").filter(Boolean);
const FIXED_TIME = new Date("2026-11-14T08:00:00Z");

const write = (f: string, data: unknown) => writeFileSync(f, gzipSync(JSON.stringify(data)));
const read = <T>(f: string): T => JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as T;

/** 断点覆盖校验：从构建产物之外的源 CSS 提取所有 max-width / min-width 断点，要求每个断点两侧都有宽度样本。 */
function checkBreakpointCoverage(): string[] {
  const roots = ["packages/ui/src/styles", "packages/workbench/src", "packages/editor/src", "plugins"];
  const bps = new Map<string, { kind: string; bp: number }>();
  const walk = (dir: string) => {
    for (const name of fsx.readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const p = path.join(dir, name);
      if (fsx.statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".css")) for (const m of readFileSync(p, "utf8").matchAll(/\((max|min)-width:\s*(\d+)px\)/g)) bps.set(`${m[1]}${m[2]}`, { kind: m[1]!, bp: Number(m[2]) });
    }
  };
  for (const r of roots) walk(path.resolve(import.meta.dirname, "../..", r));
  const missing: string[] = [];
  for (const { kind, bp } of bps.values()) {
    // max-width: bp 命中 w ≤ bp；min-width: bp 命中 w ≥ bp。两侧各要有一个样本。
    const hit = (w: number) => (kind === "max" ? w <= bp : w >= bp);
    if (!WIDTHS.some(hit) || !WIDTHS.some((w) => !hit(w))) missing.push(`断点 ${kind}-width ${bp}px 缺少一侧的宽度样本`);
  }
  return missing;
}

test("宽度矩阵 / compact / 减少动效的计算样式", async () => {
  test.skip(process.env["VISUAL_SKIP_WIDTHS"] === "1", "VISUAL_SKIP_WIDTHS=1：只跑默认状态 / 状态矩阵（收敛循环用）");
  mkdirSync(DIR, { recursive: true });
  const { page, close } = await openFixedApp(seedVault);
  const failures: string[] = [];
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.clock.setFixedTime(FIXED_TIME);
    const cdp = await page.context().newCDPSession(page);
    const variants: { id: string; width: number; attrs: Record<string, string> }[] = [
      ...WIDTHS.map((w) => ({ id: `w${w}`, width: w, attrs: {} })),
      { id: "compact", width: 1440, attrs: { density: "compact" } },
      { id: "reduced-motion", width: 1440, attrs: { motion: "reduced" } },
    ];
    for (const screen of SCREENS.filter((x) => !ONLY || ONLY.includes(x.id))) {
      await screen.enter(page);
      for (const v of variants) {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: v.width, height: 900, deviceScaleFactor: 1, mobile: false });
        await page.evaluate(
          ([attrs]) => {
            const d = document.documentElement.dataset;
            d["theme"] = "claude";
            d["mode"] = "light";
            d["density"] = "comfortable";
            d["motion"] = "standard";
            for (const [k, val] of Object.entries(attrs as Record<string, string>)) d[k] = val;
          },
          [v.attrs],
        );
        await page.waitForTimeout(150);
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => undefined)),
          ),
        );
        const { snap } = await collectDefault(page);
        await page.evaluate("document.querySelectorAll('[data-vq-i]').forEach(e=>e.removeAttribute('data-vq-i'))");
        const file = path.join(DIR, `${screen.id}--${v.id}.json.gz`);
        if (MODE === "baseline") write(file, snap);
        else if (!existsSync(file)) failures.push(`缺少基线 ${screen.id}--${v.id}`);
        else {
          const d = diffSnap(read<Snap>(file), snap, 8);
          if (d.length) failures.push(`[${screen.id}--${v.id}]\n  ${d.join("\n  ")}`);
        }
      }
      await screen.leave?.(page);
    }
  } finally {
    await close();
  }
  failures.push(...checkBreakpointCoverage());
  console.log(`宽度矩阵失败项 ${failures.length}`);
  expect(failures, failures.join("\n")).toEqual([]);
});
