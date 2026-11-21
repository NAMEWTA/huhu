# #4 W1.1 启动预检与 W1.2 重开对账

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t80
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t80
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/receipt，分支 impl/huhu-issues-3-10-receipt，当前 `ce5289ddd1ae5713167f6987fe6db53c3beef51f`，已含 W6.0。

按 dev-build、dev-verify 阅读 #4 W1.1、W1.2 及 t54/report01、t19/report04。先修 Windows 扩展／超长 cwd 的共同预检，正常中文及空格、argv、可执行身份保留。实测真实锁定 Core 0.1.19；当前版本有效超长 cwd 无法实际创建时返回确定的目录限制，保持两入口一致。核对交互 Agent 退出后的 shell 与真实退出回执是否能同时通过锁定 Core 承接，分别记录实际限制。用合成 `.cmd` 与临时 Core，严禁实际用户 Agent 历史或任务派遣。

推进 W1.2 私有启动对账。正确区分同 requestId 异意图（目标、路径、argv、provider 等）和同意图重传；持久状态记录与 Vault、标签、终端地址/代次绑定。模拟 Core 创建后丢 run 回复、重开 Engine、正常查回同一次启动，并覆盖空列表的不确定、列表失败、多候选、确认尚未创建后的再次创建、旧 Vault 或复用地址。保留已有 W6.0 合同，不把不确定结果当失败后新开。优先复用现有 SessionsService、Core 标签和 Vault 写入。分别提交 W1.1/W1.2，写明无法达到的真实 Core 能力和 W6.1 前置。

可写 `plugins/agent-cli/src/engine`、Agent CLI 相关私有 test/fixture。公共 DTO、Engine/Renderer 装配、根锁及任何 UI 体验由 Lead 持有。仅 Windows，禁止远端写入、自行增加工作树或派遣。依赖可用与集成同锁版本的隔离归档链接。锁定 Core 来源见 W0.2 Windows 证据，使用独立 HC_SOCKET。候选冻结、报告精确 SHA 与红绿。关闭完成且无后续用途的命令 pane。
