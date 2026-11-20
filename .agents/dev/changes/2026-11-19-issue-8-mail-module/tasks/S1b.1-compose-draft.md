# S1b.1 离线写一封富文本并继续编辑

所属交付 S1b。本项承接 [Issue M-06、M-07、§7](../source.md)，行为规则见[工作台操作](../spec.md#workspace)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 持有草稿 ID 与 revision。可换可发账号、录入 To/Cc/Bcc、主题、富文本和链接，关闭含内容的浮层先持久保存。

**前置产物**　[S1a.1](S1a.1-account-discovery.md)。

**代码入口**　[packages/workbench/src/contributions.ts](../../../../../packages/workbench/src/contributions.ts)、[one-mail/src/components/mail/mail-composer/index.tsx](../../../../../temp/sources/one-mail/src/components/mail/mail-composer/index.tsx)。拟在 `plugins/mail` 的草稿与发件箱流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「写信 → 扩大/还原 → 关闭 → 草稿重开」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#composer)，核对写信浮层，演示控制中的「草稿保存失败」「模拟重启」。

## 验收

- [x] Engine 验收。用有重复收件人的合成数据离线保存，关闭并重开 Windows Engine，同一草稿的收件人、正文、链接和发件账号仍正确。
- [ ] 只读、落盘失败或低版本提交时显示原因，保留编辑内容；取消丢弃可继续写，明确丢弃后才退出。

Windows Engine 的实际工作台调用验证了 `mail.drafts.list/get/save/discard`。调用者在开始编辑时生成并保留同一 UUID v4。首次保存使用 `expectedRevision: null`，后续保存和明确丢弃使用最近一次返回的修订。邮箱地址按 To、Cc、Bcc 顺序以去空白、忽略大小写的邮箱地址去重。主题和 Tiptap/ProseMirror JSON 原样存储，含链接属性。草稿可以在离线时保留或切换本地配置可发的账号，也可在尚未选择发件账号时保存。

合成账号和草稿的回环传输连接数为 0。Windows 文件原子替换故障保留了原字节和修订，同一修订并发保存仅一条成功，过期调用收到 `VERSION_CONFLICT`。只读 Engine 可重开草稿，写入与丢弃返回 `READ_ONLY_VAULT`。新格式 ZIP 保留两个账号引用及草稿内容，恢复后的账号要求重新配置认证。明确丢弃后过期请求不能恢复旧内容。浮层上的失败提示、取消丢弃和退出仍待原型确认和界面实施。 [Windows Engine 合同测试](../../../../../plugins/mail/test/drafts-engine.test.ts)
