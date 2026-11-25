# task10.md 实施批次（t1ht）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1ht
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1ht
- 当前任务 — task10.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task10.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report10.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task09.md 与 report09.md（已合入 main 并快进）。先做 P5（连接恢复、停用回收与会话一致性）。之后开始 #11 账本：L1（建账后能重开使用，新建 plugins/ledger 插件，遵循现有插件规范与 L0a 合同 packages/contracts/src/ledger.ts）、L2（账户与记账闭环，消费 C1 写入/恢复）。账本原型已获用户确认（/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-ledger.md，SHA-256 3cb52433…b940），界面按原型实现，桌面与独立 Web 共用；Playwright spec 写在 tests/e2e/workflows/ledger.spec.ts（只写不跑）。需新增依赖时先在回执说明，不改锁文件

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/102-p5.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/039-l1.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/065-l2.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task10/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report10.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## Lead 追加（发布后补充，最先执行）

P3/P4 合入 main 后，Lead 构建并以 `HUHU_MCP_KEYRING_ACCEPTANCE=1 env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 xvfb-run -a pnpm e2e tests/e2e/workflows/mcp-aggregation.spec.ts` 运行，P1 与「P4 独立 Web…」通过，以下 3 条失败（第 1 次修复）。原件 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/p34-1/。

1. 「P2 导入三个本地来源…」回归（P3/P4 合入前 Lead 运行通过）：状态数组期望第 4 项 `blocked`，实际 `ready`。
2. 「P3 正式来源页面添加服务…」：`getByRole('dialog', { name: '授予本机许可' }).getByRole('button', { name: '取消' })` 未获得焦点（inactive）。
3. 「P4 桌面来源页面完成回环 OAuth 登录并注销」：30 s 内找不到 `getByTestId('gateway-mcp-sources').getByRole('button', { name: '查看 回环授权' })`。

按根因修复产品或用例（不得放宽断言）。本项允许持 verify.lock 构建（`pnpm --filter @huhu/desktop run build`）并运行这一个 spec 复核，运行后确认无残留 Electron/上游夹具进程。修复单独提交后先回告 Lead（回执可写在 report10 的一节），再继续 P5。
