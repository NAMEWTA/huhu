# task01.md 实施批次（t1yy）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1yy
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1yy
- 当前任务 — task01.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1yy/report01.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — 最终验收候选 f69e2375 的全量套件结果：/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/summary.txt、lint.log、unit.log（Lead 的 E2E 全量仍在运行）

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/111-rc.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1yy/task01/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report01.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 本次范围：修复最终全量套件失败（不新增功能）

1. **lint**（`pnpm lint` 第一阶段 oxlint 12 个 error，日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/lint.log）：未用导入、空对象解构（Playwright 首参改为 `{ browserName: _browserName }` 等已有写法）、no-this-alias、no-useless-escape、no-control-regex（如为有意匹配控制字符，按项目惯例加局部禁用注释并说明）。修完后持锁运行 `pnpm lint` 全部阶段直至通过（lint 不属于重任务名额外的禁止项，本次 Lead 授权你运行）。
2. **全量单测 7 项失败**（日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/unit.log，搜索 FAIL）：
   - apps/cli test/approved-terminal.test.ts「Linux sh CLI/MCP 的终端授权…」：没有权限调用：本机受保护启动服务尚不支持核验 Linux sh 的执行映像
   - apps/cli test/cli.test.ts「同一 Engine 的扩展卸载与复装…」：ZodError expected object, received undefined
   - packages/kernel test/web-invitations.test.ts「两个邀请可建三个独立会话…」：返回对象多一个字段
   - plugins/agent-cli test/tool-exposure.test.ts 两项「Agent 可用性只读取脱敏缓存…」：返回对象字段差异
   - plugins/ssh test/public-resources.engine.test.ts 两项「scopes monitor reads…」：期望 { total: 8192, available: 4096 } 实际 undefined
   对每项先用 git 找出是本批哪次改动造成（合同新增字段、S5 监控形状、AW6 可用性快照等），判断是测试过期还是产品回归，按真实原因修正。每个文件持锁单独运行。
3. 每类修复独立提交，回执逐项写根因。不运行 E2E、构建、打包（Lead 正在运行全量 E2E，验证锁会排队，耐心等待）。

## 追加（lint/单测完成后继续）：全量 E2E 的 Agent/自动化/其他组

同一候选全量 E2E 失败摘要 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/e2e-failures.txt，附件 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/e2e-failures/。你负责：perf「任务列表 1,000 行滚动…」、shell.spec 的 ACC-AG-01、「Agent CLI 历史：Claude 与 Codex…」、「同步设置用 Versioning 凭据补配旧 HTTPS 目标…」、「首页：专注计时到点…」、「自动化规则编辑器：新建 Agent 规则…」；acceptance 的 W05-W06、ACC-AG-05、「Agent CLI 智能体设置页…」、「Combobox：任务项目…」；automation-linux-approval-revoke、automation-linux-environment；workbench-baseline UX08。知识库/编辑器组由 t1z0 处理。按同样方法找引入改动并修正，回执逐项写根因与预期通过的用例名。
