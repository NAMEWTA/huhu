# #5 E07 经明确批准使用终端规则的模块环境

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18v`
- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 基线 7aafa47b17e4ead727f6a41b1f6c7c82a2243f3a
- 架构分析 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18z/report01.md`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report02.md`

实现 E07 外部首个完整可复验路径。桌面管理者确认具体本机终端规则的执行目标和授权变量名。CLI 和 MCP 仅在 #6 对相应能力显式开放且存在这个精确批准时，可读取遮蔽状态、受限写入/轮换/清除已批准名字和触发同一规则的手动运行。沿用 ModuleCredentials 本机隔离和现有 protected terminal broker。禁止任何外部输入直接指定原始命令、argv、PID、交互输入、任意变量名、读取保护值或扩大到原规则未获准的目标。不要令批准随 ZIP 或同步规则恢复，本机身份和可执行目标匹配，变更命令、Space 路径/revision 或名称时要求重新确认。既有 Agent/SSH 原生命令端口及未来定时的授权约定保持原安全判据。记录首批实现范围和 G5b.2 其他欠项。

复用你的 automation-run 持久事实与 submitted 分界，公开手动执行需要稳定 intentId，组合回包丢失、同键重投、输入不匹配、撤权和旧 Vault 护栏，重投只核对原 requestId。秘密配置写入按 rule/credential 版本和既有事务，保护值只进入显式输入、不进日志、回包或快照，CLI 验证用 stdin/请求文件中的合成值，避免 argv。若时间吃紧，优先最小 ACL 和真实 MCP + CLI 的手动同一身份控制，再完成保护值写/清除。保全桌面已确认 UI，新增批准交互先做现代 Web 指南 search/retrieve。项目仅 Windows，固定 pnpm 12.10.1 与随包 Core，合成规则、真实 Engine 权限目录及 MCP/CLI 流。不要触碰根锁、公共启动/服务主入口或其它插件。不新增工作树，不连接远端、不委派。提交并发布证据。
