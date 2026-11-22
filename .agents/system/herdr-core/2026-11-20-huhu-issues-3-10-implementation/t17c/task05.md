# #8 S1b.2 接上桌面草稿附件

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17c`
- 独立工区 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 分支 — `impl/huhu-issues-3-10-mail-confirmed-ui`
- 基线 — `6a75ccd7fd88c8c6149887c3c3a0640cd6ebfb68`
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report05.md`

按 S1b.2、spec、design 和完整确认原型，复用现有 MailDraftAttachments 服务、按修订导入去重、对象回收及快照。实现写信保存后选择附件、显示状态、移除、退出和重开原草稿。先检查现有 preload 和文件传输授权如何接入已选定文件；没有现成入口时列出 Lead 必须接入的最小强类型宿主契约，并用临时且可撤销的合成宿主夹具走完 Mail 侧。渲染端不传未经宿主验证的绝对路径，不授予任意文件读取，不添加第二套附件持久或传输。新 Mail 能力应限已有桌面与 Vault 授权。Web 大文件和转发仍为各自切片。

先执行现代 Web 指南 search/retrieve。独占 plugins/mail、Mail 专用证据和测试夹具。公共 preload、Engine 主入口和根锁由 Lead，保持自身工区不写这些文件。使用 Windows 固定 pnpm，测试取消零附件写入、重复、超限／错误保留草稿、原文件移走后重开保留字节、选择消失后没有旧回调污染。按文件协议发布提交与结论。
