# task03.md 实施批次（t1rb）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1rb
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1rb
- 当前任务 — task03.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/report03.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task02.md 与 report02.md（已合入 main 并快进）。按已确认并修订的工作台原型（/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-workbench.md）。先做 #13 F07（按原捕获身份恢复转换，UX06 的前置；F01/F02/F15/F08 已交付），再做 UX05 任务窄栏表单、UX06 快速捕获（含 U0 图 10 的 slash 浮层，U1 已修宿主）、UX07 邮件三栏与设置入口（F13/F12 已交付）。E2E 写在 tests/e2e/workflows/workbench-pages.spec.ts（只写不跑）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/061-f07.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/050-ux05.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/071-ux06.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/051-ux07.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1rb/task03/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report03.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## Lead 追加（最先执行，优先于 F07）

UX02/UX04 第 1 次修复：Lead 合入 UX01–UX04（main 905 之后）构建运行，同批 28 条中 26 通过，2 条失败。原件 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/ux-1/。
1. 回归：`tests/e2e/knowledge/session-flush.spec.ts`「C06 对账无法读取且缓冲等于原文时，笔记仍可保留修改并确认重载」——`save-state` 期望「文件已被外部修改」，实际先「保存失败」后「保存结果待核实」。UX02 前该用例通过。请判断 UX02 新的未知状态是否吞掉了该场景应有的外部修改/冲突判定（以 C06 原规格与 F19/DocumentSession 语义为准），修产品；仅当原断言与 UX02 已确认的产品语义确实冲突时才调整用例并在回执说明依据。
2. `tests/e2e/workflows/workbench-knowledge.spec.ts`「UX04：常驻月历…」30 s 找不到 `getByRole('button', { name: '日记', exact: true })`。
允许持锁构建并运行这两个 spec 复核，单独提交后在终端回告提交号，再做 F07。
