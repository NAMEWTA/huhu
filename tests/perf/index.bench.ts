import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, bench, describe } from "vitest";
import { VaultIndex } from "../../packages/vault/src/index/vault-index.js";

/** 规模 Vault：5,000 篇中文笔记，分布在 50 个文件夹，带标签与双链。目标见 quality.md §3：全量索引 ≤ 15 s、检索 p95 ≤ 150 ms。 */
const NOTES = Number(process.env["HUHU_PERF_NOTES"] ?? 5000);
const WORDS = ["发布", "计划", "复盘", "架构", "接口", "性能", "索引", "笔记", "任务", "档案", "自动化", "版本", "同步", "终端", "保险箱", "插件", "网关", "编辑器", "批注", "回收站"];
let root = "";
let index: VaultIndex;
const rnd = (n: number) => Math.floor(Math.random() * n);

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "huhu-scale-"));
  for (let i = 0; i < NOTES; i++) {
    const dir = path.join(root, `文件夹${i % 50}`);
    mkdirSync(dir, { recursive: true });
    const body = Array.from({ length: 40 }, (_, k) => `${WORDS[(i + k) % WORDS.length]}${WORDS[(i * 7 + k) % WORDS.length]}相关的第 ${k} 段内容，链接 [[笔记${(i + 1) % NOTES}]]。`).join("\n");
    writeFileSync(path.join(dir, `笔记${i}.md`), `# 笔记${i}\n\n#${WORDS[i % WORDS.length]}\n\n${body}\n`);
  }
  index = new VaultIndex(root);
  const t0 = performance.now();
  await index.build();
  console.log(`[perf] ${NOTES} 篇笔记全量索引 ${(performance.now() - t0).toFixed(0)} ms（目标 ≤ 15000 ms）`);
}, 120_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("scale-vault", () => {
  bench("全文检索（随机词）", () => {
    index.query(`${WORDS[rnd(WORDS.length)]}${WORDS[rnd(WORDS.length)]}`, { limit: 20 });
  });
  bench(
    "重建索引（全量，已有索引）",
    async () => {
      await index.build();
    },
    { iterations: 3, warmupIterations: 0 },
  );
});
