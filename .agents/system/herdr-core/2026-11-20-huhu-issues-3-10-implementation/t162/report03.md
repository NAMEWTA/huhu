# #8 S1b.4 发件记录核对、选择性重试与本地删除

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t162`
- task — `task03.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t162/task03.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t162/report03.md`
- 执行结果 — `done`

## 交付

本地提交 `bf37a4eaf86291ac127358aeb65559f13bde2ab9`，直接父提交为冻结的 `564a9b680bd48757ccf8691faf86c7572949b58a`。工作树 `safe-personal`，分支 `impl/huhu-issues-3-10-mail-drafts`。提交包含 Mail 插件后端和自动化测试，工作树干净。 [提交和范围](./evidence-task03/commit.log)

- 私有 `mail.outbox.list()` 和 `status({ operationId })` 读当前 Vault 的本地记录。详情保留每个收件人的原 SMTP 结果及已确认可重试地址，后续尝试保留自己的结果和原记录链接。结果未知的地址保持待核实。
- `retry({ parentOperationId, expectedRevision, recipients })` 使用当前修订的内容、发件账号及附件，核对所选地址在父尝试已确认未投递并仍存在于当前草稿。只把选定地址写进新尝试的信封和相应邮件头。每次新尝试有自己的 `operationId` 和 RFC822 `Message-ID`，另外记录直接父尝试及原始尝试的两种 ID。
- 精确重复请求复用原重试回执。同一父尝试的每个地址只被认领一次，随后只能从该地址的新失败结果继续尝试。已有认领的草稿若换了 revision，再发入口为显式选择性重试。发送一封独立邮件使用新的草稿 ID。
- `deleteLocal({ operationId })` 用同一条件写队列替换本地记录，清除正文、明确地址、附件引用和结果。保留原操作身份供重复请求返回原回执。重试记录另保留直接父操作号及按父操作作用域计算的收件人摘要，用于拦截重叠请求。详情从查询和列表移除，迟到结果无法覆盖删除状态。附件回收继续核对其他草稿和发件记录的引用。

## Windows 自动化证据

使用真实 Windows Engine、一次性 Vault、锁定 pnpm 12.10.1 与 Vitest 3.2.7，复用 S0.2 的本机 Nodemailer 10.6.0 与合成回环 SMTP 夹具。试验清理了临时 Vault、合成凭据和子窗格。 [环境和命令](./evidence-task03/environment.log) · [联合测试原始输出](./evidence-task03/mail-vault-tests.log)

| 验收 | 实际观察 |
| --- | --- |
| 部分接受与修正重试 | 原尝试只有 A 进入 DATA，B 和 C 明确拒收。改正后两个并发的等价调用认领同一重试，只有 B 进入第二次 DATA。已接受的 A、过期 revision、修正版中缺少的 B，以及与在途重试重叠的地址请求均拒绝。原尝试的逐人结果保持，未选的 C 仍可选。另验重试被明确拒收后，可从该尝试再次显式认领，根操作和根 Message-ID 仍能回读。 |
| DATA 确认丢失与重开 | 最终回复丢失、结果原子写失败及 Engine 关闭时的在途 DATA，重开按原操作查到 `unknown`，地址无重试资格，SMTP 计数保持原值。 |
| 删除和恢复 | 注入删除写入故障时旧文件逐字节保留。重试详情删除后，父尝试仍记得该地址已被认领，附件仍由父记录保护。父详情也删除后，回收唯一无引用附件。ZIP 恢复到新 Vault 后列表为空，旧 API 请求仍返回原认领回执，回环 SMTP 仍只有 2 次 DATA。在途删除场景的迟到 SMTP 结果也通过条件写隔离。 |
| 只读与范围 | 只读 Engine 可以查看详情，重试和删除均返回 `READ_ONLY_VAULT`。所有发送证据来自 Windows 环回夹具。 |

发件箱 Engine 用例 5 项通过。最终 Mail 与 Vault 联合测试 18 个文件通过，144 项通过、1 项跳过。全仓 lint、Mail 格式和 Git 差异校验通过。Mail 类型检查仅报告既有 `packages/contracts/src/kinds/task.ts:71` `TS2379`。 [首轮探针](./evidence-task03/outbox-tests.log) · [最终联合测试](./evidence-task03/mail-vault-tests.log) · [静态检查](./evidence-task03/quality.log) · [类型检查](./evidence-task03/mail-types.log) · [基线](../t12p/evidence-task07/baseline-types.log)

## Lead 接续

工作台接线沿用进程内服务权限边界。页面选中位置可保存 `operationId`，重新进入时调用 `status`。生产 SMTP 注入和共享导出协调沿用上轮报告。删除入口应向用户确认本地移除范围，未知结果可从原操作进入人工核对。 [上轮装配合同](./report02.md)

验证子窗格 `t173`、`t175` 已回收。`t162` 由 Lead 验收后接续。

## Lead 验收

