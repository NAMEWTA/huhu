# G5c.4 卡片只读取已允许的业务数据

上级交付 **G5c 独立模块消费方**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue A01、A05](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　#10 拥有布局与卡片；#6 暴露来源判定，布局不另生业务状态。

**前置产物**　[G2.3 的可用性判定](G2.3-effective-access.md)和 [#10 的布局、实例与卡片来源合同](../../2026-11-19-issue-10-widget-dashboard/spec.md)。桌面和窄屏共用布局。带草稿切模块或关窗时，由 #10 提供保存、放弃或继续编辑；保存失败留在原地并保留草稿。

**已有代码入口**　[packages/kernel/src/capabilities/define.ts](../../../../../packages/kernel/src/capabilities/define.ts)、[apps/engine/src/boot.ts](../../../../../apps/engine/src/boot.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 挂载一个消费现有插件的卡片并刷新，核对授权来源 ID；移除卡片后源数据可读。
2. 停用来源时卡片说明实际原因，挂载/刷新不触发连接，不展示伪数据。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「工具目录」对照「工具目录／卡片来源不可用」。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。
