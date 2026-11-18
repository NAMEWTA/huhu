#!/usr/bin/env node
import { _electron as electron } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const baselineRoot = process.argv[2];
if (!baselineRoot) throw new Error("用法：node scripts/measure-notes-startup.mjs <rc.4 worktree>");
const launches = Number(process.argv[3] ?? 20);
const traceModules = process.argv.includes("--trace-modules");
if (!Number.isSafeInteger(launches) || launches < 1) throw new Error("采样次数必须为正整数");
const fixtureText = "这是一篇用于测量初次打开时间的笔记";
const scratch = mkdtempSync(path.join(tmpdir(), "huhu-notes-startup-"));
const fixture = path.join(scratch, "fixture");
const indexed = path.join(fixture, "测量数据");
mkdirSync(indexed, { recursive: true });
for (let i = 0; i < 40; i++) {
  const folder = path.join(indexed, `文件夹${i}`);
  mkdirSync(folder);
  for (let j = 0; j < 50; j++) writeFileSync(path.join(folder, `笔记${j}.md`), fixtureText.repeat(20));
}
writeFileSync(path.join(fixture, "冷启动探针.md"), `# 冷启动探针\n\n${fixtureText}\n`);

const builds = [
  { name: "rc4", root: path.resolve(baselineRoot, "apps/desktop"), legacy: true },
  { name: "candidate", root: path.resolve(import.meta.dirname, "../apps/desktop"), legacy: false },
];
const chunkName = /^(?:rich-|host-fetch-|NoteEditorSurface-|explorer-|ok-globals-|katex-).*\.(js|css)$/;
const sizeOf = (dir) =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((file) => file.isFile())
    .reduce((bytes, file) => bytes + statSync(path.join(file.parentPath, file.name)).size, 0);

for (const build of builds) {
  const output = path.join(build.root, "out");
  const assets = path.join(output, "renderer/assets");
  const files = readdirSync(assets).filter((name) => chunkName.test(name));
  console.log(
    JSON.stringify({
      build: build.name,
      outputBytes: sizeOf(output),
      rendererBytes: sizeOf(path.join(output, "renderer")),
      editorNamedChunks: Object.fromEntries(files.map((name) => [name, statSync(path.join(assets, name)).size])),
    }),
  );
}
console.log(JSON.stringify({ machine: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, logicalCPUs: cpus().length, launches, fixtureNotes: 2001 }));

async function timeBuild(build, sample) {
  const dir = path.join(scratch, `${build.name}-${sample}`);
  const vault = path.join(dir, "vault");
  cpSync(fixture, vault, { recursive: true });
  const launchStart = performance.now();
  const app = await electron.launch({
    args: [build.root, "--no-sandbox", `--user-data-dir=${path.join(dir, "profile")}`],
    env: { ...process.env, HUHU_VAULT: vault },
  });
  try {
    const page = await app.firstWindow();
    await page.getByTestId("home-module").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="engine-state"]')?.textContent === "引擎就绪", null, { timeout: 30_000, polling: "raf" });
    const homeMs = performance.now() - launchStart;
    const parsed = new Set();
    if (traceModules) {
      const cdp = await page.context().newCDPSession(page);
      cdp.on("Debugger.scriptParsed", ({ url }) => {
        if (url.includes("/assets/")) parsed.add(path.basename(new URL(url).pathname));
      });
      // Debugger.enable lists scripts already parsed in this renderer, even before this session attached.
      await cdp.send("Debugger.enable");
    }
    const homeFiles = [...parsed];
    const inboxMsStart = performance.now();
    await page.getByRole("button", { name: "收件箱", exact: true }).first().click();
    await page.getByTestId("inbox-module").waitFor();
    const inboxMs = performance.now() - inboxMsStart;
    const inboxFiles = [...parsed];

    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    const file = build.legacy ? page.getByRole("button", { name: /冷启动探针/ }).first() : page.locator('[data-testid="notes-resource-tree"] [data-item-path="冷启动探针.md"]');
    try {
      await file.waitFor();
    } catch (error) {
      const state = await page.evaluate(() => ({
        notes: !!document.querySelector('[data-testid="notes-module"]'),
        tree: document.querySelector('[data-testid="notes-resource-body"]')?.textContent,
        error: document.querySelector('[role="alert"]')?.textContent,
        activeModule: document.querySelector('[aria-current="page"]')?.getAttribute("aria-label"),
      }));
      throw new Error(`首篇笔记文件行未就绪：${JSON.stringify(state)}`, { cause: error });
    }
    await page.evaluate(() => {
      document.addEventListener("keydown", () => performance.mark("first-note-click"), { capture: true, once: true });
    });
    await file.press("Enter");
    const target = build.legacy ? ".cm-content" : ".ProseMirror";
    const handle = await page.waitForFunction(
      ({ text, selector }) => {
        const editor = document.querySelector(`[data-testid="markdown-editor"] ${selector}[contenteditable="true"]`);
        const mark = performance.getEntriesByName("first-note-click")[0];
        return mark && editor?.textContent?.includes(text) && editor.getClientRects().length ? performance.now() - mark.startTime : false;
      },
      { text: fixtureText, selector: target },
      { polling: "raf", timeout: 15_000 },
    );
    const noteMs = await handle.jsonValue();
    const noteFiles = [...parsed];
    const editorAt = (files) => files.filter((name) => chunkName.test(name));
    const byPhase = { home: editorAt(homeFiles), inbox: editorAt(inboxFiles), note: editorAt(noteFiles) };
    if (traceModules && !build.legacy && (byPhase.home.length || byPhase.inbox.length || !byPhase.note.some((name) => name.startsWith("rich-")))) {
      throw new Error(`编辑器块加载时机异常：${JSON.stringify(byPhase)}`);
    }
    return { homeMs, inboxMs, noteMs, modules: traceModules ? { editor: byPhase, all: { home: homeFiles, inbox: inboxFiles, note: noteFiles } } : undefined };
  } finally {
    await app.close();
    rmSync(dir, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
  }
}

const observations = Object.fromEntries(builds.map(({ name }) => [name, []]));
let failures = 0;
try {
  for (let sample = 1; sample <= launches; sample++) {
    for (const build of sample % 2 ? builds : [...builds].reverse()) {
      try {
        const result = await timeBuild(build, sample);
        observations[build.name].push(result);
        console.log(JSON.stringify({ build: build.name, sample, ...result }));
      } catch (error) {
        failures++;
        console.error(JSON.stringify({ build: build.name, sample, error: String(error) }));
      }
    }
  }
  for (const [build, samples] of Object.entries(observations)) {
    for (const metric of ["homeMs", "inboxMs", "noteMs"]) {
      const values = samples.map((sample) => sample[metric]).sort((a, b) => a - b);
      const percentile = (p) => values[Math.ceil(values.length * p) - 1];
      console.log(JSON.stringify({ build, metric, n: values.length, min: values[0], p50: percentile(0.5), p95: percentile(0.95), max: values.at(-1) }));
    }
  }
  if (failures) process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
