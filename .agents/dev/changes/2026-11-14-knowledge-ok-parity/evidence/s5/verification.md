# S5 验证记录（2026-11-15～17，worktree 分支内本地运行；未经 audit 子代理——fork 不能派生子代理）

## 已运行（原始结果摘要）
- `pnpm -r --workspace-concurrency=1 run typecheck`（先 `build:types`）：通过。并行 `pnpm typecheck` 在本机因内存被 SIGKILL，改串行。
- `pnpm lint`：通过（oxlint + stylelint + 5 个 CSS 守护）。
- `npx vitest run`：一次 774 通过 / 2 失败（并发负载下的偶发，重跑 0 失败）；稳定结果 **70 个文件通过**。S5 新增：`packages/editor/test/host-files.test.ts`（9：路由响应过上游 zod schema、docName 还原）、`plugins/notes/test/explorer-deps.test.ts`（10）、`plugins/notes/test/service.test.ts` +2（文件夹复制 / 非 md 复制）、`packages/workbench/test/resources.test.ts`（5：A04 20,000 文件候选 / A09 计数）。
- `pnpm build`：通过（`explorer` 懒加载 chunk ≈ 3.08 MB；主入口 index ≈ 5.11 MB——G07 增量记录，未设上限）。
- 真实 Electron（harness `tree.html`，`playwright.vendor.config.ts`）`packages/editor/test/e2e/tree.spec.ts` 5 条通过：A01/A05、A06、A02/A03、A07（复制 / 回收站 / 重命名，重命名保持扩展名）。
- 真实 Electron（完整应用）`tests/e2e/shell.spec.ts -g "知识库|文档标签条|ACC-KN-01"`：知识库相关 7 条全部通过（含文件夹重命名 / 移动 / 回收站、输入后立刻切换不丢最后字符、关闭自动保存时改名 / 回收站前先落盘）。
- `tests/e2e/workflows/acceptance.spec.ts` 知识库相关子集：通过 ACC-TK-06（`@` 引用）、ACC-WB-03 / WB-01、版本历史、笔记拖放（拖到文件夹 + 菜单回根）、文件夹拖放（含不能拖进后代）、切换笔记撤销历史、外部修改冲突、知识库查看器（txt / JSON / 图 / SVG / 二进制）、阅读模式、关联 / 保存版本、Combobox、首页卡片。

## 失败 / 未验证（如实）
- `Agent CLI：Space 可以编辑` 与 `AR-06 / AR-10 / AR-09 档案`（`vault.search` 外部写入后 0 命中，疑为索引时序）在我的多次运行里失败；前者与知识库无关（S1 也报告其偶发），后者读取的是搜索索引而非树。**未在 S6 基线上对照运行**，不能断言“与 S5 无关”。
- 并发负载下 Electron 启动偶发失败（多个 worktree 同时跑 e2e 时出现 `electron.launch: Target page ... closed`），重跑通过。
- “拖到树空白处回根”：Playwright 在 Electron 里对 pierre 空白区的拖放命中未能稳定，测试改用菜单“移动到…”走同一条 `notes.move`；**空白处拖放本身未验证**。
- A04 的 10 万文件夹具真实测量未做（只有 20,000 条候选的单测）。
- A06 的键盘方向键 / 子菜单 / IME 未验证；A07 的冲突 / 移入自身只由 `notes.move` 既有单测覆盖。
- 上传（树里拖入外部文件 → `/api/upload`）未接：宿主没有附件写入能力，树会 toast “宿主未提供上传能力”。
- `test:vendor` 里树 / 菜单的上游 dom 测试（约 34 个）**没有迁入**（缺 jsdom 预加载基础设施，与 S2a 一致）。

## 验收对照
| 项 | 状态 |
| --- | --- |
| A01/A05/A10 | 路由 + vault.list 单测；Electron 里空目录与非 md 可见；受保护目录经 `includeProtected` 带出（有测试） |
| A02/A03 | 偏好存取（S1）+ 仅树视图叠加（路由测试 + Electron）；`@`/双链/搜索走 `vault.indexEntries`，不受隐藏影响（单测 + ACC-TK-06） |
| A04 | 单测（20,000 候选）；10 万夹具未测 |
| A06 | Electron 里文件 / 目录菜单、Esc、无 Open with AI；Huhu 既有“移动到… / 星标 / 保存版本…”经 P-S5-04 接入 |
| A07 | 重命名 / 复制 / 回收站 / 文件拖放 / 文件夹拖放已验证；上传未接 |
| A08 | `beforeMutate` 单测 + 既有 flush e2e |
| A09 | `summarizeCounts` 单测；UI 栏显示 |
| 删除 `notes.files` / 更名 `vault.tree` | 已做（`vault.tree` → `vault.indexEntries`，仓内无其它引用；对外：仓库文档 / 配置里没有调用方，按 spec Q8 直接更名，未保留别名——发布说明需写一句） |
