# t17c · #8 OAuth 持久终态与未决提交

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task19.md`
- 报告文件 — `t17c/report19.md`
- 执行结果 — `done`

## 交付

阶段提交 `e01b5b06423806d7685046578fa257157c8b468e`，分支 `impl/huhu-issues-3-10-mail-oauth-outcomes`，父提交 `42d332a9083c83c3f3054afc449fd0c01f0b1421` 与独立复验一致。只改 Mail 插件及 #8 验收证据。task18 原改动另存 `refs/agent-checkpoints/t17c-task18`，未进入本提交。

- 以稳定的会话 ID 回读终态。正常完成、取消、拒绝和过期保留各自结果；尚未证实提交返回 `unknown / commit-unconfirmed`。同键仍只观察原操作。
- 受信主体和物理 Vault 绑定适用于正反查询，包括冷启动及内存回收。账本存摘要、会话及目标账号 UUID、脱敏阶段。有效回调先登记交换受理。成功时凭据事务将会话见证同 token 一起封存，沿用已发布 ModuleCredentials 版本作为证据。Portable definition 的导出范围不变。
- 终态回执写失败时，后续查询只查准确账号的已发布凭据代，匹配原见证才补记配置成功。若只有同地址账号、旧修订、凭据不可读或证据仍不全，保留原 ID 和待核实状态。

## Windows 证据

- 同一 Vault 正常重启、停启插件、创建 32 条会话触发回收之后，按原 ID 和原键回读已配置结果、原账号与发送状态。取消、拒绝和过期保留区别。
- 交换挂起时关 Engine，重开返回原 ID 加待核实。之后创建同地址的另一账号，结果仍待核实。两枚真实服务令牌继续隔离。复制相同逻辑 Vault ID 和账本到新物理目录，原会话查询得 `NOT_FOUND`。
- 注入凭据发布前故障，有效原账号和修订保持，原重授权待核实。在实际凭据提交后故障，使终态原来只有 `accepted`，重开验证本机见证后回读准确的账号，结果可由 ID 和原键复查。该段浏览器、交换均未新增。
- Windows Mail 全量 11 个文件、49 项通过，包含 Gmail history 与 Exchange IMAP 回归。TypeScript、格式、lint 和差异检查通过。仅使用隔离 Vault、合成账号及回环夹具。 [复验证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S3-S4-oauth-durable-outcome.md)

当前生产 Main 的「明确拒绝」与「仅通信 ACK 状态未知」区分属于独立待证实的 P3。若 Lead 改宿主，最小合同是在受信通道中区分 open 已确认、明确拒绝、通信结果未知。最后一类让会话保持等待有效回调直至原超时，已有 `finishing` 由凭据路径收束。真实系统浏览器和在线 OAuth 未在本片运行。

根据用户直接派发完成 task19 后，恢复 task18。共享清单的当前状态仍由 Lead 管理。
