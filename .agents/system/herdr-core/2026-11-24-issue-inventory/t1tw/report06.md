# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task06.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task06.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report06.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 059-ux18.md、070-ux19.md，由 Lead 回写
- 执行结果 — done

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`。从已快进到 main 的 `14080594` 开始，两张票各自提交，HEAD 为 `b595b4c8192aa96ddff0844c3b04071b9c07b089`。工作树干净，`git diff 14080594..HEAD --check`、spec 的 TypeScript 转译语法检查及 Playwright `--list` 收集检查通过。两条用例均被收集，未执行用例正文。

依据为 Lead 的 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ux18-19-u7.log`。该轮共 17 项通过、2 项失败。本轮单元探针与日志保存于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task06/`。

### UX18 · 看板编辑

- 提交 — `3bb4ef1b168347f46ee436f79fdeeb2333638fb6`。
- 根因 — Electron 的用例将重开后的像素级内联样式保存为基准，再按字串比较取消后的样式。渲染宽度变化会重新计算卡片像素。用现有 RGL 2.3.0 的 `calcGridItemPosition`，1040px 和 1032px 容器可把同一个 `x=2,y=2,w=4,h=3` 分别映射为日志的 `351px/689px` 和 `348px/684px`。这是等效宽度探针，原现场没有测量容器宽度。
- Web 样本的高度 — Electron 已保存任务卡高度 4，随后像素断言失败，原测试跳过位于结尾的还原请求。两个宿主共用测试 Vault，Web 在重载后从已持久化的 4 开始，按一次 Shift+ArrowDown 得到 5。用现有碰撞及缩放函数复核，从处于同一位置的高度 3、4 各增一格，分别得到 4、5。保留每次一格的产品行为。
- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。按实际网格宽度和行距量化位置与尺寸。核对碰撞、重开后两张卡的渲染位置、取消前真实草稿位移、取消后的渲染和 Engine 完整布局。验证每个宿主的初始位置与高度，断言失败时也在 finally 恢复实际写入过的夹具布局。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/dashboard-layout.test.ts`，4/4 通过。布局和缩放探针也通过。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 中「UX18 看板相邻卡片拖缩与键盘调整，保存重开和取消保留布局」，同时检查 Linux Electron 与独立 Web。

### UX19 · 添加卡片

- 提交 — `b595b4c8192aa96ddff0844c3b04071b9c07b089`。
- 根因 — 原用例在有搜索词且仍聚焦的原生 `input[type=search]` 中按一次 Escape。Chromium 先清空查询，对话框继续处于打开状态，下一次对背景卡片复选框的点击被原生模态层拦截。该步骤只检查了目录，尚未执行添加；现有添加与恢复路径均已关闭目录。单元探针复现第一次 Escape 后 `open=true`、查询为空，点击关闭后 `open=false` 且焦点回到入口。
- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。检查完目录后，通过对话框的「关闭」按钮离开并确认焦点返回。恢复、添加两条成功路径均显式等待目录退出，再继续检查卡片或保存。用例清理也通过「关闭」退出仍打开的目录。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 中「UX19 看板目录可按用途与来源搜索，区分单例、恢复、多实例和不可用来源」，同时检查 Linux Electron 与独立 Web。

共用的原语探针命令为 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/inventory-task06-probe.test.ts`，2/2 通过。源文件已移到运行附件目录。Chromium 样本仅加载静态输入和对话框结构。

## 阻碍与接续

无阻碍。两次提交仅修改顶层 Playwright spec，完成语法和用例收集检查。worker 未运行应用 E2E、包级或全仓类型检查、构建、打包、全仓 lint、knip 或截图取证。应用双端复验由 Lead 运行。已回收本轮验证终端。

## Lead 验收
- Lead 2026-11-25：UX19 通过；UX18 Web 仍失败，第 2 次修复派 task07。
