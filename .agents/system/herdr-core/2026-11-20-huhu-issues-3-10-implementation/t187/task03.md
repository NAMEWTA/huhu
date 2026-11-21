# 复验 623608c7 的任务与附件恢复

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t187`
- 只读候选 `623608c76066559611df6d61e00cf357a26c7e99`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report03.md`

复验前两次报告的剩余三个 P2，定时 Terminal 的现有事实合并自 7aafa47b，绑原 Task/run 的纯 blocked 来自 1c07566a，Mail 停止与未提交对象 ZIP 的修复来自 2e32b8ea、24438602、64f4df74。优先找数据丢失、重复启动、Vault 归属、终端原会话以及 ZIP 离开锁后还篡改文件快照的实际问题。对照新增 #10 备份和 Mail 删除的工作区范围，优先核对风险。主会话在跑同候选全量 Windows gate，避免写测试产物或并发重压。可以只读源码、读日志或跑隔离的最小测试。E07 显式受权的外部路径和 Mail 转发是已派发后续任务。不要写来源工作树，不操作远端，不委派。按协议报告，并最后把已完成的自建测试子 pane 关闭。
