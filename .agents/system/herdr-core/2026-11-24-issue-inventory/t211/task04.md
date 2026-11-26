# task04.md 实施批次（t211）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t211
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t211
- 当前任务 — task04.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task04.md
- 回执文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report04.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — #7 余项三批已在 inv/w2 实施并合入 main 445d3400（inventory S1–S7 E2E 通过）；本批覆盖 2026-11-19-issue-7-ssh-module 的 H 票逐项核对

## 目标与输入

Lead 已在 main 合入 round3（5f1519e5），并自行修复 lint（`shared/terminal-window.ts` 未用导入）与清单漏登记 `ssh.workspace.runs.cancelPaneReconnect`。开工前 `git merge --ff-only main`（Lead 推送后）。tests/e2e/ssh + ssh-workspaces 76 通过、1 跳过、2 失败，日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/h7-r3/e1.log，error-context 在主检出 test-results/：

1. tests/e2e/ssh/remaining.spec.ts:573「H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组」620 行 `expect(attached()).toEqual([1, 0, 0])` 不等（期望与实际各差 2 项）——判断是工具栏移动/偏好变更触发了重连（产品缺陷）还是计数方式变化（round2/3 引入的终端交接或重连计划可能改变附着次数）。
2. tests/e2e/ssh/settings.spec.ts:168「H10.2 非预期断线显示下一次重连并允许取消」197 行点击「打开主机详情 自动重连夹具」超时 30 秒（按钮未出现或被遮挡）。

修复后每项一个提交（`Refs: #7`），回执写根因与需 Lead 复跑的用例。不扩大范围。

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task04/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report04.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。


