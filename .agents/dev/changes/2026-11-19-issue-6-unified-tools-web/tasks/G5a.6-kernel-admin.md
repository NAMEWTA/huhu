# G5a.6 管理 Vault、插件和服务的公开动作

上级交付 **G5a 通用业务**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue A01、A03、A06](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　Kernel 管理设置、通知、插件及服务，对管理工具自身单列授权。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[G3.3 响应丢失后查询同一操作的结果](G3.3-intent-outcomes.md)

**已有代码入口**　[packages/kernel/src/capabilities/system.ts](../../../../../packages/kernel/src/capabilities/system.ts)、[apps/engine/src/boot.ts](../../../../../apps/engine/src/boot.ts)、[packages/kernel/src/capabilities/external-plugins.ts](../../../../../packages/kernel/src/capabilities/external-plugins.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 逐项对照管理矩阵，用测试插件启停和设置读改验证返回状态；诊断读取时启动次数不变。
2. 只开放查询时外部尝试变更被拒，仍可用桌面管理入口恢复设置；真实 service 状态与偏好各自保留。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「工具目录」对照「工具目录／管理项与服务状态」。待用户确认该场景的入口、状态反馈以及上述失败后能采取的动作。落地界面前按[原型确认记录](../prototype-review.md)核对具体版本和覆盖范围；演示未覆盖的细节单列待走查。
