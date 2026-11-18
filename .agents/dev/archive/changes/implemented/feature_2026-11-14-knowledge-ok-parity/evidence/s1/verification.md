# S1 验证记录（2026-11-15，worktree `worktree-agent-adad71041bd4ce01a`）

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | 通过（oxlint + check-lint-rules + stylelint + check-ui-colors + check-css-layers/classes/ownership/duplicates 全部 OK） |
| `pnpm -r --parallel --filter '!@huhu/editor' run typecheck`（先 `pnpm --filter "./vendor/*" run build:types`） | 全部 Done（kernel、ui、workbench、plugins/*、apps/*） |
| `pnpm typecheck`（含 `@huhu/editor`） | **失败**：`packages/editor` 把 `src/vendor/open-knowledge` 纳入 Huhu 严格 tsconfig（基线 `fb034af` 即如此，S2a 范围） |
| `npx vitest run`（全仓库单测） | 67 个文件通过 / 1 跳过；742 通过 / 7 跳过 |
| `pnpm build` | 通过（`apps/desktop` 构建完成） |
| `xvfb-run npx playwright test tests/e2e/shell.spec.ts -g 知识库` | 4 通过 |
| `xvfb-run npx playwright test tests/e2e/shell.spec.ts tests/e2e/workflows -g "笔记\|批注\|草稿\|冲突\|外部修改\|拖\|档案\|编辑\|自动保存\|文档\|版本"` | 32 通过、1 失败：`Agent CLI：Space 可以编辑`（与知识库无关；单独重跑通过，判定为偶发） |
| 新增 e2e `知识库：输入后立刻切换到另一篇，磁盘内容包含最后一个字符` | 通过 |
| `pnpm knip` | 失败，且报告仅来自 `packages/editor/package.json` 的未使用依赖（S2a 接入前不可避免）；S1 文件无报告 |

新增单测：`packages/vault/test/list.test.ts`（7）、`packages/vault/test/watcher.test.ts`（+1 目录事件）、`apps/engine/test/engine.test.ts`（+1 `vault.list` / `readRange`）、`plugins/notes/test/document-session.test.ts`（21）、`plugins/notes/test/doc-tabs.test.ts`（10）、`plugins/notes/test/service.test.ts`（+4 hiddenPaths）、`packages/workbench/test/engine-client.test.ts`（+1）、`packages/ui/test/file-icon.test.tsx`（2）。

**未做 / 未验证**：真实输入法 / Windows / macOS；`e2e:packaged`；`pnpm bench`；全量 e2e（只跑了知识库相关子集 + 全部 `tests/e2e/workflows` 中名称匹配的子集）。
