import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createOkParityRun, okParitySource } from "../../../scripts/ok-parity-paths.mjs";

const root = resolve(import.meta.dirname, "../../..");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const adaptation = readJson(join(okParitySource, "vendor-test-adaptation.json"));
const reviewedOkTests = readJson(join(okParitySource, "vendor-test-subject-review.json"));
const [ok, orca] = gunzipSync(readFileSync(join(okParitySource, "source-file-catalog.jsonl.gz")))
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
const orcaFindUpstream = "src/renderer/src/components/editor/PdfFind.test.tsx";
const orcaFindComponent = "plugins/notes/test/orca-pdf-find.test.tsx";
const orcaFindAssertions = ["subscribes before a synchronous cached result on reopening", "keeps empty queries clear even if a pending scan reports late", "admits the changed query when the real PDF.js controller resets its match arrays"];
const orcaFindResult = byTarget.get(orcaFindComponent);
const orcaFindPassed = orcaFindResult?.status === "passed" && orcaFindAssertions.every((title) => orcaFindResult.assertionResults.some((result) => result.fullName === title && result.status === "passed"));
const orcaE2ETitles = new Map([
  [orcaFindUpstream, "G04 ORCA：重新打开 PDF 查找保留查询并读取缓存，清空后隐藏计数"],
  ["src/renderer/src/components/editor/use-pdf-viewer-find-shortcut.test.tsx", "OP-D09 PDF 查找快捷键归属当前知识库分栏，焦点和文件重开可用"],
  ["tests/e2e/pdf-find-counter.spec.ts", "G04 ORCA：PDF 查找计数和活动高亮随导航及查询更新，关闭时清除高亮"],
  ["tests/e2e/pdf-viewer-rebuild-recovery.spec.ts", "G04 ORCA：重复加载坏 PDF 后恢复，错误时不会保留旧页"],
]);
const orcaE2EFile = "tests/e2e/workflows/viewers.spec.ts";
const orcaE2EPasses = new Map();
const orcaE2EExpected = new Set(orcaE2ETitles.values());
for (const file of process.argv.slice(4)) {
  const report = readJson(file);
  const pending = [...report.suites];
  while (pending.length) {
    const suite = pending.pop();
    pending.push(...(suite.suites ?? []));
    for (const spec of suite.specs ?? []) {
      if (resolve(report.config.rootDir, spec.file) !== join(root, orcaE2EFile) || !orcaE2EExpected.has(spec.title)) continue;
      if (!spec.tests.some((test) => test.results.length)) continue;
      const passed = spec.tests.every((test) => test.status === "expected" && test.results.at(-1)?.status === "passed");
      orcaE2EPasses.set(spec.title, passed);
    }
  }
}
const known = new Map(readJson(join(okParitySource, "vendor-tests-na.json")).map(({ file, reason }) => [`packages/${file}`, reason]));
for (const line of readFileSync(join(okParitySource, "dom-tests-applicability.md"), "utf8").split("\n")) {
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
  ["pdf-viewer-failed-load-recovery.test.tsx", "固定上游直接替换 PdfViewer 的 Base64 content prop 及面板 owner，Huhu 按 Vault 路径读取 ranges 并重挂文档。外壳适配经 OP-D09 批准，用户可见恢复与资源清理分别由两条 E2E 项跟踪"],
  ["pdfjs-viewer-assets-stream.test.ts", "测试 ORCA 开发服务的背压与文件句柄清理。Huhu 构建时复制静态 PDF.js 资源，未接 ORCA 响应流"],
  ["cdp-print-to-pdf.test.ts", "测试 ORCA 浏览器 CDP 导出的句柄、游标与过期回收。Huhu PDF 查看器不提供打印到 PDF 流"],
]);
const substitutes = new Map([
  ["src/renderer/src/components/editor/use-pdf-viewer-find-shortcut.test.tsx", "tests/e2e/workflows/viewers.spec.ts OP-D09 实测当前分栏接管、焦点和再次打开；ORCA 浮动窗格不属于 Huhu 拓扑"],
  ["packages/app/src/editor/editor-cache.test.ts", "tests/e2e/knowledge/editor-s2b.spec.ts 验证打开、切换与写盘，缓存上限仍缺断言"],
  ["packages/server/src/link-preview/guarded-fetch.test.ts", "packages/editor/test/link-preview-main.test.ts 对主进程拒绝本地地址、实际 HTTP 读取及字节和截止时间有断言，其余上游边界仍待核对"],
  ["packages/server/src/link-preview/html-metadata.test.ts", "packages/editor/test/link-preview-main.test.ts 断言实际响应的标题和描述，其余上游解析边界仍待核对"],
  ["tests/e2e/pdf-find-counter.spec.ts", "需收集 Electron 导航、活动高亮所在文本、切换查询、关闭清除高亮和重开的测试"],
  ["tests/e2e/pdf-viewer-rebuild-recovery.spec.ts", "tests/e2e/workflows/viewers.spec.ts 验证外部修改后不展示旧页面，多次失败再恢复待核对"],
  ["tests/e2e/pdf-viewer-reload-cleanup.spec.ts", "tests/e2e/workflows/viewers.spec.ts 验证重复打开关闭后的 DOM，worker、事件监听和本地化观察器逐项释放待核对"],
]);
// Omitted server domains known to belong to OK's own cloud/project lifecycle.
// Keep unproven coverage in the denominator instead of making a broad path-based exclusion.
const serverOnly =
  /^(?:acp|agent|audit|auth|backup|billing|branch|channel|checkout|cloud|cron|daemon|dispatch|github|handoff|heritage|lint|oauth|otel|presence|publish|release|remote|run-session|share|shadow|skill|staging|sync|telemetry|tunnel|worktree)(?:[.-]|$)/;
const upstreamTest = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const possibleOkTests = /^packages\/(?:app\/src\/(?:editor|components|lib|comments|hooks)|core\/src|server\/src)\//;
const moduleExtension = /\.[cm]?[jt]sx?$/;

// Suites whose subject is named differently from the test file. These entries
// describe the implementation exercised by the assertions, including suites
// that call it through OK's composed listener or an upstream test helper.
const okSubjects = [
  [/^app\/src\/components\/agent-panel-selection-label\./, "app/src/components/command-palette-commands.ts"],
  [/^app\/src\/components\/command-palette-(?:chat-history-side|dock-moves|new-skill|open-in-new-window)\./, "app/src/components/command-palette-commands.ts"],
  [/^app\/src\/components\/command-palette-(?:flicker|vocabulary)\./, "app/src/components/command-palette-search.ts"],
  [/^app\/src\/components\/settings\/markdownlint-rule-toggle\./, "app/src/components/settings/markdownlint-rule-browser.tsx"],
  [/^app\/src\/editor\/(?:provider-pool-|qa-001-crash-window\.)/, "app/src/editor/provider-pool.ts"],
  [/^app\/src\/editor\/editor-cache-visible-scroll-container\./, "app/src/editor/editor-cache.ts"],
  [/^app\/src\/editor\/list-boundary-merge\./, "core/src/extensions/list-boundary-merge.ts"],
  [/^app\/src\/editor\/image-upload\/(?:media-drop-shape-invariant|single-file-upload)\./, "app/src/editor/image-upload/index.ts"],
  [/^app\/src\/editor\/source-polish\/engine-invariants\./, "app/src/editor/source-polish/engine-invariants.reads.ts"],
  [/^app\/src\/editor\/slash-command\/(?:auto-open-flag|focus-inserted-component)\./, "app/src/editor/slash-command/component-items.tsx"],
  [/^app\/src\/lib\/palette-paint-strengths\./, "core/scripts/chrome-resolver.ts"],
  [/^server\/src\/api-agent-integrations(?:[-.])/, "server/src/http/agent-integrations-routes.ts"],
  [/^server\/src\/api-(?:agent-write|agent-control-admission)(?:[-.])/, "server/src/http/agent-write-routes.ts"],
  [/^server\/src\/api-artifact-body-control-admission\./, "server/src/http/api-pipeline.ts"],
  [/^server\/src\/api-artifact-flush-settlement\./, "server/src/persistence.ts"],
  [/^server\/src\/api-(?:agent-frontmatter|agent-patch|agent-session-capacity|docname-validation|empty-docname|patch|write-link-policy)(?:[-.])/, "server/src/api-extension.ts"],
  [/^server\/src\/api-(?:asset|asset-text)\./, "server/src/http/asset-routes.ts"],
  [/^server\/src\/api-(?:backlinks|forward-links-local-targets|link-graph|resolved-link-views|suggest-links)(?:[-.])/, "server/src/http/link-graph-routes.ts"],
  [/^server\/src\/api-comments-composition\./, "server/src/http/comment-routes.ts"],
  [/^server\/src\/api-(?:create-page|document|pages|tags)(?:[-.])/, "server/src/http/document-routes.ts"],
  [/^server\/src\/(?:api-(?:file-ops|folder-delete-duplicate-disk-enum|folder-rename-disk-enum|rename|trash-cleanup)|rename-identity|resolve-upload-dest-dir)(?:[-.])/, "server/src/http/file-ops-routes.ts"],
  [/^server\/src\/api-(?:folder-config|folder-template|template-ancestry|template-get)(?:[-.])/, "server/src/http/folder-template-routes.ts"],
  [
    /^server\/src\/api-(?:config|git-composition|history-composition|lint|local-op-composition|metrics-composition|seed-composition|share-composition|sync-composition|system-actions-composition|workspace-tools-composition)(?:[-.])/,
    "server/src/api-extension.ts",
  ],
  [/^server\/src\/api-(?:mcp|skill|skills)(?:[-.])/, "server/src/http/http-app.ts"],
  [/^server\/src\/api-(?:admission|content-admission-cause|opaque-origin-composition|request-id)(?:[-.])/, "server/src/http/api-pipeline.ts"],
  [/^server\/src\/(?:api-derived-index|api-search|link-classification-uniformity|local-target-watcher-integration)(?:[-.])/, "server/src/derived-document-index.ts"],
  [
    /^server\/src\/(?:boot-|collab-|composition-precedence|deployment-cases-composition|document-room-canonicalization|health-routes|http-limits|mcp-collab-composition|mcp-local-dispatch-parity|mcp-managed-rename-resolution|mcp-write-asset-placement|server-authority-retirement|server-exit-reason|server-freshness-default|server-head-watcher-degraded|server-shutdown-parcel-release|shutdown-progress)(?:[-.])?/,
    "server/src/boot.ts",
  ],
  [/^server\/src\/(?:file-watcher-|watcher-resubscribe|polled-watcher-contract)/, "server/src/file-watcher.ts"],
  [/^server\/src\/(?:persistence-|serialize-doc-vs-git-show-byte-equality|serialize-doc-ytext|save-version)/, "server/src/persistence.ts"],
  [/^server\/src\/(?:process-lock-|desktop-attach-contract)/, "server/src/process-lock.ts"],
  [/^server\/src\/process-scan-/, "server/src/process-scan.ts"],
  [/^server\/src\/git-preflight-/, "server/src/git-preflight.ts"],
  [/^server\/src\/(?:content-filter-|showall-)/, "server/src/content-filter.ts"],
];
const reviewedServerSubjects = new Map(
  Object.entries({
    "config-telemetry": "config-persistence.ts",
    "backlink-resolution": "backlink-index.ts",
    "document-durability-cache": "document-durability-state.ts",
    "external-change-private-state": "external-change.ts",
    "fs-copy-observer": "fs-traced.ts",
    "head-watcher-parcel-release": "head-watcher.ts",
    "local-target-index-telemetry": "local-target-index.ts",
    "shell-identity": "http/shell-csp.ts",
  }),
);

function subjectsFor(upstream, byPath, byStem) {
  const relative = upstream.slice("packages/".length);
  const reviewed = relative.startsWith("server/src/") ? reviewedServerSubjects.get(relative.split("/").at(-1).replace(upstreamTest, "")) : undefined;
  const mapped = reviewed ? `server/src/${reviewed}` : okSubjects.find(([pattern]) => pattern.test(relative))?.[1];
  if (mapped) {
    const subject = byPath.get(`packages/${mapped}`);
    if (!subject) throw new Error(`G01 缺少 ${upstream} 的被测模块：${mapped}`);
    return [subject];
  }
  // Dot-separated suites such as .dom / .browser / .collab exercise the
  // module prefix. Hyphenated filenames are distinct unless reviewed above.
  let stem = upstream.replace(upstreamTest, "");
  while (true) {
    const subjects = [...(byStem.get(stem.toLowerCase()) ?? []), ...(byStem.get(stem.toLowerCase() + "/index") ?? [])];
    if (subjects.length) return subjects;
    const parent = stem.replace(/\.[^/.]+$/, "");
    if (parent === stem) return [];
    stem = parent;
  }
}

const outcomes = [];
const skips = [];
for (const source of [ok, orca]) {
  const byPath = new Map(source.files.map((file) => [file.upstream, file]));
  const byStem = new Map();
  for (const module of source.files) {
    if (!moduleExtension.test(module.upstream) || upstreamTest.test(module.upstream)) continue;
    const stem = module.upstream.replace(moduleExtension, "").toLowerCase();
    const matches = byStem.get(stem) ?? [];
    matches.push(module);
    byStem.set(stem, matches);
  }
  for (const file of source.files) {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file.upstream)) continue;
    const row = file.target ? byTarget.get(file.target) : undefined;
    const reviewed = source === ok ? reviewedOkTests[file.upstream] : undefined;
    const orcaTitle = source === orca ? orcaE2ETitles.get(file.upstream) : undefined;
    let target = file.target;
    let status;
    let reason;
    let subjects;
    let closureExcluded = false;
    if (source === orca && file.upstream === orcaFindUpstream) {
      const electron = orcaE2EPasses.get(orcaTitle);
      target = orcaFindComponent;
      status = electron === false || orcaFindResult?.status === "failed" ? "failed" : electron && orcaFindPassed ? "patch" : "partial";
      reason = `组件断言（${orcaFindPassed ? "通过" : "未全部通过或未收集"}）：同步缓存订阅顺序、清空及改词后的晚旧回执、PDF.js 控制器重新交付；Electron 收集（${electron === true ? "通过" : electron === false ? "失败" : "缺失"}）：${orcaTitle}`;
    } else if (source === ok && known.has(file.upstream)) {
      // A collected fixture does not change the recorded scope of the shipped application.
      status = "not-applicable";
      reason = known.get(file.upstream);
    } else if (row) {
      const failures = row.assertionResults.filter(({ status }) => status === "failed");
      const passed = row.assertionResults.filter(({ status }) => status === "passed");
      const unexecuted = row.assertionResults.filter(({ status }) => !["passed", "failed"].includes(status));
      if (failures.length || row.status === "failed") status = "failed";
      else if (!passed.length) status = "skipped";
      else if (source === orca && unexecuted.length) status = "partial";
      else status = file.action;
      reason = `${passed.length} 通过，${failures.length} 失败；实际 Vitest JSON 收集`;
      for (const result of unexecuted) {
        skips.push({ file: file.target, test: result.fullName, status: result.status, line: result.location?.line ?? null });
      }
    } else if (orcaTitle && orcaE2EPasses.has(orcaTitle)) {
      status = orcaE2EPasses.get(orcaTitle) ? "patch" : "failed";
      target = orcaE2EFile;
      reason = `实际 Electron Playwright 收集：${orcaTitle}`;
    } else if (reviewed) {
      const { testedModule, testedTarget } = reviewed;
      const subject = testedModule ? byPath.get(testedModule) : null;
      if (testedModule && !subject?.target) throw new Error(`G01 缺少复核确认的交付模块：${testedModule}`);
      if (testedTarget && !existsSync(join(root, testedTarget))) throw new Error(`找不到复核确认的 Huhu 模块：${testedTarget}`);
      subjects = subject ? [subject] : undefined;
      const production = subject?.target ?? testedTarget;
      closureExcluded = !production;
      status = closureExcluded ? "not-applicable" : "needs-adaptation";
      reason = production ? `被测模块已交付（${production}）：${reviewed.reason}；需要适配` : `被测主体未交付：${reviewed.reason}`;
    } else if (substitutes.has(file.upstream)) {
      status = "partial";
      reason = substitutes.get(file.upstream);
    } else if (file.target) {
      status = "needs-adaptation";
      reason = `目标 ${file.target} 已存在，运行结果未收集到；待接入普通测试项目`;
    } else if (source === ok && [...okExcludedAreas.keys()].some((area) => area.test(file.upstream))) {
      status = "not-applicable";
      reason = [...okExcludedAreas].find(([area]) => area.test(file.upstream))[1];
    } else if (source === ok && file.upstream.startsWith("packages/server/src/") && serverOnly.test(file.upstream.split("/").at(-1))) {
      status = "not-applicable";
      reason = `固定 OK 测试 ${file.upstream} 所属云／项目服务未接入（Q2／Q10）；Huhu 本地 Vault 不使用该服务`;
    } else if (source === ok && possibleOkTests.test(file.upstream)) {
      status = "needs-adaptation";
      subjects = subjectsFor(file.upstream, byPath, byStem);
      if (subjects.length && subjects.every(({ target }) => !target)) {
        status = "not-applicable";
        closureExcluded = true;
        reason = `被测模块未进入闭包；G01：${subjects.map(({ upstream, action, reason }) => `${upstream} (${action}，${reason})`).join("；")}`;
      } else {
        const targets = subjects.flatMap(({ target }) => (target ? [target] : []));
        reason = targets.length ? `被测模块已交付（G01：${targets.join("、")}）；按上游夹具、环境及行为断言适配` : "固定测试主体尚未与 G01 模块确认对应；保留在适用分母";
      }
    } else if (source === orca && /(?:pdf|image-viewer-zoom)/i.test(file.upstream)) {
      const decision = orcaNotApplicable.get(file.upstream.split("/").at(-1));
      status = decision ? "not-applicable" : "needs-adaptation";
      reason = decision ?? "PDF.js 细节瓦片设备像素及尺寸读次数契约涉及共同补丁；需要在集成性能／专项阶段验证。";
    } else {
      status = "outside-product";
      reason = source === ok ? "路径位于固定本地编辑器实现和测试范围外" : "路径及名称位于 PDF 最小移植和构建资源范围外";
    }
    if (status === "needs-adaptation" && adaptation[file.upstream]) reason += `；${adaptation[file.upstream]}`;
    outcomes.push({
      source: source.source,
      upstream: file.upstream,
      target,
      status,
      reason,
      ...(subjects?.length ? { testedModules: subjects.map(({ upstream }) => upstream) } : {}),
      ...(closureExcluded ? { closureExcluded: true } : {}),
    });
  }
}
const summary = {};
for (const { source, status } of outcomes) {
  summary[source] ??= {};
  summary[source][status] = (summary[source][status] ?? 0) + 1;
}
const coverage = Object.fromEntries(
  Object.entries(summary).map(([source, counts]) => {
    const passed = (counts.copy ?? 0) + (counts.patch ?? 0);
    const denominator = outcomes.filter((row) => row.source === source && !["outside-product", "not-applicable"].includes(row.status)).length;
    const conservativeDenominator = denominator + outcomes.filter((row) => row.source === source && row.closureExcluded).length;
    const minimumFor70Percent = Math.ceil(denominator * 0.7);
    return [source, { passed, denominator, conservativeDenominator, minimumFor70Percent, additional: Math.max(0, minimumFor70Percent - passed) }];
  }),
);
const output = createOkParityRun("vendor-test-catalog");
writeFileSync(join(output, "vendor-test-catalog.json"), JSON.stringify({ summary, coverage, skips }, null, 2) + "\n");
writeFileSync(join(output, "vendor-test-files.jsonl.gz"), gzipSync(outcomes.map((entry) => JSON.stringify(entry)).join("\n") + "\n", { level: 9 }));
console.log(summary);
console.log(coverage);
console.log(skips);
console.log(`报告目录 ${output}`);
