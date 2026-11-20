# G5b.1 经单一外部入口完成任务问答

上级交付 **G5b 任务、自动化与 Agent**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue D01](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　Tasks 维护 Human/Agent 的新增、编辑、复制、状态、评论和所属 run；#5 产生可信回执。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[G3.2 两种 MCP 传输读取同一份目录与变更](G3.2-mcp-discovery.md)；[G3.3 响应丢失后查询同一操作的结果](G3.3-intent-outcomes.md)；[#5 的入队、问答、可信送达与取消合同](../../2026-11-19-issue-5-task-automation/spec.md)

**已有代码入口**　[plugins/tasks/src/engine/index.ts](../../../../../plugins/tasks/src/engine/index.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 在指定测试 Space 内用 MCP 独立走创建、编辑、派遣、查询、回答、查看结果，再以 CLI 独立完成另一任务。
2. 断流后按原 run 接续，重复回答/取消有确定结果，不能伪造运行回执。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「工具目录、浏览器工作台」对照「浏览器工作台／任务结果」。浏览器任务列表仅用于比对同步结果。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。

## Windows 组合证据

独立测试 Vault 使用实际 Herdr Core 0.1.19 和受控的合成 Codex App Server。MCP 创建任务后由 CLI 派遣和回答原生请求，CLI 在重启后读回原结果。第二个任务由 CLI 创建，经 MCP 派遣、回答普通问题和读回结果。工作台查询与 Core 均返回原会话 ID，三轮复用该会话，原生和普通回答各产生一次输入，最终确认四份持久回执。模拟原生回答确认丢失时保持待核实，重交及 Engine 重启后只核对原输入。独立 HTTP 用例确认 Agent 创建与派遣分别授权，外部调用不能替换工作区、越过可派时间或直接调用受信的 Agent 派遣。真实发布包、实际外部提供方和桌面点击定位仍需组合验收。 [生产协议用例](../../../../../plugins/agent-cli/test/native-receipts.live.test.ts) · [授权用例](../../../../../plugins/tasks/test/persistence-http.test.ts)
