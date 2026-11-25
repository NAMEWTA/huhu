# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1v2
- task — task05.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task05.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report05.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/107-p6.md、109-p7.md
- 执行结果 — blocked（P6 已交付本机接入与回归，仍缺 Task 委派实现和异机/真实交互证据；P7 已提交候选）

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1` 从 `23b4d4aa` 接续，两个独立提交已保存，工作区干净。已回收本次验证终端。

### P6（#12）

- 提交 `9246a4ca8edfba47f478a886d8f87a325f7cdc1e`。新增 `apps/cli/test/mcp-aggregate.test.ts` 与 `docs/mcp.md`。说明如何复用 Huhu 的现有「使用启动环境…」提供受保护令牌、通过 Codex 原生配置管理单个 `huhu` 条目，以及从异机 CI 经固定回环端口与授权隧道接入。
- 本机标准 SDK 通过单条 Streamable HTTP 配置同时发现和调用 `vault_info`、外部 echo。重启同一 Vault 后沿用原 URL 与令牌，撤销 A 后，A 的旧会话及新握手返回 401，B 仍可调用。夹具独立核对三次实际调用及参数，撤权请求未到达上游，入站 bearer 也未传给上游。
- 官方 Codex 0.170.0 在隔离配置目录实际执行 `mcp add/get/remove/list`，确认只写入当前 URL 与 bearer 环境变量名，移除 `huhu` 后原有另一条配置仍存在。[Codex 配置日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p6-codex-config.log)
- 持锁运行 `volta run --node 24.22.1 pnpm exec vitest run apps/cli/test/mcp-aggregate.test.ts`，标准客户端用例 1/1 通过，真实 App Server 用例 1 项按环境变量跳过。`pnpm --filter @huhu/cli run typecheck` 同锁通过。[SDK 测试](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p6-sdk.log) · [CLI 类型检查](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p6-cli-types.log)
- Lead 可在有会话名额时用 `HUHU_P6_CODEX_BIN` 指向官方 Codex 0.170.0，持锁执行同一文件的「P6 pinned Codex App Server reads one native entry and calls both kinds of tool」。此用例覆盖 Codex 原生加载与实际协议调用。J16 还需要真实交互会话、一次受控 Task 的真实模型运行，以及独立异机 CI 的部署通道与调用效果证据。

### P7（#12）

- 提交 `afae60ea1da82a84cb655c422ef5f3e4bc8327d7`。更新 `packages/kernel/src/mcp-sources/runtime.ts`、来源测试及夹具。在锁定 SDK 返回不支持的协议版本，或上游 SDK 明确要求缺失的客户端 sampling、elicitation 或 roots 时，来源状态返回 `incompatible` 和具体诊断。新增用例验证 2026-only 版本、反向 sampling 要求、启用后目录隔离及下游不宣告未支持的能力。[修复前失败](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-compatibility-before.log) · [修复后来源测试](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-mcp-sources-final.log)
- 核对现行 `/mcp`、Dispatcher、Gateway 和普通 CLI 入口。旧 `/api/v1/mcp` 只在旧路径拒绝测试出现，旧 CLI 服务命令由既有 CLI 回归验证。新增 `mcp-aggregation.spec.ts` 的错误诊断旅程并扩展四类目录的列举和实际调用。更新 `docs/mcp.md` 的兼容矩阵、故障排查，`docs/upstream/ledger.md` 的生产落点、测试和固定来源，以及 `scripts/gen-notices.mjs` 和生成的 `THIRD_PARTY_NOTICES.md`。生成器退出 0，SDK MIT 文本与已安装包逐字一致，本地文档链接均可定位。[生成日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-notices.log)
- 持锁逐文件运行 `volta run --node 24.22.1 pnpm exec vitest run <文件>`，`packages/kernel/test/mcp-sources.test.ts` 15/15，`packages/kernel/test/mcp-routing.test.ts` 14/14，`packages/kernel/test/mcp-recovery.test.ts` 3/3，`apps/engine/test/endpoint-contract.test.ts` 4/4。`pnpm --filter @huhu/kernel run typecheck` 同锁通过。[路由](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-mcp-routing.log) · [恢复](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-mcp-recovery.log) · [端点](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-engine-endpoint.log) · [Kernel 类型检查](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1v2/task05/p7-kernel-types-final.log)
- Lead 在 `tests/e2e/workflows/mcp-aggregation.spec.ts` 运行「P7 来源详情显示上游所需的未支持客户端能力」「P3 正式来源页面添加服务、预览发布并访问真实资源和提示」，并复用同 spec 的 P2 三传输与 P4 独立 Web / OAuth 回归。P6 已有客户端配置 UI 回读用例见 `tests/e2e/ssh/settings.spec.ts` 的「SSH settings reflect the shared gateway policy and provide redacted client samples」。

## 阻碍与接续

- 受控 Task 生产 adapter 的目标矩阵仍返回 `no_task_tool_scope`，helper 仍使用空 `mcp_servers`。P6 本次交付到标准客户端与交互配置。要完成 Task 路径，需要实现绑定 Vault、Task/Run、当前执行及工具来源的专用授权，并在发现、实际发送与 revoke/停止边界复核。本次未启用临时通用令牌穿透。
- 异机 CI 没有可用的授权宿主和隧道。本机 SDK 测量只记录为同机协议证据。P7 的最终签收仍依赖 P6 和 J16。
- 未运行 — Codex App Server 实际调用用例、真实交互式模型、受控 Task 的授权调用、异机 CI、Playwright E2E、构建、打包、全仓检查及视觉取证。

## Lead 验收

- Lead 2026-11-25：P7 通过；P6 App Server 用例夹具失败，并入 task06。
