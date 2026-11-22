# #5 T1.2 派遣记录完整性与恢复 Vault 边界

- 终端 `t110`，输出同目录 `report01.md`。专用且唯一可写业务检出 `D:/Document/code/huhu/temp/issue-worktrees/task-recovery`，分支 `impl/huhu-issues-3-10-task-recovery`，冻结父提交 `29d68b3`。根工作树、集成树、其他分工只读。禁止增加 Git worktree 或远端写入。仅 Windows。
- 先读 `../t54/report03.md` 两项新发现以及 #5 T1.2/T7.1、T1.1/T1.2 的本机证据。当前候选当持久 JSON 拥有合法结构但 runId/attempt 被篡改时会交给 executor。Vault ZIP 导入会创建新 Vault ID，候选却会在两个 Vault 自动运行同一 pending。复用已有 `VaultFiles`、持久收据和真实 ZIP 导入，修复后有效证据应含同 Vault 重开可恢复、复制 Vault 历史可读但持久自动派遣隔离、损坏记录不造成连带执行、外入口及重复查询保持原语义。
- 所有者和稳定身份均取可信的当前 Vault/存储，拒绝复用原 Vault 凭据和主动重派。请区分旧数据或外来备份缺乏可验证所有者与正常同 Vault 重启。有效历史按照 T7.1 存留。不要引入生产 Agent executor 或改 #4、桌面 UI 和外部服务。具体协议数据与冲突范围见 t54 报告。
- 使用合成 executor、实际本机 Engine HTTP 与 ZIP 往返做红绿回归，记录 executor 调用与双方 Vault ID、返回语义及独立文件前后值。跑对等实际全量筛选、TS、lint、格式，保存本地可 cherry-pick 的提交。4 个 worktree 已满，临时证据放 `temp/issue-baseline`。pnpm 12.10.1 使用锁定缓存的真实 exe，优先 `install --frozen-lockfile`，不要改变 pnpm `packageManager` 或现有根锁差异。
- 原型相关体验仍待用户确认。只实现这一数据、行为和协议切片。保留全部未测试范围与兼容性判断，完成后结束。
