#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { arch, cpus, hostname, release, totalmem } from "node:os";
import path from "node:path";

const [before, after, outputDirectory, repetitions = "3"] = process.argv.slice(2);
const repeat = Number(repetitions);
if (!before || !after || !outputDirectory || !Number.isSafeInteger(repeat) || repeat < 2 || process.platform !== "linux") {
  throw new Error("Usage on Linux: node scripts/compare-inventory-resources.mjs BEFORE_CHECKOUT AFTER_CHECKOUT OUTPUT_DIRECTORY [REPETITIONS>=2]");
}
const output = path.resolve(outputDirectory);
const coreBinary = process.env.HUHU_HERDR_BIN && realpathSync(process.env.HUHU_HERDR_BIN);
if (!coreBinary) throw new Error("Set HUHU_HERDR_BIN to the same fixed Core binary for both revisions.");

function readCommand(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command}: ${result.stderr}`);
  return result.stdout.trim();
}

function measure(cwd, name, args, environment, logDir) {
  const log = openSync(path.join(logDir, `${name}.log`), "wx");
  try {
    const result = spawnSync("volta", ["run", "--node", "24.22.1", "pnpm", ...args], {
      cwd,
      env: { ...process.env, HUHU_HERDR_BIN: coreBinary, ...environment },
      stdio: ["ignore", log, log],
    });
    if (result.error || result.status !== 0) throw result.error ?? new Error(`${name} exited ${result.status}; see ${logDir}`);
  } finally {
    closeSync(log);
  }
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const exact = (observed, expected, label) => {
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`Correctness gate failed: ${label}`);
};
const candidates = Object.fromEntries(
  Object.entries({ before, after }).map(([name, checkout]) => {
    const cwd = realpathSync(checkout);
    const sha = readCommand(cwd, "git", ["rev-parse", "HEAD"]);
    const diff = readCommand(cwd, "git", ["diff", "HEAD", "--binary"]);
    const desktop = path.join(cwd, "apps/desktop/out/build-info.json");
    if (!existsSync(desktop)) throw new Error(`Missing Lead-built desktop at ${desktop}`);
    return [name, { cwd, sha, trackedDiffSha256: createHash("sha256").update(diff).digest("hex"), desktop: readJson(desktop) }];
  }),
);
if (candidates.before.cwd === candidates.after.cwd) throw new Error("Use separate prepared checkouts for the two candidates.");
mkdirSync(output, { recursive: true });

function attachments(report, directory) {
  const observations = [];
  function add(suite) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests) {
        if (test.status !== "expected" || test.results.at(-1)?.status !== "passed") throw new Error(`Missing passing result: ${spec.title}`);
        for (const attachment of (test.results.at(-1)?.attachments ?? []).filter(({ contentType }) => contentType === "application/json")) {
          if (!["f09-agent-history", "f12-mime-journey", "f23-save-journey"].includes(attachment.name)) continue;
          const content = attachment.body === undefined ? readFileSync(path.resolve(directory, attachment.path), "utf8") : Buffer.from(attachment.body, "base64").toString("utf8");
          observations.push({ name: attachment.name, result: JSON.parse(content) });
        }
      }
    for (const child of suite.suites ?? []) add(child);
  }
  for (const suite of report.suites) add(suite);
  exact(observations.map(({ name }) => name).sort(), ["f09-agent-history", "f12-mime-journey", "f23-save-journey"], "Playwright measurements");
  return observations;
}

function runSample(name, round) {
  const { cwd } = candidates[name];
  const destination = path.join(output, `${round}-${name}`);
  mkdirSync(destination);
  const activityFile = path.join(destination, "activity.json");
  const automationFile = path.join(destination, "automation.json");
  const playwrightReport = path.join(destination, "playwright.json");
  measure(
    cwd,
    "activity",
    ["exec", "vitest", "run", "plugins/tasks/test/activity-reconciliation.test.ts"],
    {
      HUHU_F11_BENCH: "1",
      HUHU_F11_ASSERT_ACTIVITY: "0",
      HUHU_ACTIVITY_COST_OUTPUT: activityFile,
    },
    destination,
  );
  measure(
    cwd,
    "automation",
    ["exec", "vitest", "run", "apps/engine/test/automation-cost.test.ts"],
    {
      HUHU_AUTOMATION_COST_ASSERT: "0",
      HUHU_AUTOMATION_COST_OUTPUT: automationFile,
    },
    destination,
  );
  measure(
    cwd,
    "workbench",
    ["e2e", "tests/e2e/perf.spec.ts", "-g", "F09 Agent 历史分页|F12 同一 MIME|F23 大库正文", "--workers=1", "--retries=0", "--reporter=json", "--output", path.join(destination, "playwright-artifacts")],
    { HUHU_AGENT_HISTORY_PERF: "1", HUHU_MAIL_PERF: "1", HUHU_F23_BASELINE: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightReport },
    destination,
  );
  const activity = readJson(activityFile);
  const automation = readJson(automationFile);
  exact(
    activity.samples.map(({ closed, active, correct, traces }) => [closed, active, correct, traces.length]),
    [0, 1000, 10000].map((closed) => [closed, 2, true, 5]),
    "fixed dispatch workload",
  );
  exact(
    automation.samples.map(({ historyCount, clients, activeRules, liveSessions, notifications }) => [historyCount, clients, activeRules, liveSessions, notifications]),
    [0, 1000, 10000].flatMap((closed) => [1, 3, 0].map((clients) => [closed, clients, 1, 1, 1])),
    "fixed observation workload",
  );
  exact(
    automation.cleanup.map(({ socketRemoved, coreReaped, sessionReaped }) => [socketRemoved, coreReaped, sessionReaped]),
    [
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ],
    "Core cleanup",
  );
  return { candidate: name, round, activity, automation, workbench: attachments(readJson(playwrightReport), cwd) };
}

function compare(measurements) {
  const metrics = new Map();
  for (const { candidate, activity, automation, workbench } of measurements) {
    const add = (group, row) => {
      for (const [metric, value] of Object.entries(row)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const key = `${group}/${metric}`;
        if (!metrics.has(key)) metrics.set(key, { before: [], after: [] });
        metrics.get(key)[candidate].push(value);
      }
    };
    for (const { closed, traces } of activity.samples) for (const trace of traces) add(`F11/${closed}`, trace);
    for (const sample of automation.samples) {
      const key = `AU18/${sample.historyCount}/${sample.clients}`;
      const { historyCount: _history, clients: _clients, core, results: _results, ...data } = sample;
      add(key, data);
      const { queryCounts, ...resources } = core;
      add(`${key}/core`, resources);
      add(`${key}/core-queries`, queryCounts);
    }
    for (const { name, result } of workbench) {
      if (Array.isArray(result.samples)) {
        for (const { stage, kind, ...data } of result.samples) add(`${name}/${stage ?? kind}`, data);
      } else add(name, result);
    }
  }
  const statistics = (values) => {
    const ranked = values.toSorted((a, b) => a - b);
    return ranked.length ? { count: ranked.length, median: ranked[Math.ceil(ranked.length / 2) - 1], p95: ranked[Math.ceil(ranked.length * 0.95) - 1], min: ranked[0], max: ranked.at(-1) } : null;
  };
  return Object.fromEntries(
    [...metrics].map(([key, sides]) => {
      const before = statistics(sides.before);
      const after = statistics(sides.after);
      return [key, { before, after, medianDelta: before && after ? after.median - before.median : null }];
    }),
  );
}

const measurements = [];
const evidence = {
  format: 1,
  host: {
    hostname: hostname(),
    release: release(),
    arch: arch(),
    memoryBytes: totalmem(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    coreClockTicksPerSecond: Number(readCommand(process.cwd(), "getconf", ["CLK_TCK"])),
    coreSha256: createHash("sha256").update(readFileSync(coreBinary)).digest("hex"),
  },
  candidates,
  repeat,
  measurements,
};
for (let round = 1; round <= repeat; round++) {
  for (const name of round % 2 === 1 ? ["before", "after"] : ["after", "before"]) {
    measurements.push(runSample(name, round));
    writeFileSync(path.join(output, "comparison.json"), JSON.stringify({ ...evidence, comparisons: compare(measurements) }, null, 2) + "\n");
  }
}
