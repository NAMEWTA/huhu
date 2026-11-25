# task09.md 实施批次（t1v2）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1v2
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1v2
- 当前任务 — task09.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task09.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report09.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report08.md（AW6 修复与 AW7 已合入 main 44b37c6f）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/104-aw6.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/110-tw9.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task09/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report09.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 先查间歇超时（AW6 第 2 次修复）

AW6 回归已修：shell「自动化运行…」、AW2、AW6、AW7、TW7 通过。但 automation-center「AW3：扫描草稿预览无写入，关闭保护草稿并保留并发冲突输入」间歇 60 秒超时：首轮失败，`--repeat-each 3` 中 1/3 失败（其余 20 条通过）。trace 显示在 Launch electron 后的连续 Evaluate 调用处停住，之后无步骤。与你上轮记录的 AW2 首次点击不返回可能同源（启动期挂起）。trace 已保存到 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/aw3-flaky/trace.zip，日志同目录。

找出该用例第一段 evaluate（夹具或 engine 调用）在何种条件下不返回，区分产品（Engine 启动/插件加载/HTTP 请求未结算）与用例问题并修复；给每个 evaluate 加超时以便定位。若仍无法确定，写明已排除项。随后继续 TW9。
