# #10 W03-01 Widget 注册所有权返工

- 执行结果 — done，待 Lead 验收。
- 身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`。`HC_TERMINAL_ID=t6s`，清单指向 `task01.md active`。
- 任务 — [task01.md](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6s/task01.md)
- 报告 — [report01.md](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6s/report01.md)
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/widgets`，分支 `impl/huhu-issues-3-10-widgets`。
- 基线 — `15403bd772d65ae486688ffca821b271dde50605`。
- 本地候选 — `7e9cedaa663f06668f080705dace90fc492fef70`，三处文件，发布报告前工作树干净。

## 实现与复核

- **来源与所有权。** `defineHomeWidget` 从同一次取得的 Zod Schema 生成输入 JSON Schema，并校验即将发布的默认配置。Zod 解析给工厂独立的纯数据，工厂递归冻结其中的 Schema 和默认配置，之后才在模块私有 `WeakSet` 中记录定义身份。注册时核对宿主提供的来源、工厂身份、定义归属和清单集合。普通副本和手写 JSON Schema 都可以通过纯数据形状校验，但缺少与保存校验器同源的证据，因此在可信注册入口被拒绝。`WeakSet` 只标记本进程内由同一 Contracts 模块生成的对象，纯数据可以照常 JSON 往返。 [共享契约](D:/Document/code/huhu/temp/issue-worktrees/widgets/packages/contracts/src/home.ts:118)
- **注册快照。** Workbench 在读取归属与定义之前复制并冻结贡献外层，后续核对、目录发布和注销使用同一个快照。批次的 Widget 核对完成后才发布其他贡献。静态 SSH 组件和清单继续参与同样的注册，现有注销句柄的身份保护继续生效。 [注册入口](D:/Document/code/huhu/temp/issue-worktrees/widgets/packages/workbench/src/contributions.ts:105) · [SSH 静态入口](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/src/ui/index.tsx:10)
- **W02-02 接口。** 核对了 `922df3626f87a8d6674f4ccd15b2513eeee74177:packages/kernel/src/capabilities/home-dashboard.ts`。`defineDashboardUpdate` 按 `widgetType` 查规则，读取尺寸与实例数后调用 `rule.configSchema.safeParse`。Lead 可直接将共享的 `sshHostsWidgetConfigSchema` 放进该规则，目录描述也是从该对象生成。本切片实测该 Zod 接受单字符 `hostId`、拒绝空字符串，目录读回的 `minLength` 为 1。 [SSH 定义与解析器](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/src/shared/home-widget.ts:4)
- **规格轴。** 覆盖已复现的普通对象和嵌套漂移，同时证明拒绝批次的贡献快照为空、静态组件身份正确、Vault 插件启用与调用者授权按各自输入投影。现有漏报、多报、重名、归属不符、外部来源、启停、可选动作撤权及注销测试全部通过。依据为 Issue #10 的 ACC-DASH-17 与 W03-01 返工范围。 [Issue #10](https://github.com/NAMEWTA/huhu/issues/10) · [测试](D:/Document/code/huhu/temp/issue-worktrees/widgets/plugins/ssh/test/home-widget.test.ts:40)
- **规范轴。** 复用项目现有 ContributionRegistry、PluginManifest、Zod 与 SSH 实现，核对了本机 Homarr 的 `createWidgetDefinition` 边界。生产差异仅在 Widget 契约及 Workbench 注册，另含一份定向回归测试。合入时请在 `home.ts` 保留本候选的 Widget 段和 W02-02 自己的整板保存 DTO。整合后的 W06 目录界面、当前 Vault 与调用者的真实装配、整板提交是后续验收路径。 [设计](D:/Document/code/huhu/temp/issue-worktrees/widgets/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/design.md:12)

## Windows 验证

| 检查 | 基线 | 候选 |
| --- | --- | --- |
| Vitest 3.2.7 | 对 `15403bd` 加定向测试后，7 通过、5 失败。两个普通描述被接收、目录 Schema 可改、贡献 getter 被二次读取、嵌套默认值可改。 [红灯日志](evidence/vitest-red.log) · [基线测试补丁](evidence/red-tests.patch) | `7e9ceda` 上，4 文件 33 项通过，包含 12 项 Widget 回归。 [绿灯日志](evidence/vitest-green.log) |
| Edge `157.0.4341.60` 与 Electron `44.9.1` / Chromium `152.0.7977.167` | 两端都接收普通副本，改副本宽度后目录读为 4。两端都接收手写 Schema，并能将目录 `hostId.minLength` 改为 2，同时 Zod 仍接受 `a`。夹具退出码为 1。 [红灯日志](evidence/runtime-red.log) | 两端拒绝两种普通描述，嵌套写入返回 `false`，再次读取仍是 1。实际 SSH 组件仅在启用且获权时投影。停用、重新启用、撤权与无 preload 路径通过。夹具退出码为 0。 [绿灯日志](evidence/runtime-green.log) · [双运行时夹具](evidence/widget-runtime.cjs) |
| 类型和规范 | Windows 11 Pro x64 `10.0.26300`，Node `24.21.0` | 三个 vendor 的声明构建通过。Contracts、Workbench、SSH、Engine、Desktop 类型检查通过。三处改动的 oxfmt、oxlint 和提交差异检查通过。 [类型日志](evidence/typecheck.log) · [静态检查](evidence/static.log) |

运行夹具沿用 t3b 的隔离 Vite 页面，导入实际 SSH 静态注册入口、清单、组件和两份共享导出，通过真实 `ContributionRegistry` 执行投影。插件集合与授权集合均为合成输入。Electron 用独立临时 `userData`，验证到注册与投影层，真实 Vault、SSH 会话和凭据未参与。Vite 给出既有依赖的 `use client`、Node 内建模块浏览器外置及块大小提示。Vitest 给出既有 workspace 文件弃用提示。

锁定 pnpm `12.10.1` 的 frozen install 停在依赖链接，并产生了本 worktree 的包管理器条目差异。已结束并移除命令 pane `t6x`，撤回工具产生的锁文件差异。随后复用 integration 中同锁的隔离第三方依赖，workspace 链接指向待测源码。两处源锁 SHA-256 均为 `422f807cc8c10b738b68039e8759bb11b0a08ddadbe2d41aece9c146a71ad534`，git blob 均为 `e7c2876017054b1a8944cf954b2cec97981bfdc0`。 [安装输出](evidence/install.log) · [依赖链接脚本](evidence/link-deps.mjs) · [依赖核对](evidence/dependencies.log)

## 重跑命令

从 Widgets worktree 根运行。当前候选已有本机依赖链接。用基线重跑红灯时，在系统临时目录用 `git archive` 解包 `15403bd772d65ae486688ffca821b271dde50605`，切换到该解包目录，应用 `red-tests.patch`，再运行同锁链接脚本。基线 Vitest 只需指定 `plugins/ssh/test/home-widget.test.ts`。两轮使用相同的双运行时夹具。

```powershell
$evidence = 'D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6s/evidence'
$integration = 'D:/Document/code/huhu/temp/issue-worktrees/integration'
# 仅在新解包的基线目录执行下面两行
# git apply "$evidence/red-tests.patch"
# node "$evidence/link-deps.mjs" (Get-Location).Path $integration

node node_modules/vitest/vitest.mjs run plugins/ssh/test/home-widget.test.ts packages/contracts/test/sample.test.ts packages/workbench/test/ui-store.test.ts apps/desktop/test/settings-pages.test.ts --maxWorkers 1 --no-color
$env:WIDGET_QA_DEPS = $integration
$env:WIDGET_QA_ELECTRON = "$integration/apps/desktop/node_modules/electron/dist/electron.exe"
node "$evidence/widget-runtime.cjs"

foreach ($project in 'vendor/cosmokit','vendor/cordis','vendor/timer') {
  node node_modules/typescript/bin/tsc -p "$project/tsconfig.json"
}
foreach ($project in 'packages/contracts','packages/workbench','plugins/ssh','apps/engine','apps/desktop') {
  node node_modules/typescript/bin/tsc --noEmit -p "$project/tsconfig.json"
}
```

### Modern Web Guidance

- **`js`**：我在验证夹具中用 `structuredClone()` 构造保有嵌套数据形状的独立普通副本，并在指定版本的两端执行。运行时代码沿用 Zod 解析来取得独立数据，再冻结该数据。依据为指南的 “Use `structuredClone(value)` to deep-copy nested objects, arrays, and built-in platform types without round-tripping through a JSON string.”

## Lead 验收

由 Lead 核验后追加。
