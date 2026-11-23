# S1a.3 在账号栏切换邮箱并修复认证

所属交付 S1a。本项承接 [Issue M-01、§3.2、§5.3](../source.md)，行为规则见[添加与维护账号](../spec.md#accounts)，设计见[数据与提交顺序](../design.md#storage)。

## 交付与依赖

Mail 拥有账号栏、提供商分组、未读与故障状态，替换认证按当前 revision 切换本机绑定。

**前置产物**　[S1a.1](S1a.1-account-discovery.md)。

**代码入口**　[packages/workbench/src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts)、[packages/workbench/src/engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)、[one-mail/src/components/account/account-form-types.ts](https://github.com/zhihui-hu/one-mail/tree/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/account/account-form-types.ts)。拟在 `plugins/mail` 的账号与收件流程落地。

## 原型与确认范围

[Mail 原型](../prototype/index.html)的待确认场景为「全部账号 → 分组折叠/窄窗返回 → 故障账号修复」。此项界面实施前，在记录中核对该场景对应的用户确认、版本及范围。尚未演示的状态须另列，模拟操作仅作体验依据。 [版本与用户确认范围](../prototype-review.md)

定位到[邮件演示区域](../prototype/index.html#main)，核对账号栏与窄屏返回，在当前账号测试修复。

## 验收

- [ ] 用两个合成邮箱切换、键盘定位并修复其中之一，确认省略认证保持原绑定，账号级操作仅出现在适用位置。拖动账号/联系人与阅读分栏，检查最小宽度与窄窗返回后原选择、键盘焦点仍可达。
- [ ] 模拟替换认证失败及过期 revision，原绑定仍可读取配置，页面保留修复入口。切换账号时不显示前一个账号的异步结果。

使用合成邮箱、消息、附件和模拟交付结果，记录测试 Vault、输入、操作前后结果及实际调用次数。实际结果回填本任务。

t17c 补验两个账号切换、分组折叠、窄窗逐层返回、认证修复和名称变更。版本冲突、落盘失败、途中取消及迟到响应均有隔离验证。 [实际证据](../evidence/S1a.3-account-repair.md)
