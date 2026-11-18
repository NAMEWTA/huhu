# 上游测试结果（G04，三分类）

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
