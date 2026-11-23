# G5c.3 分开授权摘要读取与显式查看

上级交付 **G5c 独立模块消费方**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue D08、D10](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　Safe 拥有条目、多账号、标签、锁定、显式查看；#6 描述风险与返回边界。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[G3.2 两种 MCP 传输读取同一份目录与变更](G3.2-mcp-discovery.md)；[#9 的新格式和模块独立认证合同；按本片实际消费的存储或 Safe 业务部分接入](../../../archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/spec.md)

**已有代码入口**　[plugins/safe/src/engine/index.ts](../../../../../plugins/safe/src/engine/index.ts)、[packages/kernel/src/dispatcher.ts](../../../../../packages/kernel/src/dispatcher.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 添加有两个账户的虚构条目并设置标签，普通列表和搜索均只含摘要；解锁并显式开放查看后，专门动作才可返回所选测试值。
2. 锁定、撤销显式查看或换身份后复用旧请求均被拒；审计、普通输出和幂等记录无秘密。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「工具目录」对照「工具目录／敏感查看与普通摘要」。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。
