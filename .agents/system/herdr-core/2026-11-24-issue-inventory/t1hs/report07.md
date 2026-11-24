# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task07.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task07.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report07.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 `037-u1.md`、`047-f22.md` 和 `045-ux13.md`
- 执行结果 — done

## 成果与运行指针

- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，起点 `b7834d34`。
- 提交 — U1 `aaf27de8`，F22 `e5699643`，UX13 `da04886d`。完整文件列表可用 `git show --stat <提交>` 查阅。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task07/`。
- 定向单测均逐文件执行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`，每次检查 12 GiB 可用内存。U1 获授权的桌面构建和单个 E2E 各在持锁后检查 20 GiB。

### U1 · 对话框浮层回归

- 改动包括 `packages/ui/src/components/host-ui.ts` 及其入口、`packages/editor/src/vendor/open-knowledge/` 下现有键盘扩展及补丁记录、`packages/editor/test/suggestion-host.test.ts`、`tests/e2e/knowledge/session-slow-bridge.ts` 和 `tests/e2e/workflows/workbench-baseline.spec.ts`。
- 基线使用 Lead 的 `5fa029b2` 构建，Electron 和独立 Web 都在点选 slash 命令后按 Escape 时保留快速捕获对话框。让编辑器快捷键返回未处理后，ProseMirror 仍会在底层消费 Escape。现有低优先级键盘扩展在候选层放行后向最近的原生对话框发出可取消的关闭请求。关闭请求不改动编辑器的选区。Web 的持久化断言用浏览器同源会话，桌面分支用 preload 提供的身份。
- `packages/editor/test/suggestion-host.test.ts` 2 通过。证据 `u1-host-contract.log`。
- `tests/e2e/workflows/workbench-baseline.spec.ts` 的「U1 Inbox、Task 和 Automation 在真实对话框中共享浮层与表单行为」1 通过，覆盖 Linux Electron 和独立 Web 两个宿主。用本检出的 `apps/desktop` 产物，构建记录为 `u1-recheck-two-build.log`。构建后调整了导入顺序和 Playwright 会话读法。证据 `u1-final.log`、`u1-final.json`，初始和中间观察见 `baseline.*`、`u1-recheck*.log`。最终命令由 `u1-check.sh` 记录。

```bash
flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/desktop run build
flock /home/wta/projects/huhu/temp/dev/verify.lock env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 HUHU_U0_DESKTOP_APP="$PWD/apps/desktop" xvfb-run -a volta run --node 24.22.1 pnpm exec playwright test tests/e2e/workflows/workbench-baseline.spec.ts -g 'U1 Inbox、Task 和 Automation' --workers=1 --retries=0
```

### F22 · 命令面板焦点

- 改动包括 `packages/ui/src/components/Dialog.tsx`、`packages/workbench/src/command-palette/CommandPalette.tsx`、`packages/workbench/src/shell/{destination-focus.ts,region-cycle.ts,shell.css}` 及入口、`apps/desktop/src/renderer/workbench.tsx`、`packages/workbench/test/region-cycle.test.ts` 和 `tests/e2e/workflows/workbench-baseline.spec.ts`。
- 面板复用原生 Dialog 和可取消的关闭行为。页面背景随模态进入惰性状态，F6 与 Shift+F6 在模态内消费，组合输入期间 Escape 与 Enter 不关面板或执行命令。取消恢复触发控件，执行等面板关闭后再走现有导航和离场守卫。对模块和具体搜索结果，焦点放在目标模块的当前标签，内容仍由原导航请求定位。
- `packages/workbench/test/region-cycle.test.ts` 3 通过，`packages/workbench/test/palette.test.ts` 4 通过。证据 `f22-focus.log`、`f22-palette.log`。另在工作树运行 `apps/desktop/test/host-ui-contract.test.ts`，7 通过。
- 待 Lead 运行 `tests/e2e/workflows/workbench-baseline.spec.ts` 的「F22 命令面板隔离键盘焦点并在关闭或执行后恢复导航」。同一用例包含 Electron 与独立 Web、两种 Tab 方向、F6、关闭按钮与外层快速捕获、组合输入及执行后焦点。

### UX13 · 稳定本机 HTTP MCP

- `apps/engine/src/{boot,main,mcp-listener}.ts` 复用 Engine 的回环监听器。端口保存于 Vault 的本机 runtime 并绑定 Vault ID 与已解析根目录。首次启用固定实际端口，修改配置后显示现行地址和待重启端口。重启读取本机配置，端口冲突明确失败。复制另一个 Vault 的发现描述或本机端口配置不会混用原实例。普通 CLI 寻找运行实例和按需启动沿用现有路径。
- `packages/contracts/src/capability.ts`、`packages/kernel/src/{mcp,gateway-tokens,capabilities/system,server/capability-http,server/http-app,server/listen-http,server/mcp-http}.ts` 和 `apps/cli/src/{main,connect,commands/call}.ts` 收敛 Huhu 的入站 MCP 为 Streamable HTTP `/mcp`。移除 CLI 的 `mcp` 子命令、`apps/cli/src/mcp.ts` 及专用控制路由。复用已持久化的入站令牌、会话所有权和恢复凭证。旧 stdio 启用配置读取时按关闭处理，明示启用后才发布。原 HTTP 调用来源仍记为 `http`，Tasks 移除旧本机 stdio 会话可跨 CLI 读取问题的特例。
- `packages/workbench/src/gateway/GatewayModule.tsx`、网关查询失效和文案、`plugins/ssh/src/ui/SshSharedTools.tsx`、`plugins/agent-guide/src/shared/guide-files.ts` 沿现有页面提供端口编辑与真实生效 URL，复制的 JSON 使用待填入的持久令牌占位符。端口输入拒绝浏览器禁止使用的 HTTP 端口，规则沿用原 listener。页面整体布局等待原型决定。 [Fetch 端口限制](https://fetch.spec.whatwg.org/#port-blocking)
- 更新了 Engine、CLI、kernel 和各域的入站调用测试及共享 HTTP fixture。Endpoint 合同用实际 HTTP 客户端和 CLI 启动验证了同 URL 重启、令牌撤销、错库、旧桥失效、正常 CLI、固定端口冲突与恢复。合成 provider 验证了真实 Core 会话，回执测试附带了两种入口各自的授权范围。
- 下表采用文件的最后一次结果。日志及分批状态见 `ux13-{units,extra,final-units,core-units,ssh-units,protected-units,endpoint-final}/`。Core 文件使用检出内 `apps/desktop/resources/herdr/linux-x64/herdr-core` 作为 `HUHU_AGENT_LAUNCH_TEST_BIN`，Linux 终端授权复跑另设 `HUHU_AGENT_PTY_HOST=/home/wta/projects/huhu/native/agent-pty/bin/huhu-agent-pty`。仅设置 Core 时终端授权在运行前拒绝，补齐受保护启动宿主后 2 通过。

| 测试文件 | 最终结果 |
| --- | --- |
| `apps/engine/test/endpoint-contract.test.ts` | 4 通过 (4) |
| `apps/cli/test/approved-terminal.test.ts` | 2 通过 (2) |
| `plugins/ssh/test/public-resources.engine.test.ts` | 1 失败，55 通过 (56) |
| `plugins/tasks/test/persistence-http.test.ts` | 43 通过 (43) |
| `apps/engine/test/task-dispatch.live.test.ts` | 2 通过 (2) |
| `plugins/agent-cli/test/native-receipts.live.test.ts` | 5 通过 (5) |
| `apps/engine/test/external-plugins.test.ts` | 19 通过 (19) |
| `apps/engine/test/tool-access.test.ts` | 3 通过 (3) |
| `plugins/mail/test/accounts-engine.test.ts` | 2 通过 (2) |
| `plugins/mail/test/drafts-engine.test.ts` | 2 通过 (2) |
| `plugins/mail/test/ai-selection-engine.test.ts` | 1 通过 (1) |
| `plugins/ssh/test/directory.test.ts` | 3 通过 (3) |
| `plugins/agent-guide/test/guide.test.ts` | 10 通过 (10) |
| `plugins/agent-cli/test/tool-exposure.test.ts` | 12 通过 (12) |
| `plugins/mail/test/tool-exposure.test.ts` | 5 通过 (5) |
| `plugins/notes/test/domain-exposure.engine.test.ts` | 11 通过 (11) |
| `plugins/ssh/test/domain-exposure.engine.test.ts` | 2 通过 (2) |
| `plugins/versioning/test/domain-exposure.engine.test.ts` | 5 通过 (5) |
| `apps/desktop/test/host-ui-contract.test.ts` | 7 通过 (7) |
| `packages/kernel/test/server.test.ts` | 20 通过 (20) |
| `packages/kernel/test/mcp-recovery.test.ts` | 3 通过 (3) |
| `packages/kernel/test/kernel-exposure.test.ts` | 98 通过 (98) |
| `apps/cli/test/cli.test.ts` | 17 通过 (17) |
| `apps/engine/test/capability-catalog.test.ts` | 3 通过 (3) |
| `apps/engine/test/engine.test.ts` | 50 通过 (50) |
| `plugins/automations/test/task-scan-occurrences.test.ts` | 29 通过 (29) |
| `plugins/safe/test/external.engine.test.ts` | 3 通过 (3) |
| `plugins/mail/test/ai-settings-engine.test.ts` | 1 通过 (1) |
| `plugins/ssh/test/host-auth.engine.test.ts` | 4 通过 (4) |

#### UX13 待 Lead 验证

| Spec | 用例 |
| --- | --- |
| `tests/e2e/workflows/acceptance.spec.ts` | UX13 能力网关 MCP：保存本机端点、复制 HTTP 客户端配置、管理所属插件 |
| `tests/e2e/ssh/settings.spec.ts` | SSH settings reflect the shared gateway policy and provide redacted client samples |
| `tests/e2e/ssh/entry-parity.spec.ts` | CLI / HTTP MCP updates SSH authentication, approves trust, reads job output and transfers bytes |
| `tests/e2e/ssh/owned.spec.ts` | CLI / HTTP MCP isolates SSH terminals, files, imports and forwarded listeners |
| `tests/e2e/workflows/automation-linux-environment.spec.ts` | Linux 桌面批准 sh，CLI 和 MCP 配置及运行沿用原请求 |
| `tests/e2e/workflows/external-task-web.spec.ts` | D09 同包 CLI 创建与 MCP 修改的同一任务刷新到桌面和 Web |
| `tests/e2e/workflows/external-agent-desktop.spec.ts` | CLI-only / HTTP MCP-only 同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果 |
| `tests/e2e/packaged/packaged.spec.ts` | 打包后：CLI 与 HTTP MCP 逐项授权，Safe 锁定期间读取邮件并恢复新格式备份 |

## 阻碍与接续

- SSH 的「a changed jump revision invalidates the original pending target before authentication」仍为 1 失败、55 通过，期望 `VERSION_CONFLICT`，实际 `NOT_FOUND`。同一失败在 `59a6020e` 已有记录，归 #7 S2。证据 `ux13-ssh-units/plugins_ssh_test_public-resources.engine.test.ts.log`。
- 尚未运行 F22 和 UX13 的 Playwright 用例、组合候选重建后的 U1 复跑、独立真实 Windows 客户端（无 `huhu` PATH）、外部 provider 或服务、打包及全量验证。
- 类型检查待 Lead 串行执行。生产代码影响 `@huhu/contracts`、`@huhu/kernel`、`@huhu/engine`、`@huhu/cli`、`@huhu/ui`、`@huhu/editor`、`@huhu/workbench`、`@huhu/desktop`、`@huhu/plugin-ssh`、`@huhu/plugin-tasks`、`@huhu/plugin-agent-guide`。联验测试还涉及 `@huhu/plugin-agent-cli`、`@huhu/plugin-automations`、`@huhu/plugin-mail`、`@huhu/plugin-notes`、`@huhu/plugin-safe`、`@huhu/plugin-versioning`。

### Modern Web Guidance

- `dialog` “use `dialog.showModal()` when opening from script.” 命令面板复用模态 Dialog。编辑器的关闭请求先触发可取消的 `cancel`。
- `forms` “always associate `<label>` with its input using `for` and `id`.” 端口输入使用关联标签，提交失败时聚焦该字段。

## Lead 验收

- Lead 2026-11-25：U1/F22/UX13 合入 main 6ebc3b4c，17 包类型检查与 E2E 通过（Lead 更新 ssh/settings 一条过时断言）。清单转 task08。
