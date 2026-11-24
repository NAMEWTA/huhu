# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task05.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task05.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report05.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{034-tw3,037-u1}.md
- 执行结果 — done，交 Lead 验收

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2` 自 `c288103c886c8cca557971130378a2711e95a2cf` 接续。两票按顺序独立提交。运行原件在 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task05/`。

### TW3 · 929f2917cf14525873a7374ff14ae24db81a2021 · Refs #17

- 改动 `tests/e2e/workflows/task-journey.spec.ts`。Lead 的 `c01-1` trace 中，两次真实 Codex 来源轮次均已完成，确认关闭之后 `dwzr@183` 等待 `vault-launch` 5 秒失败。接下来的 `dwzr@186` 停在 `Close context`，将失败拖到 180 秒。测试把 Engine 换代与启动页出现绑定在一起，5 秒也短于 `engine-supervisor.ts:264` 的 15 秒停机上限。Trace 能确认两个等待点，未记录该次 Engine 实际停机耗时。
- C01 现在通过真实桌面 preload 调用关闭和重开同一个物理 Vault，核对关闭后的宿主状态、旧 HTTP 地址不可达及重新加载后的 Engine 就绪。浏览器、Engine、隔离 Core、Electron 与本地模型夹具按独立时限回收，保留第一条失败。第一次复测越过重开，暴露夹具先修改 A、再断言 A 可选的顺序问题。改为先确认 A/B 可选并明确选择 B，之后修改 A 并继续断言旧修订被拒绝。运行原件为 `c01.json` 与 `c01/`。
- 复测使用已经存在的 Linux 桌面产物 `f1b0e7306002b38e547280d3680db1e711516dd2`，官方 Codex `0.170.0`，SHA-256 `880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971`。第二次复测 `c01-2.json` 显示 1/1 通过，用例 18.8 秒，包含 `original-rollout-binding` 附件。该运行在同一物理 B 文件上验证旧轮次与新增轮次、重复派遣不产生新 run、错版本答复被拒绝，以及独立 Web 对原问题的回答与结果。
- 收尾复测 c01-final.json 同样 1/1 通过，用例 18.8 秒并附原 rollout 绑定。此次使用当时主检出已生成的桌面产物 f10f84757ac0996550af35f7a70b9b8b203ac73c，两个通过样本都早于 U1 集成。退出后按本用例隔离目录扫描进程环境，Electron、Codex、Core 和浏览器均无残留，测试子终端已回收。
- 验证命令主体为 `flock /home/wta/projects/huhu/temp/dev/verify.lock xvfb-run -a volta run --node 24.22.1 pnpm exec playwright test tests/e2e/workflows/task-journey.spec.ts -g "C01 任务编辑器直接恢复" --workers=1 --reporter=list,json`。执行时使用 X11，设置 `HUHU_C01_DESKTOP_APP=/home/wta/projects/huhu/apps/desktop` 与上述固定二进制 `HUHU_CODEX_DISPATCH_BIN`，JSON 和输出目录分别写入运行原件目录。取得锁后再次确认 `MemAvailable ≥ 20 GiB`。

### U1 · 455ff748779b1528a4635c480b53cf9b6b915a0d · Refs #14

- `packages/ui/src/components/{host-ui.ts,Combobox.tsx,Dialog.tsx,DateCalendar.tsx,DateTimePicker.tsx,datetime.ts,ui.tsx}`、`packages/ui/src/index.ts` 与 `packages/ui/src/styles/components/{overlays,tw,view-etc}.css`。共享宿主按触发项选择最近打开的原生 Dialog 或所属工作台。Radix 浮层在宿主内避让，关闭子层归还焦点。选择框保留原生键盘和提交语义，支持 `base-select` 时用主题样式。Task 和 Automation 共用按表单宽度切换列数的布局，表单主体滚动，操作区留在底部。
- `packages/editor/src/{editor.css,rich/at-reference.ts}` 与 Open Knowledge 的 `suggestion-floating-ui.ts`、`link-path-suggestions.tsx`、`PATCHES.md`。slash、引用和路径候选消费同一宿主规则，保留 OK 样式作用域，并将相关浮层的碰撞限制在原生 Dialog 内。
- 消费者为 `plugins/inbox/src/ui/InboxModule.tsx`、`plugins/tasks/src/ui/{TaskEditor.tsx,tasks.css}` 和 `plugins/automations/src/ui/{RuleEditor.tsx,automations.css}`。纯日期使用文档语言显示月份与操作，UTC 时刻保留秒，指定时区的本地时间仍由 Task 处理 DST 选择。清空映射为 `null`。Automation 的时钟值和选定时区继续交给现有 Cron 预览；时间输入使用原生控件并继承 `color-scheme`。
- `apps/desktop/test/host-ui-contract.test.ts` 7 项通过，`packages/editor/test/suggestion-host.test.ts` 1 项通过，`plugins/automations/test/cron-presets.test.ts` 3 项通过。逐文件运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`。三份日志为 `host-ui-contract.log`、`suggestion-host.log`、`cron-presets.log`。
- `tests/e2e/workflows/workbench-baseline.spec.ts` 新增「U1 Inbox、Task 和 Automation 在真实对话框中共享浮层与表单行为」，用同一个桌面构建和独立 Web 邀请页验证真实菜单、分层 Esc、焦点返回、主题、窄表单、日期 locale 与清空后持久化。测试用宿主传入的 HTML `lang` 分别覆盖中文和英文。`tests/e2e/workflows/task-journey.spec.ts` 的 C01 定位兼容新版展开时才进入无障碍树的 option。

### Modern Web Guidance

- Dialog 指南 “use `dialog.showModal()` when opening from script” 对应保留原生外层 Dialog。Viewport-Aware Dropdowns 要求面板 “remain tethered to a trigger element”，这里复用已有的 Radix 与 Floating UI 来处理边界。
- Size Aware Styling 的 “apply styles when the container reaches a certain size” 对应表单的命名容器。Branded Select Styling 的 “both the `<select>` element and the `::picker(select)` pseudo-element” 对应渐进增强的共享 Select。
- Capturing Location-Agnostic Data 的 “carry no time zone offset” 对应纯日期和本地时钟输入保留独立表示。

## 阻碍与接续

- 请 Lead 用合并后的构建运行 `tests/e2e/workflows/workbench-baseline.spec.ts` 的 U1 用例，沿用该 spec 的 `HUHU_U0_DESKTOP_APP`，同时复核 `tests/e2e/workflows/task-journey.spec.ts` 的 C01 与「T4.1 与 T5.5 在工作台处理 DST 回拨与缺口、保留启用状态并预览三次新触发」。
- Worker 未运行 U1 E2E、构建、打包、类型检查、全仓 lint 或视觉截图。请 Lead 串行检查 `@huhu/ui`、`@huhu/editor`（含 vendor）、`@huhu/plugin-tasks`、`@huhu/plugin-inbox`、`@huhu/plugin-automations`、`@huhu/desktop` 以及 Playwright TS 入口。E2E 走真实本地 Codex 进程与受控本地模型响应，外部模型服务及其他平台留待验收。

## Lead 验收


- Lead 2026-11-24：TW3 通过；U1 E2E 失败，转 t1hs task07 返工。清单转 task06。
