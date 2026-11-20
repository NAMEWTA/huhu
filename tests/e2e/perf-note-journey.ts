import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpus, loadavg, platform, release, totalmem, arch } from "node:os";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHugeVault } from "../perf/huge-vault.js";
import { root } from "./helpers/launch.js";
import { treeFolder, treeItem, treeSettled } from "./helpers/tree.js";
import { call } from "./knowledge/session-slow-bridge.js";

const headline = "性能目标";
const neighbor = "切换对照";
const line = "这是一段长文正文，包含 **加粗**、`行内代码`与 [[链接]]。\n\n";
const anchors = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 条独立批注的正文锚点。`);
export const noteScenarios = ["large-vault", "long-document", "many-comments"] as const;

export function prepareNotes(vault: string, scenario: (typeof noteScenarios)[number]) {
  let files = 2;
  const folder = scenario === "large-vault" ? "000-perf" : null;
  if (folder) {
    files += createHugeVault(vault).files;
    mkdirSync(path.join(vault, folder));
  }
  const notes = folder ? path.join(vault, folder) : vault;
  const body = scenario === "long-document" ? line.repeat(Math.ceil(1024 ** 2 / Buffer.byteLength(line))) : anchors.join("\n\n") + "\n";
  const original = `# ${headline}\n\n${body}`;
  writeFileSync(path.join(notes, `${neighbor}.md`), `# ${neighbor}\n\n对照正文。\n`);
  const file = path.join(notes, `${headline}.md`);
  writeFileSync(file, original);
  return { file, folder, original, files, bytes: Buffer.byteLength(original), threads: scenario === "many-comments" ? anchors.length : 0, repliesPerThread: scenario === "many-comments" ? 2 : 0 };
}

export async function launchJourney(vault: string, profile: string) {
  mkdirSync(profile, { recursive: true });
  const app = await electron.launch({ args: [root, "--no-sandbox", `--user-data-dir=${profile}`], env: { ...process.env, HUHU_VAULT: vault } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 120_000 });
    return { app, page };
  } catch (error) {
    await app.close();
    throw error;
  }
}

export async function seedComments(page: Page, original: string) {
  for (const [index, quote] of anchors.entries()) {
    const start = original.indexOf(quote);
    const { id } = await call<{ id: string }>(page, "comments.create", { path: `${headline}.md`, start, end: start + quote.length, quote, text: `线程 ${index + 1}` });
    for (let reply = 1; reply <= 2; reply++) await call(page, "comments.reply", { id, text: `线程 ${index + 1} 的回复 ${reply}` });
  }
}

async function clockEditor(page: Page, target: Locator, title: string, comments: boolean) {
  await target.evaluate((node) => {
    Object.assign(window, { noteJourneyStarted: 0 });
    node.addEventListener("pointerdown", () => Object.assign(window, { noteJourneyStarted: performance.now() }), { once: true, capture: true });
  });
  await target.click();
  const result = await page.waitForFunction(
    ({ title, comments }) => {
      const started = (window as Window & { noteJourneyStarted?: number }).noteJourneyStarted;
      const editor = document.querySelector('[data-testid="markdown-editor"] [contenteditable="true"].ProseMirror, [data-testid="markdown-editor"] .cm-content[contenteditable="true"]');
      if (!started || !editor?.firstElementChild?.textContent?.includes(title) || !editor.getClientRects().length) return false;
      if (comments && document.querySelectorAll('[data-testid="comment-thread"]').length !== 30) return false;
      return { milliseconds: performance.now() - started };
    },
    { title, comments },
    { polling: "raf", timeout: 120_000 },
  );
  try {
    return (await result.jsonValue()).milliseconds;
  } finally {
    await result.dispose();
  }
}

async function readMemory(app: ElectronApplication, page: Page, vault: string) {
  const runtime = path.join(vault, ".huhu", "runtime");
  const engines = readdirSync(runtime).map((machine) => JSON.parse(readFileSync(path.join(runtime, machine, "engine.json"), "utf8")) as { pid: number });
  const renderer = await app.browserWindow(page);
  const rendererPid = await renderer.evaluate((window) => window.webContents.getOSProcessId());
  await renderer.dispose();
  const memory = await app.evaluate(
    ({ app }, { rendererPid, enginePids }) => {
      const processes = app.getAppMetrics();
      const renderer = processes.find((process) => process.pid === rendererPid);
      const engine = processes.find((process) => enginePids.includes(process.pid));
      if (!renderer || !engine) throw new Error("Electron 进程指标缺少 Renderer 或 Engine");
      return { rendererWorkingSetKiB: renderer.memory.workingSetSize, engineWorkingSetKiB: engine.memory.workingSetSize };
    },
    { rendererPid, enginePids: engines.map(({ pid }) => pid) },
  );
  expect(memory.rendererWorkingSetKiB).toBeGreaterThan(0);
  expect(memory.engineWorkingSetKiB).toBeGreaterThan(0);
  return memory;
}

export async function measureNoteJourney(app: ElectronApplication, page: Page, vault: string, fixture: ReturnType<typeof prepareNotes>) {
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await treeSettled(page);
  if (fixture.folder) await treeFolder(page, fixture.folder).click();
  if (fixture.threads) {
    // 打开对照笔记只为让批注栏就绪，然后关闭。目标笔记仍从未打开。
    await clockEditor(page, treeItem(page, `${neighbor}.md`), neighbor, false);
    await page.getByTestId("note-toolbar").getByRole("button", { name: "文档详情", exact: true }).click();
    await page.getByTestId("note-inspector").getByRole("tab", { name: "批注" }).click();
    await page.getByRole("button", { name: `关闭 ${neighbor}`, exact: true }).click();
  }
  const coldOpenMs = await clockEditor(page, treeItem(page, `${headline}.md`), headline, fixture.threads > 0);
  if (fixture.threads) {
    await expect(page.getByTestId("comment-thread").nth(fixture.threads - 1)).toBeVisible();
    const rows = await call<{ messages: unknown[]; state: string }[]>(page, "comments.list", { path: `${headline}.md` });
    expect(rows).toHaveLength(fixture.threads);
    for (const row of rows) {
      expect(row.state).toBe("anchored");
      expect(row.messages).toHaveLength(fixture.repliesPerThread + 1);
    }
  }
  await clockEditor(page, treeItem(page, `${neighbor}.md`), neighbor, false);
  const hotSwitchMs = await clockEditor(page, page.getByTestId("document-tab").filter({ hasText: headline }), headline, fixture.threads > 0);

  const editor = page.getByTestId("markdown-editor").locator('.ProseMirror[contenteditable="true"], .cm-content[contenteditable="true"]');
  const heading = editor.getByText(fixture.bytes >= 1024 ** 2 ? `# ${headline}` : headline, { exact: true });
  await heading.click();
  await page.keyboard.press("End");
  await editor.evaluate((element, text) => {
    Object.assign(window, { noteInputMs: null });
    element.addEventListener(
      "keydown",
      () => {
        const started = performance.now();
        const changed = new MutationObserver(() => {
          if (!element.firstElementChild?.textContent?.includes(text)) return;
          changed.disconnect();
          Object.assign(window, { noteInputMs: performance.now() - started });
        });
        changed.observe(element, { subtree: true, childList: true, characterData: true });
      },
      { once: true, capture: true },
    );
  }, `${headline}x`);

  const saveStarted = performance.now();
  await page.keyboard.press("x");
  const result = await page.waitForFunction(
    () => {
      const milliseconds = (window as Window & { noteInputMs?: number }).noteInputMs;
      return typeof milliseconds === "number" && { milliseconds };
    },
    null,
    { timeout: 15_000 },
  );
  const inputMs = (await result.jsonValue()).milliseconds;
  await result.dispose();
  const expected = fixture.original.replace(`# ${headline}`, `# ${headline}x`);
  // 采自动保存。在确认完整字节前只轮询短前缀，减少大文件反复分配和磁盘检查开销。
  const deadline = saveStarted + 30_000;
  const expectedPrefix = Buffer.from(`# ${headline}x\n`);
  const prefix = Buffer.alloc(expectedPrefix.length);
  const saved = () => {
    const fd = openSync(fixture.file, "r");
    try {
      return readSync(fd, prefix, 0, prefix.length, 0) === prefix.length && prefix.equals(expectedPrefix);
    } finally {
      closeSync(fd);
    }
  };
  while (!saved() && performance.now() < deadline) await delay(10);
  const saveMs = performance.now() - saveStarted;
  expect(readFileSync(fixture.file)).toEqual(Buffer.from(expected));
  return { coldOpenMs, hotSwitchMs, inputMs, saveMs, ...(await readMemory(app, page, vault)) };
}

export async function journeyMachine(app: ElectronApplication) {
  const versions = await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome }));
  return {
    ...versions,
    os: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryMiB: Math.round(totalmem() / 1024 ** 2),
    load: loadavg(),
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  };
}

export function journeyPercentiles(samples: Awaited<ReturnType<typeof measureNoteJourney>>[]) {
  return Object.fromEntries(
    Object.keys(samples[0]!).map((key) => {
      const metric = key as keyof (typeof samples)[number];
      const values = samples.map((sample) => sample[metric]).sort((a, b) => a - b);
      return [metric, { p50: values[Math.ceil(values.length * 0.5) - 1], p95: values[Math.ceil(values.length * 0.95) - 1] }];
    }),
  );
}
