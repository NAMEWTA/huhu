# task01.md #10 W05 业务卡归属迁移与 W06-01 单一首页收口

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`；manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t30`；worker 内 `HC_TERMINAL_ID` 应为 `t30`。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t30/task01.md`；报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t30/report01.md`
- Lead 回告方式 — Lead 主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-w05-widgets`，HEAD `fc044713`（集成最新，已含 #6 全部已完成领域组与 home.notes.recent 外部开放）。
- 接续依据 — #10 盘点 `t9/report01.md` 的 #10 表；原型已确认（`6da1b2ec`），不要重新询问。

## 目标与输入

按 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/` 的 `spec.md`、`design.md`、`plan.md` 与 `tasks/W05-01-tasks-widget.md`、`W05-02-recent-notes.md`、`W05-03-capture-widget.md`、`W05-10-agent-entry.md`、`W06-01-home-cutover.md`，完成：

1. W05-01/02/03/10：把任务、最近笔记、待处理捕获、Agent 入口四张卡的定义与取数从 `widget:kernel:*`（`packages/workbench/src/home/HomeModule.tsx`、`packages/contracts/src/home.ts`）迁到各自业务插件的 Widget 贡献，沿用 SSH（`plugins/ssh/src/ui/HomeWidget.tsx`）、Git（`plugins/versioning/src/ui/HomeWidget.tsx`）、Automations（`plugins/automations/src/shared/home-widget.ts`）已有的可信贡献模式，不新建贡献机制。插件停用时卡不挂载、不查询；重新启用恢复；已存看板中的旧实例 ID 迁移不丢配置（备份格式按 W02-04/05 现有合同）。两张任务卡各自筛选、跨时区独立计数、行内完成；最近笔记卡失效路径与另一卡可用；捕获卡核对待处理数量、选择、停用与重新启用；Agent 入口按启用/授权呈现，无活动会话时不造状态。
2. W06-01：按单一首页要求收口旧入口（`apps/desktop/src/renderer/main.tsx` 的 today/activity 与 `HomeModule.tsx` 的独立 ActivityFeed），保留 #2 已交付行为与 #3 关窗/看板草稿离场联动（`FocusPauseOnClose`、看板草稿离场规则见 #10 design 与 #3 S1a）。
3. 复用优先：先查 Huhu 现有实现，再查 `temp/sources`。

## 读写范围与产物

- 可写业务范围 — `packages/workbench/src/home/**`、`packages/contracts/src/home.ts`（Widget 贡献合同的最小改动，报告单列）、`plugins/{tasks,notes,inbox,agent-cli}/src/ui/**` 与各自 `shared/` 中的 Widget 贡献、对应 manifest 的 contributes、`apps/desktop/src/renderer/main.tsx` 中首页入口、相关单测与 e2e（`tests/e2e/**`）、#10 证据目录。
- 涉及 HTML/CSS/客户端 TS：先按 AGENTS.md 读取并执行 `.agents/skills/zh-modern-web-guidance/SKILL.md` 的 search 与 retrieve；桌面经 `window.huhuHost`，Web 按 Baseline Widely available；共享前端两端验证。
- 禁止改动 — Engine 装配 `apps/engine/src/boot.ts`（需要时写清接线交 Lead；可在候选里改最少行并单列）、Kernel dispatcher/server/MCP、插件 engine 业务、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault。
- 预期产物 — 候选提交（临时索引方式，父 `fc044713`）、证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/verification/W05-W06-linux.md`、报告。

## 验收与验证

- 各任务文件的验收步骤；桌面 e2e 用 xvfb（`pnpm build` 后 `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 XDG_RUNTIME_DIR=$(mktemp -d /tmp/hc-xdg.XXXXXX) xvfb-run -a pnpm exec playwright test <相关 spec> --reporter=line`），只跑相关 spec；Web 入口按现有 Web e2e 方式验证。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、涉及的 vitest 文件。按 AGENTS.md「测试与内存约束」：不跑全量 vitest、不跑全量 e2e；根 `vitest.config.ts` 已限 `maxWorkers: 3`。
- 已知 Linux 基线 e2e 在 origin/main 上就失败的 14 项列于 `/home/wta/projects/huhu/temp/issue-baseline/linux-main-7811141b-e2e.failed.txt`，不要求修，但不得新增失败。

## worker 执行约定

1. 读 topic 和 manifest，核对地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交，在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
5. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
