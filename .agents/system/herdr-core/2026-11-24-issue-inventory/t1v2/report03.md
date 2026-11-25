# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1v2
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report03.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/106-l11.md
- 执行结果 — done（第 1 次返工已交回，Lead 负责 E2E 验收）

## 成果与运行指针

- L11（#11） — 在 `inv/w1` 基线 `65b016df` 上提交 `ed450f3a18a443f7b701ff574e74312c8cabef29`。工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，检出干净。提交只修改 [mcp-aggregation.spec.ts](../../../../../.agents/dev/worktree/inv-w1/tests/e2e/workflows/mcp-aggregation.spec.ts#L196)。
- 根因 — 该用例直接调用 `mcp.sources.create`，Streamable HTTP 配置缺少必填的 `headers`、`authentication`。以原请求调用实际 Engine，得到 `INVALID_INPUT`，错误路径精确指向 `configuration.headers` 和 `configuration.authentication`。原批次日志保留了测试台的失败断言，派发单中的失败附件在排查时已不在共享 `test-results/`。复现输出在下方 Engine 日志中。[Lead 原批次日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-l10-l11.log)
- 修复 — 按现有远端来源配置，在 L11 夹具传入 `headers: {}` 与 `authentication: { kind: "none" }`。保留原 `ledger_fixture` 命名空间与回环 Streamable HTTP 服务。
- 定向验证 — 持 `verify.lock` 运行 `volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/tool-access.test.ts`，5/5 通过，含执行后移除的 1 项临时复现。复现先用原请求得到上述拒绝，再用修正后请求完成来源创建、检查、选择发布、启用。在同一实际 HTTP MCP 会话中验证外部工具与账本共存、账本默认关闭、开放后的读取结果与桌面及 CLI 身份一致、账本撤权和停用后缓存名称被拒，以及外部 echo 仍可调用。[Engine 日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task03/l11-engine-probe.log) · [临时复现补丁](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task03/l11-engine-probe.patch)
- 类型检查 — 持同一锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/engine run typecheck`，退出码 0。提交前执行 `git diff --cached --check`，通过。核对并回收本任务的验证终端。[类型检查日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task03/l11-engine-types.log)

## 阻碍与接续

- 本次返工无实施阻碍。请 Lead 在 Linux 运行 `tests/e2e/workflows/mcp-aggregation.spec.ts` 的「L11 同一 MCP 目录保留外部工具，账本按授权开放、撤权与停用」。修正后预期来源检查为 `ready`，用例继续执行整条聚合验收。
- 未运行 — Playwright E2E、该用例中的实际 CLI 进程、构建、打包、全仓检查及视觉取证。Engine 测试中的 CLI 路径使用原 CLI 身份调用实机 Engine HTTP 接口。

## Lead 验收

- Lead 2026-11-25：合入 main 369cf416，L11 MCP 用例通过。
