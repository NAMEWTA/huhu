# task01.md 实施批次（t211）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t211
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t211
- 当前任务 — task01.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t211/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t211/report01.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1（分支见 git branch）
- 接续依据 — #7 余项三批已在 inv/w2 实施并合入 main 445d3400（inventory S1–S7 E2E 通过）；本批覆盖 2026-11-19-issue-7-ssh-module 的 H 票逐项核对

## 目标与输入

用户要求：`/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module` 这个 #7 SSH Change 与 issue-inventory 一并完成；两者冲突时按 issue-inventory（`/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/040-s2.md`、`041-s3.md`、`042-s4.md`、`090-s5.md`、`099-s6.md`、`105-s7.md` 及其 evidences）为准。只验证 Linux 与 Web，Windows/macOS（含 WSL、PowerShell、.NET）不做。

**第一步：逐票核对（必须先交付）。** 读 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/` 下全部 40 张 H 票（H1.1–H12.2）的「可见结果与边界」「实施验收」，以及 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/spec.md`、`design.md`、`source.md`、`verification/H-remaining-linux.md`。对每条实施验收，在当前代码（main 445d3400，已含 #7 三批：ProxyCommand/ViaShell、快速连接、Linux ZIP、外部编辑器、SCP、sudo、原生文件/工具窗口、PPK/agent/多轮认证、连接不复用、H12.1 生命周期等）和现有测试（`plugins/ssh/test/**`、`tests/e2e/ssh/**`、`tests/e2e/workflows/ssh-workspaces.spec.ts`）中找到实现与覆盖证据。把结论写入 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task01/h-audit.md`：每票一行，列「验收条目 → 已实现/部分/缺失/仅 Win-mac → 代码入口 → 覆盖用例（spec 路径 + 用例名或单测文件）→ 缺口」。写完先 `hc send t1hr "<h-audit.md 绝对路径> 核对稿已写"` 告知 Lead，然后不等回复继续第二步。

**第二步：补齐 Linux/Web 缺口。** 按依赖顺序实现第一步标为「部分/缺失」的条目（跳过仅 Win/mac 与需真实外部主机的部分），每个切片一个提交（`feat(ssh): ... (H3.4)`，结尾 `Refs: #7`），补单测和 Lead 运行的 Playwright 用例。按复用优先：先查 Huhu 现有实现、`temp/sources/motty` 等。注意：Electron 的 Node crypto 基于 BoringSSL（不支持 Argon2 等），Engine 用到的 crypto 算法用 `ELECTRON_RUN_AS_NODE=1 <electron> -e ...` 核对；渲染进程不得按值导入 engine 模块（已有 lint 规则）；新增 Engine 能力须同时登记到 `plugins/ssh/huhu-plugin.json` 的 `contributes.capabilities`（`apps/engine/test/capability-catalog.test.ts` 校验）；E2E 若改动设备偏好（localStorage），须在 finally 恢复，避免影响同 worker 后续用例。

依赖安装：本检出的 `pnpm install --frozen-lockfile --prefer-offline` 已由 Lead 在验证锁后排队，`node_modules` 可能暂缺；第一步只需读代码。需要跑单测/typecheck 时先确认 `node_modules` 已就绪，再按下方约定持锁运行。上下文接近上限时先提交已完成部分并在回执写清剩余项。

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t211/task01/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report01.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。
