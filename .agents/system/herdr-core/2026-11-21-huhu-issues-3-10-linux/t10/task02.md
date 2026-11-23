# task02.md CLI 自启动的无界面 Engine：模块凭据宿主与在途作业保活

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t10`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t10`。
- 当前任务 — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/report02.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-agent-linux`，HEAD 已快进到集成 `5021f54c`。
- 接续依据 — 独立审查 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/report01.md` 中 #7 H11.2 的第二项 P1（CLI 自启动）与 P2（空闲退出）。

## 目标与输入

审查在真实入口上复现了两个问题。它们不只影响 SSH：所有模块自有凭据（SSH、Git、Mail、Agent）在「没有桌面、由 CLI 自启动 Engine」时都受影响。

1. **P1 无界面 Engine 没有模块凭据宿主。** `apps/cli/src/connect.ts:47,54` 在没有现成 Engine 时自启动；打包启动器 `apps/desktop/resources/bin/huhu:17` 设置 Engine 入口；`HUHU_DESKTOP_USER_DATA` 只由 Desktop Supervisor（`apps/desktop/src/main/engine-supervisor.ts`）注入；`apps/engine/src/main.ts:74,92` 与 `boot.ts:152` 因此不创建 `moduleCredentialHost`。复现：在同一 Vault 用桌面配好 SSH 主机（托管密码），关闭桌面，用默认 CLI 自启动 → 主机摘要与作业受理成功，但认证取不到，作业以 `authentication-failed` 结束。要求：让 CLI/启动器启动的 Engine 与桌面使用同一个可信的本机应用数据位置（与 Electron `app.getPath("userData")` 对应的平台路径，按 Electron 的规则在各平台推导，或由启动器显式传入），从而拿到同一组模块凭据；不能经 HTTP/MCP/renderer 让调用者注入该路径，也不能放宽 `createModuleCredentialHost` 的路径检查。桌面已在运行时 CLI 应连接现有 Engine（保持现状）。
2. **P2 空闲退出会打断已受理的长操作。** `apps/engine/src/main.ts:127,132` 与 `boot.ts:579,586` 的空闲退出只看 HTTP/WS 活动和事件；`plugins/ssh/src/engine/public-jobs.ts:340` 的已受理 Exec 静默运行时不计入，CLI 默认空闲阈值 60 秒而作业上限 180 秒。要求：提供一个 Engine 级的「长操作保活」登记（受信插件在作业运行/核验期间持有，终态或取消完成后释放），空闲退出在有持有者时不触发；SSH Exec 作业接入它。显式关闭（shutdown）语义保持不变。

## 读写范围与产物

- 可写业务范围 — `apps/cli/src/**`、`apps/engine/src/{main,boot}.ts` 中与上述两项直接相关的部分、`apps/desktop/resources/bin/**`（启动器）、`apps/desktop/src/main/engine-supervisor.ts`（仅当需要统一路径来源时）、`plugins/ssh/src/engine/public-jobs.ts`（接入保活）、对应测试。本任务由 Lead 特准修改上述 Engine 装配点。
- 禁止改动 — 能力注册与静态目录、Vault 包收集器、公共契约（若保活登记需要进入 `HuhuApi`，在 `packages/kernel` 中只加最小接口并在报告单列）、根锁文件。不 push，不启动子 agent。
- 预期产物 — 候选提交、#9 或 #7 evidence 下的 `evidence/headless-engine-credentials-linux.md`、报告。

## 验收与验证

- 真实入口回归：桌面式 boot 配好托管密码主机后关闭，再用 CLI 默认自启动（不预先 boot 测试宿主），回环假 SSH 上完成认证与一次 Exec；同一流程覆盖保险箱锁定状态。
- 空闲阈值缩短（例如 1.5 秒）时，运行中的 Exec 不被空闲退出打断；作业终态后 Engine 按阈值正常退出。
- 路径来源不能被外部请求改变（测试或审阅说明）。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 通过；相关 vitest 文件计数写入报告。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须为 `t10	task02.md	active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交（父 `5021f54c`），在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
5. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写 `report02.md.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
