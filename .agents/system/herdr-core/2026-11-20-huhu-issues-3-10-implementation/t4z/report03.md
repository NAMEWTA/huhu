# #10 W03-01 Widget 贡献所有权独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t4z
- task — task03.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report03.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t4z`，清单指向 `task03.md active`。
- 执行结果 — done（复核完成，建议合入）

## 结论

| 审查轴 | 签收建议 |
| --- | --- |
| 规格 | **通过，建议合入 `7e9ceda` 的 W03-01 注册契约。** 上轮两个漂移反例均已修复。清单、共享配置、实际组件、注册失效、启停和撤权经 Windows 双运行时及定向测试验证。 |
| 规范 | **通过。** 工厂取得独立的 JSON 数据，递归冻结后登记对象身份。Workbench 验证并发布同一贡献快照。复用现有 Registry、PluginManifest、Zod 与原 SSH 组件。 |

## 规格轴

- **上轮反例已修复。** 使用同一打包夹具在父提交和候选分别运行。父提交在 Edge 和 Electron 都接收普通结构副本，外部把默认宽度改到 4 后目录也显示 4。手写 Schema 同样被接收。实际 SSH 嵌套的 `hostId.minLength` 可从 1 改到 2，Zod 仍接受 `a`。候选在两个运行时均拒绝普通副本和手写 Schema，拒绝后注册快照为空。对实际嵌套字段的 `Reflect.set()` 返回 `false`，目录仍显示 1。相同解析器接受 `a`、拒绝空字符串。 [上轮报告](report01.md) · [父提交复现](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/parent-runtime.log) · [候选复跑](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/candidate-runtime.log)
- **静态来源和注册失效通过。** 桌面静态导入 SSH 的真实贡献。清单局部 ID `hosts`、共享 Widget 类型 `widget:ssh:hosts`、实际 `SshHomeWidget` 及必需能力 `ssh.hosts.list` 一致。定向测试验证漏报、多报、重复、归属或标题不符、缺来源及外部来源均拒绝。注册之前捕获贡献外层，定义 getter 只影响捕获时的值，发布和注销始终使用同一快照。批内与跨批重复均拒绝。移除后可重注册，原注销句柄不会删除新条目。取得的默认配置独立于调用者输入，并冻结嵌套对象和数组。 [候选测试](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/candidate-vitest.log)
- **可用性投影和真实卡片通过。** 两套运行时均保持同一个工厂定义与 SSH 组件对象，分别验证未知、启用、撤权、停用、重新启用及无 preload 的情况。使用合成授权和 HTTP／WS 回包，在 Edge 与 Electron 的隔离页面通过真实 `EngineProvider` 渲染实际 `SshHomeWidget`。两端都发出 `ssh.hosts.list`，显示合成主机，点击主机触发 `ssh` 导航，权限撤回和插件停用后主机行从 DOM 移除。测试中的宿主主动重算投影，正式权限事件接线由 W06 验收。 [真实组件验证](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/rendered-ui-vite8.log) · [夹具](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/widget-ui-desktop-vite.cjs)

## 规范轴

- `7e9ceda:packages/contracts/src/home.ts:118–164` 从同一次取得的 Zod 对象生成输入 JSON Schema，校验经过 Zod 解析的默认配置，并递归冻结 Schema 与默认配置。私有 WeakSet 在同一个 Contracts 模块实例中记录可信对象。序列化后的描述继续通过纯数据 schema 且可用作投影数据，可信注册要求当前进程及模块实例的工厂产物。W06 的两个宿主都应静态导入各自运行时的定义，维持单个 Contracts 模块实例。当前 Edge 与 Electron 的打包解析均已实际核对。 [候选复跑](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/candidate-runtime.log)
- `7e9ceda:packages/workbench/src/contributions.ts:105–145` 在读贡献字段以前捕获并冻结外层，核对可信来源、声明集合和工厂身份后一次发布。信任来自宿主的静态导入，`origin` 是对该来源的检查字段。外部清单及远程 JSON 应继续留在数据路径。差异共三文件，沿用已有依赖，Git 差异检查通过。 [返工实现报告](../t6s/report01.md)

## W02-02、#6 与 W06 装配边界

- 以 `922df3626f87a8d6674f4ccd15b2513eeee74177` 的真实 Dispatcher、整板写 handler 和独立测试 Vault，注入候选 SSH 定义的 `minSize`、`maxSize`、`maxInstances` 及同源 `sshHostsWidgetConfigSchema`。实际保存并读回单字符 `hostId`。空 ID、额外字段和越界尺寸得到 `INVALID_INPUT`，文件逐字节一致。测试移除该类型规则后，新增实例拒绝，旧实例的原样配置仍可保存。目录的 JSON Schema 提供展示和表单数据，写者按运行期 Zod 规则验收。两边都修改 `packages/contracts/src/home.ts`，只读合并预览未出现冲突标记，合入时需保留 Widget 契约与整板更新 DTO。 [整板写探针输出](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/dashboard-probe.log) · [夹具](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/dashboard-probe.mjs)
- #6 集成在 `79f95f9` 的管理目录 `capabilities.list` 可列入停用能力，`selected` 表示对外开放选择。W06 应从真实 Vault 的插件状态以及经身份过滤的 `Dispatcher.discover(caller)` 或同一授权判定取得可用能力。W02-02 当前使用宿主提供的规则 Map，handler 本身尚未读取调用者的 Widget 授权。W06 需把同一状态接入新增、配置变更及执行路径，同时保留已有停用／缺失实例的原配置。真实授权和撤权、正式首页搜索分类、空态、安装版联验仍属 W06。 [W06 验收任务](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W06-01-home-cutover.md)

## 产物与验证

- 父提交 `15403bd772d65ae486688ffca821b271dde50605`，候选 `7e9cedaa663f06668f080705dace90fc492fef70`。以 Git 对象确认直接父子关系，并独立归档 Widget 双版本及 W02-02 的相关文件。复用集成检出的同锁依赖，三个归档的锁文件归一化 SHA-256 都为 `422f807cc8c10b738b68039e8759bb11b0a08ddadbe2d41aece9c146a71ad534`。所有输入均为合成资料，业务与用户现有改动全程只读。 [环境记录](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/setup.json) · [归档脚本](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/prepare-archives.cjs)
- Windows build 26300、Node 24.21.0、Vitest 3.2.7。独立复跑 3 文件 25 项通过，其中 12 项为 Widget。Edge 157.0.4341.60 与 Electron 44.9.1／Chromium 152.0.7977.167 均通过候选隔离投影和真实卡片渲染。渲染夹具首跑误选依赖目录中的通用 Vite，构建因现有 Node `randomInt` 的浏览器外置检查失败。改用桌面锁定 Vite 8.3.7 和现有 Provider 直接入口后，双端复跑通过。 [Vitest](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/candidate-vitest.log) · [渲染首跑](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/rendered-ui.log) · [渲染复跑](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/rendered-ui-vite8.log)
- 复核了六份原型资源，指纹匹配 `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342`。原型确认记录仍标记 HTML 待用户确认。本轮实际 UI 覆盖为现有 SSH 卡片的隔离显示、导航和移除，产品抽屉、整站走查以及安装包仍待 W06。 [指纹输出](D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E/prototype-fingerprint.log) · [原型确认记录](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/prototype-review.md)

## 阻碍与接续

冻结注册契约复核无阻碍，建议合入。生产接线按 W06 和 #6 的权限合同推进。定向证据保存在 `D:/Document/code/huhu/temp/issue-baseline/t4z-w03-7e9ceda-HPV38E`。

### Modern Web Guidance

我检索并读取 `js` 与 `security`，对照结构复制与服务端独立授权的规则复核所有权。重放夹具用 `structuredClone()` 构造保留嵌套形状的普通对象，验证它在两个运行时都无法作为可信注册定义。业务源码保持只读。

## Lead 验收

Lead 接收两端真实卡片和整板存储探针。批准按序合入 `15403bd` 与 `7e9ceda`，之后核对整合编译及配置 Schema。

由 Lead 核验后追加。
