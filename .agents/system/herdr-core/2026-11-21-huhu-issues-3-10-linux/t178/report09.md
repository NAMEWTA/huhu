# t178 / task09 能力目录性能定位

Lead t3p，integration，固定应用构建 `da645ee8`。**14.18 MB 目录的主要体积来自 SSH 工作区布局 schema 的重复展开。** 本地直接转换 383 个 Engine 静态描述符得到 14.085 MB，其中 7 个 SSH 工作区条目的输入／输出 schema 占 13.396 MB。工作台首页及两个卡片只消费能力名。建议先给它们增加显式的名字投影，并每次沿用当前授权筛选。完整目录保留原契约。[应用网络附件](plugin-network-artifacts-da645ee8/plugin-perf-network.json) · [只读微测脚本](measure-plugin-catalog-schema.ts)

## 固定应用实测

Lead 的 t183 单轮为冷启 1,845 ms、停用 38 ms、启用 279 ms、RSS 341 MiB。同一构建 t180 单轮曾测到启用 472 ms，后一轮低于 300 ms 限值，现有样本不足以估计复现频率。t183 的网络数据可细分如下。

| 请求 | 浏览器计时起点到发送（ms） | 发送到首字节（ms） | 首字节到结束（ms） | 结果 |
| --- | ---: | ---: | ---: | --- |
| 首次能力发现 GET | 11.157 | 295.829 | 73.503 | 200，14,184,843 B |
| 停用 POST | 0.379 | 3.938 | 1.968 | 200，57 B |
| 停用触发的能力发现 GET | 0.580 | 231.561 | 53.314 | 已见 200 响应头，随后取消 |
| 启用 POST | 220.045 | 16.866 | 2.318 | 200，55 B |

启用请求的发送前区间约占该轮端到端 279 ms 的 79%。用附件内的 Chromium `startTime` 加阶段偏移，启用发送约在停用后发现 GET 首字节之后 5.3 ms、该 GET 结束之前 48.1 ms。停用后的 `plugins.list`、`home.summary` 和 `home.notes.recent` 的首字节也集中在这个区间附近。这支持优先消除同步大目录工作，再复测启用。网络附件无法区分发送前等待的具体机制或 GET 的 Engine CPU、压缩和浏览器调度相对份额。t180 的 472 ms 样本没有这个网络分段。[网络附件](plugin-network-artifacts-da645ee8/plugin-perf-network.json) · [t180 定位](t178-report07.md)

## 体积来源与生成成本

`WorkspaceLayout` 的自定义分支通过 `treeSchema(12)` 构造有界树。同一层的 `first` 和 `second` 共用下一级 Zod 对象，当前 `toJsonSchema` 的默认导出逐处内联。仅这一输入 schema 为 1,114,066 B。运行和模板 DTO 多次复用它，`runs.start`、`runs.changeLayout` 的输入各包含两个布局分支，两个输入各约 2.23 MB，输出各约 1.12 MB。其余大头为 `templates.save`、`runs.reconnect`、`runs.list`、`runs.saveTemplate`、`templates.list`。七项占脚本目录的 95.1%，足以解释应用的大部分传输量。[布局树](../../plugins/ssh/src/shared/workspace.ts#L9) · [工作区能力](../../plugins/ssh/src/engine/capabilities.ts#L584) · [变更布局输入](../../plugins/ssh/src/engine/workspace-pane-capability.ts#L8) · [转换器](../../packages/contracts/src/capability.ts#L110)

Node 24.21.0、仓库锁定的 Zod 4.6.7，未启动 Vault、HTTP 或 Electron。脚本将 383 个静态插件描述符投影为 14,085,027 B。应用响应还包含运行期注册的 Kernel 条目和意图元数据，并按调用身份筛选。热轮原生成与以 schema 对象身份和 input/output 分别记忆化的版本交错各五次。时间为中位数及范围。

| 路径 | 目录大小 | 构造／导出（ms） | JSON stringify（ms） | JSON parse（ms） |
| --- | ---: | ---: | ---: | ---: |
| 原始转换 | 14,085,027 B | 172.10（152.85–183.74） | 86.23（82.95–93.40） | 78.56（71.25–89.09） |
| 缓存转换结果 | 14,085,027 B | 0.23（0.20–0.36） | 90.25（86.64–99.61） | 71.66（67.84–80.78） |

脚本检查冷热转换后完整 JSON 一致。只投影 `{name}` 的静态列表为 12,171 B。另一轮实验使用 Zod `reused: "ref"`，单个布局从 1,114,066 B 变为 4,900 B，目录为 718,409 B。它改变公共 schema 的表示，兼容性与消费者尚未验证。本轮建议先做名字投影，缓存方案单独衡量原样全量输出仍有的开销。[脚本](measure-plugin-catalog-schema.ts)

```sh
/home/wta/.volta/tools/image/node/24.21.0/bin/node --import ./node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/loader.mjs temp/final-audit/measure-plugin-catalog-schema.ts
```

## 调用方与最小改动

- 工作台的 `EngineClient.capabilities` 已返回 `{ name: string }[]` 类型。 `useDiscoveredCapabilities` 下游只有首页的卡片门控、任务卡的 `tasks.setStatus` 检查和自动化卡的 `automations.runs.list` 检查，三处均只看能力名。工具开放设置用独立的管理能力 `capabilities.list`。CLI 的 stdio MCP 与 Engine 的 HTTP MCP 则消费完整能力描述，包含输入、输出 schema 和意图元数据。[客户端](../../packages/workbench/src/engine-client/client.ts#L45) · [首页](../../packages/workbench/src/home/HomeModule.tsx#L27) · [任务卡](../../plugins/tasks/src/ui/HomeWidget.tsx#L24) · [自动化卡](../../plugins/automations/src/ui/AutomationHomeWidget.tsx#L8) · [管理目录](../../packages/workbench/src/gateway/GatewayModule.tsx#L50) · [MCP 消费](../../packages/kernel/src/mcp.ts#L77)
- 在共享 `registerCapabilityHttp` 的 `GET /api/v1/capabilities` 增加工作台显式参数 `?view=names`。仍通过原有认证、会话 signal 检查、`Cache-Control: no-store` 和每次执行的 `dispatcher.discover(caller)`，随后只 `map(({ name }) => ({ name }))`，跳过 schema 导出。默认 GET、管理目录和 MCP 保留完整字段。建议客户端加可选 view 参数，`useDiscoveredCapabilities` 明确选 names 并沿用现有 TanStack 查询键、取消信号和插件即时失效。这样保留已有同调用默认行为和权限刷新顺序。[HTTP 与会话入口](../../packages/kernel/src/server/capability-http.ts#L106) · [Web 会话认证](../../packages/kernel/src/server/web-share.ts#L35) · [实时允许列表](../../packages/kernel/src/dispatcher.ts#L71) · [查询键与调用](../../packages/workbench/src/engine-client/react.tsx#L102) · [即时失效](../../packages/workbench/src/engine-client/query.ts#L121)
- 复用已存在的静态描述符身份与 TanStack 目录查询缓存，不新增按身份或 TTL 缓存的授权结果。若完整目录仍慢，再考虑按不变 Zod schema 身份与方向缓存**转换结果**。现有 `descriptorSnapshots`、`descriptorBindings` 已用 WeakMap 固定描述符身份，注册及重新启用继续使用同一 schema 对象。未发现现行跨请求的 JSON Schema 输出缓存。实时 plugin 状态、handler、权限、会话撤销和 intent flags 仍每次核对。避免先全局切为 `$ref` 或引入整目录响应缓存。[描述符固定与绑定](../../packages/kernel/src/capabilities/define.ts#L57) · [目录投影](../../packages/kernel/src/server/capability-http.ts#L23)
- 验收时比较同一身份 names 响应与完整响应名称的精确一致性，覆盖插件停用／启用、Web 会话撤销、desktop-only 排除和 MCP 完整契约。更新按 URL 拦截的工作台夹具识别投影参数。Lead 在同负载复测 GET 字节数与首字节、启用 POST 发送前区间及端到端 300 ms 门槛，按多轮数据判断是否还需定位浏览器队列。[现有目录生命周期测试](../../apps/engine/test/capability-catalog.test.ts) · [现有 Web 目录夹具](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L353)

本轮读取固定构建证据和源码并完成纯本地 schema 微测。候选投影尚未实现，也未验证它对真实电子桌面计时的影响。未运行 E2E、构建、Vitest 或全仓检查。
