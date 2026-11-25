# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{088-ux11,055-ux12,067-ux14}.md
- 执行结果 — done

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`。在 `inv/w2` 自 `4dd6810e` 起按票提交三次，最终 SHA 为 `371a66f1720c10e3ef109917587b3f651ed4a277`。工作树干净，`git diff 4dd6810e..HEAD --check` 通过。定向单测和包级类型检查使用 Node 24.22.1 与共享验证锁。三个 vendor 声明已由此前在同一检出的任务生成。测试结果从 Core 终端收取，无必需临时附件。

### UX11 · 自动化表单与中心

- 提交 — `180753d35a36c86bb54f8921d59650ba3dc320e9`。
- 文件 — `plugins/automations/src/engine/{index,service}.ts`、`plugins/automations/src/ui/RuleEditor.tsx`、`plugins/automations/test/default-task-scan.test.ts`、`tests/e2e/workflows/task-journey.spec.ts`。
- 实现 — 沿用 AW2/AW3 的目录、共同编辑器和版本化计划入口。草稿日程可在动作与目标尚未填完时交给现役 Engine 预览。Engine 使用自身时钟和既有调度解释器。候选预览仍可携带动作，沿用同一能力。校验保留就地反馈，预览读失败可重试。单测以固定引擎时钟比较两种预览并检查无规则或初始化标记写入。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/automations/test/default-task-scan.test.ts`，7 项通过。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-automations run typecheck`，退出 0。
- Lead E2E — `tests/e2e/workflows/task-journey.spec.ts` 中「T4.1 与 T5.5 在工作台处理 DST 回拨与缺口、保留启用状态并预览三次新触发」已加强，核对时区改动后实际的草稿响应、表单时刻和已保存规则的预览。独立 Web 可运行 `tests/e2e/workflows/automation-center.spec.ts` 中「AW3：独立 Web 窄容器保留编辑内容和返回焦点」。
- 未验证 — 来源反向导航及全部来源计划的双端管理沿用 AW4/AW6 的实现，需在包含这些产物的候选核对。现有 AW4 用例位于 `tests/e2e/workflows/automation-center.spec.ts`「AW4 AU16 专注来源与中心共享计划修订和下次时间」。本轮未运行真实 provider、跨端全部来源生命周期或 Linux/Web E2E。

### UX12 · 公共控件

- 提交 — `2f23371d5c486eb7e781ac1e7b087df70fb7193b`。
- 文件 — `packages/ui/src/components/{Combobox,DateCalendar,DateTimePicker}.tsx`、`packages/ui/src/styles/components/view-etc.css`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 实现 — 沿用共享 Radix 浮层与原生选择器回退。组合框用方向键移动时将当前项滚入弹层视口。纯日期浮层可显式清除，改年份导致日期无效时保留已选日期。公共输入按约束校验，错误就地显示并关联到输入。只读字段无法从日历或清除按钮改值，带时刻字段仍走现有 DST 合同。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/ui run typecheck`，退出 0。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 中「U1 Inbox、Task 和 Automation 在真实对话框中共享浮层与表单行为」已加强，覆盖主题、文档语言、窄容器、14 条真实任务项目的方向键滚动、无效闰日保值、显式清空、分层 Esc 与返回焦点。用例沿用 `HUHU_U0_DESKTOP_APP` 及双宿主环境附件。DST 辅验复用上面的 T4.1/T5.5 用例。
- 未验证 — 未运行浏览器交互用例或新增 UI 单测。Electron 与独立 Web 的界面矩阵待 Lead 取证。

### UX14 · 工具授权

- 提交 — `371a66f1720c10e3ef109917587b3f651ed4a277`。
- 文件 — `packages/workbench/src/engine-client/query.ts`、`packages/workbench/src/gateway/{GatewayModule,SshHostGrants,ToolPolicyCatalog}.tsx`、`packages/workbench/src/shell/shell.css`、`tests/e2e/workflows/mcp-aggregation.spec.ts`。
- 实现 — 授权对象、内置工具批量策略及 SSH 资源分别显示，列出选中、已授权及可批量变更数量。内置授权遵从现行的桌面修改权限，独立 Web 显示策略，已只读打开的 Vault 锁定资源和工具修改。禁用模块不能增加开放，已保存的授权仍可撤销。列表区分实际 MCP 服务启停与策略设置。撤销确认聚焦取消按钮，写入仍走现有目录和策略修订校验，沿用 Engine 每次调用检查最新授权。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/kernel-exposure.test.ts`，98 项通过，含 HTTP/MCP 开放后撤销与已撤权的持久回执重试。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/workbench run typecheck`，退出 0。
- Lead E2E — `tests/e2e/workflows/mcp-aggregation.spec.ts` 中「UX14 工具授权区分可用操作，撤销后同一 MCP 会话拒绝缓存工具名」覆盖筛选空态、两项授权和撤销、同一 HTTP MCP 会话的缓存标识、浏览器连接的内置授权只读、SSH 模块停用及桌面只读 Vault。批量冲突回归复用 `tests/e2e/workflows/acceptance.spec.ts` 中「能力网关：逐项和批量选择先预览，旧版本保留草稿并在刷新后整批保存」。
- 未验证 — 本轮未运行上述 E2E，也未验证真实外部提供方或候选包。

## 阻碍与接续

三张票的 worker 改动已提交。Linux Electron、独立 Web、§10 实机矩阵及业务验收报告由 Lead 处理。未运行构建、打包、全仓类型检查、全仓 lint、knip、E2E 或视觉取证。已回收本任务自行启动的所有验证终端，保留已提交的工作树给 Lead 集成。

## Lead 验收
- Lead 2026-11-25：合入 main ff5dbadf。E2E 17 通过 2 失败；UX11 通过，UX12、UX14 返工排 task03。
