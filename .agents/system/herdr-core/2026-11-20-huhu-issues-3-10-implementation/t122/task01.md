# #10 W02-05 备份恢复与新格式损坏预览

- 终端 `t122`，写同目录 `report01.md`。独立业务检出 `D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore`，分支 `impl/huhu-issues-3-10-dashboard-restore`，父 `2ceec67d9be1227da4815dc1df1afd8f1d8069c3`。仅 Windows。不得增开 worktree、改共享锁、远端或真实 Vault。
- 先读 #10 W02-01～05、设计「校验、备份与故障窗口」「冲突」。`57f3bec` 已提供真实 Engine 的 `home.dashboard.backup`，返回当前提交的完整 board，并验证传输断开和幂等。计划 W06 之后才注册生产整板写和恢复，当前切片产出私有 helper 并以真实 Engine 测试装配通过。保留既有 `home.dashboard.get/update` 合同与未知类型保留规则。
- 目标为读当前格式备份、空 Vault 恢复同一实例/布局并重开，再用已知格式中的孤立位、越界与碰撞生成确定、可查且零写入的修复预览。可修复几何的含混关联不得猜配。用户明确提交才一次写；新格式损坏原件先保全。失败场景含未知格式、已改 revision/字节、只读、无法保全原件和无效备份。校验读写保全原板、已有备份、业务文件和其他用户状态。
- 可写 `packages/kernel/src/capabilities/home-dashboard.ts`、必要的同目录私有 helper、对应 kernel/Engine 测试（避免复用 Lead 的现有共享测试文件）和你的报告。公共契约、Engine、host、UI、根锁和总备份收集由 Lead；如需公共字段，先在本切片 Zod 输入里表达并在报告建议。利用现有 VaultFiles 字节 CAS 和已确认配置尺寸。体验和 UI 仍待确认，本次专做数据、安全写入和验收。
- 生成精确候选提交。合成 Vault 跑真实 HTTP、两次预览、失败证据和回归、TypeScript/格式/lint。保持 Core 任务路径和日志，完成后的测试 pane 关闭。不要打包或使用真实用户数据。
