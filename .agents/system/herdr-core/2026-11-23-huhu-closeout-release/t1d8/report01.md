# #6 外部评论、独立 Web 制品与 Linux 发布准备

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- terminal_address — `t1d8`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report01.md`
- 执行结果 — `done`，已交付改动和用例，等待 Lead 运行构建、打包及 E2E。

## 产物与改动

工作目录为 `/home/wta/projects/huhu`，共享 `main` 的未提交工作树，实施基线为 `fc43ceef5b64ca1c9a68404c9110a6ca46883034`。

- 移除 `tasks.comments.add` 对 Agent 任务的固定拒绝。既有网关授权仍默认关闭。授予权限后，CLI 和 HTTP MCP 调用写入普通讨论，评论 ID、来源和作者由服务端确定，调用方自报的运行、问题、会话和回执事件字段被丢弃。评论沿用现有的 Markdown 追加与持久化逻辑。已将该文件的后续写入交回 Lead 协调。 [能力实现](../../../../../plugins/tasks/src/engine/index.ts#L634) · [HTTP 回归用例](../../../../../plugins/tasks/test/persistence-http.test.ts#L320)
- `pnpm --filter @huhu/desktop run build:web` 使用独立 HTML 和 Vite 配置生成 `apps/desktop/out/web`。Web 入口沿用 `BrowserRoot` 的邀请、会话和重连逻辑，桌面入口从 preload 启动，两端共享 `WorkbenchApp` 和编辑器构建插件。桌面 `build` 包含 Web 构建，`dev` 启动前生成一份静态 Web 制品。独立 Web 制品按桌面现有的 `out/**` 规则进入 ASAR，EngineSupervisor 传递 `out/web` 给 Engine。深链脚本从分享服务根路径加载。 [Web 配置](../../../../../apps/desktop/vite.config.ts) · [构建命令](../../../../../apps/desktop/package.json#L12) · [Web 入口](../../../../../apps/desktop/src/web/main.tsx) · [共享工作台](../../../../../apps/desktop/src/renderer/workbench.tsx) · [EngineSupervisor](../../../../../apps/desktop/src/main/engine-supervisor.ts#L144) · [ASAR 文件规则](../../../../../apps/desktop/electron-builder.yml#L9)
- 删除 `plugins/mcp` 空 workspace 和锁文件中的 importer。候选包缺入口夹具改读 `out/web/index.html`。Mail E2E 所需的制品目录替换交给负责该文件的 t1d5，已在共享树核对为 `out/web`。 [锁文件](../../../../../pnpm-lock.yaml) · [缺入口夹具](../../../../../tests/e2e/helpers/candidate-web-assets.ts#L23) · [Mail E2E](../../../../../tests/e2e/workflows/mail.spec.ts#L136)
- Linux release job 与 Windows 一起安装 Go `1.26.7`，并在 `native/agent-pty` 运行 `go mod download`。 [发布工作流](../../../../../.github/workflows/release.yml#L26)

## 已运行的验证

| 命令或检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t 'Human、缺配 Agent'` | Vitest 3.2.7 通过，1 项通过，39 项被名称过滤。覆盖默认拒绝、授权后写入、伪造元数据过滤、重启后评论可读、输入 revision/hash 保持、零运行和零子进程启动。该次 pnpm 也确认锁文件通过策略检查且与 24 个工作区项目一致。 |
| `git diff --check`，对本任务涉及的修改文件执行 `oxfmt --check` | 通过。 |

## 未运行的验证

- Playwright 只编写。候选包 wrapper 的 `web` 模式运行「Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开」，新增检验 Engine 根路径和深链返回 ASAR 内独立 Web HTML、独立模块脚本及 MIME，并保留真实浏览器邀请、撤销和刷新步骤。 [Web E2E](../../../../../tests/e2e/workflows/web-share.spec.ts#L138)
- 候选包 wrapper 的 `external-agent` 模式运行 CLI-only 和 HTTP MCP-only 两个「同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果」用例，新增检验两种入口均写入普通评论，评论出现在桌面时间线，原生请求不含这一普通评论。 [外部 Agent E2E](../../../../../tests/e2e/workflows/external-agent-desktop.spec.ts#L124)
- 候选包 wrapper 的 `gateway` 模式需复验「G8.2 同包批量授权拒绝陈旧策略，Web 缺资源和缺入口返回明确错误」，其 200 → 503 → 200 隔离夹具已迁移到独立产物。 [网关 E2E](../../../../../tests/e2e/workflows/gateway-package-boundaries.spec.ts) · [缺入口夹具](../../../../../tests/e2e/helpers/candidate-web-assets.ts)
- Worker 未执行 Vite 构建、Electron 打包或安装包检查、全量测试、全仓类型检查及发布 CI。Lead 的桌面定向类型检查曾被共享树的 Mail 错误 `message-cache.ts:250`（缺 `mailFolderRole`）阻塞，已由 Lead 交给 t1d5，类型检查结果待重跑。
- 本机若要在提交之前执行 `node scripts/sync-version.mjs --check`，先将 `plugins/mcp` 的删除加入索引。脚本以 `git ls-files` 发现 package.json，删除尚未暂存时会尝试读取旧路径。 [版本检查脚本](../../../../../scripts/sync-version.mjs#L17)

### Modern Web Guidance

- **`html`** 我为独立 Web HTML 声明了设备宽度 viewport，让移动设备按其布局宽度呈现工作台并保留缩放能力（“width=device-width, initial-scale=1.0”）。Electron 44.9.1 的构建继续采用 electron-vite 的 Chromium 152 目标，独立 Web 沿用 Vite 的 Baseline Widely available 编译目标。

## Lead 验收

已核对独立入口、共享工作台抽取、Engine 资源路径和定向评论用例。接受本次代码与用例交付；真实 Web 构建、类型及候选包三模式仍由 Lead 执行，不记为通过。
