import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { VaultIndex } from "../src/index/vault-index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("1 MiB 的笔记也能在数秒内建立索引并被检索到（不拖垮 Engine 启动）", async () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-big-"));
  dirs.push(d);
  const line = "这是一行用于测试大文档打开速度的正文，包含 **加粗**、`行内代码` 与 [[链接]]。\n";
  writeFileSync(path.join(d, "大文档.md"), `# 大文档\n\n${line.repeat(Math.ceil((1024 * 1024) / Buffer.byteLength(line)))}`);
  writeFileSync(path.join(d, "小.md"), "# 小\n\n独一无二的词语：量子纠缠\n");
  const t0 = performance.now();
  const index = new VaultIndex(d);
  await index.build();
  expect(performance.now() - t0).toBeLessThan(10_000);
  expect(index.query("量子纠缠").hits.map((h) => h.path)).toContain("小.md");
  expect(index.query("加粗").hits.map((h) => h.path)).toContain("大文档.md");
});
