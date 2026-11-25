# task01.md 实施批次（t1zn）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1zn
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1zn
- 当前任务 — task01.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/report01.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — 用户 2026-11-26 决定继续实现 #7 未实现功能；缺口清单 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task12/s7-gap-list.md（必读）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/040-s2.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/041-s3.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/042-s4.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/090-s5.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/099-s6.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zn/task01/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report01.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 本次范围：#7 SSH 剩余未实现功能（按已确认 SSH 原型 0a890ec3…，A 编号以 #7 快照与 S7 清单为准）

按以下优先级实现，能在本机回环夹具验证的优先：
1. A03 本机 ProxyCommand（含设备批准、吊销、首跳与关闭语义；参照暂停快照 45b9fae3 的受限执行器）与 ViaShell 传输。
2. A01 未保存目标的快速连接（可回收临时连接）。
3. S4：Linux 桌面 ZIP 能力（若需 Linux 原生 zip/unzip 依赖，优先用现有依赖或系统工具并探测）、SCP 回退、文件 sudo、外部编辑器打开与回写。
4. S3：运行中分隔线拖动比例、扩充分栏、完整标签菜单；实时滚屏搜索与链接。
5. S6：A12 剩余设置项、A14 CLI/HTTP MCP 路由变更与主机链版本/授权/提交边界联动。
6. 本机安装 zsh 时补「真实 Zsh 目录跟随」用例（`command -v zsh` 探测，缺失则跳过并写明）。
独立原生窗口、跨窗口交接、Docker 真机、真实远端主机若无法本机验证，写明原因。每项独立提交，补定向单测与 Playwright 用例（只写不跑）。完成多少报告多少。
