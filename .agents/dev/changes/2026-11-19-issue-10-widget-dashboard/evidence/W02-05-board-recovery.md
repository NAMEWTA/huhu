# W02-05 看板恢复证据

在 Windows 使用固定 pnpm 12.10.1、Electron 44.9.1 和独立临时 Vault。样本包含一条跨出边界并碰撞的卡片位置和一条找不到实例的孤立位置。

- 两次预览给出相同的调整和推荐坐标。取消后磁盘仍只有原布局文件，内容逐字节一致。
- 预览后修改目标 revision，提交被拒绝。重新预览并确认后，损坏原件按 SHA-256 另存，保存的副本与修复前字节一致。新布局保留原实例及配置，修复后的坐标在工作台重开后仍可读取。
- 编辑一张卡的隐藏状态后导出备份。原布局字节不变，备份只包含 Engine 当前提交的实例、几何、配置和 revision。保存新草稿后重选该 JSON，取消预览零写入，确认恢复后重开工作台可读到原备份布局。
- 真实 Engine 的五项恢复测试覆盖在空 Vault 恢复当前格式备份、保护未知或旧格式、损坏关联键、同 revision 不同字节、候选内容变化、保全失败及只读目标。

[任务与验收条件](../tasks/W02-05-restore-board.md) · [三项桌面测试日志](/D:/Document/code/huhu/temp/issue-baseline/dashboard-backup-desktop.log) · [Engine 与 Kernel 测试日志](/D:/Document/code/huhu/temp/issue-baseline/dashboard-recovery-engine.log)
