import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { arch, cpus, hostname, platform, release, tmpdir, totalmem } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, bench, describe } from "vitest";
import { VaultIndex } from "../../packages/vault/src/index/vault-index.js";

const notes = Number(process.env["HUHU_PERF_NOTES"] ?? 5000);
const directory = process.env["HUHU_PERF_OUTPUT"];
const baselineFile = process.env["HUHU_PERF_BASELINE"];
const positiveControl = process.env["HUHU_PERF_REGRESSION"] === "query";
const seed = 20261124;
const sampleCount = 9;
const batchSize = 24;
const paragraphs = 40;
const folders = 50;
const words = ["发布", "计划", "复盘", "架构", "接口", "性能", "索引", "笔记", "任务", "档案"];
const samples: Sample[] = [];
type Stage = "rebuild" | "search";
type Sample = { stage: Stage; iteration: number; ms: number; rssBytes: number; correct: boolean };
const host = { hostname: hostname(), os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, cores: cpus().length, memoryBytes: totalmem() };
const runtime = { node: process.version, electron: process.versions.electron ?? null, mode: "vitest-source" };
const scenario = { seed, notes, paragraphs, folders, sampleCount, batchSize, warmup: "one build and one search batch", cache: "same corpus, warmed filesystem cache" };
const queries: { text: string; expected: string }[] = [];
let root = "";
let digest = "";
let corpusBytes = 0;
let index: VaultIndex;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
}

function summarize(stage: Stage) {
  const values = samples
    .filter((sample) => sample.stage === stage)
    .map(({ ms }) => ms)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const median = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const mad = percentile(
    values.map((value) => Math.abs(value - median)).sort((a, b) => a - b),
    0.5,
  );
  return { count: values.length, median, p95, variance, mad, peakSampleRssBytes: Math.max(...samples.filter((sample) => sample.stage === stage).map(({ rssBytes }) => rssBytes)) };
}

function searchBatch(): boolean {
  for (const { text, expected } of queries) {
    const { indexing, hits } = index.query(text, { limit: 20 });
    if (indexing || hits.length !== 1 || hits[0]?.path !== expected) return false;
  }
  return true;
}

function record(stage: Stage, elapsed: number, correct: boolean): void {
  const iteration = samples.filter((sample) => sample.stage === stage).length + 1;
  if (iteration <= sampleCount) samples.push({ stage, iteration, ms: elapsed, rssBytes: process.memoryUsage.rss(), correct });
  if (!correct) throw new Error(`性能样本正确性失败：${stage} #${iteration}`);
}

beforeAll(async () => {
  if (!Number.isSafeInteger(notes) || notes < 1) throw new Error("HUHU_PERF_NOTES 必须为正整数");
  if (baselineFile && !directory) throw new Error("对比时使用 HUHU_PERF_OUTPUT 保留原始样本");
  root = mkdtempSync(path.join(tmpdir(), "huhu-index-bench-"));
  const hash = createHash("sha256");
  const notePath = (n: number) => `文件夹${n % folders}/笔记${n}.md`;
  const marker = (n: number) => `benchfixture${String(n).padStart(8, "0")}`;
  for (let n = 0; n < notes; n++) {
    const relative = notePath(n);
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    const body = Array.from({ length: paragraphs }, (_, p) => `${words[(seed + n + p) % words.length]}相关的第 ${p} 段，链接 [[笔记${(n + 1) % notes}]]。`).join("\n");
    const text = `# 笔记${n}\n\n#${words[n % words.length]}\n\n${marker(n)}\n${body}\n`;
    writeFileSync(full, text);
    hash.update(relative).update("\0").update(text).update("\0");
    corpusBytes += Buffer.byteLength(text);
  }
  let state = seed;
  for (let n = 0; n < batchSize; n++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const choice = state % notes;
    queries.push({ text: marker(choice), expected: notePath(choice) });
  }
  digest = hash.digest("hex");
  index = new VaultIndex(root);
  if (!(await index.build()) || index.counts().files !== notes || !searchBatch()) throw new Error("基准预热结果不符合固定样本");
}, 120_000);

afterAll(() => {
  try {
    const summary = { rebuild: summarize("rebuild"), search: summarize("search") };
    const identity = { host, runtime, scenario, data: { digest, bytes: corpusBytes } };
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const violations: string[] = [];
    const comparison: Record<string, unknown> = {};
    const correct = samples.length === 2 * sampleCount && samples.every((sample) => sample.correct);
    if (!correct) violations.push("样本数量或正确性不符合约定");
    if (baselineFile) {
      const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as { identity: typeof identity; correct: boolean; positiveControl: boolean; summary: typeof summary };
      if (JSON.stringify(baseline.identity) !== JSON.stringify(identity) || !baseline.correct || baseline.positiveControl) violations.push("基线的机器、运行方式、工作负载或正确性不可比");
      else
        for (const stage of ["rebuild", "search"] as const) {
          const base = baseline.summary[stage];
          const candidate = summary[stage];
          if (!base || !candidate) continue;
          // Leave room for measured baseline variation and a minimum relative guard band.
          const tolerance = Math.max(0.15, (base.p95 - base.median) / base.median, (3 * base.mad) / base.median);
          const limit = base.median * (1 + tolerance);
          comparison[stage] = { baselineMedianMs: base.median, candidateMedianMs: candidate.median, tolerance, limitMs: limit };
          if (candidate.median > limit) violations.push(`${stage} median ${candidate.median.toFixed(3)} ms > ${limit.toFixed(3)} ms`);
        }
    }
    const report = { commit, identity, correct, positiveControl, samples, summary, comparison, violations };
    if (directory) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, "index-benchmark.json"), JSON.stringify(report, null, 2) + "\n");
      writeFileSync(path.join(directory, "index-benchmark.csv"), "stage,iteration,ms,rssBytes,correct\n" + samples.map((s) => [s.stage, s.iteration, s.ms, s.rssBytes, s.correct].join(",")).join("\n") + "\n");
    }
    console.info("[index benchmark]", JSON.stringify({ commit, summary, comparison, violations }));
    if (violations.length) throw new Error(violations.join("；"));
  } finally {
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("scale-vault", () => {
  const options = { iterations: sampleCount, time: 0, warmupIterations: 0, warmupTime: 0 };
  bench(
    "重建索引（固定数据）",
    async () => {
      const started = performance.now();
      const built = await index.build();
      const elapsed = performance.now() - started;
      record("rebuild", elapsed, built && index.counts().files === notes);
    },
    options,
  );
  bench(
    "全文检索（固定命中和顺序）",
    () => {
      const started = performance.now();
      let correct = searchBatch();
      if (positiveControl) {
        // Duplicate real work while preserving exactly the same observable result.
        for (let extra = 0; extra < 7; extra++) correct = searchBatch() && correct;
      }
      record("search", performance.now() - started, correct);
    },
    options,
  );
});
