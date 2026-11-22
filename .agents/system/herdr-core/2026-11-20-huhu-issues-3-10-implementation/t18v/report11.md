# task11.md · #7 H10 SSH 设置与 H8 Remote 转发复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task11.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task11.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report11.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-ssh-settings`
- 基线 — `95b7352c2ad220d54f57670d1fddf2025dde4986`
- HEAD — `6ba3c6bddf7d59763643d86e07509c4177211f47`

## 提交

| 提交 | 可核验结果 |
| --- | --- |
| `89d84e3d29c746b760350f587378fcc448d0a397` | H8 Remote 收到 `forwardIn` 成功回复后显示已确认的申请地址和端口，并说明实际绑定由服务器策略决定。Local、SOCKS5、HTTP CONNECT 通过 `server.address()` 显示实际绑定。四种转发通过真实的回环 TCP 验证。 [独立复核](<D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bh/report01.md>) · [H8 证据](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H8-runtime-windows.md>) |
| `ed7ef6f7011151ba6c92b2656c821a506d78abb2` | SSH 侧栏使用一个纵向滚动容器。标题、项目、页脚参与同一布局，960×600 仍可把完整项目滚到可点击区域。「并发版本」和「Mirror Copy」的公共用例分别通过。这个提交只改 SSH CSS。 |
| `22e86fd3ce8fdb95ffaa1c27c27faeefebc4ce4f` | H10.1 在全局设置贡献 SSH 页。保存后应用标签方向、分栏工具栏、终端字体与局部字号缩放。按设备和 Vault 标识恢复之前选中的已有运行，断线由用户手动重连。 |
| `f8f00159c8bb6ced65910799e387179f64eaa490` | H10.2 分开保存本机文件视图和 Vault 默认值。新拨号与同一拨号链读取同一份连接偏好，主机覆盖和显式 0 有效。文件表实际过滤点文件和改变默认排序，附着视图及双栏消费相应偏好。并发数用于实际传输队列调度。 |
| `6ba3c6bddf7d59763643d86e07509c4177211f47` | H10.3 读取共享网关的修订、能力目录、stdio／HTTP 状态和 SSH 审计，复制的示例留空真实路径和令牌。SSH 当前没有可开放能力，工具选择仍由能力网关管理。 [H10 消费者与取证](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H10-settings-windows.md>) |

## 验证

| 范围 | 实测 |
| --- | --- |
| 两个 960×600 公共回归 | `playwright test tests/e2e/ssh/host-records.spec.ts tests/e2e/ssh/import.spec.ts --grep '保持编辑失败草稿&#124;相同主机身份补齐分组' --workers=1`。两个用例都从普通指针点击走到后续断言。初始布局在本检出复现「并发版本」点击超时。导入用例的修复前证据来自公共 `42d332a9`，运行时沿用该版本切换到 `ssh.hosts.configure` 的夹具。 [定向日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/sidebar-test.log>) · [公共失败证据](<D:/Document/code/huhu/temp/issue-baseline/h9-mail-workbench-artifacts>) |
| SSH 单元及 Engine | `vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test`，10 文件、71 项通过。覆盖实际 Remote 确认与端口释放、导入兼容、带版本写入、显式 0、Vault 隔离和真实 TCP 握手超时。 [日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/ssh-final-unit.log>) |
| Windows Workbench SSH | `playwright test tests/e2e/ssh --workers=1`，13 项通过，含两个 960×600 用例、两项新增设置用例和转发。网关用例比较共享修订，用本机 CLI、MCP stdio、MCP HTTP 读取实际工具列表，核对被拒的 SSH 调用留在审计、关闭服务时 HTTP 返回 404、停用插件后目录状态及导航变化。 [日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/ssh-final-workbench.log>) |
| 工作区扩展回归 | `playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1`，8 项通过，`42d332a9` 的 H4.2 缺失主机夹具复现 1 个已知失败。临时替换该夹具后精确用例通过，见下文。 [公共版本日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/ssh-final-workflow.log>) · [夹具探针](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/workflow-fixture-probe.log>) |
| 构建与静态检查 | 桌面生产构建、SSH TypeScript、改动格式、SSH Oxlint、Stylelint、五项项目 CSS 检查和 `git diff --check 95b7352c..HEAD` 通过。Electron 44.9.1，Chromium 152.0.7977.167。 [构建日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/ssh-final-build.log>) |

试验均在 Windows 及隔离 Vault 上进行。合成 SSH 服务及 MCP HTTP 使用 `127.0.0.1`，没有在外部主机上验证 GatewayPorts。Remote 显示基于 SSH 请求及确认，服务器选中的实际地址继续标为未知。CSS 和可访问性设计使用 Modern Web Guidance 的 `css-layout`、`forms` 和 `accessibility`。复用 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c` 的连接和终端设置结构，复用 Huhu 的 Settings、Vault 版本写入、工作台文件表和能力网关。

## 范围与 Lead 接续

- 终端字号通过 CSS 局部缩放。共用终端保留固定 5000 行回滚，行距、光标、选中复制、本机 Shell、录制和原生独立文件窗口在本次设置页按实际可用性说明。SFTP 保持逐项确认覆盖，文件发布仍核验内容与修改时间。
- 当前 SSH 能力清单均为不可外部开放。设置页展示同一个公共策略。集成验证使用隔离 Vault 的 `notes.list` 推进修订，同时验证 SSH 工具候选被拒绝。按主机开放继续等待 #6 Q6-3。
- `42d332a9` 公共工作区测试的第 299 行试图从旧 `.huhu/ssh/hosts/<id>.json` 删除新建的托管主机，实际托管定义位于模块凭据目录，因而在断言前触发 ENOENT。验证过的夹具办法是创建一个仅含合成地址和 `auth: { kind: "agent" }` 的非托管兼容文件，存模板后删除该文件。用这个夹具，绑定写入失败零拨号、已移除、身份变更、本机端口失败及原目标零拨号均通过。该探针只在当前工作树临时运行，公共测试文件已还原，夹具修订归公共装配。 [失败位置](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/ssh-final-workflow-artifacts/workflows-ssh-workspaces-H4-2-绑定写入失败零拨号，已删除和身份变更有各自分栏/error-context.md>) · [替换夹具验证](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task11-b0a218b2/workflow-fixture-probe.log>)
- 公共 Workbench 复跑临时读取 `42d332a9` 的导入、监控和工作区测试文件，实际构建始终在指定分支的工作树。提交只包含 SSH 插件、授权的 SSH 测试和证据。公共 Engine／Renderer 装配和根锁未写入。工作树干净，临时依赖 junction 已清理。

## Lead 验收

由 Lead 追加。
