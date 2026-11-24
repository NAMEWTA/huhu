# Endpoint · 约定端点发现、重启与冲突的语义

状态：通过（合同样例）。

[实施票据](../tasks/018-endpoint.md)

- 版本：提交 `c2594be9`，main `c288103c`。
- 合同：`apps/engine/test/endpoint-contract.test.ts`。普通 CLI 读 Vault 专属 descriptor（停机移除、重启按原路径重新发现、拒绝另一根绑定）；无 huhu PATH 的客户端直连 HTTP initialize → tools/list → vault_info，重启后同 URL、同持久授权新建会话。区分：开关关闭 404（CLI 仍可用）、过期/撤销/无效令牌 401、CLI/桌面令牌访问 MCP 403、固定端口占用保留 `EADDRINUSE` 且原地址不变。
- 单测：2/2；engine 类型检查 0 错误。持久端口配置等属 UX13/U5。
