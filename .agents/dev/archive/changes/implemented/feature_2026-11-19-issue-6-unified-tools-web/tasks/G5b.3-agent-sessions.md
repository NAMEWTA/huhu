# G5b.3 按指定 Space 观察与恢复 Agent 会话

上级交付 **G5b 任务、自动化与 Agent**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue A03、D03](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　Agent CLI 拥有 Space、会话、历史、输入仲裁与恢复；读取无启动副作用。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[G3.2 两种 MCP 传输读取同一份目录与变更](G3.2-mcp-discovery.md)；[#4 指定 Space、会话代次和控制仲裁](../../feature_2026-11-19-issue-4-agent-cli/spec.md)

**已有代码入口**　[plugins/agent-cli/src/engine/index.ts](../../../../../../../plugins/agent-cli/src/engine/index.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 用指定测试 Space 创建或选择会话，从外部按其 ID 查询输出及历史；支持恢复时读取新代次和同一记录。
2. 停止 Core 后仅查询状态，进程数不增加；不支持历史恢复的 provider 返回能力原因。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「最近活动」对照「浏览器工作台／会话状态」。Agent 运行语义以 #4 交付的会话合同验收。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。
