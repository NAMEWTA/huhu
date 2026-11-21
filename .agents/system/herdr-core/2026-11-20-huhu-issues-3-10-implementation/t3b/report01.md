# #10 W03-01 可信 Widget 贡献契约

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t3b
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t3b/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t3b/report01.md
- 执行结果 — done
- 身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`，核对 `HC_TERMINAL_ID=t3b` 与 manifest 的 `task01.md active`。

## 结论

- `HomeWidgetDefinitionSchema` 定义纯数据描述。复用现有 `WIDGET_ID` 和六列网格约束，统一 `widget:<owner>:<id>`、默认与最小／最大尺寸、实例数上限、JSON 配置 Schema、默认配置及必需／可选能力。 `defineHomeWidget` 从同一 Zod 对象 Schema 校验默认配置并生成输入 JSON Schema。
- `assertHomeWidgetDefinitions` 按清单局部 ID 和可信定义做双向集合核对，区分漏报、多报、重复及归属错误。 `ContributionRegistry.register` 用相同检查约束实际 Renderer 注册，先拒绝有问题的 Widget 批次，再更新贡献快照。kernel 使用单独的源码声明，外部来源被拒绝。
- `projectHomeWidget` 使用当前 Vault 的启用插件集合和当前调用者获权的能力 ID 集合。必需能力撤权使条目不可用，可选能力撤权只关闭对应授权位。Renderer `getHomeWidgetCatalog` 对不可用条目保留描述与状态，组件仅在可用时提供。启用快照未知时，插件目录条目按禁用处理。
- SSH 的 manifest 声明 `hosts`，现有桌面注册引用 `@huhu/plugin-ssh/shared` 的同一描述。样本默认 3 × 2、最小 2 × 2，当前为最大尺寸选用 6 × 6。实例数不限，默认配置 `{}` 表示主机列表，唯一可选字段为非空 `hostId`。定义声明的必需能力与现有组件调用一致，均为 `ssh.hosts.list`。

## 产物与改动

- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/widgets
- 分支 — `impl/huhu-issues-3-10-widgets`
- 基线 — `0cda9b407f15dffc2d4fcb20fdd7387ba12485ad`
- 本地提交 — `15403bd772d65ae486688ffca821b271dde50605`。七个文件，工作树干净。远端写入为零。
- 复用 Huhu 的 ContributionRegistry、PluginManifest、Zod 和 SSH 卡片。核对了 `temp/sources/homarr/packages/widgets/src/definition.ts` 的定义与加载器边界。依赖与上游源码引入为零。 [契约](D:/Document/code/huhu/temp/issue-worktrees/widgets/packages/contracts/src/home.ts:77) · [注册与目录投影](D:/Document/code/huhu/temp/issue-worktrees/widgets/packages/workbench/src/contributions.ts:105) · [SSH 共享描述](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/src/shared/home-widget.ts) · [原 Renderer 注册入口](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/src/ui/index.tsx) · [清单](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/huhu-plugin.json)
- 规格与规范两轴复核覆盖此切片。实际变更位于共享契约、贡献注册及 SSH 允许范围，布局存储和 Engine 装配由 Lead 按下节接入。原型指纹 `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342` 匹配，目录抽屉、视觉、交互与文案依原型确认记录待反馈。 [Issue #10](https://github.com/NAMEWTA/huhu/issues/10) · [原型确认记录](D:/Document/code/huhu/temp/issue-worktrees/widgets/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/prototype-review.md)

## 验证

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 实际描述和清单、Renderer 对齐 | 加载 SSH 清单、共享入口和桌面实际使用的 `sshUi` 注册入口。确保 Renderer 目录引用同一描述与原组件。验证描述的 JSON 往返、尺寸约束、配置默认值、实例上限及能力字段。 | [Vitest 用例](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/test/home-widget.test.ts) |
| 漂移、重名、外部组件 | 测试清单漏报、多报、重名，定义归属不符、定义重名、缺来源、Renderer 标题漂移，外部来源、批内与跨批重复。拒绝的批次没有新增模块。重注册后旧注销句柄无法删除新项。 | [Vitest 用例](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/test/home-widget.test.ts) |
| 启用与授权下降 | 在注册表实际入口验证启动未知、启用、停用、恢复、必需能力撤权、仅获无关能力、kernel 可选能力撤权。用 Vite 打包同一 SSH 入口和注册表，以隔离空页面在 Edge 157.0.4341.60 与 Electron 44.9.1 / Chromium 152.0.7977.167 重跑启用及授权投影。两端无需 preload，核对组件身份和授权位。 | [Vitest 用例](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/test/home-widget.test.ts) · [临时双运行时探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t3b-widget-runtime.cjs) |
| 回归与类型 | Vitest 4 文件、28 项通过，其中 Widget 7 项。三个 vendor 的声明构建以及 Contracts、Workbench、SSH、Engine、Desktop 的类型检查通过。改动文件的 oxfmt、oxlint 和 `git diff --cached --check` 通过。使用 pnpm 12.10.1 的 frozen install，锁文件与基线一致。 | 见下方重跑命令 |

单元测试使用合成 ID 和授权位。双运行时探针使用本机临时应用数据目录。各项验证均在注册与投影层执行。真实 Vault、SSH 连接、凭据与 Agent 历史隔离于本次验证。

```powershell
node node_modules/vitest/vitest.mjs run plugins/ssh/test/home-widget.test.ts packages/contracts/test/sample.test.ts packages/workbench/test/ui-store.test.ts apps/desktop/test/settings-pages.test.ts
pnpm --filter './vendor/*' run build:types
pnpm --filter @huhu/contracts --filter @huhu/workbench --filter @huhu/plugin-ssh --filter @huhu/engine --filter @huhu/desktop -r --parallel run typecheck
```

双运行时探针在 Widget worktree 运行，环境变量 `WIDGET_QA_ELECTRON` 指向集成 worktree 的 `apps/desktop/node_modules/electron/dist/electron.exe`。Vite 对既有 React 依赖的 `use client` 标记给出警告，探针通过。

## 阻碍与接续

切片已完成。Lead 可在 Engine 静态导入 `sshHostsWidget`、`sshHostsWidgetConfigSchema`，结合已解析的内置 SSH manifest 调用 `assertHomeWidgetDefinitions`。使用实际插件状态及 #6 共同授权结果调用 `projectHomeWidget`。保存配置时复用同一 SSH Zod 解析器，并按定义检查尺寸和实例数。

Renderer 装配在 Vault 或授权快照变化时刷新 `getHomeWidgetCatalog`，使用可用条目和逐能力授权位处理挂载与动作。旧首页的 `getSnapshot().homeWidgets` 沿用既有启用过滤。正式目录、实际授权信号接入、逐实例 hostId 查询及 ACC-DASH-05／17 的产品入口联验由后续切片验收。现有 SSH 组件在本切片仍显示主机列表，按实例选择单台主机归 W05-07。

### Modern Web Guidance

实现前搜索了 `validate untrusted JSON data` 与 `deep clone plain data`，并读取 `js`、`security` 的完整指南。本切片的校验、复制和注册由项目现有 Zod 与贡献注册表提供。

## Lead 验收

由 Lead 核验后追加。
