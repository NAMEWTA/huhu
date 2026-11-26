# task02.md 实施批次（t211）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t211
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t211
- 当前任务 — task02.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task02.md
- 回执文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report02.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — #7 余项三批已在 inv/w2 实施并合入 main 445d3400（inventory S1–S7 E2E 通过）；本批覆盖 2026-11-19-issue-7-ssh-module 的 H 票逐项核对

## 目标与输入

接续 report01（inv/w3 e3cac81e）。按你的核对稿 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task01/h-audit.md` 与 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/` 对应票，实现以下仍缺的 Linux/Web 交付，每项一个提交（`Refs: #7`），补单测与 Lead 运行的 Playwright 用例（只写不跑）：

1. **H9.3**：进程终止增加 Linux `/proc/<pid>/stat` 启动时间核对（列表取样时记录，终止前比对，不一致拒绝并提示）。
2. **H4.3**：活动 SSH 终端/工作区迁移到另一个原生窗口——明确转移输入控制权、目标窗口启动失败时保留原窗、保留已有回滚历史与原 shellId；Web 端给等价的新标签入口或明确不支持提示。
3. **H5.2**：持续键入广播——显式选定的可见、可输入分栏实时接收键入，带可见目标模式与一键停止，锁定/观察者分栏不接收；独立 Web 控制链同样生效。
4. **H10.1 / H10.2**：逐项对照原 §11（见 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/spec.md` 与 H10 票）的偏好清单，补齐未实现字段（如启动时自动连接、恢复策略、文件目录树、终端高亮/补全、工具栏交互等），每项保存后在对应功能可观察；设置搜索/默认值/恢复/作用范围正确。确实与 issue-inventory 冲突或依赖外部的项写明理由跳过。
5. **H3.1**：本机身份文件丢失时的交互式恢复（提示选择替代凭据并按一次性流程继续，不落持久回执）；KRL/其他证书算法若 ssh2 无支持，在 UI 给明确不支持提示并在回执写明。

H1.1 台账、H12.1 异常退出/备份恢复、H12.2 打包由 Lead 做，不在本批。真实 Zsh（本机未装，Lead 另行处理）、系统级 IME、Windows/macOS 不做。上下文接近上限时先提交已完成部分。

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task02/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report02.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。
