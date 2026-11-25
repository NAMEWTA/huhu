# task09.md 实施批次（t1hs）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1hs
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1hs
- 当前任务 — task09.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task09.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report09.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task08.md 与 report08.md（已合入 main 并快进）。

一、F09 回归修复（第 1 次）：你报告的 apps/engine/test/codex-dispatch.live.test.ts 失败，Lead 用 git bisect（HUHU_AGENT_LAUNCH_TEST_BIN=<检出>/apps/desktop/resources/herdr/linux-x64/herdr-core，HUHU_CODEX_NATIVE_TEST_BIN=/home/wta/projects/huhu/temp/dev/codex-0.170.0/codex-x86_64-unknown-linux-musl）定位首个坏提交 5eb06e3d「fix(agent-cli): scope native history before pagination (F09)」，前一提交 5800107b 通过，起点 59a6020e 通过。按根因修复（F09 的 Space 投影/分页不应丢掉显式冷恢复目标），保留 F09 原有验收（plugins/agent-cli/test/history.test.ts、sessions.test.ts、tool-exposure.test.ts 仍需通过）。

二、#14 工作台原型修订：/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/workbench/，记录 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-workbench.md 末尾「用户确认」节列了用户 5 点意见（Lead 已录入，务必读原文）：知识库编辑区铺满主区域不做卡片框（参照 /home/wta/projects/huhu/temp/sources/open-knowledge 等编辑器）；批注改为点击开启的右侧栏，显示属性、批注等，批注无解决/未解决状态；Agent 工作区参照 /home/wta/projects/huhu/temp/sources/herdr-app 布局，分栏等操作用小图标按钮；标签与左侧 Spaces 会话显示各 Agent 适配图标——从 herdr-app/defaults/icons（pi.svg、codex.svg、claude.svg 等）复刻并带 LICENSE-LobeHub.txt / LICENSE-Lucide.txt 与来源 SHA。可写 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/workbench/ 与该记录（在记录中新增「修订版」节：新指纹、改动对照、实际走查；不得改用户确认原文）。同 task06 的方法用 Playwright 走查浅/深与窄屏。

三、F28（任务提醒迁入同一计划）、F31（Agent 状态观察迁入计划）、F32（无页面时结算专注计时）：消费已合入的 F29 计划目录

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/005-f09.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/073-f28.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/074-f31.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/075-f32.md

每张票先读票据，再读票头引用的原 Issue 快照对应编号的完整小节（快照目录 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/integration/20261124T094741Z/，例如 #13 → 13.md，按 F/W/UX/AU/TW 等编号搜索），然后读现有代码入口。票据中的验收条目是完成判据；快照正文给出行为细节、根因分析和边界。按根 AGENTS.md 的复用优先顺序，先查 Huhu 现有实现与 /home/wta/projects/huhu/temp/sources。涉及 HTML/CSS/客户端 TS 时，先执行 .agents/skills/zh-modern-web-guidance/SKILL.md 的 search 与 retrieve。

## 读写范围与产物

- 可读范围 — 整个仓库、快照目录、temp/sources
- 可写业务范围 — 本检出中实现这些票所需的源代码、单测和 Playwright spec（tests/ 下）
- 禁止改动 — .agents/dev/changes/**（票据与验收报告归 Lead）、根 AGENTS.md、依赖锁文件（需新依赖时先在回执中说明，不要自行安装）、其他 worker 的检出
- 预期产物 — 分支上的提交；回执中逐票列出：改动文件、实现要点、运行过的定向单测（命令与结果）、需 Lead 运行的 E2E spec 路径与用例名、未运行或无法在本机验证的项

## 验收与验证

- 只运行定向单测：`flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`，一次一个文件。运行前确认 /proc/meminfo 的 MemAvailable ≥ 12 GiB。
- 不运行构建、打包、全仓 typecheck、全仓 lint、knip、E2E 或视觉截图。可以对改动包运行 `pnpm --filter <包> exec tsc --noEmit -p .` 吗？不可以——类型检查由 Lead 串行执行；请在回执中列出需要检查的包。
- 不能在 Linux/Web 上验证的部分（真实 provider、外部服务）如实列为未验证，不得记为通过。
- 一张票做不完或发现验收要求与当前代码事实冲突时，提交已完成部分，在回执写明原因和建议，继续下一张票。
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task09/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report09.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## Lead 追加（发布后补充，最先执行）

- 规则更正：根 AGENTS.md 只禁止实施者跑「全仓」类型检查。从本批起，提交前对你改动的每个包逐个运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter <包名> run typecheck`（首次需先在检出里跑一次 `pnpm --filter "./vendor/*" run build:types`，同样持锁），必须 0 错误，并在回执列出结果。
- 先修上一批在 main 上的类型错误（同一检出快进 main 后即可复现），单独提交：
  - w1（TW7/TW2/TW6）：packages/vault/src/engine-endpoint.ts(96) TS2375；apps/cli/test/engine-lifecycle.test.ts(35) reply unknown；plugins/tasks/test/persistence-http.test.ts(557) TS2345；plugins/automations/test/task-scan-occurrences.test.ts(722,731,744,752) TS2322。用 pnpm --filter 对 @huhu/vault @huhu/cli @huhu/engine @huhu/plugin-tasks @huhu/plugin-automations @huhu/plugin-agent-cli @huhu/desktop 复核。
