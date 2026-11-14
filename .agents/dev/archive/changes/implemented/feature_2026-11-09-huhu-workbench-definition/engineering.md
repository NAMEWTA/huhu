# 工程结构与代码规范

本文件是仓库目录、包职责、工具链与代码规范的唯一权威定义。工程根为 `/home/wta/projects/huhu`（当前只有 `.agents/` 与 `temp/`；W01 创建以下结构）。

## 1. 目录

```text
huhu/
  package.json                 根脚本；version 为唯一版本来源；packageManager 固定 pnpm 版本
  pnpm-workspace.yaml          apps/*、packages/*、plugins/*、vendor/*、examples/plugins/*
  pnpm-lock.yaml
  .node-version                24
  tsconfig.base.json           strict 公共配置
  oxlint.json  .oxfmtrc.json  knip.json  vitest.workspace.ts  playwright.config.ts
  herdr.lock.json              Herdr Core 版本、各目标 URL 与 SHA-256
  LICENSE                      GPL-3.0-or-later
  THIRD_PARTY_NOTICES.md       W20 生成
  apps/
    desktop/                   Electron 应用
      src/main/                窗口、菜单、IPC、engine-supervisor、plugin-host-supervisor、platform/
      src/preload/             huhuHost
      src/renderer/            main.tsx：挂载 @huhu/workbench 并注册内置插件 UI
      src/plugin-host/         外部插件宿主入口
      resources/               图标、字体、bin 启动脚本、herdr/<target>（构建时下载）、demo-vault
      electron.vite.config.ts  electron-builder.yml
    engine/                    Engine 入口：main.ts（utilityProcess 与无界面共用）、boot.ts、shutdown.ts
    cli/                       huhu 命令：main.ts、commands/、mcp-stdio.ts
  packages/
    contracts/                 zod 模式：capability、errors、events、plugin-manifest、kinds/*、dto/*
    kernel/                    Cordis 根上下文、能力注册与 Dispatcher、权限表、事件总线、插件管理器、网关服务、HTTP/WS/MCP 服务器
    vault/                     Vault 生命周期、路径守卫、锁、原子写、回执、操作日志、语义 Markdown 仓储、文件监听、内存索引与 SQLite 全文库、平台适配
    herdr-client/              Herdr JSON-RPC 与 framed 流客户端（generated/ 为生成类型）
    ui/                        tokens.css、shadcn 组件、业务无关复合组件（DataTable、ResourcePicker、DateTimePicker、CronPicker、DiffView、TerminalView、Banner、EmptyState）
    editor/                    MarkdownEditor、MarkdownPreview、live-preview（Atomic）、merge
    workbench/                 外壳、engine 客户端（HTTP + WS + React Query）、贡献注册表、命令面板、通知中心、首页、设置、插件中心、能力网关页面、i18n
    testkit/                   夹具 Vault、fake provider CLI、fake SSH 服务器、Engine 测试启动器、Herdr 替身
  plugins/
    notes/ tasks/ automations/ archives/ inbox/ agent-cli/ agent-guide/ ssh/ mcp/ safe/ versioning/ health/
      huhu-plugin.json         清单
      package.json             exports: "./engine"、"./ui"、"./shared"
      src/engine/index.ts      Cordis 插件 apply()
      src/ui/index.ts          contributions
      src/shared/              纯函数与常量（engine 与 ui 都可用）
      test/
  vendor/
    cordis/  cosmokit/  timer/   R-05
  examples/plugins/
    daily-review/ quick-clip/ portable-export/
  scripts/                     fetch-herdr.mjs、gen-herdr-types.mjs、gen-guide.mjs、sync-version.mjs、checksums.mjs
  tests/
    e2e/                       Playwright（开发构建）
    e2e/packaged/              Playwright（安装包冒烟）
  docs/
    upstream/ledger.md         复制来源台账
    security-exceptions.md
  .github/workflows/ci.yml  release.yml
```

不设 `src/utils` 之类的通用杂物目录；跨包复用的纯函数放在拥有该概念的包中。

## 2. 包与插件内部约定

- 包名：`@huhu/<目录名>`；插件包名 `@huhu/plugin-<id>`。
- 每个包 `package.json` 的 `exports` 只暴露公开入口；禁止通过深路径导入其他包（oxlint `no-restricted-imports` 规则：`@huhu/*/src/**`）。
- 插件 `engine` 代码不得导入 `react`、`@huhu/ui`、`@huhu/workbench`；`ui` 代码不得导入 `node:*`、`@huhu/vault`、`@huhu/kernel`、任何插件的 `engine`。
- 跨插件协作只有两种：调用能力（`ctx.huhu.call(...)`），或使用对方通过 Cordis `ctx.provide` 暴露的服务接口（类型在对方 `shared` 中声明，例：`TaskQuery`、`SecretUse`、`holdRestoredInput`）。

## 3. 代码规范

### 命名

| 对象 | 规则 | 例 |
| --- | --- | --- |
| 文件 | kebab-case；React 组件文件 PascalCase | `task-query.ts`、`TaskTable.tsx` |
| 类型与组件 | PascalCase | `TaskDto`、`ResourcePicker` |
| 函数与变量 | camelCase，动词开头的函数 | `listOpenAgentTasks` |
| 常量 | UPPER_SNAKE_CASE（模块级不变值） | `MAX_ATTEMPTS` |
| 能力名 | `<领域>.<动词>` 或 `<领域>.<子域>.<动词>` | `tasks.setCompleted` |
| 错误码 | UPPER_SNAKE_CASE，登记在 `contracts/errors.ts` | `VERSION_CONFLICT` |
| 事件 | `<领域>.<过去式或状态>` | `task.completedChanged` |

### 类型

- `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`。禁止 `any`（oxlint `no-explicit-any`）；外部输入先用 zod 解析为类型再使用。
- DTO 与持久化字段只在 `contracts` 定义一次（zod 模式 + `z.infer` 类型）；UI 与 Engine 共用。
- 区分可空：持久化字段用 `null` 表示“无值”，不使用 `undefined` 写入文件。

### 错误与异步

- 业务错误抛 `HuhuError`（`contracts/errors.ts` 中的工厂函数），不抛字符串。
- 每个外部调用（文件、子进程、网络、Herdr、Git、SSH）都必须有超时与错误映射到错误码；不得吞掉异常（`catch {}` 只允许带注释说明原因的忽略）。
- 所有长任务接受 `AbortSignal`；能力 handler 从 Dispatcher 获得 `signal`（客户端断开或用户取消时触发）。
- 资源（定时器、监听器、子进程、连接）必须在插件作用域内创建（Cordis `ctx.effect`、`ctx.on`，timer 插件的 `ctx.setInterval` / `ctx.setTimeout`），以便停用时自动释放；禁止在模块顶层启动任何后台工作。

### 状态

- 禁止模块级可变单例保存业务状态（Engine 中所有状态挂在 Cordis Context 上的服务实例）。
- Renderer：服务端数据只经 React Query；zustand 只存界面状态（architecture §7）。
- 业务规则不写在 React 组件中：组件调用能力或 `shared` 中的纯函数。

### 日志与文案

- Engine 内使用 `ctx.logger(<插件 id>)`（pino 子 logger）；Renderer 不写日志文件，错误经 `huhuHost` 上报 Main 记录。
- 面向用户的文案全部在 `packages/workbench/src/i18n/zh-CN.ts` 与各插件 `src/ui/i18n.ts`，组件内不写中文字面量（oxlint 自定义规则检查 JSX 文本中的中文字符）。

### 平台

- 业务代码不出现 `process.platform`；平台差异只在 `packages/vault/src/platform/` 与 `apps/desktop/src/main/platform/`（architecture §9）。
- 路径：Vault 内统一 POSIX 相对路径；`path.join` 只在 platform 层把相对路径转为本机绝对路径。

### 注释

- 公开导出写一句 TSDoc 说明意图与不变量；复制的上游文件保留原注释与版权头。

## 4. 工具链命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | electron-vite dev（Renderer HMR，Engine 改动自动重启） |
| `pnpm lint` | `oxlint` + `oxfmt --check` + `knip` |
| `pnpm typecheck` | 全部包 `tsc --noEmit`（project references） |
| `pnpm test` | Vitest 单元与集成 |
| `pnpm e2e` | Playwright Electron |
| `pnpm build` / `pnpm dist` | 构建 / 打当前平台安装包 |
| `pnpm fetch:herdr` | 下载并校验 Herdr Core |
| `pnpm gen` | 生成 Herdr 类型与指南文件 |

## 5. 依赖规则

- 新增运行时依赖必须满足：在 [architecture](architecture.md) §2 表中，或在 PR 描述中说明用途、体积、维护状态并更新该表。
- 同一能力只用一个库（例如日期只用 date-fns，cron 只用 Croner，差异只用 diff + @pierre/diffs）。
- 不引入：架构 §2 末尾列出的库。

## 6. 禁止事项

同一能力多套实现；跨包深路径导入；插件间直接读写对方文件；Renderer 访问 Node；业务逻辑写在组件里；模块顶层副作用；没有生命周期所有者的后台工作；未带超时与错误映射的外部调用；兼容层、过渡层与无引用代码（knip 检查）。
