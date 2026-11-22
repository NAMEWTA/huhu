# #7 H7 与 #4 W8.1 组合运行复核

- terminal_address `t187`
- 固定组合候选 `ed17bce6ba6f75568e0a9b3920283b1395344686`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report12.md`

审查本组合的 H7 单文件有界队列、SFTP 暂存、暂停续传、覆盖及跨端点发布，优先真实状态错接、已有目标保全、失联和重试、引用原文件能力。按实际代码和探针区分风险与缺陷。另复核 W8.1 已集成的 Core 非启动读取、ZIP 导入时本机运行资料排除、目录待绑定和同源回读，Lead 定向日志 space-restore-core.log 有真实 Core。目录批量传输由 t18v 另外推进。report11 的安装宿主与恢复按钮两项由 Lead，当前无需重复。所有业务为只读固定对象，允许系统临时 Windows 回环与合成文件，不写其他工作树、真实远端或根锁；不在集成构建目录运行测试。

