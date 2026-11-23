# Windows 桌面菜单与首页看板阶段验收

2026-11-20 在 Windows 使用固定 pnpm 12.10.1 构建并运行仓库自动化。桌面端使用项目固定 Electron 44.9.1。采用用户确认的 #3 窗口菜单、文档保存与关窗反馈，以及 #10 布局、宽窄调整、冲突和带草稿离场场景。 [#3 原型确认](../../archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/prototype-review.md) · [#10 原型确认](../../archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/prototype-review.md)

## 自动化结果

- Windows 桌面测试 5 项通过。按钮和 F10 生成同一组应用菜单项。用该菜单触发保存并读回 Markdown。保留最后的编辑器输入，再修改看板并请求关窗。第一次选择继续编辑，窗口和未提交布局仍在。第二次选择保存并离开，关窗后读回整板和完整的笔记文本。测试拦截 Electron 原生弹层以选择菜单项，实际运行了菜单动作、渲染器和退出事务。 [菜单与关窗测试](../../../../tests/e2e/knowledge/session-flush.spec.ts)
- 同一组桌面测试覆盖窄屏重排、保存前零写入、宽屏重载后的实例顺序与文件字节。另一个客户端先保存后，编辑器显示冲突并保留草稿，明确采用新版本为基准后才能提交。Git 与 SSH 卡片经可信目录添加，停用及重启用 SSH 后，原实例和布局文件保留。专注与习惯的业务状态可重开读取。 [看板测试](../../../../tests/e2e/workflows/acceptance.spec.ts) · [专注与习惯测试](../../../../tests/e2e/shell.spec.ts)
- Engine、Kernel 与 Workbench 定向回归 12 文件 50 项通过。两份邀请分别产生两个会话和一个会话。独立会话访问同一真实 Engine，保存后发送布局更新事件，旧 revision 返回冲突，剩余邀请会话与桌面读到同一布局。按邀请撤销仅切断该邀请的两个会话。另覆盖丢失响应、原意图重查、备份恢复、并发修改和只读拒写。 [邀请联验](../../../../apps/engine/test/web-share.test.ts) · [断线保存](../../../../apps/engine/test/dashboard-save.test.ts) · [恢复](../../../../apps/engine/test/dashboard-recovery.test.ts)

原工作区日志位于 `temp/issue-baseline/dashboard-shell-all-e2e.log`、`dashboard-shell-production-rerun.log`、`dashboard-shell-build.log`。恢复测试使用普通 Engine 装配，API 拒绝覆盖旧格式及无法识别的原件。

宽屏的移动和缩放把手已补齐实际指针预览。Windows `pnpm` 自动化在拖动和缩放时检查网格坐标，按 Escape 取消下一次移动，确认显式保存前 Vault 没有布局文件，保存后读到原实例的新尺寸和坐标。此次看板测试四项通过，日志为 `temp/issue-baseline/dashboard-geometry-e2e.log`。 [指针与保存回归](../../../../tests/e2e/workflows/acceptance.spec.ts)

## 后续验收

2026-11-21，`4f5cb1c8` 对应的 Windows 候选通过 23 项桌面回归。工作台导航取消上一轮加载时保留新的顶层页面，缺失启动资源仍能显示可关闭的错误页。评论回归通过有名称的「打开任务」按钮进入详情。Web 测试在 Edge 157.0.4341.60 验证两份邀请、三个独立浏览器会话、按邀请撤销及看板保存后重开。日志为 `temp/issue-baseline/windows-desktop-regressions.log`。 [关窗与启动失败测试](../../../../tests/e2e/knowledge/session-flush.spec.ts) · [紧凑评论测试](../../../../tests/e2e/knowledge/compact-submit.spec.ts) · [Web 分享测试](../../../../tests/e2e/workflows/web-share.spec.ts)

Linux 和 macOS 的系统菜单、系统快捷键与原生控件仍缺对应平台证据。Windows 原生菜单的方向键、Escape 焦点返回与系统菜单互不干扰仍需取证。看板恢复能力已有 Engine 验证，恢复操作界面按已确认原型实施。八项共同候选包、同包联验和最终远端落地按批次计划验收。
