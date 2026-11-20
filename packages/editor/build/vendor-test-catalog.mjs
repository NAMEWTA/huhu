import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "../../..");
const archive = join(root, ".agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence");
const parity = join(root, ".agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const [ok, orca] = gunzipSync(readFileSync(join(archive, "source-file-catalog.jsonl.gz")))
  .toString()
  .trim()
  .split("\n")
  .map(JSON.parse);
const okResults = process.argv[3] ?? join(root, "packages/editor/test-results/vendor.json");
const results = [...readJson(okResults).testResults, ...readJson(process.argv[2]).testResults];
const byTarget = new Map(
  results.map((row) => [
    row.name
      .replaceAll("\\", "/")
      .split(`${root.replaceAll("\\", "/")}/`)
      .at(-1),
    row,
  ]),
);
const known = new Map(readJson(join(archive, "vendor-tests-na.json")).map(({ file, reason }) => [`packages/${file}`, reason]));
for (const line of readFileSync(join(parity, "dom-tests-applicability.md"), "utf8").split("\n")) {
  const decision = /^\| `([^`]+)` \| [^|]+ \| 不适用 \| (.+) \|$/.exec(line);
  if (decision) known.set(decision[1], decision[2]);
}
const okExcludedAreas = new Map([
  [/^packages\/server\/src\/(?:acp|mcp|bash)\//, "Q2 冻结的知识库闭包不挂载上游 Agent 会话与工具服务"],
  [/^packages\/server\/src\/share\//, "Q2 不接上游 Share 服务"],
  [/^packages\/server\/src\/lint\//, "Q2 不接上游服务端 lint"],
  [/^packages\/server\/src\/embeddings\//, "宿主保留 Huhu 搜索与索引，上游嵌入服务未接入"],
  [/^packages\/server\/src\/seed\//, "原项目的种子装载服务未挂载，Huhu 独立装载示例 Vault"],
  [/^packages\/app\/src\/components\/acp\//, "Q2 不接上游 Agent 对话，Huhu Agent CLI 独立"],
  [/^packages\/app\/src\/lib\/(?:acp|handoff)\//, "Q2 不接上游 Agent 对话与 handoff"],
  [/^packages\/app\/src\/components\/handoff\//, "Q2 不挂载上游 Agent handoff 组件"],
  [/^packages\/app\/src\/lib\/share\//, "Q2 不接上游 Share 会话"],
  [/^packages\/core\/src\/(?:acp|agent-registry|skills-catalog)\//, "Q2 所测的上游 Agent 协议、注册表或安装功能未接入"],
]);
const orcaNotApplicable = new Map([
  ["image-viewer-zoom-ownership.test.tsx", "ORCA 窗口缩放路由未迁入，Huhu 使用自己的查看器焦点处理"],
  ["pdf-viewer-zoom-ownership.test.tsx", "ORCA 分组命令所有权未迁入，Huhu 使用查看器本地快捷键"],
  ["use-pdf-viewer-find-shortcut.test.tsx", "依赖 ORCA 全局键盘路由。OP-D09 行为等价待确认"],
  ["pdf-viewer-failed-load-recovery.test.tsx", "Huhu 的 PdfView 自行渲染错误及重载状态。OP-D09 外壳等价待确认"],
  ["pdfjs-viewer-assets-stream.test.ts", "测试 ORCA 开发服务的背压与文件句柄清理。Huhu 构建时复制静态 PDF.js 资源，未接 ORCA 响应流"],
  ["cdp-print-to-pdf.test.ts", "测试 ORCA 浏览器 CDP 导出的句柄、游标与过期回收。Huhu PDF 查看器不提供打印到 PDF 流"],
]);
const substitutes = new Map([
  ["packages/app/src/editor/editor-cache.test.ts", "tests/e2e/knowledge/editor-s2b.spec.ts 验证打开、切换与写盘，缓存上限仍缺断言"],
  ["packages/server/src/link-preview/guarded-fetch.test.ts", "packages/editor/test/link-preview-main.test.ts 对主进程拒绝本地地址、实际 HTTP 读取及字节和截止时间有断言，其余上游边界仍待核对"],
  ["packages/server/src/link-preview/html-metadata.test.ts", "packages/editor/test/link-preview-main.test.ts 断言实际响应的标题和描述，其余上游解析边界仍待核对"],
  ["tests/e2e/pdf-find-counter.spec.ts", "tests/e2e/workflows/viewers.spec.ts 验证定位与计数，连续导航、改查词和重开后的计数待核对"],
  ["tests/e2e/pdf-viewer-rebuild-recovery.spec.ts", "tests/e2e/workflows/viewers.spec.ts 验证外部修改后不展示旧页面，多次失败再恢复待核对"],
  ["tests/e2e/pdf-viewer-reload-cleanup.spec.ts", "tests/e2e/workflows/viewers.spec.ts 验证重复打开关闭后的 DOM，worker、事件监听和本地化观察器逐项释放待核对"],
]);
const outcomes = [];
const skips = [];
for (const source of [ok, orca]) {
  for (const file of source.files) {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file.upstream)) continue;
    const row = file.target ? byTarget.get(file.target) : undefined;
    let status;
    let reason;
    if (row) {
      const failures = row.assertionResults.filter(({ status }) => status === "failed");
      const passed = row.assertionResults.filter(({ status }) => status === "passed");
      status = failures.length || row.status === "failed" ? "failed" : passed.length ? file.action : "skipped";
      reason = `${passed.length} 通过，${failures.length} 失败；实际 Vitest JSON 收集`;
      for (const result of row.assertionResults) {
        if (!["passed", "failed"].includes(result.status)) skips.push({ file: file.target, test: result.fullName, status: result.status, line: result.location?.line ?? null });
      }
    } else if (known.has(file.upstream) && source === ok) {
      status = "not-applicable";
      reason = known.get(file.upstream);
    } else if (substitutes.has(file.upstream)) {
      status = "partial";
      reason = substitutes.get(file.upstream);
    } else if (file.target) {
      status = "uncollected";
      reason = "目标已存在，运行结果未收集到该文件";
    } else if (source === ok && [...okExcludedAreas.keys()].some((area) => area.test(file.upstream))) {
      status = "not-applicable";
      reason = [...okExcludedAreas].find(([area]) => area.test(file.upstream))[1];
    } else if (source === ok && /^packages\/(?:app\/src\/(?:editor|components|lib|comments|hooks)|core\/src|server\/src)\//.test(file.upstream)) {
      status = "unreviewed";
      reason = "可能涉及本地组件、核心或服务端桥。需对照被测行为与 Huhu 的替代断言";
    } else if (source === orca && /(?:pdf|image-viewer-zoom)/i.test(file.upstream)) {
      const decision = orcaNotApplicable.get(file.upstream.split("/").at(-1));
      status = decision ? "not-applicable" : "unreviewed";
      reason = decision ?? "主题可能涉及 PDF。需对照 Huhu 的行为与测试";
    } else {
      status = "outside-product";
      reason = source === ok ? "路径位于固定本地编辑器实现和测试范围外" : "路径及名称位于 PDF 最小移植和构建资源范围外";
    }
    outcomes.push({ source: source.source, upstream: file.upstream, target: file.target, status, reason });
  }
}
const summary = {};
for (const { source, status } of outcomes) {
  summary[source] ??= {};
  summary[source][status] = (summary[source][status] ?? 0) + 1;
}
writeFileSync(join(archive, "vendor-test-catalog.json"), JSON.stringify({ summary, skips }, null, 2) + "\n");
writeFileSync(join(archive, "vendor-test-files.jsonl.gz"), gzipSync(outcomes.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { level: 9 }));
console.log(summary);
console.log(skips);
