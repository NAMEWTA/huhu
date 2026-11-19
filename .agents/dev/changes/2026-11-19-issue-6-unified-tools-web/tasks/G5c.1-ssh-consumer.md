# G5c.1 从公共目录看到 SSH 资源与等待项

上级交付 **G5c 独立模块消费方**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue D04、D05、D06、D07、D10](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　#6 只接工具选择与流授权；#7 拥有 SSH handler、认证、文件、作业和等待项。接口可用合成快照先行对接。实施验收使用已授权测试主机，从公共入口和 SSH 模块分别读回同一实际资源。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[G3.2 两种 MCP 传输读取同一份目录与变更](G3.2-mcp-discovery.md)；[#7 的主机、信任待答及作业/文件对象；取 H2、H3、H6、H11 的领域合同，公共适配仍归 #6](../../2026-11-19-issue-7-ssh-module/spec.md)

**已有代码入口**　[plugins/ssh/src/engine/index.ts](../../../../../plugins/ssh/src/engine/index.ts)、[packages/kernel/src/dispatcher.ts](../../../../../packages/kernel/src/dispatcher.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 以已授权样例主体核对主机新增、认证更新、等待项、文件与会话标识的跨入口投影；Safe 三种状态不改变 SSH 自有认证。
2. 撤销访问或提交另一对象 ID，重新判定并拒绝；只读目录不连接。按主机缩小范围的可选 UI 仅在 Q6-3 决定后接入。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「工具目录」对照「浏览器工作台／SSH 快照」。连接待答和流的模拟场景在 #7。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。
