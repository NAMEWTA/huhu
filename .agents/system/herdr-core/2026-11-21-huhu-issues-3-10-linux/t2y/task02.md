# task02.md #6/#7 Q6-3 按已保存主机的 SSH 外部授权，并续开 SSH 动作

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t2y`。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report02.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-ssh`。Lead 已把你的 task01 候选 `d89c5e04` 快进到该分支（见 report01 末尾 Lead 验收）；本任务候选父为 `d89c5e04`。

## Lead 授权与范围

Q6-3 已定（`decisions-2026-11-21.md` 第 13 行）：外部 SSH 授权在 #6 同一判定中按已保存主机选择，保存稳定资源 ID，提供对应的选择与撤销。Lead 授权你作为本轮**工具策略资源选择**的唯一写入者：

- 共享层：`packages/contracts/src/capability.ts` 的工具策略文件与快照（在 `formatVersion: 1` 内新增可选的资源选择字段，例如 `resources: { "ssh.hosts": string[] }`，缺省为空集＝无授权；旧文件照常读取）、`packages/kernel/src/exposure.ts` 的保存与原子更新、`packages/kernel/src/capabilities/system.ts` 中 `gateway.get` / `gateway.policy.preview` / `gateway.policy.update` 的资源选择读写（策略修改仍仅工作台，2026-11-21 定案），以及让领域 handler 在调用时取得**当前**资源授权的最小接口（例如 `CapabilityContext` 增加只读查询，或 Dispatcher deps 注入），撤销后旧会话、流与操作回读立即受约束。
- 工作台：`packages/workbench/src/` 中 Gateway/工具授权页增加“允许外部工具访问的 SSH 主机”选择与撤销（默认不选）。先按 AGENTS.md 读取并执行 zh-modern-web-guidance 的 search 与 retrieve；复用现有列表/勾选组件；桌面经 `window.huhuHost`，Web 按 Baseline Widely available；两端验证。
- Engine 装配 `apps/engine/src/boot.ts` 最少行（单列）。
- SSH：`plugins/ssh/**`。在此基础上续开 task01 报告「逐 ID 接续清单」中的动作：每个动作按可信 `ctx.subject`、当前主机授权、主机/路由修订与原领域对象核对；从主机目录与列表（脱敏投影，不回显凭据状态）起，再到主机修订、连接与信任、监控、转发、文件来源与传输、终端；旧 `ssh.sftp.upload/download` 不得接受 Engine 本机任意路径，`ssh.disconnect` 只能作用于授权主机。现有 10 个公共入口接入主机授权并补双入口矩阵。
- 若一轮上下文无法覆盖全部 81 项，按上述顺序完成并提交一批，报告逐 ID 写清已开放与剩余，Lead 续派；共享层与 UI 必须在本轮完成。

## 验收

- 资源选择：默认空集时外部调用拒绝（含已开放工具）；选择主机 A 后只能访问 A；撤销 A 后原连接、流、作业输出与操作回读被拒；策略修订递增且并发更新冲突；旧策略文件（无资源字段）正常读取；工作台桌面与 Web 均可选择与撤销（相关 Playwright spec，xvfb）。
- SSH 开放项按 t19「双入口验收矩阵」CLI 与 HTTP MCP 各一遍（含 C05 恢复）；回环 SSH 夹具，不连真实主机、不用真实凭据。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、涉及的 vitest 文件；按 AGENTS.md「测试与内存约束」不跑全量。
- 候选提交（临时索引，父 `d89c5e04`），证据追加到 `G-ssh-exposure-linux.md` 并新增 `G-resource-grants-linux.md`，报告 `report02.md`，格式同前，发布后打印路径并停下。
