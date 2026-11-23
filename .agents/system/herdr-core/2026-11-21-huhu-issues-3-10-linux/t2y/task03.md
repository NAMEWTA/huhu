# task03.md #6/#7 SSH 剩余 79 个动作的逐项开放

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t2y`（执行终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task03.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report03.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-ssh`，HEAD `10ebb272`（你的 task02 候选，已由 Lead 验收合入集成 `e0cfa33c`）。候选父为 `10ebb272`。

## 目标

按你 report02「阻碍与接续」与 79 项表，在 Q6-3 实时主机授权之上逐项开放：主机修订与配置管理、连接、监控、转发、文件来源与传输、终端。每项按可信 `ctx.subject`、当前主机授权（目标与跳板）、主机/路由修订与原领域对象核对；只读不拨号、不回显凭据；旧 SFTP 本机路径与全局 hostId 断线保持关闭或改为受限合同。t19 无永久关闭裁决，若某项确需保持关闭写明理由。

## 职责边界（AGENTS.md「实施者职责边界」）

- 只写业务代码与对应单测、E2E spec；只跑改动涉及的单个 vitest 文件（`pnpm exec vitest run <路径>`）。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/knip/lint、启动 Playwright/Electron、截图。E2E 只写不跑，报告列出 spec 文件与用例名。
- 报告单列“未运行的验证”。

## 产物

候选提交（临时索引，父 `10ebb272`），证据追加 `G-ssh-exposure-linux.md`，报告 `report03.md`（逐 ID 表），格式同前，发布后打印路径并停下。一轮上下文不足时按上述顺序提交一批，报告写清剩余。
