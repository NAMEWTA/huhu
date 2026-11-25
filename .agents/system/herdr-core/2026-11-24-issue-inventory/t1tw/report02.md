# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report02.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{056-ux15,057-ux16,058-ux17}.md
- 执行结果 — done

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`。从 `ff5dbadf` 出发按票提交三次，当前分支 `inv/w2` 的 HEAD 为 `57ab5062a4bc1db736d70121ff10c1d2dbfcfea7`。工作树干净，`git diff ff5dbadf..HEAD --check` 通过。三个修改过的 Playwright spec 通过 TypeScript 语法解析。通过 Core 执行定向单测与包级类型检查，统一持验证锁。vendor 声明由检出的前序任务生成，无需重建。无必需附件。

### UX15 · 同步表单

- 提交 — `600e8b1fdc7e0a78bf15740e0957bc0878d0081f`。
- 文件 — `plugins/versioning/src/ui/sync/SyncSettingsPage.tsx`、`plugins/versioning/src/ui/versioning.css`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 实现 — 按连接信息、同步行为和多行排除规则分组。实际内容够宽时并排展示前两组，窄容器采用单列。保存操作在独立操作行，成功后以 Engine 返回值回填规范化的远端、分支和排除规则。沿用原 Git 同步行为和 AW4 的计划入口，按当前 planId 跳转。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/versioning/test/sync.test.ts`，16 项通过。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-versioning run typecheck`，退出 0。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts`「UX15 同步表单按容器重排，保存后从原计划继续管理」。使用本机裸 Git 仓库的长 URL，双宿主保存不同模式，核对排除规则和 planId。现有计划回归见 `tests/e2e/workflows/acceptance.spec.ts`「GitPlan：完整同步与拉取在中心各有一个可修改的计划」。
- 未验证 — 当前未运行双宿主布局、保存和计划跳转 E2E，未接远端外部 Git 服务。

### UX16 · Safe 三栏

- 提交 — `0279cacf266763fef8572b66547f9b411161a5fb`。
- 文件 — `plugins/safe/huhu-plugin.json`、`plugins/safe/src/engine/{index,personal,safe}.ts`、`plugins/safe/src/ui/{PersonalWorkspace,EntryEditor,SafeModule}.tsx`、`plugins/safe/src/ui/safe.css`、`plugins/safe/test/personal.engine.test.ts`、`tests/e2e/shell.spec.ts`、`tests/e2e/workflows/{workbench-baseline,safe-tags}.spec.ts`。
- 实现 — 宽容器显示条目、所有账号和所选账号详情。窄容器逐级进入及返回并恢复焦点，按条目 ID 和账号 ID 保留选择。账号摘要仅显示遮罩和是否设置密码。实际明文按显式动作和所选账号读取，返回、切换和锁定会清理。
- 原型有向已有条目新增账号入口。实现沿用原密文存储、会话、修订检查和同一编辑对话框，并在保存后选择回执中的账号。新增入口仅供工作台调用，保留现有旁路工具的授权边界。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/safe/test/personal.engine.test.ts`，11 项通过。新增用例覆盖同版本并发新增只写一次、摘要无密码、按 ID 读取与锁定后拒绝。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-safe run typecheck`，退出 0。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts`「UX16 Safe 三栏按账号取用明文，窄窗逐级返回并清理」。双宿主用合成账号，核对读取请求只带第二个账号的 ID、两级返回恢复焦点、新增选择时遮罩、删除、切换与锁定。已迁移 `tests/e2e/shell.spec.ts` 的「保险箱：多账号创建、编辑、显隐与锁定清除」「保险箱：按指定账号删除，最后一个账号单独确认并可取消」及 `tests/e2e/workflows/safe-tags.spec.ts` 的「保险箱只复制所选第三个账号，剪贴板拒绝有反馈且锁定拦截迟到复制」「保险箱标签：多标签交集、账号命中、无标签及锁定清除」至三栏入口。
- 未验证 — 当前未运行双宿主三栏、返回焦点和剪贴板 E2E。

### UX17 · 外观

- 提交 — `57ab5062a4bc1db736d70121ff10c1d2dbfcfea7`。
- 文件 — `packages/workbench/src/settings/{AppearancePage,SettingsModule}.tsx`、`packages/workbench/src/shell/shell.css`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 实现 — 外观页滚动区占用可用工作区宽度。主题卡按容器排成 1、2、4 列，宽窗四张卡填满一行。窄容器垂直排列设置说明和控件，卡片字号采用现有主题 token，继续使用原持久化流程。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/ui/test/theme.test.ts`，43 项通过。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/workbench run typecheck`，退出 0。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts`「UX17 外观按工作区重排四套主题，窄窗切换并重开保留」。双宿主检查宽、中、窄三种布局，改变主题、明暗和字号后重开核对。同一用例保存工作区宽度和字号的 JSON 附件。
- 未验证 — 当前未运行双宿主布局和持久化 E2E。候选包外观与看板组合留给对应验收。

## 阻碍与接续

三张票已提交，等待 Lead 在 Linux 上验收 Electron 与独立 Web，补 §10 实际构建和环境矩阵。三条新增用例复用 `HUHU_U0_DESKTOP_APP` 和双宿主环境附件。未运行 E2E、视觉取证、构建、打包、全仓类型检查、全仓 lint 或 knip。已回收本任务启动的验证终端，保留工作树给 Lead 集成。

## Lead 验收
- Lead 2026-11-25：合入 main 4d83f40a。E2E 10 通过 2 失败；UX16 通过，UX15、UX17 返工排 task04。worker 已 /compact 后继续。
