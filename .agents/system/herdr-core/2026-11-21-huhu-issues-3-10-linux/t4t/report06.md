# #7 H4.3 跨窗口接线独立审查

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，Core `wta-ubuntu`，Lead `t3p`，worker `t4t`。
- `t4t/task06.md` → `t4t/report06.md`。任务完成。只审查 `858564a58e5780f20d5cbbed7953ab65b89fed55` 相对 `f16cf1cdd43d45f68639c63b7bdafc319ef5c9f7`。依据 H4.3 和 Lead 已接受的 [换窗设计与验收](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report04.md)。

## 规格问题

### P1 · Engine 已交接时，宿主超时或目标失联仍可能丢失可输入分栏

**条件和影响。** Engine 提交时改写唯一控制者、把源降为观察者，并从等待队列移除两端；随后才向两个 renderer 发送回执。若 Engine 提交成功，主进程的 `complete` 仍未收到，主进程把事务当成 pending。超时、目标文档重载或崩溃会走取消并直接销毁目标窗。应用退出的开始阶段也直接销毁 pending 窗，即使最终有窗口选择「保留窗口」。Engine 释放目标 socket 后，原 socket 仍是观察者，已经不在候选队列，主进程也没有变更要广播给源。用户可看到保留的源分栏却无法输入，shell 仍在。如果源的成功回执先于目标失联通知抵达主进程，主进程也可以确认已失联的投影视图并让源解绑。源收到确认失败后只对账一次 `moved()`，无法区分这几种结果。 [Engine 提交与回执](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/terminal-bridge.ts:176) · [Engine 断开释放](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/terminal-bridge.ts:272) · [宿主取消](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/workspace-window.ts:53) · [附着后超时与完成](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/workspace-window.ts:126) · [退出前取消](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:623) · [客户端对账](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/workspace-window.ts:53)

**修复与验证。** 让主进程能按同一操作读取 Engine 的终态与当前活附着，再决定显示、回收或恢复入口。已提交且目标失联时沿原 shell 的正常模式重挂，保留已经获得控制的第三方。加一条受控时序，允许 Engine 提交后暂缓两个窗口的 IPC 回执，再分别触发超时、目标重载和应用退出后保留窗口。断言至少有可恢复入口、只有一方取得输入、未开新 shell。现有「目标关闭后旧提交只对账」只验证 Engine socket，不驱动宿主状态。 [现有回执测试](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/test/terminal-runtime.test.ts:342) · [Electron 窗口销毁语义](https://www.electronjs.org/docs/latest/api/browser-window#windestroy)

### P2 · 原工作区隐藏但仍挂载时，待定换窗可以在后台提交

**条件和影响。** 源工作区打开「独立文件会话」后设置 `fileView`，工作区变为隐藏和 inert，终端仍挂载。换窗只在用户点击「取消换窗」或原 socket 断开时发取消。待定操作继续等待目标附着，完成后会显示并聚焦新窗口，打断正在查看文件的用户。真正卸载终端的路径会 abort 其 socket 生命周期。 [文件视图隐藏工作区](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/SshModule.tsx:242) · [文件入口](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/WorkspaceLibrary.tsx:230) · [换窗取消来源](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/WorkspaceRunView.tsx:124) · [终端仍挂载](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/WorkspaceRunView.tsx:374) · [宿主完成时聚焦](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/workspace-window.ts:139)

**修复与验证。** 在源视图由 shown 变为隐藏、切换运行或卸载时撤销未提交的操作。已提交操作沿原回执收尾，并以当前前台视图决定是否请求激活。延迟目标附着后进入独立文件会话，确认没有弹出窗口，返回工作区可继续操作原终端。

### P2 · 关闭目标窗后，源窗按本地默认值重新请求写权限

**条件和影响。** 完成后 `moved()` 只给源五元组。目标 `closed` 后主进程删除归属并通知来源。来源把终端按 `observe={Boolean(locked[paneId])}` 重新挂载，`locked` 是 renderer 内存状态。若源窗在分栏移出期间重载，原来锁定的源分栏会以可写请求恢复；非锁定但曾由服务端降级的源视图也会这样请求。没有当前控制者时会直接取得键盘及 resize 权。接受的设计要求此处先以观察视图恢复，后来显式取得空闲控制。现有 E2E 在目标关窗后直接输入，编码了自动取得控制的行为。 [归属清除与源投影](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/workspace-window.ts:149) · [源输入锁状态](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/WorkspaceRunView.tsx:52) · [源重挂模式](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/WorkspaceRunView.tsx:393) · [Engine 授权初始角色](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/terminal-bridge.ts:189) · [当前 E2E 的关窗输入断言](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/ssh/remaining.spec.ts:205)

**修复与验证。** 让恢复投影携带显式观察状态，并沿 Engine 现有仲裁接受用户请求控制。覆盖原锁定视图、被降级的观察者、源 reload、已有控制者和当前空闲四种边界。先断言恢复前的输入及 resize 计数保持原样，再检查显式取得控制后的输入。

## 规范与接线问题

### P1 · 第二个完整工作台能在另一个窗口完成保存前停止共享 Vault

**条件和影响。** 目的窗口沿正常工厂和 AppShell 启动。只有 SSH 模块换为分栏投影，其他模块及 Vault 切换仍可用。Vault 切换/关闭对话框只处理发起方 renderer 注册的文档。main 随后停止共享 supervisor，并向所有窗口广播状态，触发其他窗口的工作台模块卸载。另一个窗口中仍未保存、草稿写入还未完成的内容可能丢失，其留窗或取消选择也没有参与此次核对。多窗口的显式应用退出已有逐窗确认，切换与关闭 Vault 的调用链没有同等协调。 [目标窗仍是完整工作台](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/renderer/main.tsx:405) · [只替换 SSH 模块](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/index.tsx:20) · [本 renderer 的未保存集合](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/workbench/src/state/flushers.ts:21) · [切库保存及 reload](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/workbench/src/shell/VaultSwitchDialog.tsx:38) · [共享 Engine 停止与广播](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:334) · [Vault 关闭 IPC](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:445) · [应用退出逐窗确认](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:635)

**修复与验证。** 共享 Vault 的停用或切换应沿现有 Main 逐窗核对机制收集受影响文档，所有窗口均放行才停止旧 Engine。双窗夹具在一窗保留尚未落盘的笔记，在另一窗发起切库及关闭 Vault。核对取消保留 Engine 与原焦点，允许时真实文件或草稿均有回执。

### P2 · 主进程的附着和完成没有校验 Engine 回执所指的目标

**条件和影响。** IPC 入口校验可信顶层 frame、当前 Engine 和持久窗口关联，开窗时也查询了 ready 的五元组。Engine 的 ticket 实际绑定 shell 与 socket；Main 保存的 ticket 和目标地址则由源 renderer 分别提交。后续 Main 只用参与窗口、frame、原 ticket 和 renderer 提交的 mode 更新归属，没有校验 ticket 对应的是该目标、其确实附着或 Engine 已提交。错误或过期的可信 renderer 回调可以让 Main 误报「已移至另一窗口」，使真正源视图被卸载。此路径本身不会向 Engine 授予输入权。准备阶段的源文档监听也在异步 `validTarget` 之后才安装；附着后源的 reload/crash 被留给对账，Main 仍需根据真实提交结果区分是否取消。 [可信顶层 IPC 校验](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/window-chrome.ts:38) · [Main 的五元组查询](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:304) · [异步开窗与文档监听](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/workspace-window.ts:64) · [Main 接纳附着、mode 与完成](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/workspace-window.ts:126) · [Engine 实际只认同 shell 和 socket](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/terminal-bridge.ts:137) · [Electron IPC frame 生命周期](https://www.electronjs.org/docs/latest/api/structures/ipc-main-invoke-event)

**修复与验证。** 开始异步校验前固定文档代次并监听失效。把同一 Engine、准确业务地址、操作、目标附着和结果关联到主进程可验证的回执。受控 IPC 测试应拒绝未获 Engine 提交、绑定不一致以及被旧文档占用的回执，源分栏和控制保持原样。

### P3 · E2E 焦点与尺寸断言可弱化桌面验收

**条件和影响。** 用例核对目标 renderer 的 xterm textarea 有 DOM 焦点，再用 Playwright 对目标 Page 发送输入。缺少 BrowserWindow 在操作系统中的焦点证据。尺寸断言只查右侧计数增加，缺少交接完成后的稳定起点、尺寸归属和源 resize 的负例。用例也只关目标窗，未验证源窗有待保存内容时的保留、实际关闭与目标继续运行。已有的 shellId、历史回放、布局版本和远端回显断言仍提供实际绑定证据。 [焦点及定向键盘断言](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/ssh/remaining.spec.ts:176) · [尺寸与关窗断言](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/ssh/remaining.spec.ts:196) · [Electron 窗口焦点语义](https://www.electronjs.org/docs/latest/api/browser-window#winfocus)

**修复与验证。** 在真实桌面会话中同时断言目标 BrowserWindow 实际聚焦、对应 xterm 获得焦点和远端只收到一次输入。等待交接后的尺寸稳定，分别调整两窗并断言只有控制方改变 PTY。增加源窗先保留再关闭、目标继续使用同一 shell 的回归。

## 固定候选核对

- 受邀 Web 不具备桌面 handoff 标记。回环桌面 terminal 使用受验证的 desktop bearer，分享入口由 Engine 单独封装，WS 查询只消费尺寸和观察标记。preload 限于顶层非 data 文档，Main 再要求已登记 BrowserWindow 和可信工作台 URL。正常路径下 Engine 按 socket 原子提交，所有二进制输入和 resize 均复核当前控制者。原样回放来自同一 shell 的缓冲，源和目的视图的 detach 不关闭 SSH channel。 [回环终端权限](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/http-app.ts:133) · [桌面与 Web 分流](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:569) · [WS 参数](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/ws-workbench.ts:58) · [preload 入口](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/preload/index.ts:20) · [输入和 resize 仲裁](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/terminal-bridge.ts:242) · [原 shell 回放及 detach](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:1037)
- 指定日志记录类型检查调用、16 项终端运行测试和 1 项真实 Engine/回环 SSH/受邀 Web 流测试通过。后者检查桌面源交接、邀请 Web 认领拒绝、关联的原 shell 及旧源写入被拒绝。Electron E2E 只有 6 项列表，其中包含 H4.3。窗口身份、真实桌面焦点、目标回执丢失及双窗保存的建议用例尚无运行证据。 [指定验证日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/h7-pane-window-check.log) · [真实 Engine 夹具](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/engine/test/engine.test.ts:919)
- `git diff --check` 通过。此次只写同号报告，未运行测试、构建、Electron E2E 或远端命令。使用本机 modern-web-guidance 核对视图重挂时的焦点恢复；此次为只读审查。

`hc get t4t` 因沙箱 Core 锁只读失败，身份与任务指针已通过本机、topic 和 manifest 核对。
