# 上游测试首版结果（core，node 环境）

生成：`node scripts/ok-test-report.mjs`（数据 `packages/editor/test-results/vendor.json`，由 `pnpm --filter @huhu/editor test:vendor` 产出）。固定上游 `44a2e0a`。

| 项 | 数 |
| --- | --- |
| 测试文件总数 | 216 |
| 通过 | 143 |
| 失败（被测模块在 vendor 内） | 3 |
| 不适用（被测模块不在 closure / 依赖上游 test-support 或构建脚本） | 70 |
| **适用文件通过率** | **97.9%**（143 / 146） |
| 单测用例：通过 / 失败 / 总数 | 3958 / 18 / 3978 |

阈值：适配后适用文件通过率 ≥ 70%（decisions OP-D02）。**范围说明**：只迁入了 core 的测试；app（含 85 个 jsdom dom 测试）依赖上游 `tests/dom/jsdom-preload.ts` 与 `test-support/`，**尚未迁入，不计入上述通过率**。

## 失败（需适配或登记）

- `src/vendor/open-knowledge/core/src/acp/thread-protocol.typelock.test.ts`（0/0 失败）：Cannot find module './thread-protocol.typelock.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a95957
- `src/vendor/open-knowledge/core/src/agent-registry/derived-tables.test.ts`（0/0 失败）：Cannot find module '../acp/agent-posture.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/extensions/list.test.ts`（0/0 失败）：Cannot find package '@tiptap/extension-paragraph' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a959571

## 不适用（70）

- `src/vendor/open-knowledge/core/src/app-shell-csp.test.ts`：Cannot find module './app-shell-csp.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/burst-grouping.test.ts`：Cannot find module './burst-grouping.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90
- `src/vendor/open-knowledge/core/src/filesystem-identity.test.ts`：Cannot find module './filesystem-identity.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb
- `src/vendor/open-knowledge/core/src/git-pathspec.test.ts`：Cannot find module '../../../test-support/configure-git-fixture.test-helper.ts' imported from '/home/wta/projects/huhu/.
- `src/vendor/open-knowledge/core/src/helper-bundle.test.ts`：Cannot find module './helper-bundle.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/schema-invariant.test.ts`
- `src/vendor/open-knowledge/core/src/shadow-repo-layout.test.ts`：Cannot find module '../../../test-support/capabilities.test-helper.ts' imported from '/home/wta/projects/huhu/.claude/wo
- `src/vendor/open-knowledge/core/src/skill-folder-state.test.ts`：Cannot find module './skill-folder-state.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/sync-paused-reason.test.ts`：Cannot find module './sync-paused-reason.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/y-prosemirror-patch.test.ts`
- `src/vendor/open-knowledge/core/src/acp/agent-posture.test.ts`：Cannot find module './agent-posture.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/acp/codex-legacy-notice.test.ts`：Cannot find module '../../../../test-support/fixtures/codex-legacy-warning-envelopes.json' imported from '/home/wta/proj
- `src/vendor/open-knowledge/core/src/acp/permissive-mode.test.ts`：Cannot find module './permissive-mode.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be9
- `src/vendor/open-knowledge/core/src/config/auto-sync-mode-confinement.uncached.test.ts`：Cannot find module '../../../../test-support/test-only-source-file.mjs' imported from '/home/wta/projects/huhu/.claude/w
- `src/vendor/open-knowledge/core/src/config/collect-config-diagnostics.test.ts`：Cannot find module './collect-config-diagnostics.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a959
- `src/vendor/open-knowledge/core/src/config/committed-scope-diagnostics.test.ts`：Cannot find module './committed-scope-diagnostics.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a95
- `src/vendor/open-knowledge/core/src/config/env-layer.test.ts`：Cannot find module './env-layer.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/config/inspect-config-paths.test.ts`：Cannot find module '../../../../test-support/temp-dir.test-helper.ts' imported from '/home/wta/projects/huhu/.claude/wor
- `src/vendor/open-knowledge/core/src/config/loopback-parity.test.ts`：Cannot find module '../../../../test-support/no-net-connect.ts' imported from '/home/wta/projects/huhu/.claude/worktrees
- `src/vendor/open-knowledge/core/src/config/read-config-safely.test.ts`：Cannot find module './read-config-safely.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/config/removed-keys.test.ts`：Cannot find module './removed-keys.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/
- `src/vendor/open-knowledge/core/src/config/resolve-server-config.test.ts`：Cannot find module './resolve-server-config.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710f
- `src/vendor/open-knowledge/core/src/config/skill-source-policy.test.ts`：Cannot find module './read-config-safely.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/config/source-locator.test.ts`：Cannot find module './source-locator.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90
- `src/vendor/open-knowledge/core/src/config/write-config-patch.test.ts`：Cannot find module './write-config-patch.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/constants/chrome.uncached.test.ts`：Cannot find module '../../scripts/chrome-resolver.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a95
- `src/vendor/open-knowledge/core/src/constants/lifecycle.test.ts`：Cannot find module './lifecycle.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/constants/mcp-launcher.test.ts`：Cannot find module './mcp-launcher.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/
- `src/vendor/open-knowledge/core/src/constants/ok-user-home.test.ts`：Cannot find module '../config/write-config-patch.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a959
- `src/vendor/open-knowledge/core/src/constants/path-shim-layout.test.ts`：Cannot find module './path-shim-layout.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be
- `src/vendor/open-knowledge/core/src/constants/pi-docs.uncached.test.ts`：ENOENT: no such file or directory, open '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packages/edit
- `src/vendor/open-knowledge/core/src/constants/preview-theme-tokens.uncached.test.ts`：Cannot find module '../../scripts/preview-theme-token-resolver.ts' imported from '/home/wta/projects/huhu/.claude/worktr
- `src/vendor/open-knowledge/core/src/constants/shared-ok-entries.test.ts`：Cannot find module '../installed-skills/schema.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a95957
- `src/vendor/open-knowledge/core/src/constants/uninstall-feedback.test.ts`：Cannot find module '../index.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packag
- `src/vendor/open-knowledge/core/src/frontmatter/record.test.ts`：Cannot find module './record.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packag
- `src/vendor/open-knowledge/core/src/git/git-spawn-path.test.ts`：Cannot find module './git-spawn-path.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90
- `src/vendor/open-knowledge/core/src/git/missing-git-helper.test.ts`：Cannot find module './missing-git-helper.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5
- `src/vendor/open-knowledge/core/src/git/worktree-path.test.ts`：Cannot find module './worktree-path.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/i18n/node-locale-provider.test.ts`：Cannot find module './node-locale-provider.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ff
- `src/vendor/open-knowledge/core/src/logging/renderer-capture-scrub-coverage.uncached.test.ts`
- `src/vendor/open-knowledge/core/src/registry/jsx-src-ref-tags.test.ts`：Cannot find module './jsx-src-ref-tags.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be
- `src/vendor/open-knowledge/core/src/registry/projection.test.ts`：Cannot find module './projection.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pa
- `src/vendor/open-knowledge/core/src/search/workspace-search.parity.test.ts`：ENOENT: no such file or directory, open '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packages/edit
- `src/vendor/open-knowledge/core/src/sharing/share-url-v2.test.ts`：Cannot find module '../../../../test-support/fixtures/share-url-v1-v2.json' imported from '/home/wta/projects/huhu/.clau
- `src/vendor/open-knowledge/core/src/skills-catalog/dedup.test.ts`：Cannot find module './dedup.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/package
- `src/vendor/open-knowledge/core/src/skills-catalog/enumerate.test.ts`：Cannot find module './enumerate.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/skills-catalog/harness-homes.test.ts`：Cannot find module './harness-homes.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/skills-catalog/leaderboard.test.ts`：Cannot find module './leaderboard.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/p
- `src/vendor/open-knowledge/core/src/skills-catalog/plugin-upstream.test.ts`：Cannot find module './plugin-upstream.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be9
- `src/vendor/open-knowledge/core/src/skills-catalog/publisher.test.ts`：Cannot find module './publisher.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/skills-catalog/repo-marketplace.test.ts`：Cannot find module './repo-marketplace.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be
- `src/vendor/open-knowledge/core/src/skills-catalog/scope.test.ts`：Cannot find module './scope.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/package
- `src/vendor/open-knowledge/core/src/skills-catalog/search.test.ts`：Cannot find module './search.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packag
- `src/vendor/open-knowledge/core/src/skills-catalog/skill-registry.test.ts`：Cannot find module './skill-registry.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90
- `src/vendor/open-knowledge/core/src/skills-catalog/source-fields.test.ts`：Cannot find module './acquire/fetch.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/theme/default-theme-contrast.uncached.test.ts`：Cannot find package 'culori' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packages/e
- `src/vendor/open-knowledge/core/src/utils/apply-by-prefix-suffix.test.ts`：Cannot find module './apply-by-prefix-suffix.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710
- `src/vendor/open-knowledge/core/src/utils/github-stars.test.ts`：Cannot find module './github-stars.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/
- `src/vendor/open-knowledge/core/src/utils/path-resolve.test.ts`：Cannot find module './path-resolve' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/utils/relative-time.test.ts`：Cannot find module './relative-time.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d
- `src/vendor/open-knowledge/core/src/utils/sanitize-folder-name.test.ts`：Cannot find module './sanitize-folder-name.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ff
- `src/vendor/open-knowledge/core/src/utils/sleep.test.ts`：Cannot find module './sleep.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/package
- `src/vendor/open-knowledge/core/src/utils/tag-rollup.test.ts`：Cannot find module './tag-rollup.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pa
- `src/vendor/open-knowledge/core/src/utils/uninstall-feedback-submit.test.ts`：Cannot find module '../index.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/packag
- `src/vendor/open-knowledge/core/src/util/atomic-temp-path.test.ts`：Cannot find module '../../../../test-support/configure-git-fixture.test-helper.ts' imported from '/home/wta/projects/huh
- `src/vendor/open-knowledge/core/src/util/atomic-yaml-write.test.ts`：Cannot find module './atomic-yaml-write.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5b
- `src/vendor/open-knowledge/core/src/util/file-lock-deadline.test.ts`：Cannot find module './file-lock.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/util/file-lock.test.ts`：Cannot find module './file-lock.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ffb5be90d/pac
- `src/vendor/open-knowledge/core/src/util/project-logs-dir.test.ts`：Cannot find module '../constants/ok-user-home.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a959571
- `src/vendor/open-knowledge/core/src/util/spawn-error-log-open.test.ts`：Cannot find module '../constants/lifecycle.ts' imported from '/home/wta/projects/huhu/.claude/worktrees/agent-a9595710ff
