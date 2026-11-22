# #8 S1b.3 持久投递独立复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t161`
- task — `task04.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/task04.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report04.md`
- 执行结果 — **done**

## 结论

冻结候选 `564a9b680bd48757ccf8691faf86c7572949b58a` 的私有 Mail 出箱通过独立复核。Windows 定向复跑 1 个文件、3 项通过。同一草稿版本只启动一次投递，持久认领先于 SMTP，DATA 确认丢失和回执写失败均保持待核实，重开后同版本提交只返回原操作。未发现阻挡此候选交回的新增缺陷。生产 SMTP 适配器和受权工作台入口仍需 Lead 装配。 [独立复跑](evidence-task04/outbox.log) · [原实施报告](../t162/report02.md)

## 静态复核

- 直接父提交为 `5ab72a2ba812130cbf83a7694232582abf7f762f`。9 个变更文件均在 Mail 插件内，两提交的锁文件 blob 均为 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`，`git diff --check` 退出 0。原 Mail 与 Vault 联跑 142 项通过、1 项跳过。原 Mail 类型日志中的共享任务日期 `TS2379` 对应源文件与父提交相同，本次取证聚焦运行夹具。 [静态证据](evidence-task04/static.log) · [原联合测试](../t162/evidence-task02/mail-vault-tests.log) · [原类型日志](../t162/evidence-task02/mail-types.log)
- `plugins/mail/src/engine/outbox.ts:72` 使用既有草稿串行队列检查和冻结原修订。按 Vault 目录内的 draftId／revision 决定 operationId，条件创建持久记录时写入 Message-ID、发送设置、内容、收件人和附件引用。落盘后才经 `ModuleCredentials.use` 取已绑定凭据、复核 SMTP 设置并调用传输。同版本再次提交从磁盘返回原操作，数据包恢复时即使重新生成 Vault ID，也能查回同一操作。附件回收同时计入出箱与草稿持久引用。
- `smtp.ts:60` 把 Bcc 放在 SMTP 信封。记录按明确的 DATA 2xx、明确拒绝和连接中断区分结果。无持久回执的认领仍留在磁盘，活跃投递结束或 Engine 重开后显示 `unknown` 与 `result-not-recorded`。未知操作的人工对账和逐收件人补投留在 S1b.4。 [S1b.3 规格](../../../../dev/changes/2026-11-19-issue-8-mail-module/tasks/S1b.3-submit-draft.md)

## Windows 独立复跑

从冻结 Git 对象取系统临时归档，复用 `safe-personal` 同一提交安装的依赖。对比两个夹具及出箱、SMTP、草稿实现的 Git blob。使用 Node v24.21.0、固定 pnpm 12.10.1、Vitest 3.2.7，以 `pnpm exec vitest` 单 worker 运行原 `outbox-engine.test.ts`。真实 Engine 的草稿入口走桌面 HTTP，测试在 Mail 注册时注入本机夹具目录已安装的 Nodemailer 10.6.0 适配器，通过捕获的进程内服务提交和查询。SMTP 使用 `127.0.0.1` 临时端口与合成凭据。 [命令与日志](evidence-task04/outbox.log) · [复跑脚本](verify-outbox.ps1)

| 检查 | 实测 |
| --- | --- |
| 并发、先认领和持久快照 | 两个模拟 caller 获得相同 operationId 和 Message-ID。挂起服务器最终回包时，磁盘已有原修订、正文和附件摘要，`result: null`，接口报告 `sending`。取消提交方等待、改主题并移除草稿附件后，SMTP 仍收到原主题、正文、附件字节和 Bcc 信封，MIME 头省略 Bcc。出箱引用保留对象。DATA 250 后为 `accepted`，连接、认证和 DATA 各 1 次。 |
| 提交前拒绝 | 过期 revision、附件缺字节、只读、无收件人、SMTP 停用及认领原子替换失败累计连接 0、认证 0、DATA 0、认领 0，原草稿可读。 |
| 明确拒绝和部分接受 | DATA 554 为 `not-delivered`，原草稿保持可读。全体 RCPT 550 不进入 DATA。部分 RCPT 550 与 DATA 250 保留逐地址的接受与拒绝结果。 |
| 丢失确认、回执写失败和恢复 | 合成服务在 DATA 后断开，出箱结果保持 `unknown`。收到 250 后故障注入导致回执写失败，磁盘仍留原认领，状态为 `unknown/result-not-recorded`。重开后两个未知操作及明确拒绝操作均复用原号，总计连接 5、认证 5、DATA 4。另将已接受样例经 ZIP 恢复到新 Vault ID，原操作和附件保留，DATA 仍为 1。 |

## 装配边界

`apps/engine/src/boot.ts:193` 仍使用三个参数调用 Mail `apply`。Lead 需在生产依赖层固定 Nodemailer 10.6.0 并接入两个已核对的入口 `nodemailer/lib/smtp-connection` 与 `nodemailer/lib/mail-composer`。现有适配器作为 Mail `apply` 第四参数提供。冻结查阅确认缺少适配器时，新投递在认领前返回 `smtp-transport-unavailable`。本机包元数据为 MIT-0、Node ≥20，无新增传递运行依赖。受信工作台提交和含逐地址状态的查询仍需按当前 Vault 和草稿授予访问。整体 ZIP 与 Mail 子集导出沿用同写入实例的 `withSnapshot`。当前 MIME 使用纯文本和附件，富文本 JSON 留在持久快照。真实邮箱、TLS、GUI 与安装包均超出本次验收。 [原装配说明](../t162/report02.md) · [本机软件包元数据](evidence-task04/static.log)

## 运行偏差与清理

首次准备因 Windows PowerShell 无法直接解析 npm 夹具锁文件的空键失败，改用 Node 读取所需条目。随后的启动中，pnpm 自动依赖核验向 npm 包仓库发起下载，已下载部分依赖。我在发现后终止该验证窗格，移除该次临时快照；这次启动未进入 Vitest。最终以明确禁用运行前依赖核验、启用离线模式及回环 registry 的参数复跑，Vitest 和窗格均退出 0。仓库根锁文件的 SHA-256 与此前留存值一致。 [首次日志](evidence-task04/initial-outbox.log) · [自动下载日志](evidence-task04/registry-outbox.log) · [中止清理](evidence-task04/registry-cleanup.log) · [最终配置](evidence-task04/pnpm-config.log)

最终夹具目录为零，夹具断言合成 Windows 凭据已清理。三次临时快照的原路径均已清理，无注册 worktree。验证窗格 `t171`、`t172`、`t174` 已关闭。Lead 可回收或复用 `t161`。 [最终窗格退出](evidence-task04/pane-exit.log) · [最终清理](evidence-task04/cleanup.log)
