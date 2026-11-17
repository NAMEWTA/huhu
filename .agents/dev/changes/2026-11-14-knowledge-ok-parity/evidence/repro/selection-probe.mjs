#!/usr/bin/env node
// B06 取证：真实 Electron 里的“鼠标选区 / 上下行光标”探针。
// 用法（在被测工作树里已 pnpm build）：
//   xvfb-run -a node selection-probe.mjs <被测工作树根> <label> [--editor-selector '.cm-content']
// 同一份探针对 rc.4（CM6 `.cm-content`）与新编辑器（ProseMirror `.ProseMirror`）运行，输出 JSON 到 stdout。
// 判据都用浏览器自己的 caretRangeFromPoint 做预言机，不依赖编辑器内部状态：
//   S1 拖选：选区文本 == 浏览器在 mousedown/mouseup 坐标处算出的原生 Range 文本
//   S2 ArrowDown 逐行：字符偏移单调不减、纵向位移 ≤ 2.5 行高，不原地不动（除末行）
//   S3 ArrowUp 逐行：同上方向相反
//   S4 Shift+ArrowDown 扩选：选区单调增长，锚点不变
//   S5 跨段落拖选
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , rootArg, label = "run", ...rest] = process.argv;
if (!rootArg) {
  console.error("用法：selection-probe.mjs <工作树根> <label> [--editor-selector SEL]");
  process.exit(2);
}
const sIdx = rest.indexOf("--editor-selector");
const editorSel = sIdx >= 0 ? rest[sIdx + 1] : ".cm-content";
const require = createRequire(path.join(rootArg, "package.json"));
const { _electron: electron } = require("@playwright/test");

const para = (n) => `第 ${n} 段：这是一段用来测试光标移动与鼠标选区的中文正文，包含 English words、**加粗**、\`代码\` 和 [[链接${n}]]，需要足够长才能在窗口里折行成两到三行显示，继续补充一些文字让它更长一些，直到确实折行。`;
const doc = ["# 选区探针", "", ...Array.from({ length: 8 }, (_, i) => para(i + 1) + "\n"), "- 列表项甲", "- 列表项乙", "", "```js", "const a = 1;", "const b = 2;", "```", "", para(9)].join("\n");

const vault = mkdtempSync(path.join(tmpdir(), "huhu-selprobe-"));
writeFileSync(path.join(vault, "探针.md"), doc);
const appRoot = path.join(rootArg, "apps/desktop");
const app = await electron.launch({ args: [appRoot, "--no-sandbox"], env: { ...process.env, HUHU_VAULT: vault } });
const out = { label, editorSel, results: {}, notes: [] };
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  await page.getByTestId("engine-state").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  const legacy = page.getByTestId("note-item").filter({ hasText: "探针" });
  if ((await legacy.count()) > 0) await legacy.first().click();
  else await page.locator('[data-testid="notes-resource-tree"] [data-item-path]').filter({ hasText: "探针" }).first().click();
  const content = page.getByTestId("markdown-editor").locator(editorSel).first();
  await content.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const sel = editorSel;

  // 页内工具：偏移 = 从内容根开头到选区焦点的字符数；y = 焦点处矩形
  await page.evaluate((s) => {
    const root = () => document.querySelector(s);
    window.__p = {
      focusInfo() {
        const r = root();
        const sel = getSelection();
        if (!sel || !sel.focusNode) return null;
        const rg = document.createRange();
        rg.setStart(r, 0);
        rg.setEnd(sel.focusNode, sel.focusOffset);
        const c = document.createRange();
        c.setStart(sel.focusNode, sel.focusOffset);
        c.collapse(true);
        let rect = c.getClientRects()[0] || c.getBoundingClientRect();
        if (!rect || (rect.top === 0 && rect.height === 0)) {
          const el = sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement;
          rect = el.getBoundingClientRect();
        }
        return { offset: rg.toString().length, y: Math.round(rect.top - r.getBoundingClientRect().top), lh: Math.round(parseFloat(getComputedStyle(root()).lineHeight) || 24) };
      },
      anchorOffset() {
        const r = root();
        const sel = getSelection();
        if (!sel || !sel.anchorNode) return null;
        const rg = document.createRange();
        rg.setStart(r, 0);
        rg.setEnd(sel.anchorNode, sel.anchorOffset);
        return rg.toString().length;
      },
      selText: () => getSelection()?.toString() ?? "",
      oracle(x1, y1, x2, y2) {
        const a = document.caretRangeFromPoint(x1, y1);
        const b = document.caretRangeFromPoint(x2, y2);
        if (!a || !b) return null;
        const r = document.createRange();
        const fwd = a.compareBoundaryPoints(Range.START_TO_START, b) <= 0;
        const s = fwd ? a : b;
        const e = fwd ? b : a;
        r.setStart(s.startContainer, s.startOffset);
        r.setEnd(e.startContainer, e.startOffset);
        return r.toString();
      },
    };
  }, sel);

  const para3 = content.locator("p, .cm-line").filter({ hasText: "第 3 段" }).first();
  await para3.scrollIntoViewIfNeeded();
  const box = await para3.boundingBox();

  // S1：段内拖选（同一段内，从 25% 宽到 75% 宽，纵向取第一行中部）
  {
    const fails = [];
    for (let i = 0; i < 6; i++) {
      const x1 = box.x + box.width * (0.1 + 0.05 * i);
      const x2 = box.x + box.width * (0.55 + 0.06 * i);
      const y = box.y + 10;
      await page.mouse.click(box.x + 4, box.y + box.height - 6); // 先点别处重置
      await page.mouse.move(x1, y);
      await page.mouse.down();
      await page.mouse.move((x1 + x2) / 2, y, { steps: 6 });
      await page.mouse.move(x2, y, { steps: 6 });
      await page.mouse.up();
      const got = await page.evaluate(() => window.__p.selText());
      const want = await page.evaluate(([a, b, c, d]) => window.__p.oracle(a, b, c, d), [x1, y, x2, y]);
      if (got !== want) fails.push({ i, got: got.slice(0, 60), want: (want ?? "null").slice(0, 60) });
    }
    out.results.S1_drag_within_line = { trials: 6, mismatches: fails.length, samples: fails.slice(0, 3) };
  }

  // S2/S3：逐行上下移动
  async function walk(key, steps) {
    const trace = [];
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press(key);
      trace.push(await page.evaluate(() => window.__p.focusInfo()));
    }
    return trace;
  }
  function judge(trace, startInfo, dir) {
    const bad = [];
    let prev = startInfo;
    for (let i = 0; i < trace.length; i++) {
      const t = trace[i];
      if (!t || !prev) continue;
      const dOff = (t.offset - prev.offset) * dir;
      const dY = Math.abs(t.y - prev.y);
      if (dOff < 0) bad.push({ i, reason: "方向反了", prev, t });
      else if (dOff === 0 && dY === 0 && i < trace.length - 3) bad.push({ i, reason: "原地不动", prev, t });
      else if (dY > t.lh * 2.5 + 40) bad.push({ i, reason: "一次跨越过多行", prev, t });
      prev = t;
    }
    return bad;
  }
  await page.mouse.click(box.x + box.width * 0.4, box.y + 10);
  const start = await page.evaluate(() => window.__p.focusInfo());
  const down = await walk("ArrowDown", 14);
  out.results.S2_arrow_down = { steps: down.length, anomalies: judge(down, start, 1).length, samples: judge(down, start, 1).slice(0, 3) };
  const startUp = await page.evaluate(() => window.__p.focusInfo());
  const up = await walk("ArrowUp", 14);
  out.results.S3_arrow_up = { steps: up.length, anomalies: judge(up, startUp, -1).length, samples: judge(up, startUp, -1).slice(0, 3) };

  // S4：Shift+ArrowDown 扩选
  {
    await page.mouse.click(box.x + box.width * 0.3, box.y + 10);
    const a0 = await page.evaluate(() => window.__p.anchorOffset());
    let prevLen = 0;
    const bad = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+ArrowDown");
      const len = (await page.evaluate(() => window.__p.selText())).length;
      const a = await page.evaluate(() => window.__p.anchorOffset());
      if (len < prevLen) bad.push({ i, reason: "选区变短", prevLen, len });
      if (a !== a0) bad.push({ i, reason: "锚点移动", a0, a });
      prevLen = len;
    }
    out.results.S4_shift_arrow_extend = { steps: 8, anomalies: bad.length, samples: bad.slice(0, 3) };
  }

  // S5：跨段落拖选（第 3 段中部 → 第 5 段中部；先把第 4 段滚到视口中央，保证两端都在视口内）
  {
    const loc = (n) => content.locator("p, .cm-line").filter({ hasText: `第 ${n} 段` }).first();
    await loc(4).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    const b3 = await loc(3).boundingBox();
    const b5 = await loc(5).boundingBox();
    const x1 = b3.x + b3.width * 0.3, y1 = b3.y + 10, x2 = b5.x + b5.width * 0.6, y2 = b5.y + 10;
    out.notes.push({ S5_coords: { x1, y1, x2, y2 } });
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 20 });
    await page.mouse.up();
    const got = await page.evaluate(() => window.__p.selText());
    const want = await page.evaluate(([a, b, c, d]) => window.__p.oracle(a, b, c, d), [x1, y1, x2, y2]);
    out.results.S5_drag_across_paragraphs = { match: got === want, gotLen: got.length, wantLen: (want ?? "").length, head: got.slice(0, 30), tail: got.slice(-30) };
  }
} catch (e) {
  out.error = String(e && e.stack ? e.stack : e).slice(0, 1500);
} finally {
  await app.close().catch(() => {});
  rmSync(vault, { recursive: true, force: true });
}
console.log(JSON.stringify(out, null, 2));
