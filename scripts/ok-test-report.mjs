#!/usr/bin/env node
// 读取 packages/editor/test-results/vendor.json（pnpm --filter @huhu/editor test:vendor 产出），
// 把上游测试分类并写 evidence/vendor-test-results.md（G04）：
//   通过 / 失败（被测模块在 vendor 里，真实失败）/ 不适用（被测模块不在 closure：git、acp、sharing 等）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ED = join(ROOT, 'packages/editor')
const r = JSON.parse(readFileSync(join(ED, 'test-results/vendor.json'), 'utf8'))
const rows = { pass: [], fail: [], na: [] }
for (const f of r.testResults) {
  const file = f.name.replace(/^.*packages\/editor\//, '')
  const stem = file.replace(/\.test\.ts$/, '').replace(/\.(uncached|parity|typelock)$/, '')
  const subjectExists = ['.ts', '.tsx', '/index.ts'].some((e) => existsSync(join(ED, stem + e)))
  const n = f.assertionResults.length
  const failed = f.assertionResults.filter((a) => a.status === 'failed').length
  const msg = (f.message || '').split('\n')[0].slice(0, 120)
  if (f.status === 'passed') rows.pass.push({ file, n })
  else if (!subjectExists || /test-support|\.\.\/\.\.\/scripts\/|ENOENT/.test(msg)) rows.na.push({ file, msg })
  else rows.fail.push({ file, n, failed, msg })
}
const applicable = rows.pass.length + rows.fail.length
const tests = r.numTotalTests
let md = `# 上游测试首版结果（core，node 环境）\n\n生成：\`node scripts/ok-test-report.mjs\`（数据 \`packages/editor/test-results/vendor.json\`，由 \`pnpm --filter @huhu/editor test:vendor\` 产出）。固定上游 \`44a2e0a\`。\n\n`
md += `| 项 | 数 |\n| --- | --- |\n| 测试文件总数 | ${r.testResults.length} |\n| 通过 | ${rows.pass.length} |\n| 失败（被测模块在 vendor 内） | ${rows.fail.length} |\n| 不适用（被测模块不在 closure / 依赖上游 test-support 或构建脚本） | ${rows.na.length} |\n| **适用文件通过率** | **${((rows.pass.length / applicable) * 100).toFixed(1)}%**（${rows.pass.length} / ${applicable}） |\n| 单测用例：通过 / 失败 / 总数 | ${r.numPassedTests} / ${r.numFailedTests} / ${tests} |\n\n阈值：适配后适用文件通过率 ≥ 70%（decisions OP-D02）。**范围说明**：只迁入了 core 的测试；app（含 85 个 jsdom dom 测试）依赖上游 \`tests/dom/jsdom-preload.ts\` 与 \`test-support/\`，**尚未迁入，不计入上述通过率**。\n\n## 失败（需适配或登记）\n\n${rows.fail.map((x) => `- \`${x.file}\`（${x.failed}/${x.n} 失败）${x.msg ? '：' + x.msg : ''}`).join('\n') || '无'}\n\n## 不适用（${rows.na.length}）\n\n${rows.na.map((x) => `- \`${x.file}\`${x.msg ? '：' + x.msg : ''}`).join('\n')}\n`
writeFileSync(join(ROOT, '.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/vendor-test-results.md'), md)
console.log({ files: r.testResults.length, pass: rows.pass.length, fail: rows.fail.length, na: rows.na.length, rate: ((rows.pass.length / applicable) * 100).toFixed(1) + '%' })
