# task07.md 实施批次（t1ht）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1ht
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1ht
- 当前任务 — task07.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task07.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report07.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task06.md 与 report06.md（已合入 main 并快进）。沿用 task06 的原型做法与可写范围。

1. L0a（#11 账本领域冻结）：HomiBook 不在 temp/sources，按 #11 快照（11.md）指定的固定提交从 GitHub 获取到 /home/wta/projects/huhu/temp/sources/homibook 并记录 SHA 与许可证；docs/upstream/ledger.md 是来源台账。领域模型、金额（精确小数/最小单位）、业务日与来源时区、失效引用样例以可运行的纯函数单测落地（可放 plugins/ledger 的拟新增位置，或先放 packages/contracts，按 Huhu 插件规范选择并说明），列出上游复用与 Huhu 适配位置。
2. L0b（#11 账本核心旅程原型）→ /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/ledger/，记录 → /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-ledger.md：建账、记一笔、导入、平账、报表、恢复及失败状态，固定收支补期与贷款补记先预览后确认。
3. P0（#12 MCP 来源与路由）：锁定 Magpie 复刻映射（快照 12.md 的固定版本，按需获取到 temp/sources），协议矩阵、source/config/route/policy 合同、scope/risk/错误表；合同以类型+可运行样例测试落地。原型 → /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype/mcp/，记录 → /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-mcp.md：服务列表、添加/导入、详情、认证、四类目录、失效/无权限/离线状态。
「用户确认」一节留空。L0a 与 P0 的合同代码按普通实现规则（定向单测、持锁、不跑构建/E2E）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/020-l0a.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/021-l0b.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/019-p0.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task07/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report07.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。
