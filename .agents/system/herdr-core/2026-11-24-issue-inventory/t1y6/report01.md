# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1y6
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1y6/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1y6/report01.md
- 业务验收报告 — [041-s3.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/041-s3.md)、[099-s6.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/099-s6.md)
- 执行结果 — done，交回 H5.2 第二次修复和 S6 已实现部分。业务验收及余项见下。

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，实际基线 `89f281c3`。候选 `eba331a9f0963d4f13a3e69350c517193fa5acd1`。工作树干净，`git diff 89f281c3..HEAD --check` 通过。

### 041-S3 · df56e473822eef6629cc35d568fef00a44679211

- 改动文件 — `plugins/ssh/src/ui/{WorkspacePaneTools,WorkspaceRunView}.tsx`、`plugins/ssh/src/ui/ssh.css`、`tests/e2e/ssh/remaining.spec.ts`。
- 第一次修复后，原三个 Shell 的挂接断言和键盘移动断言均已通过。复跑 trace 中 `xorh@84` 的 Mouse down 结束，`xorh@85` 的 Mouse move 从 3905.29 毫秒开始，直到约 60 秒超时都没有结束事件。测试尚未执行落点或后续重连断言。工具栏使用原生 HTML 拖放，Playwright Chromium 的鼠标移动会等待原生拖放拦截。证据把故障限定在第一个拖动动作，未捕获 Electron 与 Playwright 之间更细的协议事件。 [原 trace](../../../../../temp/dev/2026-11-24-issue-inventory/runs/lead/h52/trace.zip) · [复跑日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-h52-rerun.log)
- 复用 Huhu 的指针捕获模式及 Motty 的移动阈值与释放命中方式。只从工具栏把手捕获主指针，超过阈值后显示同一分栏的停靠目标，释放时命中才保存原有设备布局。保留点击和键盘移动、Escape 与无效落点取消、焦点恢复。Playwright 保留真实鼠标动作，增加有效落点高亮和成功落点后的焦点断言，继续核对终端挂接、SSH socket 数、Pane/Shell 身份及布局版本。

### 099-S6 · eba331a9f0963d4f13a3e69350c517193fa5acd1

- 改动文件 — `packages/ui/src/components/TerminalView.tsx`、`plugins/ssh/src/ui/{LocalShellPanel,SshSettingsPage,SshSharedTools,SshTerminal,SshVaultSettings}.tsx`、`plugins/ssh/src/ui/device-preferences.ts`、`plugins/ssh/test/{domain-exposure.engine,workspace-device-layout}.test.ts`、`tests/e2e/ssh/{entry-parity,settings}.spec.ts`。
- A12 在设置页接通已有纵向分组、工具栏顺序和尺寸，设备存储和工作区内控件共用。终端行距、光标样式与闪烁、1,000/5,000/10,000 行回滚直接更新已挂载的 xterm，连接副作用仍由原会话身份控制。行距沿用标准 1 和宽松 1.25，xterm 6 的行距下限为 1。默认本地 Shell 从本机现有 Shell/WSL 列表选择，设置只用作新终端的初选。已有会话的重启继续使用其原环境。设置搜索支持大小写归一及匹配已知主机入口，恢复和取消沿用原设备与 Vault 边界。
- A15 SSH 设置在桌面和邀请 Web 都通过能力网关的 `gateway.get`、`capabilities.list` 和 `gateway.audit.list` 读取共享策略、目录与审计。按现有能力名归入终端、文件、工作区、路由等领域，支持搜索。Web 用浏览器剪贴板复制脱敏 HTTP 示例。分类仅涉及显示，授权与生效状态沿用能力网关。
- A13/A16 扩展 CLI 与 HTTP MCP 的同流程 E2E，加入授权主机列表、重复连接意图返回原 ID、回环端点仅收到一次拨号、停止后读取原连接终态。仍核对信任待答、字节传输、作业同意图回执、UTF-8 游标和撤权后的缓存工具调用。
- CLI/MCP 设置单测的初跑从两条路径都观察到一次非 SSH 凭据读取。临时堆栈定位到 Engine 重启时 `McpCredentials.reconcile`。现分别断言重启前的 SSH 操作和重启完成后的重放阶段，保留全程对拨号、启动 Core 和调度传输的检查。 [根因日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1y6/task01/domain-boot-credential-trace.log) · [复跑日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1y6/task01/domain-exposure.log)

### 已运行的定向验证

均使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1` 串行。检出已有 vendor 类型产物。非法回滚行数的测试夹具已通过 `unknown` 明确模拟运行时输入，修正初次类型检查的 `TS2352`。 [最终检查日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1y6/task01/ssh-types-and-device-preferences.log)

| 命令后半段 | 结果 |
| --- | --- |
| `pnpm --filter @huhu/plugin-ssh run typecheck` | S3 和 S6 候选均退出 0 |
| `pnpm --filter @huhu/ui run typecheck` | 退出 0 |
| `pnpm exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` | S3 4/4，S6 5/5 |
| `pnpm exec vitest run plugins/ssh/test/domain-exposure.engine.test.ts` | 修正观察点后 CLI 与 HTTP MCP 2/2 |

### Lead 运行的 Playwright 用例

- `tests/e2e/ssh/remaining.spec.ts` — 「H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组」。
- `tests/e2e/ssh/settings.spec.ts` — 「SSH preferences apply to workspace, terminal, file views and transfer queue」「SSH settings reflect the shared gateway policy and provide redacted client samples」「SSH host grants are editable from desktop and invited browser workbenches」。
- `tests/e2e/ssh/entry-parity.spec.ts` — 「CLI updates SSH authentication, approves trust, reads job output and transfers bytes」「HTTP MCP updates SSH authentication, approves trust, reads job output and transfers bytes」。

## 阻碍与接续

- S3 的 H5.2 修复待 Lead 在 Linux Electron 复跑。如仍失败，团队规则要求第三次实施前交顾问，优先对照新 trace 中鼠标动作、落点及角色定位各自完成的最后一步。S3 的自定义分隔线拖动、完整标签菜单、跨窗口控制权与真实终端余项沿 [前次回执](../t1tw/report09.md)。
- S6 仍需完成或结合其他票验收的 A12 内容包括导航显隐、更多终端交互与录制默认项、连接重试/共享/启动选项及独立 SFTP 窗口等文件选项。独立 Web 的 Vault 默认值仍依现有工作台权限。A14 的批量路由编辑已在目录中登记为工作台能力，CLI/HTTP MCP 的路由变更仍缺主机链版本、授权与提交边界的联动。A13–A16 新增端到端断言及真实入口结合结果待 Lead 复验。
- 本次未运行 Linux Electron、独立 Web 或 CLI 发布物的 Playwright E2E，未测试实际远端 SSH 或外部服务，未运行全量测试、构建、打包、全仓检查及截图。Windows 和 macOS 沿用本批的历史结论。

## Lead 验收
- Lead 2026-11-25：合入 main 968291f3；H5.2 通过，S6 设置用例回归派 task02。
