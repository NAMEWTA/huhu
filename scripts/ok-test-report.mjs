#!/usr/bin/env node
// G04：上游测试三分类结果表 → evidence/vendor-test-results.md
//   通过   = 迁入且原样（SHA 与 tests-manifest 一致）通过
//   适配后通过 = 迁入但为适配 Huhu 改过（PATCHES.md 的 P-T-xx / 依赖对齐），通过
//   不适用 = 没迁入（ok-tests-prune.mjs 记录在 vendor-tests-na.json，逐条写原因）
// 输入：packages/editor/test-results/vendor.json（pnpm --filter @huhu/editor test:vendor 产出）。
// 口径：阈值 70% 按“(通过 + 适配后通过) / (全部上游测试文件 − 不适用)”计算，不适用必须有原因。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ED = join(ROOT, "packages/editor");
const EV = join(ROOT, ".agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence");
const r = JSON.parse(readFileSync(join(ED, "test-results/vendor.json"), "utf8"));
const na = JSON.parse(readFileSync(join(EV, "vendor-tests-na.json"), "utf8"));
const testsMan = JSON.parse(readFileSync(join(EV, "tests-manifest.json"), "utf8"));
const V = join(ED, "src/vendor/open-knowledge");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

const passAsIs = [];
const passAdapted = [];
const failed = [];
for (const f of r.testResults) {
  const rel = f.name.replace(/^.*src\/vendor\/open-knowledge\//, "");
  const same = testsMan[rel] && existsSync(join(V, rel)) && sha(join(V, rel)) === testsMan[rel];
  if (f.status !== "passed") failed.push({ rel, msg: (f.message || "").split("\n")[0].slice(0, 160) });
  else if (same) passAsIs.push(rel);
  else passAdapted.push(rel);
}
const total = r.testResults.length + na.length;
const applicable = total - na.length;
const rate = (((passAsIs.length + passAdapted.length) / applicable) * 100).toFixed(1);
const byReason = new Map();
for (const x of na) {
  const key = x.reason.replace(/被测模块 \S+ /, "被测模块 <…> ").replace(/（\.\.?\/[^）]*）/, "");
  byReason.set(key, (byReason.get(key) ?? 0) + 1);
}
let md = `# 上游测试结果（G04，三分类）

生成：\`node scripts/ok-test-report.mjs\`（数据 \`packages/editor/test-results/vendor.json\` ← \`pnpm --filter @huhu/editor test:vendor\`；不适用清单 \`vendor-tests-na.json\` ← \`scripts/ok-tests-prune.mjs\`；原样基线 \`tests-manifest.json\` ← \`ok-patches.mjs --write-tests-manifest\`）。固定上游 \`44a2e0a\`。

| 项 | 数 |
| --- | --- |
| 上游测试文件（已评估） | ${total} |
| 通过（上游原样） | ${passAsIs.length} |
| 适配后通过 | ${passAdapted.length} |
| 失败 | ${failed.length} |
| 不适用（没迁入，逐条有原因） | ${na.length} |
| **适用文件通过率** | **${rate}%**（${passAsIs.length + passAdapted.length} / ${applicable}） |
| 单测用例：通过 / 失败 / 跳过 | ${r.numPassedTests} / ${r.numFailedTests} / ${r.numPendingTests ?? 0} |

阈值：≥ 70%（decisions OP-D02）。**范围**：core 的 node 测试 + app/comments 的非 dom 测试；app 的 jsdom dom 测试（上游 85 个 \`*.dom.test.*\`）依赖上游 \`tests/dom/jsdom-preload.ts\` 与 \`test-support/\`，**未迁入、不在分母里**——这是范围缺口，不是通过（见 progress.md 的“未验证”）。

## 失败

${failed.map((x) => `- \`${x.rel}\`：${x.msg}`).join("\n") || "无"}

## 适配后通过（${passAdapted.length}）

${passAdapted.map((x) => `- \`${x}\``).join("\n") || "无"}

适配内容见 \`packages/editor/src/vendor/open-knowledge/PATCHES.md\`（P-T-xx）与 \`pnpm-workspace.yaml\` 的依赖对齐 overrides（例：\`mdast-util-gfm-task-list-item\` 浮到 2.0.1 时 \`extensions/list.test.ts\` 的任务项序列化用例失败 → 钉回上游锁文件版本 2.0.0 后通过，这是测试抓到的真实行为差异）。

## 不适用（${na.length}，按原因汇总）

${[...byReason].map(([k, v]) => `- ${v} × ${k}`).join("\n")}

### 逐条

${na.map((x) => `- \`${x.file}\`：${x.reason}`).join("\n")}
`;
writeFileSync(join(EV, "vendor-test-results.md"), md);
console.log({ total, passAsIs: passAsIs.length, passAdapted: passAdapted.length, failed: failed.length, na: na.length, rate: rate + "%" });
