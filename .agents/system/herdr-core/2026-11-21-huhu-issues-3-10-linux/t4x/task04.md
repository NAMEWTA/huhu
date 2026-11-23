# #7 H5.2 工作区终端栏布局

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 本机默认 Core `wta-ubuntu`，Lead `t3p`，实施终端 `t4x`
- 任务 `t4x/task04.md`，报告 `t4x/report04.md`
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-terminal-layout`，基线 `e71f47b0dedd323a69c4861f6bc808a450603e44`

按 `dev-build` 实现 #7 H5.2 设备本地布局中尚缺的操作。对照 H5.2 任务、source §6.2、已确认原型与 Motty v0.4.12，先核对 `WorkspaceRunView`、SSH 工作区标签与已有 `device-preferences.ts`。终端工具栏可移动至有效位置、隐藏并恢复默认，维护有效的展示顺序和尺寸预设。拖到无效位置或按 Escape 时取消，提供键盘可达的同一移动动作。桌面与独立 Web 要沿用现有宿主及设备偏好边界。工具栏、标签方向或同目标分组的变更不能导致原终端重新建立连接，保留 paneId、sessionId、活动 Pane 和合适的焦点。工作区隐藏或 Pane 失去控制时遵循既有快捷文本和实际输入边界。优先实现工具栏移动与持久化，再完成尚缺的纵向同目标分组，已有功能通过检查即可。快捷命令库的保存/CRUD 另归 Lead，勿在此引入新服务。

可写 SSH 自身的 WorkspaceRunView、WorkspaceCanvas、相关工作区/终端工具栏组件、SshModule 布局挂接、该模块设备偏好与同模块 CSS，本次 Vitest 文件至多一个、相应 Playwright spec 至多一个。Lead 独占共享 UI、Engine、注册、公共契约和根锁文件。先运行 `zh-modern-web-guidance` 的 search 和 retrieve 并读完整摘要文件，复用项目组件，不启动构建、E2E、包或全仓门禁。验证中只跑直接相关的一份 Vitest。报告列候选、实际验证、未运行项、参考的固定上游文件及许可证；Lead 跑 Electron。每项任务仅写同号报告，无远端写入或其他派发。
