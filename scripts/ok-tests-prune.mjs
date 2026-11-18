#!/usr/bin/env node
// G04：把“被测模块 / 助手不在 vendor 闭包里”的上游测试从 vendor 目录移除，并把清单与原因写入
// evidence/vendor-tests-na.json（不适用 = 没迁入，不再作为失败留在 test:vendor 里）。
// 输入：packages/editor/test-results/vendor.json（pnpm --filter @huhu/editor test:vendor 产出）。
// 只处理“加载失败（Cannot find module / ENOENT / 缺包）”或 `NA_ASSERT` 明确列出的文件；真实断言失败不会被删除。
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ED = join(ROOT, "packages/editor");
const NA_FILE = join(ROOT, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/vendor-tests-na.json");
// 加载成功但断言的是“上游仓库其他包的源码”的测试：不适用
const NA_ASSERT = {
  "core/src/logging/renderer-capture-scrub-coverage.uncached.test.ts": "扫描上游 app/ 与 desktop/ 的渲染进程日志源码；这些源码不在 Huhu 闭包里",
};
const r = JSON.parse(readFileSync(join(ED, "test-results/vendor.json"), "utf8"));
const prev = existsSync(NA_FILE) ? JSON.parse(readFileSync(NA_FILE, "utf8")) : [];
const rows = new Map(prev.map((x) => [x.file, x]));

function reasonOf(file, msg) {
  const miss = /Cannot find (?:module|package) '([^']+)'/.exec(msg);
  if (miss) {
    const m = miss[1];
    if (/test-support|\/scripts\//.test(m)) return `依赖上游仓库的 ${m.includes("test-support") ? "test-support" : "scripts"}（${m}），Huhu 不携带`;
    if (!m.startsWith(".")) return `依赖未安装的包 ${m}（所测功能不在闭包里）`;
    return `被测模块 ${m} 不在编辑器闭包里（所测功能 Huhu 不使用）`;
  }
  if (/ENOENT/.test(msg)) return "读取上游仓库的 docs / 其他包路径（不随闭包迁入）";
  return null;
}

let removed = 0;
for (const f of r.testResults) {
  if (f.status === "passed") continue;
  const file = f.name.replace(/^.*src\/vendor\/open-knowledge\//, "");
  const msg = f.message || f.assertionResults.find((a) => a.status === "failed")?.failureMessages?.[0] || "";
  const loadFailure = f.assertionResults.length === 0 || f.assertionResults.every((a) => a.status !== "failed");
  const reason = NA_ASSERT[file] ?? (loadFailure || /ENOENT/.test(msg) ? reasonOf(file, msg) : null);
  if (!reason) {
    console.log("保留（真实失败）：", file, msg.split("\n")[0].slice(0, 120));
    continue;
  }
  rows.set(file, { file, reason });
  const abs = join(ED, "src/vendor/open-knowledge", file);
  if (existsSync(abs)) {
    rmSync(abs);
    removed++;
  }
}
writeFileSync(
  NA_FILE,
  JSON.stringify(
    [...rows.values()].sort((a, b) => a.file.localeCompare(b.file)),
    null,
    2,
  ) + "\n",
);
console.log(`removed ${removed}, na total ${rows.size}`);
