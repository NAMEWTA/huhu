# #7 H3.2 跳板路由批量关联与启停

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4x`，本机 `wta-ubuntu` 默认 Core，已核对环境终端 ID、topic 和 manifest。
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report02.md`
- 执行结果 — `done`，待 Lead 接线和验收。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-batch-routes`，基线 `4198354dbd12ece0e4a65cf84209c45100d0c5c6`。四个已跟踪文件有差异，两份新增文件目前未跟踪。

## 产物

- `EditHostRoutes` 和 `HostRouteEditResult` 是 Lead 接线可直接导入的 Zod schema。前者接受 1–100 个不同的 `{hostId, expectedRevision}`，支持 `associate` 的 `skip|replace` 和布尔值 `setEnabled`。后者返回 `{updated, skipped}`，两个列表各自保持输入顺序。 [route-edits.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/route-edits.ts)
- `HostConfigurations.editRoutes(input, signal)` 在同一份 portable 定义快照中核对全部目标版本，包括将被跳过的条目。新关联默认启用，覆盖现有关系保留原启停状态，相同关系或状态列为跳过。启停要求每个所选目标已有直接跳板。提交前用 `routeForHost` 检查改动后的完整受管配置图，包括停用边。未知、旧式引用、自指和有环配置会拒绝整批。 [host-configurations.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/host-configurations.ts:195)
- `ModuleCredentials.editDefinitions` 只向规划器提供定义，为实际变更核对派生凭据目标等价，沿用同一 Vault/module 写入队列和整文件 CAS。新版本快照引用原有加密材料，已有 pin 继续供进行中的认证使用。对已核实在本机未绑定的条目保留未绑定状态。无法解释的快照缺失会拒绝整批，避免删除仍可能有效的本机材料。批量编辑路径未读取或重写凭据明文，普通目录刷新沿用已有认证状态查询。 [module-credentials.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/packages/kernel/src/credentials/module-credentials.ts:273)
- 独立路由页复用现有主机搜索、路由分组和单条编辑。逐行勾选捕获主机 ID 和当时版本，搜索隐藏已选项时仍展示数量与名称。可搜索批量跳板，禁用选项标明自身、环或不可用链等原因。显式点击提交，显示逐条结果并刷新。页面请求 `ssh.routes.edit`。 [RoutePanel.tsx](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/RoutePanel.tsx:152)

### Lead 接线

从 `plugins/ssh/src/engine/route-edits.ts` 导入两个 schema，绑定 `ssh.routes.edit` 至 `hosts.editRoutes(input, context.signal)`。按任务分工，描述符、Engine 注册、插件清单、工作台授权及 `ssh-host` 更新事件属于 Lead。批量成功时可按返回的 `updated` 发事件，`skipped` 对应无变更条目。

## 规格与上游

- 复核了 #7 原型六文件的确认指纹 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`，`routeView`、`routeDialog`、`routeHops` 展示独立页面、单条编辑、环校验与启停。多选和批量交互补在该页面，依据 H3.2 与 R01、R02、R06 的验收要求。 [H3.2](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H3.2-route-editor.md) · [原型确认](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md) · [R01–R06](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/source.md:151)
- Motty `v0.4.12` 解引用到 `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0。`internal/workbench/proxy_batch.go` 提供按选中 ID 操作、候选搜索与禁用原因的参考。`internal/workbench/proxy.go` 的 `batchAssociateProxies` 与 `toggleProxyByID` 支撑默认跳过、覆盖保留路由状态及启停语义。Huhu 使用自己的路由图、表单和整批发布实现。复用量为行为参考，零代码或资产复制。 [proxy_batch.go](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/proxy_batch.go) · [proxy.go](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/proxy.go) · [Apache-2.0](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE)

## 验证

Node `24.21.0`、pnpm `12.10.1` 下运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/route-edits.test.ts`，最终 7 项通过，耗时 1.51 秒。夹具是临时 Vault、合成地址与测试凭据后端。

| 验收场景 | 实际结果 |
| --- | --- |
| 多个变更与一个跳过 | 只观察到一次 portable 文件写入，跳过和未选主机保持原定义。覆盖保留原停用状态。 |
| 失败不提交 | 覆盖陈旧的跳过项、未知目标及跳板、旧式引用、三节点环、自指、直连启停、空与重复目标、超出 100 项及取消。断言未调用文件写入或字节保持原样。已有旧式引用可在同一批替换并恢复为有效图。 |
| 凭据及并发 | 锁定后批量关联成功，测试保护后端的读、建、删均未调用，解锁后原密码仍可认证。CAS 冲突回收暂存，两个实例用同一旧版本并发时仅一次成功，等待中的旧认证保有快照 pin。 |
| 只读和绑定不确定 | 只读 Vault 拒绝编辑。已知未在本机绑定的配置保留重配状态，无法确认的快照缺失保留原文件和密文。通用编辑拒绝改变派生认证目标。 |
| 启停路径 | 同一个解析器计算出停用时的直连路径、启用后的完整路径，停用仍保留配置边，旧路径对象保留原链。真实已有 Shell 的验证写入 E2E。 |

定向用例全部在 [route-edits.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/route-edits.test.ts)。六个变更文件的 oxlint、oxfmt 及 `git diff --check` 通过。SSH 插件 `tsc --noEmit` 只报告 `apps/engine/src/boot.ts:52` 缺少 `@huhu/herdr-client` 声明，退出码 2。

已编写用例「H3.2 路由页批量关联、覆盖与启停，旧 Shell 保留原连接路径」。它使用两台回环 SSH 夹具，覆盖筛选时保留勾选范围、禁用无效候选、关联的逐条结果、原连接和 Shell 保留、重连走直连以及重新启用后重走跳板。按任务约定留给 Lead 执行。 [remaining.spec.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/ssh/remaining.spec.ts:267)

## Modern Web Guidance

按版本 `2026_11_10-47b4c80e` 搜索 `select rows bulk actions`、`announce bulk action results` 与 `group checkbox form controls`，执行 `retrieve forms,accessibility` 和 `retrieve checkbox`。桌面依赖 Electron 44.9.1 对应 Chromium 152.0.7977.167，使用原生 `search`、复选框和表单控件，按 Web Baseline Widely available 核对。 [Electron 发布版本](https://releases.electronjs.org/release/v44.9.1) · [HTML search 规范](https://html.spec.whatwg.org/multipage/grouping-content.html#the-search-element) · [HTML fieldset 规范](https://html.spec.whatwg.org/multipage/form-elements.html#the-fieldset-element)

- **`forms`**　我按 “use `<fieldset>` and `<legend>` … to group related controls” 设置批量区域，勾选或改选跳板只更新表单，由明确按钮触发写入。
- **`accessibility`**　我用常驻状态区域宣布保存摘要，失败用警报，逐项结果为可浏览的列表。参考 “Standard … `polite` … ‘Saved’ status”。
- **`checkbox`**　我保留带明确标签的原生复选框及 Huhu 共享表单样式。参考 “each checkbox associated with its label”。

## 阻碍与接续

Core 的默认锁所在文件系统只读，`hc get t4x`、`hc get t3p` 和终稿发布后的 `hc send t3p` 均返回 `cannot open core lock`。回告消息未投递，终稿已在共享根发布。

## Lead 验收

Lead 已核对改动和源码，候选分支提交为 `abe8e331`，合入并接线为 `29c3fe32`。三个定向类型检查通过，批量路由 8 项、Module Credentials 18 项、能力目录 2 项通过。路由页 E2E 已核对用例收录，未实跑。工作台动作已进入静态能力目录，外部批量改动仍需能覆盖最初路由、拟改路由及受影响者的授权合同。
