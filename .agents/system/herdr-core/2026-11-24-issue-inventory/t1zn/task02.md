# task02.md 实施批次（t1zn）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1zn
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1zn
- 当前任务 — task02.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/report02.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — task01/report01 已合入 main 6e93b208；Lead 修复渲染进程导入 node 模块导致的启动失败 8a836003

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/040-s2.md
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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zn/task02/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report02.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 本批具体范围（#7 余项，按 S7 缺口清单与你 report01 的「剩余项」）

开工前在 inv-w2 执行 `git merge --ff-only main`（main 已含你的 16 个提交与 Lead 修复）。

1. **渲染进程边界（先做，回归事故）**：合并后桌面窗口白屏——`ui/RoutePanel.tsx`、`ui/HostDirectory.tsx` 按值导入 `engine/route-edits.ts`，后者新引入 `public-resources.js` 把 kernel 的 `createRequire` 带进渲染包，所有 E2E 启动失败。Lead 已把 `maxRouteEditTargets` 移到 `shared/route.ts`。请复查 `plugins/ssh/src/ui/**` 其余按值导入 `../engine/**` 的模块（auth-profile、import/input 等），确保不传递引入 Node 内置模块；若项目已有渲染边界 lint/依赖规则，补上覆盖 `plugins/*/src/ui` → `engine` 的值导入，否则在回执说明建议，不新增依赖。
2. **A07 独立文件窗口**：桌面经 `window.huhuHost` 打开独立原生 SFTP 窗口/Tab 双栏，目标绑定打开时的主机与文件会话，不随全局活动 Tab 改变；Web 端以新 Tab 等价入口。
3. **A09**：SCP 上传回退（在已有单文件下载基础上）；文件 sudo——真实能力检测（`sudo -n true` 等），可用时以 sudo 读写，不可用时给出明确不支持提示；不在持久回执中留凭据。
4. **A11**：监控和工具的独立 sudo；进程/Docker 工具窗口绑定正确主机。本机有 Docker socket：若回环 SSH 夹具执行的是本机命令，写一个 Lead 运行的 Docker E2E（`docker` 不可用时 `test.skip` 并写明原因）。
5. **A12 余项设置**：自动重连、共享连接策略、录制与历史策略、导航显隐、独立文件窗口设置；每项保存后在对应功能可观察到效果，搜索/默认值/恢复/作用范围正确。
6. **A01 余项认证**：PPK v2/v3、加密私钥（口令）、ssh-agent 认证、keyboard-interactive 多轮挑战；先查 ssh2 与 temp/sources 是否已有解析实现（复用优先）。夹具在本机可构造的写 E2E。

真实 Zsh（本机无 zsh）、真实远端主机、Windows/macOS 不做，回执列为未验证。每项一个提交，带 `Refs: #7`。上下文接近上限时先提交已完成部分再继续。

## 追加（Lead 在 main 8a836003 上回归，优先于上面第 2 项起处理）

完整日志 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/ssh-merge/e1.log；error-context 在主检出 test-results/ 下对应目录。tests/e2e/ssh 与 ssh-workspaces 共 52 条：49 通过，3 失败：

- ssh-workspaces.spec.ts:100「A05 adding a split opens only the new host and keeps the original pane session」：新增分栏 data-phase 停在 "trust"，期望 "ready"（124 行）。判断是产品缺陷（新主机信任未沿用/未提示）还是夹具未预置主机密钥。
- ssh-workspaces.spec.ts:1067「H7.2 两个回环端点按前缀续传…」：1252 行取消后 state 为 "cancelling"，期望 "cancelled"。确认取消结果的契约：若 cancelling 为合法中间态，用例应轮询到终态；否则修产品。
- ssh-workspaces.spec.ts:1572「H7.3 ZIP 探测报告本机支持状态…」：1678 行「Linux ZIP 压缩失败」，made.ok=false——你在 65da66e4/24c332c5 加的 Linux ZIP 实际压缩失败，请用定向单测复现并修复。

每项独立提交，回执写根因与需 Lead 复跑的用例名。
