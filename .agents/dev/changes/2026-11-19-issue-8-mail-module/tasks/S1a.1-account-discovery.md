# S1a.1 用预设发现文件夹并保存邮箱

所属交付 S1a。本项承接 [Issue §3.1–3.2、M-01](../source.md)，行为规则见[添加与维护账号](../spec.md#accounts)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 管理账号 ID、配置 revision、私有认证、目录发现；接入已有插件注册。保存成功回到账号栏，保留用户选择。

**前置产物**　[S0.2](S0.2-transport-choice.md)、[#9](../../../archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/plan.md) [P0.2](../../../archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P0.2-credential-replacement.md) 的模块保存与替换合同。

**代码入口**　[apps/engine/src/boot.ts](../../../../../apps/engine/src/boot.ts)、[one-mail/src/components/account/account-form-types.ts](../../../../../temp/sources/one-mail/src/components/account/account-form-types.ts)。拟在 `plugins/mail` 的账号与收件流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「添加邮箱 → 提供商/自定义 → 测试连接 → 目录选择 → 保存/失败」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#fault)，核对账号添加/发现，演示控制可选「连接超时」。

## 验收

- [ ] 逐个对照 18 个命名预设和自定义，含两个完美域名；模拟服务器返 INBOX、不可 SELECT 目录，保存后重开保留手改端口与 SMTP 开关。
- [ ] 发现期间改地址或认证再返回旧结果，旧目录失效；网络、证书或本机钥匙错误保留表单且不留下半个账号。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。
