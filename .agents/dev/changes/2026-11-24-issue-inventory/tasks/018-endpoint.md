# Endpoint · 约定端点发现、重启与冲突的语义

[#14 原单](https://github.com/NAMEWTA/huhu/issues/14) · [本次完整快照](../../../../../temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/14.md) · U5/C5 · [批次规格](../spec.md)

## 交付

从现有 HTTP listener、CLI 发现与 Gateway 出发，定义同 Vault 稳定地址、服务开关、端口占用与令牌绑定。

现有入口为 [packages/kernel/src/server/http-app.ts](../../../../../packages/kernel/src/server/http-app.ts)。

## 前置产物

可从现有代码与原单开始。

## 验收

- [ ] 普通 CLI 与无 huhu PATH 的客户端均能据配置说明发现方式和失败结果；区分暂未开启、冲突和授权过期。

[本票验收记录](../evidences/018-endpoint.md)
