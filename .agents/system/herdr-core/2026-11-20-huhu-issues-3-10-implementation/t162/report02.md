# #8 S1b.3 同一草稿版本的持久投递受理

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t162`
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t162/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t162/report02.md`
- 执行结果 — `done`

## 交付

Mail 草稿分支本地提交 `564a9b680bd48757ccf8691faf86c7572949b58a`，直接父提交为冻结的 `5ab72a2ba812130cbf83a7694232582abf7f762f`。变更覆盖 Mail 插件后端和 Windows 回环测试。工作树干净，根锁的 Git blob 与父提交一致。 [提交和范围](./evidence-task02/commit.log)

- 新增进程内 `mail.outbox` 服务，提供 `submit({ draftId, expectedRevision }, signal?)` 和 `status({ operationId })`。复用草稿 CAS 的串行边界和 `VaultFiles` 原子条件写。Dispatcher 现有幂等按 caller 隔离，这里的持久认领按 Vault 内草稿与 revision 唯一约束。认领记录保留稳定 RFC822 Message-ID、发件配置、原始富文本 JSON、收件人和附件摘要。受管附件字节在首次认领时校验并读入本次发送快照，其持久引用加入附件回收判断。
- 认领落盘后才从 Mail 账号的 `ModuleCredentials.use` 取已绑定凭据，并在登录前复核已冻结的发件账号配置。提交回执只含 operationId 和 Message-ID。私有状态可查逐地址结果及阶段，Bcc 进入 SMTP 信封，出站 MIME 头省略 Bcc。当前 S1b.3 发送 `text/plain` 正文和 MIME 附件，富文本 JSON 留在持久快照，富文本 MIME 映射属于后续装配。
- SMTP 明确接受后写入 `accepted`，支持明确未投递和部分接受。DATA 确认中断写入 `unknown`。只有认领而缺持久结果的记录，执行中显示 `sending`，执行结束或重开时显示 `unknown` 并标明 `result-not-recorded`。同版本重复调用查询原操作。明确失败后，`draftId` 和 revision 可用于打开并修复原草稿；新的投递操作以新 revision 认领。逐收件人补投和人工对账留在 S1b.4。

## 实际验证

Windows x64 26300、Node 24.21.0，运行真实 Engine `boot()` 与工作台 HTTP 草稿入口。SMTP 使用 `127.0.0.1` 临时端口、合成账号、Nodemailer 10.6.0。测试在 Mail 实际注册时装配适配器并捕获私有服务。各试验关闭连接与 Engine、删除合成凭据及一次性 Vault。 [环境](./evidence-task02/environment.log) · [SMTP 原始日志](./evidence-task02/smtp-engine-utf8.log)

| 验收 | 观察结果 |
| --- | --- |
| 同草稿版本两个模拟 caller | 返回同一 operationId 和 Message-ID。SMTP 连接 1 次、认证 1 次、DATA 1 次。最终回包被挂起时，磁盘已有认领且状态仍为 `sending`。取消提交方的等待、修改原草稿和移除附件后，发送仍使用冻结的主题、正文及附件字节，回收保留发件记录引用。 |
| 旧版本与无效输入 | 过期 revision、附件缺字节、只读、无收件人、SMTP 停用以及认领原子替换失败，共计 0 次 TCP 连接、0 次 DATA、0 条认领。原草稿仍可打开。 |
| 端点明确拒绝与部分接受 | DATA 最终 554 记为明确未投递并保留原草稿，全部 RCPT 550 时没有 DATA。部分 RCPT 550、DATA 250 的测试分别记下已接受和拒收地址。 |
| 重启、ZIP 与去重 | 丢失最终 DATA 回包后保留 `unknown`；模拟 SMTP 成功但回执原子替换失败后，重开从原认领得到 `unknown`。重复提交沿用相同操作号，SMTP 计数保持 5 次连接、4 次 DATA。正常接受样例还恢复到重新生成 Vault ID 的新目录，同一已认领版本仍只产生原先 1 次 DATA。 |

Mail 与 Vault 联合测试 18 个文件通过，142 项通过、1 项跳过。全仓 lint、格式、Git 差异和 Nodemailer 装配类型探针通过。Mail 类型检查只报告父任务已记录的 `packages/contracts/src/kinds/task.ts:71` `TS2379`。 [联合测试](./evidence-task02/mail-vault-tests.log) · [全仓 lint](./evidence-task02/root-lint.log) · [格式与差异](./evidence-task02/diff-lint-format.log) · [装配类型](./evidence-task02/assembly-types.log) · [Mail 类型](./evidence-task02/mail-types.log) · [基线](../t12p/evidence-task07/baseline-types.log)

## Lead 接续

1. 在拥有生产包依赖与 Engine 装配的层固定 `nodemailer@10.6.0`，许可证 `MIT-0`，Node 要求 `>=20.0.0`。此版本的运行时 `dependencies`、`optionalDependencies` 和 `peerDependencies` 均为空，新增依赖闭包只有 Nodemailer 本身，自带 ESM/CJS 类型声明。生产使用 `nodemailer/lib/smtp-connection` 与 `nodemailer/lib/mail-composer`，由 Lead 更新该层 manifest、根锁及第三方 NOTICE，验证安装包包含两个导出。 [实际包元数据与锁校验值](./evidence-task02/nodemailer-package.log)
2. Engine 将两个默认导出传给 `createMailSmtpTransport({ SMTPConnection, MailComposer })`，并把返回值作为 Mail `apply` 的第四个参数。当前缺少装配时，新投递会在写认领前返回 `smtp-transport-unavailable`。工作台接线需校验调用者对当前 Vault 与草稿的权限，逐收件人查询留在受权范围。整库和 Mail 子集导出沿用 S1b.2 的 `withSnapshot` 协调边界。
3. 生产提供商和 TLS 服务由后续验证交付。本次回环执行覆盖已配置的明文模式，适配器对隐式 TLS 与 STARTTLS 使用独立显式配置和证书校验。Nodemailer 在无最后确认且未返回逐地址证据时，受影响地址保持 `unknown`，避免把连接中断当作拒绝或成功。

验证子窗格 `t16n`、`t16p`、`t16r`、`t16t`、`t16v` 已回收。`t162` 由 Lead 验收后回收。

## Lead 验收

