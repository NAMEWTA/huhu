# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t7
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t7/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t7/report01.md
- 执行结果 — done

## 结论

以 Linux 只读快照 `4d86c84b` 为准，四个 Issue 均仍需保留开放。优先处理 #6 用户动作仍不可开放、#5 失败轮次重试入口、#4 受控 provider 的平台边界。#3 最省工的下一步是拿同版安装包做原生窗口验证。#5/#4 可以从现有双 ACK、真实 Tasks 收件箱和切换后的生产入口继续，无需重写执行链。

103 个计划切片中，30 个有阶段验收，59 个待验证，14 个为 WIP。另对原文 151 条验收要求逐条核对。独立候选、已被替代的分支和交接时未开始的 P8.3 见分支表。

历史验收仅对列明的行为与环境有效。下表「已验收」指有历史运行证据覆盖该片的主行为，「待验证」指已有入口而验收矩阵仍有缺口，「WIP」指已能定位局部成果与具体实施缺口；「未开始」仅用于没有找到相应交付的部分。任务编号可直接在该成员的 tasks 目录查到验收步骤；代码和测试路径相对快照根。历史 Core 路径相对 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`。同名提交或报告的 done 字段单独均不能证明功能通过。

四份原型已在 `6da1b2ec` 确认。Windows 阶段版本 3bd2e24、3290af1、9bb7efaf、40822efd、78e180b7 留有范围不同的证据（批次 windows-stage-*.md 和 evidence/）。40822efd 有 38 项桌面/Web 和 4 项包内通过，包 SHA-256 为 `3b9d72dd8da98add223243650986ad77a3ba5c50e2b9007e408a049ae1df7521`。handoff.nd 记录 4d86c84b 的 Windows 定向 66 项和两个桌面用例。两次运行覆盖的提交、动作均不同。Linux 五项静态/构建门禁通过及 1261 过、15 败取自 Lead 任务交接。本次未运行测试。

### Issue #3 · desktop-shell

成员目录 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell`。下表给出 4d86c84b 中的可复查文件；测试名称见后文组合验收。

| 计划切片 | 状态 | 实现 / 证据入口 | 剩余动作 |
| --- | --- | --- | --- |
| S0-01 采集安装版窗口基线 | 待验证 | `tests/e2e/window-chrome.spec.ts` · `apps/desktop/src/main/index.ts`（首项文件版本 cfbce161） | 三平台安装首屏留全窗截图并记录窗口管理器和缩放 |
| S0-02 走查标题栏与关闭提示 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/prototype-review.md` · `packages/workbench/src/shell/AppShell.tsx` · `tests/e2e/window-chrome.spec.ts`（首项文件版本 6da1b2ec） | 以已确认指纹比较实装关闭提示 |
| S1a-01 关窗前保存最后一次文档输入 | 已验收 | `tests/e2e/knowledge/session-flush.spec.ts` · `apps/desktop/src/main/index.ts`（首项文件版本 cfbce161） | 最终包读回防抖期最后字节和手动草稿 |
| S1a-02 从关闭失败提示重试或取消 | 已验收 | `tests/e2e/knowledge/session-flush.spec.ts` · `apps/desktop/src/main/index.ts`（首项文件版本 cfbce161） | 同包复跑保存失败、取消、重试 |
| S1a-03 把关窗升级为一次可取消的应用退出 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/verification/S1a-03-quit-coalescing.md` · `apps/desktop/src/main/index.ts` · `tests/e2e/knowledge/session-flush.spec.ts`（首项文件版本 6ebe3e04） | 复跑第二窗口拒绝时第一窗及 Engine 存活 |
| S1b-01 把真实窗口状态交给所属工作台 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/verification/S1b-S2-window-chrome-windows.md` · `apps/desktop/src/main/index.ts` · `tests/e2e/window-chrome.spec.ts`（首项文件版本 cfbce161） | 同包验证主 frame、预览隔离及订阅清理 |
| S1b-02 在 macOS 保留系统红黄绿 | 待验证 | `apps/desktop/src/main/window-chrome.ts` · `apps/desktop/src/main/index.ts` · `tests/e2e/window-chrome.spec.ts`（首项文件版本 efc33768） | macOS 安装版验证红黄绿、系统偏好与原生菜单 |
| S1b-03 在 Windows 保留贴靠与窗口菜单 | 待验证 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/verification/S1b-S2-window-chrome-windows.md` · `apps/desktop/src/main/index.ts` · `tests/e2e/window-chrome.spec.ts`（首项文件版本 cfbce161） | Windows 实机补 Snap 悬停、系统菜单及多屏 DPI |
| S1b-04 在 Linux 的目标桌面操作窗口 | 待验证 | `apps/desktop/src/main/window-chrome.ts` · `apps/desktop/src/main/index.ts` · `tests/e2e/window-chrome.spec.ts`（首项文件版本 efc33768） | Linux 分别记录 X11 和 Wayland 的拖动、装饰和系统菜单 |
| S2-01 工作台共用一条可交互标题栏 | 已验收 | `tests/e2e/window-chrome.spec.ts` · `packages/workbench/src/shell/AppShell.tsx`（首项文件版本 cfbce161） | 核对新包窄窗与拖动命中 |
| S2-02 在启动与错误页仍可移动和关窗 | 已验收 | `tests/e2e/window-chrome.spec.ts` · `apps/desktop/src/renderer/main.tsx`（首项文件版本 cfbce161） | 重放无库、加载失败及 Renderer 崩溃 |
| S2-03 让标题控制区跟随主题和可用宽度 | 待验证 | `tests/e2e/window-chrome.spec.ts` · `packages/workbench/src/shell/AppShell.tsx`（首项文件版本 cfbce161） | 四主题已有 Windows 记录，补原生缩放、跨屏及切库 |
| S2-04 专注或失焦后仍可操作窗口 | 待验证 | `tests/e2e/window-chrome.spec.ts` · `packages/workbench/src/shell/AppShell.tsx`（首项文件版本 cfbce161） | 专注模式与三个系统的全屏、焦点逐项回归 |
| S3-01 用平台入口打开 HUHU 菜单 | 待验证 | `apps/desktop/src/main/app-menu.ts` · `apps/desktop/src/main/index.ts` · `tests/e2e/knowledge/session-flush.spec.ts`（首项文件版本 78aa04f2） | 核对 Mac 系统角色及 Linux/Windows Alt/F10 返回焦点 |
| S3-02 将保存与编辑命令交给原焦点 | 待验证 | `tests/e2e/knowledge/session-flush.spec.ts` · `apps/desktop/src/main/index.ts`（首项文件版本 cfbce161） | 菜单保存有联验，补输入框、终端与编辑器撤销复制单次路由 |
| S3-03 从菜单执行 Vault 和视图操作 | 待验证 | `packages/workbench/src/shell/AppMenuButton.tsx` · `packages/workbench/src/shell/VaultSwitchDialog.tsx` · `tests/e2e/workflows/acceptance.spec.ts`（首项文件版本 78aa04f2） | 无库、只读、停用、视图快捷键和菜单一致 |
| S4-01 在三平台安装版验收桌面外壳 | 待验证 | `tests/e2e/window-chrome.spec.ts` · `apps/desktop/src/main/index.ts`（首项文件版本 cfbce161） | 三平台同候选安装和真实原生手势 |

**Issue 原文验收逐条核对**。编号来自该成员 source.md 的验收章节。下列结论按原编号的完整范围判定。「已满足」的运行环境沿用 Windows 阶段记录；每项可按所列切片回查上表。

| 原文编号 | 判定 | 已知结果与需要补足的证据 | 关联切片 |
| --- | --- | --- | --- |
| TB-01 | 须在对应 OS / 设备或真实服务验证 | 三平台安装首启缺两种宿主的安装记录 | S0-01、S1b-02、S1b-03、S1b-04、S2-02、S4-01 |
| TB-02 | 部分 | Windows 单栏及恢复页已有；补 GNOME/KDE 与 macOS 原生区域 | S0-01、S0-02、S2-01、S4-01 |
| TB-03 | 部分 | 关于与菜单已有；逐平台核对签名包显示名、版本与帮助目标 | S2-01、S3-01、S4-01 |
| TB-04 | 部分 | Windows 四主题测过，补跨库冷启与系统色切换 | S2-03、S4-01 |
| TB-05 | 部分 | 960×600 长标题与网页缩放已有，缺真实高 DPI 跨屏 | S0-02、S1b-02、S1b-03、S2-03、S4-01 |
| TB-06 | 须在对应 OS / 设备或真实服务验证 | macOS 原生偏好、系统角色及全屏 | S0-01、S1b-02、S3-01、S4-01 |
| TB-07 | 须在对应 OS / 设备或真实服务验证 | Windows 命中测试已有，仍需真实 Snap 面板及系统菜单 | S0-01、S1b-03、S4-01 |
| TB-08 | 须在对应 OS / 设备或真实服务验证 | X11 与 Wayland 各用真实桌面采证 | S0-01、S1b-04、S4-01 |
| TB-09 | 部分 | 预览选择与标题区有覆盖；补物理拖放和编辑区冲突 | S0-02、S2-01、S2-04、S4-01 |
| TB-10 | 部分 | Windows 全屏和失焦有据，补各平台专注模式操作 | S0-02、S1b-01、S1b-02、S1b-04、S2-04、S4-01 |
| TB-11 | 已满足 | 加载失败与崩溃后的单一安全标题区已有 Windows Electron 记录 | S0-02、S2-02、S4-01 |
| TB-12 | 部分 | 复测键盘、可访问名称、关闭/退出快捷键及焦点回位 | S0-02、S2-04、S3-01、S3-02、S3-03、S4-01 |
| TB-13 | 部分 | 已有菜单保存，补编辑角色/其他控件重复触发 | S3-02、S3-03、S4-01 |
| TB-14 | 已满足 | Windows 关窗、退出和最后输入落盘已有跨窗口及菜单记录 | S1a-01、S1a-02、S1a-03、S4-01 |
| TB-15 | 已满足 | 取消、超时、失败、旧许可及崩溃有真实 Main/Electron 回归 | S0-02、S1a-01、S1a-02、S1a-03、S4-01 |
| TB-16 | 部分 | 预览隔离有记录，补重挂载及 IPC 拒绝矩阵 | S1b-01、S2-01、S4-01 |
| TB-17 | 部分 | 按无 Vault、只读、模块禁用枚举菜单状态 | S3-01、S3-02、S3-03、S4-01 |
| TB-18 | 部分 | 核对 Host 类型和文档、样式及来源闭包 | S1b-01、S4-01 |

### Issue #4 · agent-cli

成员目录 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli`。下表给出 4d86c84b 中的可复查文件；测试名称见后文组合验收。

| 计划切片 | 状态 | 实现 / 证据入口 | 剩余动作 |
| --- | --- | --- | --- |
| W0.1 核对工作区与历史的源码出处 | 待验证 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/prototype-review.md` · `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/sources.md`（首项文件版本 6da1b2ec） | 逐项补齐 ORCA、Core、历史与渲染闭包的本地来源和许可对应 |
| W0.2 核验安装包 Core 与子终端的真实能力 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W0.2-windows-core-lifecycle.md` · `plugins/agent-cli/src/engine/herdr-core.ts`（首项文件版本 1a6cce76） | 在 Linux/macOS 随包 Core 复测 parent 自然退出、kill 与 outlive |
| W1.1 在所选目录启动 shell 或 Agent | 待验证 | `plugins/agent-cli/test/launch.live.test.ts` · `plugins/agent-cli/src/engine/detect.ts`（首项文件版本 43fdad6c） | 验证当前包的 GUI PATH、三种 CLI 与 shell、带空格目录和错误提示 |
| W1.2 找回回包丢失的启动 | 已验收 | `plugins/agent-cli/test/launch-reconcile.test.ts` · `plugins/agent-cli/src/engine/sessions.ts`（首项文件版本 bc371828） | 再注入回包丢失、同标签多候选和重启 |
| W2.1 在多个工作区切换并恢复各自布局 | 待验证 | `apps/engine/test/agent-workspace.test.ts` · `plugins/agent-cli/src/engine/spaces.ts`（首项文件版本 8d836829） | 三 Space 两窗并发 CAS、坏文档、切换焦点、迟到保存 |
| W2.2 从触发处新建 Tab 或填充指定叶子 | 待验证 | `plugins/agent-cli/src/ui/WorkspaceCanvas.tsx` · `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 4749b1e2） | 将慢启动分别从 Tab、split、菜单发起后关闭原目标 |
| W2.3 从 Agents 找到后台实例和待处理轮次 | 待验证 | `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 354bcfca） | 核对后台关注、普通 shell、受控等待和跨 Space 原位跳转 |
| W3.1 在任意叶子向四个方向分栏 | 待验证 | `plugins/agent-cli/test/split-layout.test.ts` · `plugins/agent-cli/src/ui/AgentCliModule.tsx`（首项文件版本 6572fbc8） | 六叶不对称布局逐方向填充、重开 |
| W3.2 调整分隔条并放大当前输入目标 | 待验证 | `plugins/agent-cli/src/ui/WorkspaceCanvas.tsx` · `packages/ui/src/components/TerminalView.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 4749b1e2） | 键盘拖条、取消拖拽、zoom 后真实输入与焦点 |
| W3.3 关闭 pane、收起视图并重开最近工作区 | 待验证 | `plugins/agent-cli/src/ui/WorkspaceCanvas.tsx` · `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 4749b1e2） | 将 pane 终止、park、关闭 viewer 与最近工作区重开分别核对 |
| W3.4 移动已有 pane 或调整 Tab 顺序 | 待验证 | `plugins/agent-cli/test/split-layout.test.ts` · `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 6572fbc8） | 跨 Tab 移动与重排核对仍是原进程、原 viewer |
| W4.1 让慢 pane 输出时其他终端仍可用 | 待验证 | `packages/herdr-client/test/frames.test.ts` · `packages/herdr-client/src/client.ts`（首项文件版本 2cb7531e） | 同时跑快慢 pane、高输出拖 divider，采有界队列与重连数据 |
| W4.2 断线后重连原进程，识别替代 shell | 待验证 | `plugins/agent-cli/test/sessions.test.ts` · `packages/herdr-client/src/client.ts`（首项文件版本 571ac026） | 分别断 Engine、Core、viewer 并区分替代 shell |
| W4.3 授予只读观察或交互查看 | 待验证 | `plugins/agent-cli/test/terminal-bridge.test.ts` · `plugins/agent-cli/src/engine/terminal-bridge.ts`（首项文件版本 ef4bb508） | 两个 viewer 验证 observe 无输入/尺寸写权，交互所有权可回收 |
| W5.1 搜索历史并只读预览 | 待验证 | `plugins/agent-cli/test/history.test.ts` · `plugins/agent-cli/src/ui/history/HistoryPanel.tsx`（首项文件版本 ec796e42） | 复验多 provider 分页、高亮迟到、预览无副作用与 Unicode 路径 |
| W5.2 将历史记录恢复到指定位置或分支 | WIP | `plugins/agent-cli/test/history.test.ts` · `plugins/agent-cli/src/ui/history/HistoryPanel.tsx` · `plugins/agent-cli/src/engine/index.ts`（首项文件版本 ec796e42） | canOpenHistory 明确仅允许 Pi；Claude/Codex 仅预览，按真实 provider 的文件绑定能力补实现与证据 |
| W5.3 从活跃历史行返回原终端 | 待验证 | `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `plugins/agent-cli/src/ui/history/HistoryPanel.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 354bcfca） | 普通 Pi 有 bc371828 级别回放，补其他 provider 与同名跨机历史 |
| W6.0 定义可由两端独立验证的回执契约 | 已验收 | `packages/contracts/test/execution-receipt.test.ts` · `packages/contracts/src/index.ts`（首项文件版本 1b3b3857） | 重新用 contracts 金样验证原 receiptId、两段 ACK 和隔离边界 |
| W6.1 派遣到有证据支持的目标并仲裁输入 | 待验证 | `plugins/agent-cli/test/dispatch.live.test.ts` · `plugins/agent-cli/src/engine/index.ts`（首项文件版本 f154b370） | Windows 受控 Codex 和非支持 provider 分开复核；Linux 入口有平台门限 |
| W6.2 接管或停止精确绑定的运行 | 待验证 | `plugins/agent-cli/test/native-stop.live.test.ts` · `plugins/agent-cli/src/engine/sessions.ts`（首项文件版本 891c20e1） | 原 turn 停止、人工接管、替代 shell 拒绝和丢确认 |
| W6.3 持久保存并重交执行端回执 | 已验收 | `plugins/agent-cli/test/native-receipts.live.test.ts` · `plugins/agent-cli/src/engine/index.ts`（首项文件版本 7688c302） | 在支持环境复验两段 ACK 分别丢失、进程重开补送 |
| W7.1 在当前工作区打开文件与变更 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W7.1-W7.4-workspace-files.md` · `plugins/agent-cli/src/ui/AgentCliModule.tsx` · `tests/e2e/shell.spec.ts`（首项文件版本 d0a63f0b） | 同候选核对 Files/Changes 实际目录与打开文件 |
| W7.2 将评审意见发给原会话 | 待验证 | `plugins/agent-cli/test/sessions.test.ts` · `plugins/agent-cli/src/ui/ReviewPanel.tsx`（首项文件版本 571ac026） | 原会话评审批次、未知送达和并发用户输入 |
| W7.3 保存模块环境并验证实际子进程 | 待验证 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W7.3-native-pty.md` · `plugins/agent-cli/src/engine/settings.ts`（首项文件版本 5ee1a705） | 真实 Windows 保护宿主已有；Linux 模块凭据及交互 PTY 分别核对 |
| W7.4 建立或打开授权目录的 worktree | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W7.1-W7.4-workspace-files.md` · `plugins/agent-cli/src/engine/spaces.ts` · `tests/e2e/shell.spec.ts`（首项文件版本 d0a63f0b） | 测授权目录的 worktree 创建、冲突、重开 |
| W8.1 恢复新格式工作区并核对布局边界 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W8.1-space-package.md` · `packages/vault/src/package/package.ts`（首项文件版本 4749b1e2） | 核对新 ZIP 的本机绑定排除、只读、异地重绑和 Core 空布局 |
| W8.3 联编工作区与任务的共同验收包 | 待验证 | `tests/e2e/packaged/packaged.spec.ts` · `apps/engine/src/boot.ts`（首项文件版本 e13d8d6d） | 已有 78e180b7 可重放 Windows 包；T7.1 最终接线后再次冻结并交付 SHA |
| W8.2 用同一安装版本验收完整工作区 | 待验证 | `tests/e2e/packaged/packaged.spec.ts` · `apps/engine/src/boot.ts`（首项文件版本 e13d8d6d） | 同包补三 Space、六 pane、历史、TUI、泄漏与性能对照 |

**Issue 原文验收逐条核对**。编号来自该成员 source.md 的验收章节。下列结论按原编号的完整范围判定。「已满足」的运行环境沿用 Windows 阶段记录；每项可按所列切片回查上表。

| 原文编号 | 判定 | 已知结果与需要补足的证据 | 关联切片 |
| --- | --- | --- | --- |
| A01 | 部分 | 已有多 Space 布局；缺三 Space 同包计数焦点全断言 | W2.1、W2.3 |
| A02 | 部分 | 身份分别保存；回放同名目录、独立 shell 和 native ID | W2.1、W2.3 |
| A03 | 部分 | 树支持方向；四向目标及异步启动重排须实机取证 | W2.2、W3.1 |
| A04 | 部分 | 复核各入口同目标与键盘菜单锚点 | W2.2、W5.2 |
| A05 | 部分 | 测试等待启动时关目标/切 Space 后的焦点 | W2.2 |
| A06 | 已满足 | session/reconcile 回归覆盖同 ID 并发、丢包找回与独立请求 | W1.2 |
| A07 | 部分 | 检测/搜索迟到与 IME、Escape 和还焦需 UI 记录 | W2.2 |
| A08 | 部分 | 有冻结 cwd 与 Space 校验，补全部新建路径继承目录 | W1.1、W2.2 |
| B01 | 部分 | 六叶非对称逐方向实测与任务目标对齐 | W3.1、W3.4 |
| B02 | 部分 | 有比例持久化、键盘 divider，补窄尺寸取消 | W3.2 |
| B03 | 部分 | 跨标签身份有测试，补真实 attach 数量 | W3.1、W3.2、W3.4 |
| B04 | 部分 | 补最后工作区、缩放后的真输入和焦点 | W3.2、W3.3 |
| B05 | 部分 | Core 子进程生命周期有 Windows 证据；补产品关闭/park 路由 | W0.2、W3.3、W6.2 |
| B06 | 部分 | 区分 exited/unknown 有服务测试；补 keep 替代 shell 与 UI | W3.3、W4.2 |
| B07 | 部分 | 观察者禁止输入有桥接；补多视图尺寸及原位跳转 | W2.3、W4.3、W5.3 |
| B08 | 部分 | 区分并发 CAS、超限、损坏、离线与窗口重开 | W2.1、W8.1 |
| C01 | 须在对应 OS / 设备或真实服务验证 | 真 provider 认证/退出及平台组合需各宿主与隔离账号 | W1.1 |
| C02 | 部分 | 分平台复核 GUI PATH、shim、shebang 和带空格/中文 cwd | W1.1、W7.3 |
| C03 | 部分 | 有检测及不可启动 UI，补坏版本与缺 Core 区分 | W1.1、W7.3 |
| C04 | 部分 | 比对预览、手工、历史与规则实际 argv | W1.1、W6.1、W7.3 |
| C05 | 部分 | Windows 随包 Core 已有 SHA；补 Linux/macOS 版本拒绝 | W0.2 |
| C06 | 部分 | frames 单测及 attach.live 在库，补各包分片/早到/关闭回放 | W4.1 |
| C07 | 部分 | 补同时高输出/慢 pane 的 UTF-8、CREDIT 和内存水位 | W4.1 |
| C08 | 部分 | 补 focus、facts、resize 与 TUI 自动回应的来源记录 | W4.1、W4.3 |
| C09 | 部分 | 补 seq 重置、missed 与真实前台可见时写 seen | W2.3、W4.2 |
| C10 | 已满足 | 原 requestId、标签找回、unknown 与并发已回归 | W1.2、W6.1 |
| C11 | 部分 | 补三种部件分别重启和替代 shell UI | W4.2、W6.2 |
| C12 | 部分 | 脱敏与错误关联需受控失败的端到端记录 | W1.2、W6.0、W6.2、W6.3、W7.3 |
| C13 | 须在对应 OS / 设备或真实服务验证 | Windows 有保护 PTY；Linux/macOS 运行时支持及秘密清理缺证 | W7.3 |
| D01 | 部分 | Pi 与目录分页已有；补与 ORCA 各 provider 分组及异常状态对照 | W5.1 |
| D02 | 部分 | 普通 Pi 跨 Space 已实测，其他活跃历史类型逐一核对 | W5.3 |
| D03 | 部分 | 需记录各 provider 明确不可恢复的状态与原因 | W5.2 |
| D04 | 部分 | 核对精确文件/原生 ID、目标 cwd 和不同 provider 的 fork 边界 | W5.2 |
| D05 | 部分 | 补慢扫描旧结果、分页截断与只读零启动 | W5.1 |
| D06 | 部分 | 同 ID 多源和换件有测试，补多机重叠 Space 路径 | W5.1、W5.3 |
| D07 | 部分 | Pi 有真实回放；Claude/Codex 固定版本需同时回归 | W5.1、W5.2 |
| D08 | 部分 | 补重复恢复/分支、已有 pane、删除与 kill 对照 | W5.1、W5.2、W5.3 |
| E01 | 部分 | 补固定上游截图与安装版空间排版对照 | W2.1、W2.3、W7.1、W8.2 |
| E02 | 已满足 | Windows 桌面同名文件、授权 Git worktree 和真实内容已验证 | W7.1、W7.2、W7.4 |
| E03 | 部分 | 需长标题、窄窗和多缩放截图 | W2.2、W3.2、W7.1、W8.2 |
| E04 | 部分 | 需实测终端颜色/字体与 DPI 变化 | W4.3、W8.2 |
| E05 | 须在对应 OS / 设备或真实服务验证 | 真实 TUI、输入法、宽字符与系统剪贴板需各宿主验证 | W4.1、W4.3、W8.2 |
| E06 | 部分 | 多区域 focus 切换后逐键检查只触发一次 | W2.2、W3.4、W4.3、W8.2 |
| E07 | 部分 | 需要持续高输出、拖 divider 与切 Space 的对照 | W3.2、W4.1、W8.2 |
| E08 | 部分 | 需要重复挂载/重连后的 viewer、WS、timer 与内存数据 | W4.2、W4.3、W8.2 |
| F01 | 部分 | 受控任务链存在；缺同包覆盖审查、普通回复、人工完成 | W2.3、W3.3、W6.0、W6.1、W6.2、W6.3、W7.2、W8.3、W8.2 |
| F02 | 部分 | 有 Vault 隔离和绑定核对；补双窗迟到与未经授权 viewer | W2.1、W4.2、W4.3、W6.0、W6.1、W6.3、W7.4、W8.1、W8.2 |
| F03 | 部分 | 共享 bridge 有观察者限制，补 SSH 终端及寿命回归 | W4.3、W8.3、W8.2 |
| F04 | 部分 | 逐项对照引用、移植闭包和许可差异 | W0.1、W0.2、W8.2 |
| F05 | 部分 | 核对当前 UI 与演示/文档/旧兼容行为清理 | W8.1、W8.3、W8.2 |
| F06 | 未满足 | 缺最终包的完整 provider、上游视频与性能记录 | W0.1、W0.2、W8.3、W8.2 |

### Issue #5 · task-automation

成员目录 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation`。下表给出 4d86c84b 中的可复查文件；测试名称见后文组合验收。

| 计划切片 | 状态 | 实现 / 证据入口 | 剩余动作 |
| --- | --- | --- | --- |
| T0.1 核实每个 provider 能走通的任务路径 | 待验证 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/evidences/T0.1-provider-evidence.md` · `plugins/agent-cli/src/engine/launch.ts`（首项文件版本 6e820faf） | 区分一次输出、可答复的受控轮次和可恢复历史，记录 provider 版本与平台 |
| T1.1 创建并重开 Human 或 Agent 任务 | 已验收 | `plugins/tasks/test/persistence-http.test.ts` · `plugins/tasks/src/ui/TaskEditor.tsx`（首项文件版本 38ab7f27） | 同包复核 Human/Agent、Markdown 外改、保存零启动 |
| T1.2 持久接受人工派遣并恢复未领取意图 | 已验收 | `plugins/tasks/test/persistence-http.test.ts` · `plugins/tasks/src/engine/index.ts`（首项文件版本 38ab7f27） | 固定 dispatchId 验证受理后领取前断电与切 Vault |
| T1.3 在发送前取消指定待派任务 | 已验收 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/tasks/src/engine/index.ts`（首项文件版本 bc371828） | 复验规则删除后的单项取消及与领取竞争 |
| T1.4 按原快照重试已证实失败的执行 | WIP | `plugins/tasks/src/engine/dispatch.ts` · `plugins/tasks/src/engine/index.ts` · `plugins/tasks/test/persistence-http.test.ts`（首项文件版本 38ab7f27） | 区分失败后用户显式按旧快照再试与原意图重交；核查并补用户入口与新旧 run 关联 |
| T2.1 把已接受任务交给指定的实际会话 | 待验证 | `apps/engine/test/task-dispatch.live.test.ts` · `plugins/tasks/src/engine/service.ts`（首项文件版本 e632027c） | 核对指定新建、已有、resume 的实际支持矩阵与冻结输入 |
| T2.2 核实未知结果并停止已绑定的轮次 | 待验证 | `plugins/agent-cli/test/native-stop.live.test.ts` · `plugins/tasks/src/engine/index.ts`（首项文件版本 891c20e1） | 在 Tasks 抽屉验证停止原轮、接管后拒绝及 late result |
| T3.1 在原任务识别问题并处理原生暂停 | 待验证 | `plugins/agent-cli/test/native-receipts.live.test.ts` · `packages/contracts/src/dto/task.ts`（首项文件版本 7688c302） | 真实包重测普通问题与原生 deferred 在同一 Task 展示 |
| T3.2 从原问题提交一次回答 | 待验证 | `plugins/agent-cli/test/native-receipts.live.test.ts` · `plugins/tasks/src/ui/TaskDetail.tsx`（首项文件版本 7688c302） | 原 request/version 单次消费，用修复后包而非临时 helper |
| T3.3 回执重交后原任务只显示一次结果 | 已验收 | `plugins/tasks/test/persistence-http.test.ts` · `plugins/tasks/src/engine/service.ts`（首项文件版本 38ab7f27） | 双 ACK 丢失及评论已写时在最终包回读唯一结果 |
| T3.4 向原任务发送补充并保留普通讨论 | 待验证 | `plugins/tasks/test/persistence-http.test.ts` · `plugins/tasks/src/ui/TaskDetail.tsx`（首项文件版本 38ab7f27） | 普通讨论零启动、补充排队、同 session 续接与冲突 |
| T4.1 设置最早派遣时间并显式提前派遣 | 待验证 | `plugins/tasks/src/ui/TaskDetail.tsx` · `plugins/tasks/src/ui/TaskEditor.tsx`（首项文件版本 301dee75） | 验明天的 availableAt 今天不发，明确人工提前且目标不漂移 |
| T4.2 预览与实际扫描使用相同的时间窗口 | 待验证 | `plugins/automations/src/engine/dispatch-window.ts` · `plugins/automations/src/engine/scan.ts`（首项文件版本 7926d619） | 跨时区、未排期、逾期、忙及未来窗口的预览与实扫对照 |
| T5.1 安装一次可由用户管理的默认规则 | 已验收 | `plugins/automations/test/default-task-scan.test.ts` · `plugins/automations/src/ui/AutomationsModule.tsx`（首项文件版本 35dc2bf8） | 删除和重启默认规则，核对 15 分钟 UI 与持久状态 |
| T5.2 停用或删除规则并保留入队任务 | 待验证 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/automations/src/ui/AutomationsModule.tsx`（首项文件版本 bc371828） | 由 UI 删除/停用后重启，只取消指定待发项 |
| T5.3 每个定时点只接受一次扫描 | 已验收 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/automations/src/engine/scheduler.ts`（首项文件版本 bc371828） | 补同包两规则与人工争用、重启漏扫只补一次 |
| T5.4 按模板生成可继续问答的独立任务 | 待验证 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/automations/src/ui/RuleEditor.tsx`（首项文件版本 bc371828） | 模板的同一 occurrence 在包内只建一个可问答任务 |
| T5.5 编辑启用规则并预览后续日程 | 待验证 | `plugins/automations/src/ui/RuleEditor.tsx`（首项文件版本 d667d1ac） | 核对编辑启用规则后的下一次触发、DST 重叠与缺口及预览 |
| T6.1 改期或取消原任务的一次性跟进 | 待验证 | `plugins/tasks/src/ui/TaskFollowUp.tsx` · `plugins/automations/src/engine/scheduler.ts`（首项文件版本 301dee75） | 到期跟进使用原任务，取消/改期/回拨与在途派遣竞争 |
| T6.2 等待回答时让独立任务继续工作 | 待验证 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/tasks/src/engine/service.ts`（首项文件版本 bc371828） | 两真实独立会话验证等待释放容量、人工输入仲裁 |
| T6.3a 投递一次提醒或生成提醒任务 | 已验收 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/automations/src/engine/service.ts`（首项文件版本 bc371828） | 同包复核提醒、任务及二者组合的稳定发生身份 |
| T6.3b 运行带模块配置的终端规则 | 待验证 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/verification/T6.3b-protected-terminal.md` · `plugins/automations/src/engine/service.ts`（首项文件版本 d667d1ac） | Linux 实测受保护环境及撤权；Windows 已有批准、注入与清理证据 |
| T6.4 停用模块、切 Vault 后找回未完业务 | 待验证 | `plugins/agent-cli/test/native-receipts.live.test.ts` · `plugins/tasks/src/engine/index.ts`（首项文件版本 7688c302） | 原生结果到达后跨插件停启、切库和只读再恢复原绑定 |
| T7.1 一次切换 Tasks、Automations 与工具的生产调用者 | 待验证 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/verification/T7.1-terminal-occurrence-recovery.md` · `plugins/automations/src/engine/index.ts`（首项文件版本 623608c7） | 4c8fe523、d667d1ac 后按全部生产调用点和旧 supervisor 残留复核 |
| T7.2 用真实 CLI 签收从明日任务到人工完成 | 待验证 | `tests/e2e/packaged/packaged.spec.ts` · `plugins/tasks/src/ui/TaskEditor.tsx`（首项文件版本 e13d8d6d） | 78e180b7 已有混合入口随包问答；补明日调度、各入口独立全程和最终包 |

**Issue 原文验收逐条核对**。编号来自该成员 source.md 的验收章节。下列结论按原编号的完整范围判定。「已满足」的运行环境沿用 Windows 阶段记录；每项可按所列切片回查上表。

| 原文编号 | 判定 | 已知结果与需要补足的证据 | 关联切片 |
| --- | --- | --- | --- |
| A01 | 已满足 | HTTP 持久化实验证实保存零启动，模板发生有单独创建测试 | T1.1、T5.4、T7.2 |
| A02 | 部分 | 三状态与运行分离；补完整包的成功、失败、等待回读 | T1.1、T1.2、T2.1、T3.3、T7.2 |
| A03 | 部分 | 收件箱原 Task 去重；补全部模板与原生问题同包回读 | T3.1、T3.3、T5.4、T7.2 |
| A04 | 部分 | 外部 Markdown 字节合并有测试；补引用/删除线 UI | T1.1、T7.1、T7.2 |
| A05 | 部分 | 已有普通/原生 request；重跑真实包确认卡片消费后只读 | T3.1、T3.2 |
| A06 | 部分 | 验证版本冲突与普通评论零启动，补包内长输入 | T3.2、T3.4 |
| A07 | 部分 | 两入口对同一问题回执须同包检查未知、重按 | T3.2、T3.4、T7.2 |
| A08 | 部分 | 原位定位、抽屉有部分 E2E；补三者不同状态主题 | T2.1、T4.1、T5.1、T5.2、T5.5、T7.2 |
| B01 | 部分 | 默认规则落盘及删除不重建；补 15 分钟 UI 编辑重启 | T5.1、T5.2、T5.5 |
| B02 | 部分 | 按绝对 availableAt 复测明日任务今日零派遣 | T4.1、T4.2、T7.2 |
| B03 | 部分 | 时区边界、未排期、自定义与夏令时各补一次 | T4.1、T4.2、T5.3、T5.5 |
| B04 | 部分 | 已共享分类；逐项复核忙与配置缺失原因且预览零写 | T4.2 |
| B05 | 已满足 | 冻结入选名单及两规则/人工竞争有真实服务回归 | T1.2、T2.1、T5.3、T6.2 |
| B06 | 部分 | 提醒、模板有稳定发生；补实际 CLI 的重启发布窗口 | T5.3、T5.4、T6.3a、T6.3b |
| B07 | 已满足 | 停用期间不补扫、重新启用只补最近一轮有发生测试 | T5.1、T5.2、T5.3 |
| B08 | 部分 | UI 能改期/取消；补到期只继续原任务 | T6.1 |
| B09 | 部分 | 模板生成有实现；补编辑扫描提示、模板的真实问答 | T5.3、T5.4、T5.5 |
| C01 | 部分 | 按新建/已有/恢复与 provider 支持表实测 | T0.1、T2.1、T7.2 |
| C02 | 部分 | 输入占用和只读降级已实现；补人工审查与派遣同时竞争 | T2.1、T3.2、T3.4、T6.2 |
| C03 | 部分 | 已实现容量约束；补原生等待期间另一会话仍前进 | T3.1、T6.2 |
| C04 | 部分 | 核对实际亮起的 provider 对 resume/reply/result 的声明 | T0.1、T2.1、T3.1 |
| C05 | 部分 | 有丢包回找；补 UI 在新进程/旧 receipt 的不同呈现 | T2.1、T2.2 |
| C06 | 部分 | persistence-http.test.ts 已有“超过网关 24 小时，同 dispatchId 仍重交原记录且异载荷冲突”；最终包复测 | T1.2、T1.4 |
| C07 | 部分 | 待发单项取消有证；补已运行/关 pane/关闭任务的组合 | T1.3、T2.2 |
| C08 | 须在对应 OS / 设备或真实服务验证 | 需实际 Core 代次与替代 shell 验收 | T2.2、T7.2 |
| D01 | 部分 | 受理落盘有测试；补派遣/回答两种领取前故障 | T1.2、T3.2、T3.4 |
| D02 | 部分 | 可读冻结快照；补失败后旧快照重试路径 | T1.2、T1.4 |
| D03 | 部分 | 未知发送与匹配确认有测试，需真包断线重演 | T2.2、T3.2、T3.4 |
| D04 | 已满足 | 持久收件、恢复补送、评论唯一且不重开执行已有回归 | T3.3、T7.2 |
| D05 | 已满足 | 同回执重交按稳定评论身份去重 | T3.3 |
| D06 | 部分 | 失败回执需核对只修格式与坏记录冻结 | T1.4、T3.3、T6.4 |
| D07 | 部分 | 缺失败 run 显式重试与新输入、unknown、已删任务的完整入口证据 | T1.4、T2.2 |
| D08 | 部分 | 规则停用已验证；补只读、切库和三个模块相互独立 | T1.3、T5.2、T6.1、T6.2、T6.3b、T6.4 |
| D09 | 部分 | 已有生产切换，补重启后 Automations 停用的人工问答 | T2.1、T3.2、T6.4、T7.1 |
| D10 | 部分 | 部分发生/送达有故障注入；补每个跨文件物化窗口 | T1.3、T3.3、T5.3、T5.4、T6.1、T6.3a |
| D11 | 部分 | 双 ACK 有 Windows 回归，补答案落盘到评论物化之间中断 | T3.2、T3.3、T6.4 |
| E01 | 部分 | 保留入口授权，复核内部调用和外部普通评论 | T1.1、T1.2、T7.1 |
| E02 | 部分 | 原轮/原 request 有校验；补跨任务、越权与真实账户状态 | T3.1、T3.2、T3.3、T7.1 |
| E03 | 部分 | MCP 停用能约束外部工具；重开模块时补证内部补送 | T6.4、T7.1 |
| E04 | 部分 | 已退役旧 supervisor；仍需全调用者与文档清点 | T7.1 |
| E05 | 部分 | 原始来源索引需对照实际移植后的路径与许可证 | T0.1、T7.1 |
| E06 | 部分 | 78e180b7 随包真实 Codex 已完成问答及人工完成；缺明日调度、受支持 provider 矩阵与最终联验 | T0.1、T7.2 |
| E07 | 须在对应 OS / 设备或真实服务验证 | Windows 规则保护有据；Linux 凭据与真实终端还需分开验证 | T6.3b、T7.1 |

### Issue #6 · unified-tools-web

成员目录 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web`。下表给出 4d86c84b 中的可复查文件；测试名称见后文组合验收。

| 计划切片 | 状态 | 实现 / 证据入口 | 剩余动作 |
| --- | --- | --- | --- |
| G1.1 从用户动作查到唯一领域入口 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidences/G1.1-action-inventory.md` · `packages/contracts/src/index.ts`（首项文件版本 ca8290d0） | 按当前版本更新动作差集；旧盘点为基线 |
| G1.2 插件停用后仍能查看工具说明 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G2.1-windows-integrated-access.md` · `packages/kernel/src/capabilities/define.ts`（首项文件版本 6ebe3e04） | 补新模块和扩展卸载重装的同包目录校验 |
| G2.1 干净安装零开放，重启可读回用户选择 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G2.1-windows-integrated-access.md` · `packages/kernel/src/exposure.ts`（首项文件版本 6ebe3e04） | 同包干净默认、损坏拒绝、撤销及重启 |
| G2.2 两位管理者按版本提交整批选择 | 已验收 | `apps/engine/test/tool-access.test.ts` · `packages/kernel/src/exposure.ts`（首项文件版本 c6ece89b） | 复验两管理员 CAS 与整批写失败时旧版本 |
| G2.3 检查为何可用并在实际调用时复核 | 待验证 | `apps/engine/test/tool-access.test.ts` · `packages/kernel/src/dispatcher.ts`（首项文件版本 c6ece89b） | 逐域核对投影原因与 Dispatcher、缓存调用及流处理一致 |
| G3.1 CLI 与外部 API 发现并调用同一能力 | 待验证 | `apps/cli/test/cli.test.ts` · `apps/cli/src/main.ts`（首项文件版本 558af632） | CLI/API 重跑同 ID、身份、输出和错误；核对全域差集 |
| G3.2 两种 MCP 传输读取同一份目录与变更 | 已验收 | `apps/cli/test/cli.test.ts` · `packages/kernel/src/mcp.ts`（首项文件版本 558af632） | stdio/HTTP 热变更、总开关与业务 list 被关闭 |
| G3.3 响应丢失后查询同一操作的结果 | WIP | `packages/kernel/src/operation-receipts.ts` · `packages/kernel/src/dispatcher.ts`（首项文件版本 31d1379a） | Tasks 与 taskScan 已采用 durable，不能外推全部副作用；逐项列举可查询/未知/异参冲突的能力 |
| G3.4 扩展命令逐项开放且代理保留调用者 | WIP | `apps/engine/test/external-plugins.test.ts` · `packages/kernel/src/capabilities/external-plugins.ts`（首项文件版本 558af632） | 当前 plugins.commands.run 使用 admin 的 exposable:false 且回调未传入 caller；补逐项命令映射与调用者传递 |
| G4.1 从三个设置入口筛选并跨页选择 | 待验证 | `tests/e2e/workflows/acceptance.spec.ts` · `packages/workbench/src/gateway/GatewayModule.tsx`（首项文件版本 558af632） | 三设置入口组合筛选、跨页选择和不同风险项计数 |
| G4.2 预览批量影响并处理提交冲突 | 待验证 | `tests/e2e/workflows/acceptance.spec.ts` · `packages/workbench/src/gateway/GatewayModule.tsx`（首项文件版本 558af632） | 两窗旧预览、失败回滚与原草稿保留 |
| G5a.1 从外部维护笔记和受管文件 | WIP | `plugins/notes/test/archives.test.ts` · `plugins/notes/src/engine/index.ts`（首项文件版本 290e8f70） | notes.openDaily 等仍永久关；盘点笔记/评论/目录实际动作和受管文件路由 |
| G5a.2 维护档案类型和文件关联 | WIP | `plugins/notes/test/archives.test.ts` · `plugins/notes/src/engine/index.ts` · `plugins/notes/src/engine/archives/capabilities.ts`（首项文件版本 290e8f70） | archives.types.* 和 addFile 仍用 internalRead/internalWrite；补外部授权及领域回读 |
| G5a.3 转换收件项并找到撤销结果 | WIP | `plugins/inbox/test/service.test.ts` · `plugins/inbox/src/engine/index.ts`（首项文件版本 4ca74d1c） | inbox.convert/undo 仍为 exposable:false；补开放、撤销后的版本与通知 |
| G5a.4 外部提交、同步和恢复版本 | WIP | `plugins/versioning/src/engine/index.ts`（首项文件版本 40822efd） | git.commit 等仍硬关闭；等待 #9 模块凭据后验提交同步恢复 |
| G5a.5 外部调用指南检查和备份恢复 | WIP | `plugins/agent-guide/test/guide.test.ts` · `plugins/agent-guide/src/engine/index.ts`（首项文件版本 74fada73） | guide.check、guide.backups.restore 仍继承 exposable:false；复用 handler 并保留独立授权 |
| G5a.6 管理 Vault、插件和服务的公开动作 | WIP | `packages/kernel/src/dispatcher.ts` · `packages/kernel/src/capabilities/system.ts`（首项文件版本 31d1379a） | 按 kernel 所有用户动作区分本机宿主与可授权管理工具，修复未覆盖者 |
| G5b.1 经单一外部入口完成任务问答 | 待验证 | `plugins/agent-cli/test/native-receipts.live.test.ts` · `plugins/tasks/src/engine/index.ts`（首项文件版本 7688c302） | 完成两个独立入口的真实包完整 Task 旅程 |
| G5b.2 外部管理自动化规则和已排队任务 | 待验证 | `plugins/automations/test/task-scan-occurrences.test.ts` · `plugins/automations/src/engine/index.ts`（首项文件版本 bc371828） | 对现有 taskScan、runs、终端批准分别跑创建至取消；复查普通规则 |
| G5b.3 按指定 Space 观察与恢复 Agent 会话 | WIP | `apps/engine/test/agent-workspace.test.ts` · `plugins/agent-cli/src/engine/index.ts`（首项文件版本 8d836829） | agent.spaces.list、agent.workspace.launch 硬关闭；开放指定 Space 的合约后验证只读零启动、unsupported 明示 |
| G5c.1 从公共目录看到 SSH 资源与等待项 | WIP | `.agents/dev/changes/2026-11-19-issue-7-ssh-module/verification/H11.1-public-resources-windows.md` · `plugins/ssh/src/engine/index.ts`（首项文件版本 be7a8b8e） | H11.1 已集成；等待 t5 作业状态/输出/取消，再复核外部流控制和 SFTP |
| G5c.2 按真实可用性发现 Mail 同步操作 | WIP | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidences/G1.1-action-inventory.md` · `packages/kernel/src/capabilities/define.ts`（首项文件版本 ca8290d0） | 逐项接 #8 Mail 同步及未入集成的 AI 能力，核对停用目录和授权 |
| G5c.3 分开授权摘要读取与显式查看 | 待验证 | `packages/kernel/src/dispatcher.ts` · `plugins/safe/src/engine/index.ts`（首项文件版本 31d1379a） | 558af632 后用两个权限分别读摘要与显式值，Safe 锁定/撤权 |
| G5c.4 卡片只读取已允许的业务数据 | 待验证 | `tests/e2e/workflows/acceptance.spec.ts` · `packages/kernel/src/capabilities/define.ts`（首项文件版本 558af632） | 核对 #10 Widget 定义与实际数据读取均服从授权，停用保留实例 |
| G6.1 桌面启停 Web 并看到可用地址 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G6.1-windows-listener.md` · `apps/engine/src/boot.ts`（首项文件版本 1e2aae3a） | 同包端口占用、网卡变化、停止不影响 Engine |
| G6.2 打包工作台可在普通浏览器打开深链 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G6.2-windows-http-intent.md` · `apps/desktop/src/renderer/main.tsx`（首项文件版本 6ebe3e04） | 包内 MIME、深链刷新、普通 HTTP 和宿主隔离 |
| G6.3 重取同一邀请并让两台设备分别加入 | 已验收 | `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G6-windows-shared-workbench.md` · `apps/engine/src/boot.ts`（首项文件版本 aaea2a5f） | 三浏览器已有；补两台物理设备和外部网卡 |
| G6.4 撤销邀请并断开它建立的会话 | 已验收 | `tests/e2e/workflows/web-share.spec.ts` · `apps/engine/src/boot.ts`（首项文件版本 dcc95e63） | 保留按邀请撤销和其他会话继续操作的实测 |
| G6.5 两台设备看到同一任务版本 | 待验证 | `apps/engine/test/web-share.test.ts` · `packages/workbench/src/engine-client/client.ts`（首项文件版本 78aa04f2） | 两物理设备并发改同任务、陈旧 revision 与跨 Vault 隔离 |
| G7.1 文件落在选择它的设备 | 待验证 | `tests/e2e/workflows/web-share.spec.ts` · `plugins/ssh/src/ui/FilesPanel.tsx`（首项文件版本 dcc95e63） | 浏览器附件已有，补异机下载落点、SFTP 与 LAN HTTP 剪贴板 |
| G7.2 刷新浏览器后接续原会话 | 待验证 | `plugins/agent-cli/test/terminal-bridge.test.ts` · `packages/workbench/src/engine-client/client.ts`（首项文件版本 ef4bb508） | 刷新后原会话、Agent/SSH 输入独占、断线不杀后台 |
| G8.1 全仓调用方切到唯一新合同 | WIP | `packages/kernel/src/dispatcher.ts` · `packages/kernel/src/capabilities/define.ts`（首项文件版本 31d1379a） | 清点并迁移仍依赖 exposable 的用户动作；复核 CLI/文档/示例、备份格式 |
| G8.2 在同一构建复核跨入口结果 | 待验证 | `tests/e2e/packaged/packaged.spec.ts`（首项文件版本 e13d8d6d） | 等 G8.1、SSH、Mail、凭据后同一候选跑全量与第二台设备 |

**Issue 原文验收逐条核对**。编号来自该成员 source.md 的验收章节。下列结论按原编号的完整范围判定。「已满足」的运行环境沿用 Windows 阶段记录；每项可按所列切片回查上表。

| 原文编号 | 判定 | 已知结果与需要补足的证据 | 关联切片 |
| --- | --- | --- | --- |
| A01 | 未满足 | 当前用户动作仍有永久不可选，需逐模块覆盖表 | G1.1、G1.2、G5a.5、G5a.6、G5c.2、G5c.4 |
| A02 | 部分 | 默认策略跨入口已实测；补全量动作与撤销时已连接客户端 | G2.1、G2.3、G8.2 |
| A03 | 部分 | 补只读目录对所有 handler 的无副作用检查 | G1.1、G2.3、G5a.6、G5b.3 |
| A04 | 未满足 | 全开仍受硬关闭用户动作限制，如 git.commit | G4.2 |
| A05 | 已满足 | 已有成功安装描述保留与卸载释放、重启恢复策略实测 | G1.2、G2.1、G5c.2、G5c.4 |
| A06 | 部分 | 复核内部任务与 SSH/Mail 自有凭据无需外部工具开关 | G1.1、G2.3、G5a.6 |
| A07 | 部分 | 逐个受管文件路由、代理最终 caller 仍需审核 | G2.3、G3.4、G5a.1 |
| B01 | 部分 | 三入口筛选、跨页和部分选择需同包矩阵 | G4.1 |
| B02 | 部分 | 批量预览已有，核对四个快捷动作的精确 ID | G4.2 |
| B03 | 部分 | CAS 成批生效有据，补坏 ID 与写失败回滚 | G2.2、G4.2 |
| B04 | 已满足 | 重启、坏策略、未配置新工具默认关已有集成测试 | G2.1 |
| B05 | 已满足 | 两份预览同 revision 的首个提交生效，旧草稿 UI 有 E2E | G2.2、G4.1、G4.2 |
| C01 | 部分 | 已有 stdio 撤销修复，补与 HTTP、CLI、偏好在同包对照 | G3.2、G8.2 |
| C02 | 部分 | 关闭业务 list 单独复跑两种 MCP 与 CLI 协议发现 | G3.1、G3.2 |
| C03 | 部分 | schema 变化已有测试；需全目录名称/资源/prompt 差集 | G3.1、G3.2 |
| C04 | 部分 | 结构化结果已有；补实际副作用后校验失败与查询 | G3.1、G3.2、G3.3 |
| C05 | 部分 | 首个持久意图已实现；全部创建/启动/管理仍需逐动作覆盖 | G2.2、G3.3 |
| C06 | 部分 | 通用命令注册在 desktop 管理组；缺逐 ID 独立可选与代理保留 caller | G3.4 |
| C07 | 部分 | 同名 schema 改变有刷新测试；补当前两种传输长连接 | G1.2、G3.2 |
| D01 | 部分 | 现有用例交替用两个入口；缺各入口各自完成的整段 | G5b.1 |
| D02 | 部分 | 已有 taskScan、runs、批准终端，需实际两入口逐动作复核 | G5b.2 |
| D03 | 部分 | 已有指定 Space 的绑定；补会话管理外部可选矩阵 | G5b.3 |
| D04 | 部分 | H11.1 有真实入口证据；补全 CRUD、jumpHost 和凭据版本 | G5c.1 |
| D05 | 部分 | 已持久暴露信任待答，需从新接入客户端与 Web 重开核对 | G5c.1 |
| D06 | 未满足 | H11.2 仍 WIP；缺作业生命周期和跨入口输入控制联验 | G5c.1、G7.2 |
| D07 | 部分 | 已有绑定文件/队列；需浏览器与 CLI 实际落点与取消验证 | G5c.1、G7.1 |
| D08 | 未满足 | 外部动作未全覆盖，git.commit 及笔记多项仍硬关闭 | G5a.1、G5a.2、G5a.3、G5a.4、G5a.5、G5c.3 |
| D09 | 部分 | Web 看板重开有据；补真实两设备的任务/笔记推送与并发 | G5a.1、G5a.3、G6.5、G8.2 |
| D10 | 须在对应 OS / 设备或真实服务验证 | Windows 终端规则已有；SSH/模块环境/Safe 敏感读取完整实机矩阵待补 | G5a.4、G5c.1、G5c.3 |
| E01 | 部分 | Windows 回环和桌面 listener 有证；补真实 LAN 地址变化 | G6.1、G6.2、G6.3 |
| E02 | 须在对应 OS / 设备或真实服务验证 | 须两台物理局域网设备读写同库 | G6.3、G6.5、G8.2 |
| E03 | 部分 | 补 Agent/SSH 浏览器 viewer 归属与工具开关独立 | G7.2、G8.2 |
| E04 | 须在对应 OS / 设备或真实服务验证 | 浏览器附件有据，补第二台设备 HTTP 剪贴板与终端 | G6.2、G7.1、G8.2 |
| E05 | 已满足 | Windows 包已提供独立工作台，补最终 Linux 包重跑 | G6.2、G8.2 |
| E06 | 部分 | 补端口占用、资源缺失、网卡变化、Engine 重启和切库的全矩阵 | G6.1、G6.4、G8.2 |
| E07 | 部分 | 邀请撤销隔离有实测，需切库旧页面写入拒绝以及停 Web 后本机服务 | G6.1、G6.4、G6.5、G8.2 |
| F01 | 未满足 | dispatcher 和领域注册仍保留 exposable 硬关闭 | G8.1 |
| F02 | 部分 | 逐对照开发规范/用户示例/能力目录及现在的权限语义 | G8.1 |
| F03 | 部分 | 有局部跨入口/包测试，缺最终同版真实 SSH、受控 Agent 与异机 LAN | G8.2 |

### 本地远端跟踪引用审计

逐支读取 `git log 4d86c84b..origin/impl/huhu-issues-3-10-<后缀>`。表中以分支后缀表示完整引用。每对提交为「分支 → 基线中同题提交」。等号表示 stable patch-id 一致，约等号表示补丁有差异，只把同功能的移植列作替代，不能证明逐行相同。两条 SSH 文件提交按合并实现另查。

| 分支后缀 | 独有提交数 | 分类和核对 |
| --- | --- | --- |
| agent-environment | 1 | 已被替代 · 7c1d1ee8=2d964099 |
| agent-lifecycle | 10 | 已被替代 · ec581b32=3bd2e245、ba5f3481=59c97def、4fe97901=95d5d4c3、a20128b8=571ac026、db0a562f=6c2cc928、5cda8418=30da8fe6、ce5289dd≈9d36640e、5daf0486=1b3b3857、9a8225f1=3ffd0698、3804140c=414d042c |
| agent-pty | 2 | 已被替代 · f4f68fd3=5ee1a705、cfcea984=3eed4e0c |
| agent-space-package | 1 | 已被替代 · 331defdb=27f8b636 |
| automation-tools | 0 | 已可从基线到达 |
| capability | 5 | 已被替代 · c70a9872=79f95f90、cc736e5f=82ef3280、29a6e8f1≈9d6ad33b、6e6240d5=0fdfbb56、2dfd7624=ca8290d0 |
| credentials | 3 | 已被替代 · 47f854b4=2758912e、86f810e8=5e255d36、7174fc8d=84a3d42a |
| dashboard-geometry | 1 | 已被替代 · 3eeb62d7=f4e397a0 |
| dashboard-restore | 1 | 已被替代 · 95ecb232=f8fb9f55 |
| follow-up | 2 | 已被替代 · 35e13890=e632027c、ccbda0bd=c600ef35 |
| integration | 0 | 已可从基线到达 |
| mail | 1 | 已被替代 · be12ca89=97040034 |
| mail-ai | 2 | 5c1c52a9（#8 S7 独立候选，未进基线）、b739090e（#8 S7 独立候选，未进基线） |
| mail-api-sync | 2 | 已被替代 · 119d19c8=7170a7b5、4c491cc0=d02355ce |
| mail-confirmed-ui | 11 | 已被替代 · 2524d695≈288ec99d、2a627f54≈0e3d6a5e、d941065b≈e5de8840、b1aafd92≈46a770ed、4e6daf08=24438602、f4e43d5e≈7fd88b74、46b9047a≈2ea0bda8、6a75ccd7≈b854b7bc、44941ecd≈ca6e6e31、94dc30a5=77edc5bd、20567cc2=48ffa5e0 |
| mail-data-settings | 3 | 已被替代 · 6c88b90b≈04bd14e4、6ce5a850=c1204976、1127e370=dcf1848a |
| mail-drafts | 4 | 已被替代 · bf37a4ea≈415efe99、564a9b68=50580696、5ab72a2b=b48e37c1、37bcc525=45ae8500 |
| mail-oauth | 1 | 已被替代 · 03b8ccc0=4563a422 |
| mail-oauth-outcomes | 1 | 已被替代 · e01b5b06=649fe2e7 |
| mail-oauth-review | 3 | 已被替代 · d7f1cff2=44358105、1fd570c7=704f8271、cfd76b9c=5ee5fa1c |
| mail-repair | 2 | 已被替代 · 6d9fde65=34610456、be12ca89=97040034 |
| mail-sync | 1 | 已被替代 · 251baeef=4f301953 |
| native-existing | 0 | 已可从基线到达 |
| normal-reply | 1 | 已被替代 · 6d4b6623=3ab02fe5 |
| production-cutover | 17 | 已被替代 · 1f7ceec8 → 0d279330（组合整合；295c052b 记录原连接与文本版本复验）、8ff3549b → 0d279330（组合整合；295c052b 记录原连接与文本版本复验）、7ae257b2≈0e1b1167、14a95f7f≈c16acfb3、3f479b89=b55c94c8、9198c349=a4fe0262、815d9917=db61ce53、69776e68=aa9952bb、7aafa47b=623608c7、311ba0c8≈d667d1ac、5bdaff66=e13d8d6d、49b9cea8=38ab7f27、0ca39e6a=ea252571、bbc3f014=301dee75、82b5ec95=f207e8e1、6d51ad28=35dc2bf8、1f5a472a=4c8fe523 |
| protected-env | 1 | 已被替代 · fb562efe=74015354 |
| receipt | 8 | 已被替代 · 4fe97901=95d5d4c3、a20128b8=571ac026、db0a562f=6c2cc928、5cda8418=30da8fe6、ce5289dd≈9d36640e、5daf0486=1b3b3857、9a8225f1=3ffd0698、3804140c=414d042c |
| reminders | 1 | 已被替代 · 3b08dc44=927536f2 |
| safe-confirmed-ui | 2 | 已被替代 · ec781688=d282fffc、e2f84e9d=1bee36b5 |
| safe-git | 0 | 已可从基线到达；P8.3 在交接时未开始，Linux 已由 t6 接手 |
| safe-personal | 3 | 已被替代 · aaeed7f8=8ee7643d、1910acc0=7f7c5547、6b11b63c=a7c51d9a |
| safe-tools | 0 | 已可从基线到达 |
| scan-cutover | 1 | 已被替代 · 35e46623=0514c1a2 |
| ssh | 1 | 已被替代 · 38891343=7edd015a |
| ssh-confirmed-ui | 3 | 已被替代 · 4f771358=9e924607、ff3221aa=17625f3d、3b837a7d=528ff232 |
| ssh-exec-jobs | 1 | c23a8258（#7 H11.2 WIP，t5 接手） |
| ssh-file-follow | 0 | 已可从基线到达 |
| ssh-forwarding | 2 | 已被替代 · f19a3a9e=96d79929、e69a8580=22fbdc4f |
| ssh-host-auth | 1 | 已被替代 · 65742887=5ed0f03e |
| ssh-import | 1 | 已被替代 · a12309b8≈0839ab75 |
| ssh-import-confirm | 1 | 已被替代 · 588bece5=d036effb |
| ssh-monitoring | 3 | 已被替代 · 9c55c07e≈95b7352c、c2e3605d≈adca7b97、006d42a9=e289ca7e |
| ssh-public-resources | 0 | 已可从基线到达 |
| ssh-settings | 5 | 已被替代 · 6ba3c6bd=7367e1f7、f8f00159=1f438d3d、22e86fd3=040a2e01、ed7ef6f7=5f277163、89d84e3d=f6fd6039 |
| ssh-transfers | 5 | 已被替代 · 895ae975=afd400ef、731b50cc=11d7b576、5e3e59de=6e99e78a、0fe4f1bb=ed17bce6、568fbbe5=a1edc22a |
| task-executor | 6 | 已被替代 · da653169≈264699e1、162fa0dc=1a735971、15b34b45≈af2305b3、77a52b6b≈79b495a2、9b34df69≈c839daf6、ff0afc58≈c0c70e67 |
| task-occurrence | 6 | 已被替代 · 3174c325=5273a390、4d030749=ee2cf74c、7734b844=964fd1ce、d14e5159=f9ad06b7、61b02ab4=53003e14、3d9f6079=764e324b |
| task-recovery | 6 | 已被替代 · 3c79467e=9761f2a1、29d68b3a=e940403b、4b4d4f32=d2e929f3、6b43fcec=1379c777、6cc99edd=dd514483、a5d82cb7≈96f53d35 |
| task-run-ui | 1 | 已被替代 · 2b693b4e=2f848859 |
| task-supplement | 0 | 已可从基线到达 |
| task-terminal-view | 3 | 已被替代 · 33e2d230=891c20e1、b909fc4a=264699e1、1641ff69=cd39e857 |
| task-tool-access | 1 | 已被替代 · 315c75d1=34088404 |
| tasks | 5 | 已被替代 · 29d68b3a=e940403b、4b4d4f32=d2e929f3、6b43fcec=1379c777、6cc99edd=dd514483、a5d82cb7≈96f53d35 |
| versioning-auth | 2 | 已被替代 · bb6f450b=8dc4a5f2、f5a92e68=0f5bbeb7 |
| versioning-owned-auth | 1 | 已被替代 · df0fca91=40822efd |
| web-share-ui | 1 | 已被替代 · 464c0e03=dcc95e63 |
| widgets | 2 | 已被替代 · 7e9cedaa=65bd6eba、15403bd7=98907e70 |
| window-chrome | 3 | 已被替代 · 688122c1=cfbce161、51facc51=efc33768、b48d3555=82f34b95 |

**分支裁决。** `production-cutover` 的两个无同名提交在 `0d279330` 合并实现文件会话绑定及按版本写远程文本。其后 `295c052b` 保存 Windows 验收。其余 ≈ 项可按两端 SHA 查看路径及增删，例如 311ba0c8→d667d1ac 的终端规则、ff0afc58→c0c70e67 的 Tasks 绑定、29a6e8f1→9d6ad33b 的 Vault 授权；后续集成版仍有相应生产入口与回归。对非本组的 ≈ 项，这一结论限于已有对应实现，不代表该成员已验收。按这些证据无需另行整支合入。交接时的未合入功能候选仍为 Mail AI 与 SSH 作业，P8.3 基线无提交。

**Windows Core 原始记录抽查。** 旧 manifest 中三条 active 分派 t18v/task15、t1bh/task11、t1c2/task02 均缺同号报告，另有 t17b/task01 标为 blocked 且缺报告。均不作通过依据。T5.3 的 t161/report05.md 仅签收内在发生和受理，后续生产切换另由 4c8fe523 等承担。t187/report12.md 在同次复核中签收 W8.1 的 21 项并提出 SSH P2，不能将整篇记成全通过。t19m/report01、02 和后续 78e180b7 原包必须分开读取；t1c2/report01.md 仅支撑 Mail AI 独立分支。终端报错或只有 task 的记录均未用于验收。

### 跨成员契约及派发边界

| 消费者 ← 提供者 | 基线可依赖的行为 | 仍需绑定到候选验证的边界 |
| --- | --- | --- |
| #5 Tasks ← #4 Agent CLI | W6.0 的原 run/attempt/session 与消息身份、Agent 落盘后可重交、Tasks 持久收妥后 ACK；两端由 packages/contracts/src/execution-receipt.ts、plugins/agent-cli/src/engine/execution-receipts.ts、plugins/tasks/src/engine/receipt-inbox.ts 分担。Tasks 单独决定评论物化、业务状态及人工完成。合同已可独立复用。 | Windows 原生执行已有可靠子集；plugins/agent-cli/src/engine/codex-dispatch.ts 的可用性带 win32 条件，interactive-environment.ts 另要求 win32/x64 与本机凭据。Linux 修好凭据测试后也须单独核对执行宿主与受控 provider，不能简单取消测试 skip。 |
| #4 W8.3 ← #5 T7.1 → #5 T7.2 | 4c8fe523 接 Tasks 生产入口，d667d1ac 替换终端规则环境，a4fe0262 校验启用事务，打包用例已切到“自动化发生、运行抽屉与任务详情使用同一笔派遣”。T7.1 提供调用者，W8.3 提供可复现包，T7.2 消费该包。 | 旧 t187/report01.md 的初审不能当现状。78e180b7 已有一轮随包问答；最终组合需重核旧入口、每条渠道独立问答和到期扫描，避免循环等待。 |
| #4/#5/#7/#8/#9/#10 ← #6 目录/授权 | per-Vault revision 与 Dispatcher 判定、CLI/MCP 共享策略已可用；内部插件另有 caller 和权限组；SSH H11.1 已合入 be7a8b8e。 | 静态声明、运行时注册、stream/Widget 读取仍须核对。plugins/agent-cli/src/engine/index.ts 的 agent.spaces.list 和 agent.workspace.launch 均有 exposable:false。域内 handler 已存在，G5b.3 的外部路由仍是实施任务。#7 H11.2 未合入，#8 Mail AI 尚需 Lead 接线。 |
| #4/#5、Git、SSH、Mail ← #9 模块凭据 | W7.3/T6.3b 的 Windows 宿主及模块所有权已有证据，Safe 个人条目与应用的凭据生命周期分别管理。 | Linux 15 项失败来自 Lead 基线；P8.3 Git 工作不能代替 Agent 交互 PTY 的实现/验证。跨机器 ZIP 还原只还原允许的配置，不复制本机凭据。 |
| #10 看板 / 编辑器 ← #3 退出契约 | Main 合并在途关窗/退出；Workbench 汇集参与者。Windows 菜单保存、选择继续编辑、再保存离开时从磁盘读回两份数据已有记录。 | Linux/macOS 的原生系统入口和 #2 编辑器最新版本仍需共同验收。仅有看板卡片草稿不得绕过文档结算。 |
| #6 工作台 / #10 Widget | 可信贡献声明与卡片实例可区分；停用插件后保留布局；邀请撤销能单独断开其会话。 | Widget 声明和业务读取需分别验权；Web 工作台身份独立于公开工具授权；按两物理设备验共享 Vault 及文件落点。 |

### 三条组合联验

**① 同一 Task 与原会话。** 历史阶段最强证据为批次 evidence/windows-stage-combined-78e180b7.md。Windows 真实 Codex 0.171.0、原包 helper 和包内 Core，模型服务为回环 Responses；MCP 创建并派遣，CLI 读问题并答复，重复 reply ID 仍只消费一次，桌面定位原会话并人工完成。NSIS SHA-256 为 `b23b5b0bf0b8d9a55fd224eb808b9b08f739702753403af8a198b7ded2463afc`。较早的 t19m/report01.md 记录 40822efd 问答失败，report02.md 是临时 helper 诊断；a183c7b8、3b3fc07a 和 78e180b7 原包实测更新了该判断。

| 自动化文件 · 用例原名 | 覆盖 | 缺口 |
| --- | --- | --- |
| plugins/agent-cli/test/native-receipts.live.test.ts · Windows MCP and CLI dispatch and answer through the same Core session and production Tasks inbox | 实际工具传输、Tasks 收件箱与原 Core，MCP 建任务、CLI 派遣，交替读取/答复，使用 provider 夹具 | 分成 MCP-only / CLI-only 各自创建、编辑、派遣、查询、答复和读取，逐个保存原 taskId/sessionId |
| 同文件 · Windows Engine recovers both lost ACKs for the same native receipt without another input | Windows 真实 Engine/Core 中两段 ACK 分别丢失后的重放与输入次数 | 与上述两条独立旅程合并，在最终安装包注入断线；在 UI 核对唯一结果和人工完成 |
| plugins/tasks/test/persistence-http.test.ts · 持久验收原回执后才 ACK，重开补送原评论一次且不重新执行 | Tasks 错误窗口、持久化与回读 | 与真实 provider 和桌面原位定位串联 |
| tests/e2e/packaged/packaged.spec.ts · 打包后：自动化发生、运行抽屉与任务详情使用同一笔派遣 | 包内规则、run 与 Task 共同身份 | 明日 availableAt、到期扫描和真实原生问答仍须同轮记录。对不支持的 provider 记录拒绝，不用假进程填通过 |

**② 工具授权、独立认证与新格式恢复。**

| 自动化文件 · 用例原名 | 覆盖 | 缺口 |
| --- | --- | --- |
| apps/engine/test/tool-access.test.ts · 两个 Vault 分开保存工具选择，重启保持版本，未配置的新工具关闭，损坏时失败关闭 | 初装、重启隔离与坏策略；同文件“两份工具预览只有同一版本的首个提交能整批生效，发现、撤销和落盘共用策略”覆盖批量撤销 | 逐项覆盖补齐后的新用户动作及活跃连接 |
| apps/cli/test/cli.test.ts · 受权 CLI 和两种 MCP 复用持久意图，同 Vault 不同身份不能读同一次调用 | 真实协议与意图主体隔离 | 复核服务撤销后缓存列表及真实调用均拒绝 |
| apps/engine/test/module-credential-host.test.ts · Windows 模块凭据与 Safe 锁独立，ZIP 恢复到新目录不继承系统密钥 | Windows 模块凭据/Safe/恢复边界 | 同一 Linux 候选完成实际受保护 shell、Git、SSH/Mail 各自的授权测试资源；Windows 用原生宿主复验 |
| apps/cli/test/approved-terminal.test.ts · Windows CLI/MCP 的终端授权、保护值轮换与原意图对账 | 外部授权的固定终端规则与轮换 | 将干净默认、单项授权、撤权、Safe 锁定、同包导出/还原串成一轮 |
| apps/engine/test/dashboard-recovery.test.ts · 在空 Vault 恢复真实 Engine 返回的当前格式备份并重开 | 当前格式看板回读。另见 W8.1-space-package.md 的 Vault ZIP / Space ID、重绑和未导入 runtime | 新 Vault 核对业务配置、待重绑、凭据隔离及恢复不产生重复任务；看板备份与整库 ZIP 要分别读回 |

**③ 菜单、页面离场、分享与布局。**

| 自动化文件 · 用例原名 | 覆盖 | 缺口 |
| --- | --- | --- |
| tests/e2e/knowledge/session-flush.spec.ts · 应用菜单保存当前文档，关窗先处理看板草稿再结算文档 | 同时保留最后输入与看板草稿；Windows 菜单及真实退出事务，原生选择由夹具驱动。另有 TB-15 应用退出接管在途关窗，另一窗口取消时保留已确认窗口 | X11/Wayland、macOS、物理原生菜单及编辑器 #2 最新改动 |
| tests/e2e/workflows/web-share.spec.ts · Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开 | 两份邀请、三个独立浏览器会话、撤销范围与布局重读 | Windows 同机 Edge 会话并非两台局域网设备；补第二设备实读写、继续工作的第三会话及浏览器设备存取 |
| tests/e2e/workflows/acceptance.spec.ts · 首页看板：窄屏调整顺序时保留草稿，保存后在宽屏重开使用同一布局 | 草稿与已提交布局的宽窄切换及重开 | 同候选联验退出与跨设备的布局结果；覆盖停用 Widget 不泄露业务数据 |
| tests/e2e/shell.spec.ts · Agent CLI 关窗等分栏保存回执，再打开看到已提交布局 | 额外参与者的异步布局结算 | 与文档、看板、另一窗口取消组合复验 |

### 建议派发顺序

下表规模为对新工作量的估计。S 是单入口复查或局部补证，M 是单领域含回归，L 是跨域切换或多环境签收。并行表示写入边界允许，仍受四 worktree 上限约束；Linux 的 t5、t6 已占位置。

| 先后 / 工作 | 写入范围 | Lead 独占文件 | 规模 / 并行 |
| --- | --- | --- | --- |
| 1. 核实可交付平台并生成首轮差集。#3 真实 Linux 窗口、#4 provider/PTY 能力、#6 各领域可选动作各取运行结果；定位 Windows-only 的产品与测试条件 | 对应成员 evidence/；#3 apps/desktop/src/main、packages/workbench/src/shell，仅修复已观察偏差 | 无；Renderer 装配变更交 Lead | 每项 S–M，可并行且可复用既有包 |
| 2a. #6 G3.3/G3.4，将扩展命令的最终 caller、具体能力授权、持久意图与撤销接到现有 Dispatcher | packages/kernel/src/{capabilities,plugins,server}、dispatcher.ts、operation-receipts.ts、apps/cli；各自测试 | 注册、静态目录由 Lead 集中更新 | L；先固定命令/意图契约，域 handler 可并行 |
| 2b. #6 G5a 按域移除用户动作永久关闭，逐项验证 Notes/档案、Inbox、指南与 kernel；Git 等 t6 的 P8.3 再接 | plugins/notes、plugins/inbox、plugins/agent-guide、plugins/versioning、packages/kernel/src/capabilities；工具 UI 在 packages/workbench/src/gateway | 静态目录与 Engine 注册归 Lead；Vault 包收集器如有改动也只由 Lead 写 | 每域 M，Notes 与档案同写入者，其他域可并行；复用领域动作 |
| 2c. #5 T1.4 用已持久快照实现或证明失败后的显式再试，保留原轮；#5 完成 T4/T5 时间输入及规则编辑/预览，回放 T6 恢复 | plugins/tasks、plugins/automations、各自 test；T5.5 对照 design.md 末尾两项决策 | 通常无；新增公开动作由 Lead 注册 | M + M，可分人；同一 Task 编辑器由一人负责。DST 缺口/重叠、编辑启用规则是否继续，资料仍列待选择，仅阻塞该输入/保存语义 |
| 2d. #4 W5.2 与 W4/W7，核对精确历史文件、受控和交互能力、布局压力；按目标平台适配有缺口的原生宿主 | plugins/agent-cli/src/{engine,ui}、packages/herdr-client、对应 live tests；隔离历史夹具 | 随包资源与 Engine/Renderer 装配交 Lead，根锁文件仅 Lead | 历史/渲染各 M；新增平台 PTY 或受控 provider 为 L。与 #5 可并行，沿 W6.0 通信；Linux 认证联调等 t6 |
| 3. #6 G5b、G5c、G7 收齐领域注册与流归属，核对 agent.workspace.launch、规则启停/历史、SSH exec/WIP、Safe 两档读、Mail 能力、Widget 数据读权 | plugins/{agent-cli,automations,ssh,mail,safe} 各自 handler、工作台/Web 宿主与回归 | Lead 在 apps/engine/src/boot.ts、Renderer 装配、静态目录和插件注册接线；Mail AI 与 Vault ZIP 同样由 Lead 整合 | 每域 M；#7 等 t5，#8 可先复核独立候选，#9 等 t6，#10 可并行 |
| 4. #5 T7.1 与 #6 G8.1 在集成分支完成调用方/示例清理，冻结 #4 W8.3 可复现候选，保存 build-info、包/Core/helper SHA 与实际输入 | 集成分支、tests/e2e/packaged、批次 evidence/ | 是，Engine/Renderer、插件注册、Vault 包收集器、静态目录及根锁文件如有变动均由 Lead 写 | M；先合入 main 的 #2 收尾并复测窗口/编辑器，再固定 SHA |
| 5. #4 W8.2、#5 T7.2、#6 G8.2、#3 S4-01 在同 SHA 完成三条联验及跨系统矩阵 | tests/e2e、对应成员与批次 evidence/ | 只取已装配包；发现实现缺口则返回对应所有者 | L；同一候选可并行跑 Windows、macOS、Linux X11/Wayland、授权 LAN 设备和服务 |

### 取证限制与复查方法

原 Issue 编号和成员状态是两层判断。例如存在 dispatcher 定义可以证明路由是否拒绝，存在测试只能证明有回归入口；只在历史报告明确记录运行时才采用为阶段通过。测试名中出现 live 仍须核对平台条件与 provider 夹具。T1.4 的 WIP 为源码推断：存在原意图对账/冻结输入，本次未定位到用户指定确切失败轮次、按原快照再试的完整界面到 handler；优先做一次可复现演示再决定改动范围。

## 产物与改动

仅发布本报告。业务树、Git 引用、历史渠道及 manifest 均未写入。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 任务身份 | HC_TERMINAL_ID=t7，manifest 有 t7、task01.md、active，初查无终稿 | 本主题 topic.md、manifest.tsv |
| 成员与基线 | 逐个提取 plan 的独立 tasks 链接，核对实际文件、原文编号、快照代码及测试入口；未知平台与整段未证项单列 | 四个成员 source.md、plan.md、tasks/、evidence/、prototype-review.md，4d86c84b |
| 候选来源 | 本地 58 个 origin/impl/huhu-issues-3-10-* 跟踪引用逐一核对；归档 stash 位于独立 handoff 命名空间 | 上文分支表；主库 handoff.nd 和 Windows 历史 manifest.tsv |
| 运行证据 | 核对 Windows 原包指纹、真实/合成边界及后续修复；本次为只读清点，Linux 全量同包结果尚缺 | 批次 evidence/windows-stage-combined-78e180b7.md、evidence/windows-stage-combined-40822efd.md、windows-shell-dashboard.md |

## 阻碍与接续

本次清点可交付。跨平台原生窗口、支持的真实 provider、第二台物理设备与最终固定候选的全量门禁仍由 Lead 按上表接续。Linux 主机上的 xvfb 只能验证对应 X11 虚拟环境。原 Windows 临时安装包和部分原始日志未随 Git 迁移，复核以持久报告为索引并在目标环境重新采证。

## Lead 验收

待 Lead 核对后登记。


Lead 验收（2026-11-21）：通过。与 t9 的分支映射一致；#4 `codex-dispatch.ts`、`interactive-environment.ts` 的 win32 条件已列为 Linux 联验①的前置。派发顺序按本表 1、2a–2d 推进，集成已含 main（`2b280794`）与 Mail AI（`3fa0f3de`）。终端关闭。
