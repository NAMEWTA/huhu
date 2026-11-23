# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t30（按原 manifest 识别任务，恢复后的终端地址为 t3r）
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t30/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t30/report01.md
- 执行结果 — done（实施交付，最终集成验证由 Lead 执行）

## 结论

四张业务卡已迁入各自插件的可信 Widget 贡献。现有 v1 布局和备份保留实例 ID、筛选、标题、显隐及位置，下一次正常提交写入新类型。单一首页提供任务的今日筛选和活动的来源筛选。关窗草稿、笔记结算及专注暂停沿用现有流程，并有对应 E2E。

## 产物与改动

- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-w05-widgets`。
- 候选 `e197f9abe421f4b4ffc38292420b23aa16e8967a`，父提交 `fc044713`。临时索引生成，分支 HEAD 仍在基准。已核对工作树业务文件与候选一致。工作树内 `.agents/` 为只读，证据通过 Git 对象加入候选。
- 证据 `.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/evidence/W05-W06-linux.md`。
- 合同改动位于 `packages/contracts/src/home.ts`，旧类型读回统一映射至插件类型，备份版本保持 v1。
- Engine 只在 `apps/engine/src/boot.ts` 加四个定义 import 和注册清单接线。任务插件的 `package.json` 新增独立定义导出，避免 Engine 包通过共享入口加载 Workbench 资源。
- 复核由实施者完成。任务要求由 Lead 接续验收。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 旧布局与 W02-04/05 恢复合同 | `pnpm exec vitest run apps/engine/test/dashboard-recovery.test.ts` 单文件 6 项通过。新增真实 Engine 备份、预览及提交用例覆盖四种旧实例。 | `/tmp/huhu-t30.oogOam/vitest-single-resumed.log` |
| 变更与候选一致 | Git 空白检查及候选对比通过。 | 候选 SHA |

## 未运行的验证

以下项目尚无最终候选验收结果，由 Lead 按新版 AGENTS.md 串行执行。

| 文件或命令 | 用例 |
| --- | --- |
| `tests/e2e/workflows/acceptance.spec.ts` | W05-W06 旧看板任务卡保留独立筛选、时区与布局，冲突后重读任务 |
| 同上 | W05-W06 最近笔记定位文件，失效与撤权在单卡内恢复 |
| 同上 | W05-W06 待处理捕获可定位，插件重新启用后恢复旧实例 |
| 同上 | W05-W06 Agent 入口随插件启停，最近活动在看板内筛选 |
| 同上 | ACC-WB-05 首页“我的任务”勾选：待推进任务数减少，任务进入已完成 |
| 同上 | 专注计时：运行中关闭应用，退出前暂停并保存剩余时间 |
| 同上 | 既有首页看板用例组，名称以“首页看板”开头 |
| `tests/e2e/knowledge/session-flush.spec.ts` | W05-W06 关闭时保存看板草稿，结算笔记并暂停专注 |
| 同上 | W05-W06 关闭时放弃看板草稿，结算笔记并暂停专注 |
| `tests/e2e/workflows/web-share.spec.ts` | Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开 |
| `tests/e2e/shell.spec.ts` | 首页与健康中心：卡片反映真实数据；坏文件出现在健康检查里 |
| 同上 | 首页：专注计时到点（ACC-WB-06）、习惯勾选持久化、自定义隐藏卡片；停用任务插件后任务卡片隐藏 |
| 构建与静态门禁 | `pnpm build`、全仓 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` |
| 发布前检查 | 打包、安装版冒烟、视觉比对及批次全量测试 |

## 阻碍与接续

恢复前的关窗保存运行发生 60 秒测试和 worker 清理超时，打包在依赖收集后中断。中间快照的日志位于 `/tmp/huhu-t30.oogOam`，未作为最终候选验收结果。最新 E2E 增加了收件箱列表已缓存时的再次选择，待 Lead 执行。

恢复后，首次生成报告的 shell 命令展开了 Markdown 反引号，意外启动构建和类型检查。该命令已中止，误执行的输出未用作验收。

## Lead 验收


Lead 验收（2026-11-22）：通过。候选 `e197f9ab` 快进到 `impl/huhu-issues-3-10-w05-widgets`，合入集成 `369efcfd`。Lead 补跑：受影响 8 包 tsc、oxlint、oxfmt 通过；vitest 28 文件 341/341；`pnpm build` 后 xvfb + 隔离 Secret Service 下 acceptance.spec（W05-W06/ACC-WB-05/首页看板/专注计时）14 过；session-flush W05-W06 2 过、shell 首页 2 过；web-share（两份邀请、三浏览器会话、单份撤销、看板保存重开）需 `PLAYWRIGHT_BROWSERS_PATH` 显式传入后 1 过。session-flush Windows 菜单/F10 用例仅 Windows，未运行。
