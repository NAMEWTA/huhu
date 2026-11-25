# task02.md 实施批次（t1rb）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1rb
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1rb
- 当前任务 — task02.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/report02.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task01.md 与 report01.md（已合入 main 并快进）。#14 工作台原型已获用户确认并按用户意见修订（/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-workbench.md，修订版 SHA-256 9f5db0cb…42bb，原型 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/workbench/）：知识库编辑区铺满主区域、属性与批注为点击开启的右侧栏且批注无解决状态。本批实现知识库/日记组：UX01 编辑排版、UX02 保存（含 U0 中图 04 的保存失败与未知反馈；底层 F01/F02/F06/F19 已交付）、UX03 单条批注（按用户意见无解决/未解决状态）、UX04 日记常驻月历。复用 packages/editor 与 plugins/notes 现有实现。E2E 写在 tests/e2e/workflows/workbench-knowledge.spec.ts（只写不跑）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/048-ux01.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/063-ux02.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/064-ux03.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/049-ux04.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1rb/task02/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report02.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## Lead 追加（发布后补充，最先执行）

AW2/AW3（inv/w2 的 0fb8257d）与 main 上已合入的 W5d（b6b2b026，清退 runReminderAction 直发、Tasks 5 秒轮询、automations.defaultTaskScan 内部服务、Agent waitingTasks，模板创建/恢复统一走 automations.plans.defaultTaskScan；见 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report11.md 的 W5d 节）冲突：plugins/automations/src/engine/service.ts、plugins/automations/test/service.test.ts。Lead 已中止合并，main 未含 AW2/AW3。请在 inv/w2 执行 `git merge main`，按两侧意图解决（保留 W5d 的清退与发送边界重查，保留 AW2/AW3 的草稿预览、修订校验等），持锁复跑 service、default-task-scan、plan-directory、cron-presets、scheduler、task-scan-occurrences 测试与 @huhu/plugin-automations、@huhu/plugin-agent-cli、@huhu/desktop 类型检查，提交合并后先在终端回告 Lead 合并提交号，再做 UX01–UX04。

## Lead 追加 2（最先执行，优先于 UX01–UX04）

AW2/AW3 第 1 次修复：Lead 合入 a26d1ae3 后构建运行，automation-center.spec.ts 4 条、acceptance「MailPlan：」「F31：」、task-journey「T4.1 与 T5.5」、automation-linux-environment「Linux 桌面批准 sh」共 8 条全部失败，症状一致：点击自动化模块内控件（如 `getByRole('button', { name: '计划', exact: true })`、`getByTestId('plan-directory').getByRole('button', { name: '从模板新建' })`）时 Playwright 报 `<div class="shell-page-surface">… intercepts pointer events`，随后 `nav.rail` 的「任务」按钮拦截。这些用例在 AW2/AW3 合入前通过（MailPlan/F31/T4.1 等），疑为 AW2/AW3 的 automations.css 或模块布局让内容层与外壳重叠。原件 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/aw23-1/（含 trace）。按根因修复，允许持锁构建并运行 automation-center.spec.ts 与上列回归用例复核，单独提交后在终端回告提交号。
