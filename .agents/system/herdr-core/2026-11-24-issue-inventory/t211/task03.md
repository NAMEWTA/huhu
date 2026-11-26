# task03.md 实施批次（t211）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t211
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t211
- 当前任务 — task03.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task03.md
- 回执文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report03.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — #7 余项三批已在 inv/w2 实施并合入 main 445d3400（inventory S1–S7 E2E 通过）；本批覆盖 2026-11-19-issue-7-ssh-module 的 H 票逐项核对

## 目标与输入

接续 report02（inv/w3 b9b7f3d3，Lead 已合入 main 并在跑回归）。实现以下 #7 H 票剩余 Linux/Web 差距，每项一个提交（`Refs: #7`），补单测与 Lead 运行的 Playwright 用例（只写不跑）。先 `git merge --ff-only main`。

1. **H4.3 整工作区迁移**：多分栏工作区作为整体迁移到另一个原生窗口并可整体还原（保留布局版本、各 paneId/shellId、焦点与输入控制权；目标窗口失败时原窗不变）。
2. **H10.1 终端高亮**：多条关键词规则（可增删、排序、启停，支持正则或字面），跨换行匹配按 xterm 可见缓冲处理；设置保存后在终端可观察。
3. **H10.2 重连计划**：可配置的多次重试（次数、间隔、退避上限），默认保持现行「一次、默认关闭」；主动断开不触发；UI 显示下一次重试与取消。
4. **H10.2 文件表列宽**：用户拖动/键盘调整列宽并按设备持久化，可恢复默认。

不做：自动覆盖与禁用时间戳偏好（issue-inventory S3 与 #7 F05–F06 已决定排除）、系统 IME、Windows/macOS、真实 Zsh。E2E 若改设备偏好须在 finally 恢复。上下文接近上限时先提交已完成部分。

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task03/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report03.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。


## 追加（Lead 对 round2 合入后的回归，最优先处理）

main 合入 b9b7f3d3 后：plugin-ssh/desktop/ui typecheck 0、定向单测 4 文件通过、构建通过；lint 失败；tests/e2e/ssh + ssh-workspaces 72 通过、1 跳过、4 失败。日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/h7-r2/{lint.log,e1.log}，error-context 在主检出 test-results/。

1. lint：`packages/ui/src/components/TerminalView.tsx:142` 硬编码颜色 "#f6d06f" "#211804"（高亮装饰），改用现有 token。
2. tests/e2e/ssh/settings.spec.ts:90「H10.2 SSH 启动目标和工作区恢复策略在下一次载入时生效」与 tests/e2e/ssh/shortcuts.spec.ts:173 两条「H5.2 桌面/独立 Web 键入只广播到显式选定的可输入分栏并可一键停止」：`ssh.workspace.runs.start` 报 INVALID_INPUT，panes[i] 含多余键 revision/authKind/configured/authState——用例把主机对象整体传入 panes，应只传 { hostId }（或合同允许的字段）。
3. tests/e2e/ssh/lifecycle.spec.ts:40「H12.1 Engine 异常退出释放转发并留下唯一传输终态，原工作区可重新连接」88 行：ENOENT `<vault>/.huhu/runtime/ssh/engine.json`——readdir(runtime) 的条目不是机器目录（或运行描述符路径与实际不同），按实际写入位置修正。
