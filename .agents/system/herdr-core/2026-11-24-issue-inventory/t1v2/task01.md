# task01.md 实施批次（t1v2）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1v2
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1v2
- 当前任务 — task01.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report01.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1t7/report01.md 与 report02.md（L6/L8/AW4/L9 已合入 main 95499eba，AgentCliModule.tsx 冲突由 Lead 合并两侧；前任会话已回收）。Lead E2E 日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-l6-l8-aw4-l9.log，失败附件在 /home/wta/projects/huhu/test-results/

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/092-l8.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/101-l9.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/098-aw4.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report01.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 返工要点（第 1 次修复）

L6/L8/AW4/L9 已实施并合入。本任务只修 Lead 在 main 95499eba（Linux X11 Electron + 独立 Web）的 3 条 E2E 失败，同批其余 38 条（含 L6、两条 AW4、L1–L7、UX05–UX10）通过：

1. `tests/e2e/workflows/ledger.spec.ts`「L8 独立 Web 预览和确认所选贷款期次并打开原流水」：第 509 行，对话框「预览贷款历史补记」内未出现 status「已确认 1 个所选期次」。
2. 同文件「L9 独立 Web 导出账本包并预览恢复到新账本」：第 608 行，`ledger-module` 内未出现 heading「恢复账本」。
3. `tests/e2e/workflows/acceptance.spec.ts`「首页看板通过可信目录添加 Git 和 SSH 卡片，停用后保留 SSH 实例」：保存后卡片已可见，但立即读取 `.huhu/home/widgets.json` 时 ENOENT。确认是 AW4 Home 改动改变了保存路径/时机，还是用例在写入完成前同步读取；先用 git 对照 AW4 前后行为。

逐条找出真实原因（产品缺陷还是用例时序/夹具），按真实原因修正，必要时补定向单测。夹具按生产数据格式，元素按回执 ID 或唯一名称定位。E2E 由 Lead 运行；回执写明预期通过的用例名及每条根因。
