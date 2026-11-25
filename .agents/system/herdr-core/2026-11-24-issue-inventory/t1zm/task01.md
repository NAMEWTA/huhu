# task01.md 实施批次（t1zm）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1zm
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1zm
- 当前任务 — task01.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zm/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zm/report01.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — 用户 2026-11-26 决定继续实现 #16 未实现功能；各票当前缺口见 evidences/078-aw5.md、098-aw4.md、104-aw6.md、108-aw7.md、124-j13/125-j14 草案（Lead 维护）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/078-aw5.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/098-aw4.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/104-aw6.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zm/task01/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report01.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 本次范围：#16 剩余未实现功能（按已确认的自动化原型 96b22cda…、AU 编号以 #16 快照为准）

1. **AU03 通知反向深链**：从通知中心/桌面通知按原 planId/occurrenceId 打开自动化中心的原发生详情（及其来源页），过期或已删除时给出明确状态。
2. **全局自动运行暂停**：统一计划端口提供全局暂停/恢复（持久、带修订），暂停期间不触发新发生，恢复后按各计划规则继续，不补发暂停期间的发生（以规格为准）；中心与设置可见。
3. **通用单效果重试**：在发生详情对失败/未知的单个效果按原身份重试（未知先核实），不重派整个运行。
4. **跨发生汇总的待处理状态**：「需要处理」筛选能汇总子运行的待答/失败。
5. **固定收支公共改期写入**：中心可编辑账本日历型计划的周期/起始（经账本领域校验）。
6. **AU18 多客户端成本样本**：在 Engine 级测试中固定计划/运行，0/1k/10k 历史，模拟 1 与 3 个客户端订阅，记录 Core 查询/推送/读取量，断言不随客户端倍增；输出样本文件。

每项独立提交，补定向单测与 Playwright 用例（E2E 只写不跑，用例首参须对象解构）。完成多少报告多少，若某项与规格冲突写明。
