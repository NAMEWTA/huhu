# G5c.2 按真实可用性发现 Mail 同步操作

上级交付 **G5c 独立模块消费方**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue A01、A05](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　Mail 提供账号、消息、同步状态和业务错误；#6 仅消费描述及注册状态。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[#8 邮件账号与同步状态合同](../../2026-11-19-issue-8-mail-module/spec.md)

**已有代码入口**　[packages/kernel/src/capabilities/define.ts](../../../../../packages/kernel/src/capabilities/define.ts)、[packages/kernel/src/dispatcher.ts](../../../../../packages/kernel/src/dispatcher.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 登记测试账号同步动作，分别切换策略和插件，公共接口与桌面管理能解释可用性。
2. 模拟同步失败、缺少账户或插件停用，返回实际原因，不产生成功通知或伪造消息。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「工具目录」对照「工具目录／Mail 工具详情」。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。
