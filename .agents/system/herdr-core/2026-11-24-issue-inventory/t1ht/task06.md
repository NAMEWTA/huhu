# task06.md 实施批次（t1ht）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1ht
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1ht
- 当前任务 — task06.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task06.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report06.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task05.md 与 report05.md（已合入 main 并快进）。

本批为确认原型，按 /home/wta/projects/huhu/.agents/skills/dev-prototype/SKILL.md 及其 references/change-prototype.md 执行。参照已确认的 SSH 原型做法：/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype/ 与 prototype-review.md（入口、指纹、场景表、源码定位、实际走查）。

产物与可写范围（覆盖下方通用禁止条款）：
1. #14 工作台新布局原型 → /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/workbench/（index.html 及本地资源），走查记录 → /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-workbench.md。范围按 U0 报告（/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report04.md 的 26 图表）中标为待确认的新布局/交互：UX01 编辑排版、UX02 保存反馈、UX03 单条批注、UX04 常驻日记月历、UX05 任务窄栏表单、UX06 快速捕获、UX07 邮件三栏与设置入口、UX08 终端分栏末行、UX09 会话导航、UX10 紧凑两级启动器、UX12 公共控件、UX13/UX14 HTTP MCP 与工具授权布局、UX15 同步表单、UX16 Safe 三栏与窄窗逐级返回、UX17 外观、UX18 看板编辑、UX19 添加卡片搜索/分类。每项先读对应票据（/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/0NN-uxNN.md）与 #14 快照（UX 编号、原图 01–26 在快照目录 images/）。
2. #16 自动化中心：先做 AW0（基线/复刻映射，结论写回执；Orca、T3 Code 源码在 /home/wta/projects/huhu/temp/sources，缺失则从 GitHub 固定提交获取到 temp/sources 并记录 SHA 与许可），再做 AW1（C9 交互合同与原型，消费已合入的 PlanAPI：packages/contracts/src/automation-plan.ts 与 HostUI）→ /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/automations/，记录 → /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-automations.md。
沿用 Huhu 现有 tokens、外壳、组件与图标（packages/ui、packages/workbench/src/shell），浅/深主题与窄屏都要走查。用 Playwright 驱动本地 file: 地址实际走查（这不是项目 E2E，无需持锁，但不要同时开多个浏览器）。用 fingerprint.mjs 计算两个目录的 SHA-256 写进记录。记录里「用户确认」一节留空待 Lead 转交用户，不得自填。不提交业务代码。完成后把两个原型目录与记录提交到分支

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/022-aw0.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/038-aw1.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task06/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report06.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。
