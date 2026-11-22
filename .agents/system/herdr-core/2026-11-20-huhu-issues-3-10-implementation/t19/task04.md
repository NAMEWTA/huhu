# task04.md 推进 #4 W1.1 Core 启动合同与 W1.2 前置核对

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t19
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t19
- 当前任务 — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report04.md
- Lead 收件 — 回告终稿绝对路径。
- 实施目录 — D:/Document/code/huhu/temp/issue-worktrees/receipt，分支 impl/huhu-issues-3-10-receipt，从已冻结和已审的 5daf048665ea46ae62e60dfbda9beed6459a8868 追加候选。

读取 #4 W0.2、W1.1、W1.2 tasks、设计与原型待确认范围。W6.0 已合入集成，保持该合同不动。优先核对并交付 W1.1 后端切片，复用现有 detect、launch、sessions 与实际 Core 协议。在隔离 Vault 与唯一 Core socket，验证 launch preview 与实际 shell/合成 Agent 的命令、参数、含空格/中文 cwd、显式非法目录零启动、标记与直接调用方；如果已有可靠实现，以真实序列与证据交付。实际锁定的独立 Windows x64 Core 0.1.19 路径 D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe。Lead 的宿主隔离范例和初始结果在 D:/Document/code/huhu/temp/issue-baseline/core-lifecycle/probe.ps1 与 Core t3y。未推进 W1.2 前核对现有去重、Core 响应丢失、操作期与跨 Vault 的具体缺口，独立记录。W6.1/W6.3 尚依赖这些结果。正式 GUI 和 provider 登录/历史保留待对应实机入口，保持产品 UI 和原型不动。

可写 plugins/agent-cli/src/engine 中 W1.1 的探测/解析/会话分支与对应插件测试，以及上述报告。不得写 apps/engine 或 Renderer 装配、公用 Registry、锁或其他插件。仅合成进程与临时 Vault、独立 Core 环境，不能写入原生 Agent 历史或真实 Vault，不能使用真实 Core 346bd5608735e3fcb27f9d01f5c8008e 作测试。核对同号报告、精确提交、平台与实际命令和失败原因。按 dev-build，给出可审查本地提交，禁止远端写入或自行派遣。