#!/usr/bin/env node
import { _electron as electron } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  options: { aa: { type: "boolean" }, pairs: { type: "string" }, "trace-modules": { type: "boolean" }, "nav-only": { type: "boolean" }, "frame-click": { type: "boolean" }, "rich-inbox": { type: "boolean" } },
  allowPositionals: true,
});
const aa = values.aa;
const [baselineRoot, count] = aa ? [null, positionals[0]] : positionals;
if ((!aa && !baselineRoot) || positionals.length > (aa ? 1 : 2) || (count !== undefined && values.pairs !== undefined)) {
  throw new Error("用法：node scripts/measure-notes-startup.mjs (<rc.4 worktree> | --aa) [每侧次数 | --pairs N] [--trace-modules | --nav-only] [--frame-click] [--rich-inbox]");
}
const pairsRequested = Number(values.pairs ?? count ?? 20);
const traceModules = values["trace-modules"];
const navOnly = values["nav-only"];
const frameClick = values["frame-click"];
// --rich-inbox：收件正文带行内格式，走完整 Markdown 阅读路径；可见文本与普通样本相同。
const richInbox = values["rich-inbox"];
if (navOnly && traceModules) throw new Error("--nav-only 不包含编辑器加载场景，不能与 --trace-modules 一起使用");
if (!Number.isSafeInteger(pairsRequested) || pairsRequested < 1) throw new Error("采样对数必须为正整数");
const fixtureText = "这是一篇用于测量初次打开时间的笔记";
const taskTitle = "冷启动任务探针";
const inboxTitle = "冷启动收件探针";
const inboxBody = "用于测量收件箱冷启动。";
const fixtureDate = "2026-01-01T00:00:00Z";
const readyTimeout = 30_000;
const bootstrapResamples = 10_000;
const bootstrapSeed = 20261120;

const candidate = { name: "candidate", root: path.resolve(import.meta.dirname, "../apps/desktop"), legacy: false };
const builds = aa
  ? [
      { ...candidate, name: "candidate-a" },
      { ...candidate, name: "candidate-b" },
    ]
  : [{ name: "rc4", root: path.resolve(baselineRoot, "apps/desktop"), legacy: true }, candidate];
const homeData = {
  selector: '[data-testid="home-module"] [data-testid="card-open"] strong',
  text: /^\d/,
  frameMetric: "homeDataMs",
  locatorMetric: "homeDataLocatorMs",
};
const earlyNavigation = [
  {
    id: "tasks",
    name: "任务",
    selector: '[data-testid="tasks-module"] main.tasks-task-main [data-testid="task-row"] .tasks-task-name > span:first-child',
    text: new RegExp(`^${taskTitle}$`),
    frameMetric: "tasksEarlyNavDataMs",
    locatorMetric: "tasksEarlyNavDataLocatorMs",
    fixtureDir: "Tasks",
    frontmatter: {
      huhu: { kind: "task", id: "task-startupprobe", schema: 2 },
      title: taskTitle,
      type: "human",
      status: "not_started",
      origin: { kind: "desktop" },
      createdAt: fixtureDate,
      updatedAt: fixtureDate,
    },
    body: "<task>\n\n用于测量任务冷启动。\n\n</task>\n",
  },
  {
    id: "inbox",
    name: "收件箱",
    selector: '[data-testid="inbox-module"] .inbox-knowledge-inbox-main .inbox-knowledge-inbox-detail > h2',
    text: new RegExp(`^${inboxTitle}$`),
    frameMetric: "inboxEarlyNavDataMs",
    locatorMetric: "inboxEarlyNavDataLocatorMs",
    fixtureDir: "Inbox",
    frontmatter: {
      huhu: { kind: "capture", id: "cap-startupprobe", schema: 1 },
      title: inboxTitle,
      source: "quick",
      status: "pending",
      createdAt: fixtureDate,
    },
    body: richInbox ? "**用于测量**收件箱冷启动。\n" : `${inboxBody}\n`,
    bodyProbe: {
      selector: '[data-testid="inbox-module"] .inbox-knowledge-inbox-note',
      text: new RegExp(`^${inboxBody}$`),
      frameMetric: "inboxBodyMs",
      locatorMetric: "inboxBodyLocatorMs",
    },
  },
];
const navigationMetrics = earlyNavigation.flatMap(({ id, frameMetric, locatorMetric, bodyProbe }) => [
  frameMetric,
  locatorMetric,
  `${id}RailReadyMs`,
  `${id}RailClickMs`,
  `${id}ClickToDataMs`,
  ...(bodyProbe ? [bodyProbe.frameMetric, bodyProbe.locatorMetric] : []),
]);
const metrics = navOnly ? navigationMetrics : ["homeMs", "homeLocatorMs", "inboxMs", "noteMs", homeData.frameMetric, homeData.locatorMetric, ...navigationMetrics];
const chunkName = /^(?:rich-|host-fetch-|NoteEditorSurface-|explorer-|ok-globals-|katex-).*\.(js|css)$/;
const sizeOf = (dir) =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((file) => file.isFile())
    .reduce((bytes, file) => bytes + statSync(path.join(file.parentPath, file.name)).size, 0);

function createFixture(fixture) {
  const indexed = path.join(fixture, "测量数据");
  mkdirSync(indexed, { recursive: true });
  for (let i = 0; i < 40; i++) {
    const folder = path.join(indexed, `文件夹${i}`);
    mkdirSync(folder);
    for (let j = 0; j < 50; j++) writeFileSync(path.join(folder, `笔记${j}.md`), fixtureText.repeat(20));
  }
  writeFileSync(path.join(fixture, "冷启动探针.md"), `# 冷启动探针\n\n${fixtureText}\n`);
}

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
console.log(
  JSON.stringify({
    machine: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length,
    launches: pairsRequested,
    pairsRequested,
    coldLaunchesPerBuildPerPair: navOnly ? 2 : 3,
    fixtureNotes: 2001,
    earlyNavigation: "fresh process, profile and vault; click the target rail button as soon as actionable",
    clickDriver: frameClick ? "trusted pointer from first hit-testable renderer frame" : "Playwright locator actionability",
    bootstrapResamples,
    bootstrapSeed,
  }),
);

async function withColdLaunch(build, sample, measure, scenario) {
  const dir = path.join(scratch, `${build.name}-${sample}-${scenario?.id ?? "home"}`);
  const vault = path.join(dir, "vault");
  let app;
  try {
    cpSync(fixture, vault, { recursive: true });
    if (scenario) {
      const fixtureDir = path.join(vault, scenario.fixtureDir);
      mkdirSync(fixtureDir, { recursive: true });
      const fields = Object.entries(scenario.frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
      writeFileSync(path.join(fixtureDir, "startup-probe.md"), `---\n${fields.join("\n")}\n---\n\n${scenario.body}`);
    }
    const launchStart = performance.now();
    app = await electron.launch({
      args: [build.root, "--no-sandbox", `--user-data-dir=${path.join(dir, "profile")}`],
      env: { ...process.env, HUHU_VAULT: vault },
    });
    return await measure(await app.firstWindow(), launchStart);
  } finally {
    try {
      await app?.close();
    } finally {
      rmSync(dir, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

async function timeVisibleData(page, launchStart, { selector, text, frameMetric, locatorMetric }) {
  const frame = page
    .waitForFunction(
      ({ selector, pattern }) => {
        const item = document.querySelector(selector);
        if (!item || !new RegExp(pattern).test(item.textContent.trim())) return false;
        const rect = item.getBoundingClientRect();
        return rect.width && rect.height && getComputedStyle(item).visibility === "visible" ? performance.timeOrigin + performance.now() : false;
      },
      { selector, pattern: text.source },
      { polling: "raf", timeout: readyTimeout },
    )
    .then((handle) => handle.jsonValue());
  const locator = page
    .locator(selector)
    .filter({ hasText: text })
    .waitFor({ timeout: readyTimeout })
    .then(() => performance.now() - launchStart);
  try {
    const [frameTimestamp, locatorMs] = await Promise.all([frame, locator]);
    return { [frameMetric]: frameTimestamp - (performance.timeOrigin + launchStart), [locatorMetric]: locatorMs };
  } catch (error) {
    throw new Error(`${frameMetric} 未就绪：${error.message}`, { cause: error });
  }
}

async function timeHomeAndNote(build, sample) {
  return withColdLaunch(build, sample, async (page, launchStart) => {
    // Keep the original serial locator measurement in parallel with the in-page endpoint.
    const homeFrame = page
      .waitForFunction(
        () => {
          const home = document.querySelector('[data-testid="home-module"]');
          const rect = home?.getBoundingClientRect();
          if (!rect?.width || !rect.height || getComputedStyle(home).visibility !== "visible") return false;
          if (document.querySelector('[data-testid="engine-state"]')?.textContent !== "引擎就绪") return false;
          return performance.timeOrigin + performance.now();
        },
        null,
        { polling: "raf", timeout: 30_000 },
      )
      .then((handle) => handle.jsonValue());
    const homeLocator = (async () => {
      await page.getByTestId("home-module").waitFor();
      await page.waitForFunction(() => document.querySelector('[data-testid="engine-state"]')?.textContent === "引擎就绪", null, { timeout: 30_000, polling: "raf" });
      return performance.now() - launchStart;
    })();
    const [homeFrameTimestamp, homeLocatorMs, homeDataTimes] = await Promise.all([homeFrame, homeLocator, timeVisibleData(page, launchStart, homeData)]);
    const homeMs = homeFrameTimestamp - (performance.timeOrigin + launchStart);
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
    return { homeMs, homeLocatorMs, ...homeDataTimes, inboxMs, noteMs, modules: traceModules ? { editor: byPhase, all: { home: homeFiles, inbox: inboxFiles, note: noteFiles } } : undefined };
  });
}

async function timeBuild(build, sample) {
  const result = navOnly ? {} : await timeHomeAndNote(build, sample);
  for (const scenario of earlyNavigation) {
    const times = await withColdLaunch(
      build,
      sample,
      async (page, launchStart) => {
        const button = page.locator(".shell-rail-item").and(page.getByRole("button", { name: scenario.name, exact: true }));
        // Record the actual trusted click in the same renderer clock as data readiness.
        // Otherwise launch-to-data cannot distinguish delayed input from slow module loading.
        await page.evaluate((name) => {
          document.addEventListener(
            "click",
            function onRailClick(event) {
              const rail = event.target instanceof Element && event.target.closest(".shell-rail-item");
              if (!event.isTrusted || !rail || rail.getAttribute("aria-label") !== name) return;
              performance.mark("startup-rail-click");
              document.removeEventListener("click", onRailClick, true);
            },
            true,
          );
        }, scenario.name);
        const railReady = page
          .waitForFunction(
            (name) => {
              const rail = [...document.querySelectorAll("button.shell-rail-item:not(:disabled)")].find((item) => item.getAttribute("aria-label") === name);
              if (!rail || rail.closest('[aria-disabled="true"]')) return false;
              const { x, y, width, height } = rail.getBoundingClientRect();
              const cx = x + width / 2;
              const cy = y + height / 2;
              if (!width || !height || !rail.contains(document.elementFromPoint(cx, cy))) return false;
              return { x: cx, y: cy, timestamp: performance.timeOrigin + performance.now() };
            },
            scenario.name,
            { polling: "raf", timeout: readyTimeout },
          )
          .then((handle) => handle.jsonValue());
        const click = frameClick ? railReady.then(({ x, y }) => page.mouse.click(x, y)) : button.click({ timeout: readyTimeout });
        const [dataTimes, { timestamp: readyTimestamp }, , bodyTimes] = await Promise.all([
          timeVisibleData(page, launchStart, scenario),
          railReady,
          click,
          scenario.bodyProbe ? timeVisibleData(page, launchStart, scenario.bodyProbe) : undefined,
        ]);
        const clickTimestamp = await page.evaluate(() => performance.timeOrigin + (performance.getEntriesByName("startup-rail-click", "mark")[0]?.startTime ?? NaN));
        if (!Number.isFinite(clickTimestamp)) throw new Error(`${scenario.name} 未捕获到导航点击`);
        const clickMs = clickTimestamp - (performance.timeOrigin + launchStart);
        return {
          ...dataTimes,
          ...bodyTimes,
          [`${scenario.id}RailReadyMs`]: readyTimestamp - (performance.timeOrigin + launchStart),
          [`${scenario.id}RailClickMs`]: clickMs,
          [`${scenario.id}ClickToDataMs`]: dataTimes[scenario.frameMetric] - clickMs,
        };
      },
      scenario,
    );
    Object.assign(result, times);
  }
  return result;
}

function percentile(sorted, p) {
  return sorted[Math.ceil(sorted.length * p) - 1];
}

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[middle]) / 2;
}

function bootstrapMedianInterval(deltas) {
  if (deltas.length === 0) return null;
  let state = bootstrapSeed;
  const sample = new Float64Array(deltas.length);
  const medians = new Float64Array(bootstrapResamples);
  for (let draw = 0; draw < medians.length; draw++) {
    for (let i = 0; i < sample.length; i++) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      sample[i] = deltas[Math.floor((state / 2 ** 32) * deltas.length)];
    }
    sample.sort();
    medians[draw] = median(sample);
  }
  medians.sort();
  return [percentile(medians, 0.025), percentile(medians, 0.975)];
}

const observations = Object.fromEntries(builds.map(({ name }) => [name, new Map()]));
const scratch = mkdtempSync(path.join(tmpdir(), "huhu-notes-startup-"));
const fixture = path.join(scratch, "fixture");
let failures = 0;
try {
  createFixture(fixture);
  for (let sample = 1; sample <= pairsRequested; sample++) {
    for (const build of sample % 2 ? builds : [...builds].reverse()) {
      try {
        const result = await timeBuild(build, sample);
        observations[build.name].set(sample, result);
        console.log(JSON.stringify({ build: build.name, sample, ...result }));
      } catch (error) {
        failures++;
        console.error(JSON.stringify({ build: build.name, sample, error: String(error) }));
      }
    }
  }
  for (const [build, samples] of Object.entries(observations)) {
    for (const metric of metrics) {
      const values = [...samples.values()].map((sample) => sample[metric]).sort((a, b) => a - b);
      console.log(JSON.stringify({ build, metric, n: values.length, min: values[0] ?? null, p50: percentile(values, 0.5) ?? null, p95: percentile(values, 0.95) ?? null, max: values.at(-1) ?? null }));
    }
  }
  const [left, right] = builds.map(({ name }) => name);
  const pairedSamples = [...observations[left]].filter(([sample]) => observations[right].has(sample));
  for (const metric of metrics) {
    const deltas = pairedSamples.map(([sample, first]) => observations[right].get(sample)[metric] - first[metric]).sort((a, b) => a - b);
    const pairs = deltas.length;
    console.log(
      JSON.stringify({
        baseline: left,
        candidate: right,
        metric,
        pairs,
        pairedMedianDeltaMs: pairs ? median(deltas) : null,
        candidateSlowerPairs: deltas.filter((delta) => delta > 0).length,
        pairedMedianDelta95CiMs: bootstrapMedianInterval(deltas),
      }),
    );
  }
  if (failures) process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
