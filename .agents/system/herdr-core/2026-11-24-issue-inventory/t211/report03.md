# 派发回执

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory`
- terminal_address — `t211`，本机默认 Core
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task03.md`
- 回执文件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report03.md`
- 业务验收报告 — `2026-11-19-issue-7-ssh-module/evidences/` 的 H4.3、H5.2、H10.1、H10.2、H12.1 和 Inventory 的 `041-s3.md`、`099-s6.md`、`105-s7.md`，由 Lead 写入。
- 执行结果 — `done`。交付分支、定向验证和 Lead 待运行用例已就绪。
- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w3`，本轮从 `b9b7f3d3` 快进至 `774a5b26` 后实施，交付 `5f1519e5645071adb5dcea94741a5f6a38996df8`。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task03/`

## 成果与运行指针

| 范围 | 提交 | 改动与验证依据 |
| --- | --- | --- |
| 第 2 轮回归 | `3f46742b` | `packages/ui/src/components/TerminalView.tsx` 使用主题 `--warning-bg` 和 `--warning-text`，外观变化后刷新。`tests/e2e/ssh/{settings,shortcuts}.spec.ts` 的工作区启动入参只传 `{ hostId }`。`lifecycle.spec.ts` 走 Vault 的 `readEngineEndpoint`，读取当前机器描述符、核对 Vault 与端口后向本地夹具 Engine 发信号。 |
| H4.3 整工作区迁移 | `36e00e21` | `plugins/ssh/src/engine/terminal-bridge.ts` 在所有源控制者准备且所有目标 Socket 都已认领后一次提交，用同一组票据保留原 Shell。源分栏留在原渲染进程，关闭目标或目标失效时归还全部存活 Shell。`terminal-window.ts`、`Workspace{Canvas,Library,RunView}.tsx`、`Ssh{Terminal,Workspace}Window.tsx`、`TerminalView.tsx` 和桌面 main/preload/renderer 共用原生窗口与 Canvas。当前布局版本、分栏 ID、Shell ID、回放与活动焦点随窗移交，目标确认后才显示。分栏均已就绪且输入未锁定时可移窗，结构编辑在移回后继续。Web 显示原生换窗能力范围。 |
| H10.1 多条终端高亮 | `c06268c7` | `SshSettingsPage.tsx`、`TerminalHighlightSettings.tsx`、`device-preferences.ts` 和 `SshTerminal.tsx` 支持增删、启停和顺序，迁移旧的单条字面规则。UI `terminal-content.ts`、`terminal-highlight{s,-patterns,.worker}.ts` 处理可见行、软换行、硬换行及宽字符，设置中的规则顺序决定重叠优先级。普通缓冲用 xterm 装饰，备用缓冲用按 xterm 字格坐标绘制的只读覆盖层。正则在有超时上限的 Worker 中执行，异常时同一视图继续应用字面规则。 |
| H10.2 重连计划 | `43110b8f` | `shared/{preferences,trust,workspace}.ts`、`engine/{manager,workspace-runs,workspace-pane-capability,capabilities}.ts` 与 `ui/{SshModule,SshVaultSettings,SshSettingsPage,HostDirectory,WorkspaceRunView,ReconnectSchedule}.tsx`。本库默认关闭，开启后的默认计划仍为 1 秒后尝试一次。可设 1–10 次，按初始间隔指数退避并受上限约束。传输类失败进入下一轮，身份、权限或路由等失败终止。主机和工作区分栏显示下一次时间或进行中状态，可取消计划。主动断开不触发。共享主机连接恢复后原 Shell 和文件会话按原行为处理，独立工作区分栏可重新打开 Shell。 |
| H10.2 文件列宽 | `5f1519e5` | `FileTable.tsx`、`FileColumnResize.tsx`、`files.css`、`device-preferences.ts`。本机、附属、独立远端及 sudo 文件表共用名称、大小、修改时间、权限列的宽度偏好。拖动有预览，松开保存，Escape 取消，方向键和 Home/End 可调整。恢复宽度保留排序和列显示设置。`settings.spec.ts` 恢复测试前的设备偏好，并补上启动设置用例的设备状态清理。 |

## 定向验证

使用 Node `24.22.1`。以下每行分别用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm` 执行，持锁核对内存、cgroup 余量和磁盘。

| pnpm 参数 | 结果 | 原件 |
| --- | --- | --- |
| `exec vitest run plugins/ssh/test/terminal-runtime.test.ts` | 8 通过，含单 Shell、整组准备失败、整组迁移和恢复控制 | `h43-terminal-runtime.log` |
| `exec vitest run plugins/ssh/test/workspace-pane-edits.test.ts` | 1 通过 | `h43-pane-edits.log` |
| `exec vitest run packages/ui/test/terminal-content.test.ts` | 4 通过，含普通和备用缓冲的跨行范围、宽字符、重叠规则 | `h101-terminal-content.log` |
| `exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` | 11 通过，含单条高亮迁移、非法正则与列宽保存恢复 | `h102-file-device.log` |
| `exec vitest run plugins/ssh/test/manager.test.ts` | 35 通过，含真实回环重连第一次失败、第二次成功及取消 | `h102-reconnect-manager.log` |
| `exec vitest run plugins/ssh/test/preferences.engine.test.ts` | 2 通过，含 Vault 隔离、设置持久化、默认独立分栏恢复 | `h102-reconnect-preferences.log` |
| `exec vitest run plugins/ssh/test/public-resources.engine.test.ts` | 63 通过，含外部 CLI/MCP 资源、工作区和连接作用域回归 | `h102-public-resources.log` |
| `--filter @huhu/ui run typecheck` | 0 错误 | `final-type-ui.log` |
| `--filter @huhu/plugin-ssh run typecheck` | 0 错误 | `h102-file-type-ssh.log` |
| `--filter @huhu/desktop run typecheck` | 0 错误 | `final-type-desktop.log` |

7 个定向测试文件共 124 项通过。`git diff --check 774a5b26 HEAD` 通过。4 个改动的 Playwright spec 经 TypeScript 语法检查，新增高亮及列宽代码经颜色字面量检查。工作树干净。

### Lead 待运行的 Playwright 用例

| 规格 | 用例名 |
| --- | --- |
| `tests/e2e/ssh/remaining.spec.ts` | `H4.3 整工作区换窗和移回保留布局、全部分栏与焦点，目标分栏失败时保持原窗口` |
| `tests/e2e/ssh/remaining.spec.ts` | `H4.3 原生窗口接管同一 SSH 终端并回放，启动失败保留原窗口输入` |
| `tests/e2e/ssh/settings.spec.ts` | `H10.1 保存并排序跨行终端高亮规则，命令补全和锁定工具栏仍可用` |
| `tests/e2e/ssh/settings.spec.ts` | `H10.2 非预期断线显示下一次重连并允许取消` |
| `tests/e2e/ssh/settings.spec.ts` | `H10.2 文件表列宽可拖动、键盘调整、重载并恢复，SSH 设置应用到运行视图` |
| `tests/e2e/ssh/settings.spec.ts` | `H10.2 SSH 启动目标和工作区恢复策略在下一次载入时生效` |
| `tests/e2e/ssh/shortcuts.spec.ts` | `H5.2 桌面 键入只广播到显式选定的可输入分栏并可一键停止` 和 `H5.2 独立 Web 键入只广播到显式选定的可输入分栏并可一键停止` |
| `tests/e2e/ssh/lifecycle.spec.ts` | `H12.1 Engine 异常退出释放转发并留下唯一传输终态，原工作区可重新连接` |

### 未运行的验证

- Playwright 用例、构建、打包、安装包检查、视觉截图、全仓类型检查、全仓 lint 和 knip 由 Lead 按本轮候选执行。桌面原生窗口、实际桌面和独立 Web 高亮呈现、浏览器拖拽及第 2 轮修订用例的运行结果待 Lead 验收。

## 阻碍与接续

实施无待决阻碍。待 Lead 对分支结合上述用例验收。

## Lead 验收
