# 上游测试结果（G04）

## 2026-11-20 固定来源与交付闭包分母

测试按固定 Git 树逐文件计数。OK 的通过数来自 Vitest，每个文件至少有一个通过用例且无失败。ORCA 还纳入通过 Electron 验证的 Huhu 适配用例。部分覆盖留在适用分母。跳过用例见 执行汇总（本机原件 `temp/dev/feature_2026-11-14-knowledge-ok-parity/integration/legacy-7984bff4/vendor-test-catalog.json`）。

- 已核完 112 个待定文件。40 个被测模块或行为随 Huhu 交付，仍需适配。72 个的被测主体未交付，从适用分母移除。逐文件测试主体及理由见 [复核记录](../../../../../../../docs/upstream/ok-parity/vendor-test-subject-review.json)，生产源码对应关系见 [G01 来源清单](source-file-catalog.md)。
- 原先确认的 604 个未交付模块继续按逐文件理由记为不适用。原保守口径将这 604 个与本轮排除的 72 个都计入分母。Q2 排除仍按现有具体理由登记。
- 本轮 OK 测试运行通过 530 个文件、9,182 个用例，4 个用例跳过。适用通过数计 488 个原样上游文件及 28 个适配文件。另有 4 个本地测试文件，10 个已登记不适用的上游文件虽运行通过，仍按被测功能的交付范围排除。原样试跑失败或无终态的条目见 [适配清单](../../../../../../../docs/upstream/ok-parity/vendor-test-adaptation.json)。

| 固定源 | 交付闭包口径 | 原保守口径 | 70% 所需通过数（交付闭包口径） |
| --- | --- | --- | --- |
| OK `44a2e0a` | **516 / 639（80.75%）** | 516 / 1315（39.24%） | 448 |
| ORCA `7041ea02` | **8 / 11（72.73%）** | 8 / 11（72.73%） | 8 |

ORCA 的四个外壳适配套件使用 Electron 结果。其中查找栏还要求 [组件回归测试](../../../../../../../plugins/notes/test/orca-pdf-find.test.tsx#L27) 全部通过，覆盖重开时订阅先于同步缓存回执、清空及改词后忽略晚旧回执，以及真实 PDF.js 控制器重新交付新查询结果。计数套件同时检查活动高亮所在文本、关闭后的高亮清除以及重开后继续导航。[查找快捷键](../../../../../../../tests/e2e/workflows/viewers.spec.ts#L744) · [计数和高亮](../../../../../../../tests/e2e/workflows/viewers.spec.ts#L830) · [查找栏重开](../../../../../../../tests/e2e/workflows/viewers.spec.ts#L888) · [坏文件恢复](../../../../../../../tests/e2e/workflows/viewers.spec.ts#L915)

ORCA 分母仍含细节瓦片设备像素、尺寸读取次数，以及重载后的资源释放完整性。这三项未计作通过。设备像素及尺寸读次数待专项验证，现有重载清理仅有 DOM 证据。完整状态见 逐文件 JSONL（本机原件 `temp/dev/feature_2026-11-14-knowledge-ok-parity/integration/legacy-7984bff4/vendor-test-files.jsonl.gz`）。

---

## 2026-11-15 历史三分类结果

生成：`node scripts/ok-test-report.mjs`（数据 `packages/editor/test-results/vendor.json` ← `pnpm --filter @huhu/editor test:vendor`；不适用清单 `vendor-tests-na.json` ← `scripts/ok-tests-prune.mjs`；原样基线 `tests-manifest.json` ← `ok-patches.mjs --write-tests-manifest`）。固定上游 `44a2e0a`。

| 项 | 数 |
| --- | --- |
| 上游测试文件（已评估） | 238 |
| 通过（上游原样） | 167 |
| 适配后通过 | 1 |
| 失败 | 0 |
| 不适用（没迁入，逐条有原因） | 70 |
| **适用文件通过率** | **100.0%**（168 / 168） |
| 单测用例：通过 / 失败 / 跳过 | 4210 / 0 / 2 |

阈值：≥ 70%（decisions OP-D02）。**范围**：core 的 node 测试 + app/comments 的非 dom 测试；app 的 jsdom dom 测试（上游 85 个 `*.dom.test.*`）依赖上游 `tests/dom/jsdom-preload.ts` 与 `test-support/`，**未迁入、不在分母里**——这是范围缺口，不是通过（见 progress.md 的“未验证”）。

## 失败

无

## 适配后通过（1）

- `core/src/y-prosemirror-patch.test.ts`

适配内容见 `packages/editor/src/vendor/open-knowledge/PATCHES.md`（P-T-xx）与 `pnpm-workspace.yaml` 的依赖对齐 overrides（例：`mdast-util-gfm-task-list-item` 浮到 2.0.1 时 `extensions/list.test.ts` 的任务项序列化用例失败 → 钉回上游锁文件版本 2.0.0 后通过，这是测试抓到的真实行为差异）。

## 不适用（70，按原因汇总）

- 56 × 被测模块 <…> 不在编辑器闭包里（所测功能 Huhu 不使用）
- 8 × 依赖上游仓库的 test-support，Huhu 不携带
- 2 × 依赖上游仓库的 scripts，Huhu 不携带
- 2 × 读取上游仓库的 docs / 其他包路径（不随闭包迁入）
- 1 × 扫描上游 app/ 与 desktop/ 的渲染进程日志源码；这些源码不在 Huhu 闭包里
- 1 × 依赖未安装的包 culori（所测功能不在闭包里）

### 逐条

- `core/src/acp/agent-posture.test.ts`：被测模块 ./agent-posture.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/acp/codex-legacy-notice.test.ts`：依赖上游仓库的 test-support（../../../../test-support/fixtures/codex-legacy-warning-envelopes.json），Huhu 不携带
- `core/src/acp/permissive-mode.test.ts`：被测模块 ./permissive-mode.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/acp/thread-protocol.typelock.test.ts`：被测模块 ./thread-protocol.typelock.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/agent-registry/derived-tables.test.ts`：被测模块 ../acp/agent-posture.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/app-shell-csp.test.ts`：被测模块 ./app-shell-csp.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/burst-grouping.test.ts`：被测模块 ./burst-grouping.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/auto-sync-mode-confinement.uncached.test.ts`：依赖上游仓库的 test-support（../../../../test-support/test-only-source-file.mjs），Huhu 不携带
- `core/src/config/collect-config-diagnostics.test.ts`：被测模块 ./collect-config-diagnostics.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/committed-scope-diagnostics.test.ts`：被测模块 ./committed-scope-diagnostics.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/env-layer.test.ts`：被测模块 ./env-layer.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/inspect-config-paths.test.ts`：依赖上游仓库的 test-support（../../../../test-support/temp-dir.test-helper.ts），Huhu 不携带
- `core/src/config/loopback-parity.test.ts`：依赖上游仓库的 test-support（../../../../test-support/no-net-connect.ts），Huhu 不携带
- `core/src/config/read-config-safely.test.ts`：被测模块 ./read-config-safely.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/removed-keys.test.ts`：被测模块 ./removed-keys.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/resolve-server-config.test.ts`：被测模块 ./resolve-server-config.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/skill-source-policy.test.ts`：被测模块 ./read-config-safely.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/source-locator.test.ts`：被测模块 ./source-locator.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/config/write-config-patch.test.ts`：被测模块 ./write-config-patch.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/constants/chrome.uncached.test.ts`：依赖上游仓库的 scripts（../../scripts/chrome-resolver.ts），Huhu 不携带
- `core/src/constants/lifecycle.test.ts`：被测模块 ./lifecycle.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/constants/mcp-launcher.test.ts`：被测模块 ./mcp-launcher.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/constants/ok-user-home.test.ts`：被测模块 ../config/write-config-patch.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/constants/path-shim-layout.test.ts`：被测模块 ./path-shim-layout.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/constants/pi-docs.uncached.test.ts`：读取上游仓库的 docs / 其他包路径（不随闭包迁入）
- `core/src/constants/preview-theme-tokens.uncached.test.ts`：依赖上游仓库的 scripts（../../scripts/preview-theme-token-resolver.ts），Huhu 不携带
- `core/src/constants/shared-ok-entries.test.ts`：被测模块 ../installed-skills/schema.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/constants/uninstall-feedback.test.ts`：被测模块 ../index.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/filesystem-identity.test.ts`：被测模块 ./filesystem-identity.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/frontmatter/record.test.ts`：被测模块 ./record.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/git-pathspec.test.ts`：依赖上游仓库的 test-support（../../../test-support/configure-git-fixture.test-helper.ts），Huhu 不携带
- `core/src/git/git-spawn-path.test.ts`：被测模块 ./git-spawn-path.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/git/missing-git-helper.test.ts`：被测模块 ./missing-git-helper.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/git/worktree-path.test.ts`：被测模块 ./worktree-path.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/helper-bundle.test.ts`：被测模块 ./helper-bundle.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/i18n/node-locale-provider.test.ts`：被测模块 ./node-locale-provider.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/logging/renderer-capture-scrub-coverage.uncached.test.ts`：扫描上游 app/ 与 desktop/ 的渲染进程日志源码；这些源码不在 Huhu 闭包里
- `core/src/registry/jsx-src-ref-tags.test.ts`：被测模块 ./jsx-src-ref-tags.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/registry/projection.test.ts`：被测模块 ./projection.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/search/workspace-search.parity.test.ts`：读取上游仓库的 docs / 其他包路径（不随闭包迁入）
- `core/src/shadow-repo-layout.test.ts`：依赖上游仓库的 test-support（../../../test-support/capabilities.test-helper.ts），Huhu 不携带
- `core/src/sharing/share-url-v2.test.ts`：依赖上游仓库的 test-support（../../../../test-support/fixtures/share-url-v1-v2.json），Huhu 不携带
- `core/src/skill-folder-state.test.ts`：被测模块 ./skill-folder-state.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/dedup.test.ts`：被测模块 ./dedup.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/enumerate.test.ts`：被测模块 ./enumerate.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/harness-homes.test.ts`：被测模块 ./harness-homes.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/leaderboard.test.ts`：被测模块 ./leaderboard.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/plugin-upstream.test.ts`：被测模块 ./plugin-upstream.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/publisher.test.ts`：被测模块 ./publisher.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/repo-marketplace.test.ts`：被测模块 ./repo-marketplace.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/scope.test.ts`：被测模块 ./scope.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/search.test.ts`：被测模块 ./search.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/skill-registry.test.ts`：被测模块 ./skill-registry.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/skills-catalog/source-fields.test.ts`：被测模块 ./acquire/fetch.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/sync-paused-reason.test.ts`：被测模块 ./sync-paused-reason.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/theme/default-theme-contrast.uncached.test.ts`：依赖未安装的包 culori（所测功能不在闭包里）
- `core/src/util/atomic-temp-path.test.ts`：依赖上游仓库的 test-support（../../../../test-support/configure-git-fixture.test-helper.ts），Huhu 不携带
- `core/src/util/atomic-yaml-write.test.ts`：被测模块 ./atomic-yaml-write.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/util/file-lock-deadline.test.ts`：被测模块 ./file-lock.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/util/file-lock.test.ts`：被测模块 ./file-lock.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/util/project-logs-dir.test.ts`：被测模块 ../constants/ok-user-home.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/util/spawn-error-log-open.test.ts`：被测模块 ../constants/lifecycle.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/apply-by-prefix-suffix.test.ts`：被测模块 ./apply-by-prefix-suffix.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/github-stars.test.ts`：被测模块 ./github-stars.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/path-resolve.test.ts`：被测模块 ./path-resolve 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/relative-time.test.ts`：被测模块 ./relative-time.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/sanitize-folder-name.test.ts`：被测模块 ./sanitize-folder-name.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/sleep.test.ts`：被测模块 ./sleep.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/tag-rollup.test.ts`：被测模块 ./tag-rollup.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
- `core/src/utils/uninstall-feedback-submit.test.ts`：被测模块 ../index.ts 不在编辑器闭包里（所测功能 Huhu 不使用）
