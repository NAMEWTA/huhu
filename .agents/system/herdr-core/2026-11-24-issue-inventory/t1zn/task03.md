# task03.md 实施批次（t1zn）

## 定位

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- topic — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/topic.md
- manifest — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/manifest.tsv
- terminal_address — t1zn
- 身份核对 — 本机默认 Core，worker 进程 HC_TERMINAL_ID 应为 t1zn
- 当前任务 — task03.md，须与 manifest 一致
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/report03.md
- 业务票据和验收 — 下列各票的 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/<票>.md；验收报告 /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/<票>.md 由 Lead 唯一写入，worker 不改
- Lead 回告方式 — hc send t1hr "<回执绝对路径>"
- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w2（分支见 git branch）
- 接续依据 — task02/report02 已合入 main；Lead 修复 PPK v3 Argon2（Electron BoringSSL 不支持，回退 @noble/hashes）与 3 个定位器，main 932e09b3，SSH E2E 全部通过

## 目标与输入

按顺序实现以下票据，每张票独立提交（commit message 形如 `fix(vault): ... (F05)`，结尾加 `Refs: #<Issue>`）：

- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/041-s3.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/042-s4.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/090-s5.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/099-s6.md
- /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/tasks/105-s7.md

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
- 运行附件 — 无强制附件；需留存的测试原件写 /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zn/task03/

## worker 执行约定

按 /home/wta/projects/huhu/.claude/skills/system-herdr-core/assets/task.md 的「worker 执行约定」与「完整报告格式」执行。先写临时稿 report03.md.tmp 再用 `node -e "fs.linkSync(a,b)"` 发布终稿并删除临时稿。回告后等待下一项。

## 本批具体范围（#7 最后余项，来自你 report02「阻碍与接续」）

开工前 `git merge --ff-only main`。注意：Electron 的 Node crypto 基于 BoringSSL（如 Argon2 不可用），Engine 里用到的 crypto 算法请以 `ELECTRON_RUN_AS_NODE=1 <electron> -e ...` 核对；渲染进程不得按值导入 engine 模块（已有 lint 规则）。

1. **A12 共享连接策略**：增加同主机新终端「不复用连接」选项。按分栏维护独立传输与待答信任记录，迁移文件、监控、自动重连、鉴权中依赖原连接 ID 的调用路径；默认保持现有复用。
2. **A07**：从未连接主机直接打开独立文件窗口（取得独立连接，走同一信任/认证流程）。
3. **A09 sudo**：提权会话覆盖完整文件动作（重命名、删除、属性、上传下载）与批量队列；需要口令时以一次性交互输入（不进持久回执/日志）；不可用时明确提示。
4. **A11**：仪表盘逐主机 sudo；进程终止（二次确认）；Docker 容器日志与容器终端（`docker exec` 经原 SSH 连接），绑定正确主机。
5. **S7 H12.1 生命周期**：写 Lead 运行的 E2E——终端、文件会话、传输、端口监听、等待认证同时存在时切换 Vault / 停用 SSH 插件，核对对象回收、监听端口释放、旧代迟到事件被丢弃、其他模块仍可用。发现的回收缺陷一并修复。

Ed448（ssh2 不支持）、真实外部主机、真实 Zsh、Windows/macOS 不做，回执列未验证。每项独立提交，带 `Refs: #7`。上下文接近上限时先提交已完成部分。
