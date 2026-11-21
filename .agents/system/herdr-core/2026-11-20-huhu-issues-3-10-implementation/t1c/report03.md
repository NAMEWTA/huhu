# G2.1 任务报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t1c
- task — task03.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report03.md
- 执行结果 — done
- 身份 — Windows 本机 Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 0.1.21。核对 `HC_TERMINAL_ID=t1c` 与 `task03.md active`。

## 结论

- 每个 Vault 的 `.huhu/gateway/tool-access.json` 独立持久化 `formatVersion=1`、`revision` 和布尔选择。首次写入 revision 0，登记当时已知能力的明确关闭。随后登记的能力显示 `selected:null`，外部仍关闭。显式单项变更经 VaultFiles 条件原子写，写成才返回新 revision，同值重复设置回原 revision。旧 `plugins.json` 的外露字段没有参与新格式初始化，插件启停偏好继续读取自己的文件。
- `gateway.get.toolAccess` 提供 `ready` 或只读的 `error`，后者有 `missing`、`unreadable`、`invalid-format` 原因。无效格式、无法读取和缺失文件均拒绝依赖配置的外部调用。损坏文件的字节保留，管理写入也拒绝覆盖。桌面和已有插件委托保持自己的认证与权限路径。
- Dispatcher 在普通调用、HTTP 发现及 MCP 发现使用同一 Vault 选择。CLI `capabilities list` 与 MCP stdio 使用认证过的 `GET /api/v1/capabilities`，零开放时返回空列表。直接调用桌面管理 `capabilities.list` 或 `gateway.get` 被拒绝。MCP 的旧工具名在 Engine 内解析后仍经 Dispatcher 检查，stdio 通过同一调用端点的 MCP 名称格式，限制为 MCP 身份。MCP 资源按依赖能力发现，读取仍逐项授权。
- `home.summary` 的正文摘要改用原调用者身份走 `notes.read`。仅开放笔记列表时可以读标题等列表数据，正文摘要为空。

## 产物与改动

- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/capability
- 分支 — `impl/huhu-issues-3-10-capability`
- G1.2 基线 — `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e`
- 本地候选提交 — `29a6e8f13bcbd3e644ef9b7a2a463627e6d39735`，父提交为上述 G1.2，工作树干净。
- [ExposureStore](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/exposure.ts) · [共享合同](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/contracts/src/capability.ts) · [Engine 装配](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/src/boot.ts) · [管理入口](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/capabilities/system.ts)
- [Dispatcher](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/dispatcher.ts) · [HTTP 发现和调用](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/server/http-app.ts) · [MCP 资源和工具](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/mcp.ts) · [CLI 标准发现](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/cli/src/main.ts)
- 复用现有 VaultFiles 的条件原子写和已锁定的 Zod、Hono、MCP SDK，新增上游代码与依赖为零。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 两个 Vault、初始关闭和单项恢复 | 隔离 A 的所有初始选择为 false，旧格式样例原件保留。CLI、MCP 和 HTTP 三种令牌发现为空。打开 `notes.read` 后 revision 1，三者只发现该项并读得合成正文。重启 A 保持，B 仍为 revision 0 且发现为空。 | [双 Vault Engine 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/tool-access.test.ts) |
| 新工具、明确关闭和版本 | 重开后登记样例能力，目录为 `selected:null`，调用拒绝。显式关闭新能力到 revision 2，关闭原已开能力到 revision 3，同值重试保持 3。缓存的 MCP 名称调用收到 `CAPABILITY_NOT_EXPOSED`。 | [双 Vault Engine 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/tool-access.test.ts) |
| 损坏原件和失败关闭 | 写入一次 schema 无效但部分值为 true 的样例，运行中和重启后都能通过管理读到 `invalid-format`。受策略影响的业务调用拒绝，MCP 发现为空，管理变更拒绝，原件逐字节不变。在真实 stdio 子进程中另实测非法 JSON 使原已显示的工具消失，旧名称调用返回同类错误。 | [双 Vault Engine 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/tool-access.test.ts) · [CLI 与 stdio 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/cli/test/cli.test.ts) |
| 发现、资源及身份边界 | 无认证 HTTP 发现返回 401。CLI 在没有开放工具的无界面 Engine 上发现成功。真实 stdio 和 HTTP MCP 均验证零值、显式授权和拒绝。外部直接读取管理目录及策略被拒。MCP Vault、最近笔记、笔记资源取数和主页聚合走原主体授权。 | [CLI 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/cli/test/cli.test.ts) · [Engine 回归](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/engine.test.ts) |
| 检查与定向宽跑 | 目录、策略、CLI、Kernel 组 79 项通过。最后一轮随机端口触发 Fetch `bad port` 时为 78/79，单跑 HTTP server 13/13。Engine 与扩展组在为 Git 夹具设置仓库查找上限后 51 通过、7 跳过。宽跑原先还有一个 Windows `symlinkSync` 的 `EPERM`，复跑按编号排除该既有 Vault 包测试。Contracts、Kernel、Engine、CLI 类型检查通过。19 个提交文件通过 oxfmt、oxlint 和暂存差异检查。 | [HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/test/server.test.ts) · [Engine 回归](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/engine.test.ts) |
| 原型和 Electron 回归入口 | 浏览原型初始目录，筛选「未配置」后只见 1 项小组件样例。模拟损坏显示「开放策略无法读取，外部调用已暂停」。Packaged CLI 和写作恢复 Electron 夹具已加显式授权，两份 Playwright `--list` 成功。 | [原型](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/prototype/index.html) · [Packaged 夹具](D:/Document/code/huhu/temp/issue-worktrees/capability/tests/e2e/packaged/packaged.spec.ts) · [写作恢复夹具](D:/Document/code/huhu/temp/issue-worktrees/capability/tests/e2e/workflows/write-and-restore.spec.ts) |

实际验证命令从本 worktree 根经 pnpm 12.10.1 运行。测试使用本任务目录内临时 `TEMP/TMP`、隔离 Huhu Core 和合成数据。最终 Engine 回归的进程级 `GIT_CEILING_DIRECTORIES` 为该临时目录，防止测试 Vault 被视为外层 Git 仓库。

```text
pnpm exec vitest run apps/engine/test/tool-access.test.ts apps/engine/test/capability-catalog.test.ts apps/cli/test/cli.test.ts packages/kernel/test --no-color --maxWorkers=2
pnpm exec vitest run apps/engine/test/engine.test.ts apps/engine/test/external-plugins.test.ts -t '^(?!.*ACC-SY-08)' --no-color --maxWorkers=1
pnpm exec vitest run packages/kernel/test/server.test.ts --no-color --maxWorkers=1
pnpm --filter @huhu/contracts --filter @huhu/kernel --filter @huhu/engine --filter @huhu/cli -r run typecheck
pnpm exec playwright test --list tests/e2e/workflows/write-and-restore.spec.ts
pnpm exec playwright test -c playwright.packaged.config.ts --list tests/e2e/packaged/packaged.spec.ts
```

## 受影响调用方与接续

- 命令行 `vault info`、`guide status`、`plugins list`、Notes、Tasks、Inbox 等业务命令依赖相应的显式授权。`tasks status` 先读版本，需授权 `tasks.read` 与 `tasks.setStatus`。Engine、CLI、两种 MCP 和 Packaged/恢复夹具已改掉所依赖的旧默认开放。G1.1 的历史隔离证据按原 SHA 回放。
- Renderer 已有调用使用 `gateway.get.mcp/tokens`、`capabilities.list` 与单项 `gateway.update`。配置错误、三态选择、批量交互由对应 UI 切片接续。G2.2 的整批提交、版本竞争和意图键，以及后续诊断、MCP 服务启停与流的授权生命周期，按计划推进。
- 真实远端和 Electron/安装包实机不在本轮验证范围。ACC-SY-08 的符号链接分支需可创建符号链接的环境重新验证。原型走查是既有样例对照，用户确认由对应阶段收集。

## Lead 验收
