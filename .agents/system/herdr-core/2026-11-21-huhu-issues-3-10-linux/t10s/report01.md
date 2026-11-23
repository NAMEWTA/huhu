# t10s 同包验收脚手架 P2/P3 返工

- Lead `t3p`，worker `t10s`，任务 `t10s/task01.md`
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，派工基线 `4ae7e7e4`
- 实现已交回 Lead，运行验收待执行

## 改动

- `tests/e2e/helpers/candidate-desktop.ts` 从同一 Vault 的 `engine.json` 取得 Engine PID 和回环端点，核对 Vault 目录绑定、随包 executable 和该进程实际继承的桌面 profile。端点证据与 renderer 的 preload 返回值相互核对。清理独立尝试各阶段，核对桌面和 Engine 退场及描述移除，再通过本 profile、Vault 和机器标识派生的 Core socket 核对随包进程路径，向同一 RPC 连接请求停止并要求 `stopped: true`。另核对已观测的 Core / holder PID 和夹具 socket 消失。清理未获确认时留下脱敏附件和私有 `/tmp/hc-d-*` profile。
- `tests/e2e/helpers/candidate-package.ts` 把 `protected-launch/helper.cjs` 纳入固定 AppImage 内的 SHA-256 清单。
- `tests/e2e/workflows/web-share.spec.ts` 通过原桌面 Engine 发布的状态核对独立 Web 监听端口，导航前核对邀请来源。初开和重开各有身份附件，断言同一 Vault 和新的 Engine 启动身份。外部链接恢复、浏览器关闭、桌面提示和两次桌面关闭独立清理。
- `tests/e2e/workflows/automation-linux-environment.spec.ts` 保留每条同包 CLI 调用前后的原桌面 Engine 证据，将 MCP 端点和实际 Core 绑定至本次桌面。临时 CLI 输入改用 stdin。规则输出实际领取值的 SHA-256，逐轮匹配合成值且排除另一轮，保留占位遮蔽、原意图重交和两次启动计数。检查 CLI stdout 与 stderr，核对 MCP 的 `PERMISSION_DENIED` 及本机批准撤销原因。令牌撤销、凭据清除和桌面关闭分别尝试。
- 清理异常按阶段写入附件。主体首错继续作为失败原因，主体成功时单独发生的清理异常也会判失败。两份 spec 关闭 trace、失败截图和 video，以避免保存合成邀请或凭据。原 helper 返回字段 `app/page/vault/env/resources/close` 继续可用。

包与提交的单 SHA 门槛保留，按 Lead 决定使用未来干净组合提交重打统一候选。脚本、生产代码和 Lead 的 `external-task-web.spec.ts` 由原负责人维护。本次未暂存或提交。

## 未运行的验证

未运行 E2E、单测、类型检查、lint、构建、安装、打包或 GUI，也未启动验证子代理。实际 Engine/Core/holder 退场、Web 重开、两轮规则和清理失败路径均待 Lead 在固定候选上串行核对。
