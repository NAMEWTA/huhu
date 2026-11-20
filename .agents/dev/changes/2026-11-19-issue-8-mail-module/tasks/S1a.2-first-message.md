# S1a.2 从所选邮箱读到首封 IMAP 邮件

所属交付 S1a。本项承接 [Issue §3.2、§6.1、§6.3、M-01](../source.md)，行为规则见[网络与数据契约](../spec.md#durability)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 为每封信建立 localMessageId 和账号、目录、UIDVALIDITY、UID 定位；给工作台首次收件和读取的最小链路，收件专用状态可辨。

**前置产物**　[S1a.1](S1a.1-account-discovery.md)。

**代码入口**　[apps/engine/src/boot.ts](../../../../../apps/engine/src/boot.ts)、[one-mail/src-tauri/src/mail/sync/imap.rs](../../../../../temp/sources/one-mail/src-tauri/src/mail/sync/imap.rs)。拟在 `plugins/mail` 的账号与收件流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「账号 → 首次刷新 → 邮件摘要 → 正文/重试」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#fault)，核对阅读区及「正文载入失败」。

## 验收

- [ ] 给两个模拟账号相同 UID、不同正文，分别打开并重启回读，内容和账号一致；记录当前实际传输。
- [ ] 替换一方 UIDVALIDITY 后用旧定位重试，应提示重新同步该目录；另一账号和已有草稿完好。只读 Vault 不执行远端标记或持久写入。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。

## Windows Engine 数据验证

两个合成回环 IMAP 账号分别使用真实 Windows Credential Manager。Engine 对两个 INBOX 发出 `EXAMINE` 和 `UID FETCH ... BODY.PEEK[]`，未发送 `SELECT` 或 `STORE`。两个账号均使用 UID 42、UIDVALIDITY 12，得到不同本地 ID 与各自的原文字节。重开回读和只读 Vault 回读沿用本机缓存，未增加远端 FETCH。只读刷新返回 `READ_ONLY_VAULT`。

把其中一个合成目录切到 UIDVALIDITY 13 后刷新，结果标记目录换代，旧 ID 返回 `needs-refresh`。另一账号保留原 ID 和字节，远端调用计数不变。Vault ZIP 不收集 `.huhu/cache/mail`。实际 Engine 验证同账号、目录、UIDVALIDITY 和 UID，当前切片保存所选目录的最新摘要和 RFC822 原文。真实阅读页、MIME 正文、联系人聚合与多页同步继续分片。 [ImapFlow Fetch 文档](https://imapflow.com/docs/guides/fetching-messages/) · [实际 Windows 用例](../../../../../plugins/mail/test/messages-engine.test.ts)

Windows 三文件 24 项通过，原工作区日志 `temp/issue-baseline/core-finished/t14j.log`。

t17c 在已保存账号上补验同步、选择首封和 MIME 阅读。目录换代回执也经 Engine 请求验证。 [回环证据](../evidence/S1-S2-mail-reader.md)
