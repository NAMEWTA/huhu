# task01.md 实施批次（t1zg）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1zg
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1zg
- 当前任务 — task01.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zg/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zg/report01.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — 候选 4fb0e8de 第二轮全量：E2E 500 通过 2 失败（H03 斜杠命令复跑 2/2 通过，判为偶发）；日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final2/e2e.log、/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final2/e2e-rerun2.log；/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/report02.md 中你方前任对该用例的改动

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/111-rc.md

每张票先读票据，再读票头引用的原 Issue 快照对应编号的完整小节（快照目录 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/，例如 #13 → 13.md，按 F/W/UX/AU/TW 等编号搜索），然后读现有代码入口。票据中的验收条目是完成判据；快照正文给出行为细节、根因分析和边界。按根 AGENTS.md 的复用优先顺序，先查 Huhu 现有实现与 /home/wta/projects/huhu/temp/sources。涉及 HTML/CSS/客户端 TS 时，先执行 .agents/skills/zh-modern-web-guidance/SKILL.md 的 search 与 retrieve。

## 读写范围与产物

- 可读范围 — 整个仓库、快照目录、temp/sources
- 可写业务范围 — 本检出中实现这些票所需的源代码、单测和 Playwright spec（tests/ 下）
- 禁止改动 — .agents/dev/changes/**（票据与验收报告归 Lead）、根 AGENTS.md、依赖锁文件（需新依赖时先在回执中说明，不要自行安装）、其他 worker 的检出
- 预期产物 — 分支上的提交；回执中逐票列出：改动文件、实现要点、运行过的定向单测（命令与结果）、需 Lead 运行的 E2E spec 路径与用例名、未运行或无法在本机验证的项

## 验收与验证

- 只运行定向单测：`flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`，一次一个文件。运行前确认 /proc/meminfo 的 MemAvailable ≥ 12 GiB。
- 提交前对改动的每个包持锁运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter <包名> run typecheck`，须 0 错误（检出首次先持锁跑 `pnpm --filter "./vendor/*" run build:types`），回执列出结果。不运行构建、打包、全仓 typecheck、全仓 lint、knip、E2E 或视觉截图。
- 不能在 Linux/Web 上验证的部分（真实 provider、外部服务）如实列为未验证，不得记为通过。
- 一张票做不完或发现验收要求与当前代码事实冲突时，提交已完成部分，在回执写明原因和建议，继续下一张票。
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zg/task01/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report01.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 本次范围：两项最终验收阻碍

1. **`tests/e2e/shell.spec.ts`「首页：专注计时到点（ACC-WB-06）、习惯勾选持久化…」稳定失败**（2/2 复跑）：经 `home.focus.update` 启动、`automations.plans.submit` 把同一截止计划改到 3 秒后，关闭应用并重开，15 秒内 `focus-completed` 仍为「今日完成 0 次」。t1yy 在 `57bc6a6f` 按 F32 `f0b07078` 改写此用例但未实际运行。用 Engine 级定向测试复现「启动→改期→关闭 Engine→到期后重启→结算」路径（参考 apps/engine/test/engine.test.ts 中 F32 用例与 plugins/automations/src/engine/focus-deadline.ts 的 tick/activatePlanReminder），找出重启后为何不结算（产品：错过截止的补结算、reminders 可用性、关闭时状态持久化；或用例：桌面关闭后常驻 Engine 是否已在关闭期间结算、读取时机），按真实原因修正。若产品语义是「关机期间不执行、重开后补结算」，以规格（F32/AU18）为准。
2. **lint**：`packages/ui/src/styles/base.css:25` 的 `.ok-root` 触发 check-css-classes（非 hu-/shell- 前缀）。若是 OK 上游根类，按惯例登记到 `scripts/css-class-exceptions.json` 并写理由。持锁运行完整 `pnpm lint` 至通过。

每项独立提交，回执写根因。E2E 由 Lead 运行。
