# #7 H5.2 工作区终端工具栏和布局设备偏好

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4x`，本机 `wta-ubuntu` 默认 Core。已核对环境终端 ID、topic 中的 Lead 和 manifest 活跃指针。
- task — `task04.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task04.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report04.md`
- 执行结果 — `done`，候选实现在工作树，待 Lead 实跑。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-terminal-layout`，基线 `e71f47b0dedd323a69c4861f6bc808a450603e44`。8 个已跟踪文件有差异，3 个新增文件目前未跟踪。

## 产物

- 分栏工具栏手柄可拖往同一分栏的另一端，也可用 Enter、Space 或点击执行同一移动。仅明确的上方或下方落点写入本机设备偏好，Escape 和无效落点撤销。移动后的键盘焦点回到原分栏的手柄。上方和下方是既有 Huhu 的有效位置。浏览器不支持拖动的输入方式仍可用手柄按钮或位置下拉框。 [WorkspacePaneTools.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/WorkspacePaneTools.tsx)
- 「本机布局偏好」可设位置、隐藏、两种有效工具顺序和小中大三档尺寸。恢复默认只重置工具栏的三个字段。保留原设备存储键，旧记录自动填入新增默认值。应用布局走同一浏览器存储边界，独立 Web 页面使用自身来源的存储。 [WorkspaceRunView.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/WorkspaceRunView.tsx:165) · [device-preferences.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/device-preferences.ts)
- 纵向内部标签可按已连接目标分组，比较地址、端口、账号及完整跳板链。相同目标和链的不同主机别名可归组。连接未就绪或缺少已确认路径的分栏维持独立。分组改变标签的显示顺序，工作区 Pane 顺序、身份和已选 Pane 仍由原结构管理。 [WorkspaceCanvas.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/WorkspaceCanvas.tsx) · [workspace-tab-groups.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/workspace-tab-groups.ts)
- 工具栏上下槽包围同一个稳定终端节点。位置、顺序、尺寸、方向和分组变更不调用运行布局 API。现有输入回调仍按 sessionId 关联。工作区被独立文件视图或宿主隐藏时，保留挂载的运行视图设为 inert，快捷文本不再渲染。可见性和输入控制仍决定快捷文本的合法目标。 [SshModule.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/SshModule.tsx) · [WorkspaceLibrary.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/WorkspaceLibrary.tsx) · [WorkspaceRunView.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/WorkspaceRunView.tsx)
- 模块设置原字段仍可编辑，`SshSettingsPage` 的字段表类型限定为该页已呈现的属性。拖动落点、尺寸和标签组仅增加模块样式。 [SshSettingsPage.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/SshSettingsPage.tsx) · [ssh.css](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/ssh.css)

## 规格与上游

- 核对了 H5.2、来源 §6.2 及原型确认。六文件指纹为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。`workView` 和 `paneCard` 展示活动分栏、切换与可见广播边界。布局移动和纵向分组依据 H5.2 的产品要求，使用现有 Huhu 布局与控件。 [H5.2](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H5.2-terminal-actions.md) · [来源 §6.2](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/source.md:121) · [原型确认](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md)
- Motty `v0.4.12` 解引用到 `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0。参考 `toolbar_dock_ui.go` 的有效落点和 Escape 取消、`toolbar_dock.go` 的顺序及恢复语义、`terminal_toolbar_settings.go` 的三档尺寸、`vertical_tab_groups.go` 的按实际目标和链分组。只采用行为参考，零上游源码或资产复制。 [拖放与键盘](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/toolbar_dock_ui.go) · [停靠](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/toolbar_dock.go) · [尺寸](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/terminal_toolbar_settings.go) · [纵向分组](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/vertical_tab_groups.go) · [许可证](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE)

## 验证

- Node `24.21.0`、pnpm `12.10.1` 下只运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/workspace-device-layout.test.ts`，1 文件、4 项通过。覆盖旧偏好、移动隐藏恢复、无效值拒写、路由别名分组，以及跳板、账号、端口、待连接状态和外部来源边界。 [定向 Vitest](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/workspace-device-layout.test.ts)
- 变更文件的 oxlint、oxfmt、模块 CSS 的 stylelint 及 `git diff --check` 均通过。SSH 插件 `tsc --noEmit` 只报告 `apps/engine/src/boot.ts:52` 无法解析既有 `@huhu/herdr-client` 声明。
- 已编写「H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组」。用三个工作区 Pane 比较有效拖动、无效落点、Escape、键盘焦点、分组、刷新持久化和恢复默认，并断言变更前后的 Pane、Shell、运行布局版本和 SSH/终端附件连接数。包括输入锁定及隐藏工作区无输入的检查。按约定未运行 Playwright、Electron、独立 Web UI、构建、打包或全仓门禁。 [Playwright spec](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/ssh/remaining.spec.ts:374)

## Modern Web Guidance

使用技能版本 `2026_11_10-47b4c80e`，先搜索 `drag reorder toolbar keyboard`、`move element preserve focus`、`cancel pointer drag escape`，再获取并完整读取 `toolbar,drag-and-drop,move-dom-element-without-losing-state` 的 462 行摘要。Electron 44.9.1 捆绑 Chromium 152.0.7977.167。浏览器端对 `focusgroup` 实作检测回退，停靠沿用标准 HTML DnD 和现有输入边界。 [Electron 版本](https://releases.electronjs.org/release/v44.9.1) · [Chromium focusgroup](https://developer.chrome.com/release-notes/150?hl=en) · [HTML DnD](https://html.spec.whatwg.org/multipage/dnd.html)

- **`toolbar`**　我为工具栏设单个 Tab 停靠点，在支持 `focusgroup` 时用原生导航，其余浏览器用 roving tabindex。依据 “Only one item is in the tab order at a time”。
- **`drag-and-drop`**　我保留显式拖动手柄，只在有效落点保存，并让键盘和指针激活相同移动。依据 “Let `Escape` cancel” 和 “Visible movement controls or an actions menu”。
- **`move-dom-element-without-losing-state`**　我用固定终端槽维持 xterm 的 DOM 节点和终端订阅，工具栏移位后恢复手柄焦点。依据 “a loss of keyboard focus to the page’s `<body>` element”。

## 阻碍与接续

默认 Core 锁所在文件系统只读，`hc get t4x` 和发布后的 `hc send t3p` 均返回 `cannot open core lock`。回告消息未送达，同号报告已发布到共享根。

## Lead 验收

Lead 核对候选 `5e832ada`、终端稳定挂载、布局偏好、焦点与输入条件，集成提交为 `636393fe`。SSH 类型检查通过，布局 4 项通过，`remaining.spec.ts` 枚举 5 项。Electron 拖放、控制交接和独立 Web UI 待固定候选运行。快捷命令库属于单独任务。
