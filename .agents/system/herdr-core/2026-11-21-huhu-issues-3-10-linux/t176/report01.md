# t176/task01 三处界面失败的只读诊断

Lead 为 `t3p`，当前任务指针为 `t176/task01.md`。诊断基于 integration 源码与桌面构建元数据共同指向的 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73`。从 `temp/final-audit/followup-failed-4a54f0a9.log` 和同名 artifacts 目录读取三组 error-context、`test.trace` 及自动化 JSON 附件。三条用例分别判断为产品结果呈现窗口过长、桌面能力发现拦截夹具失效、Agent 检测夹具缺少冷缓存隔离。与 `05a748b6` 比较，这些调用路径所在的 Tasks、Automations、Engine Boot 和 Home 业务文件无差异，当前证据不能把症状的首次引入归因于最后一组组合提交。

## 1. 自动化已完成后结果正文短时不可见

**定性。** 真实产品呈现缺口。原任务回执最终投递，运行详情在投递前等待约一轮扫描，投递后的首次正文渲染又存在无提示空窗。现有证据支持迟到，尚未观测到正文最终挂载，也未读取结果正文来核验载荷。

- 日志 257–282 行，`tests/e2e/shell.spec.ts:2808–2821` 已通过列表和详情的「已完成」。正文断言先读到「已保存原结果回执，正在核对任务时间线投递。」13 次，最后一次读到空字符串。
- Shell trace 的 `unxk@165` 在 190034.262 ms 开始、195045.399 ms 结束。附件 `attachments/95a0abade6d5e5dae9897f61be1e3dd0042b9348` 对同一 run 依次记录 21858.644 ms 的 `pending`、22320.564 ms 的 `tasks.read` 无结果、26807.076 ms 的 `delivered`，以及 26810.320 和 26825.070 ms 的两次 `tasks.read` 都带匹配 runId。pending 到 delivered 约 4.95 s，带结果的读取发生在正文断言启动约 4.47 s 后。测试与附件计时以各自时基计算，关联依据是 trace 的 `unxk@166–169` 四次 response body 调用。失败捕获时 `resultViews=1, readers=2`。reader 计数查的是 `.ok-root, [data-ok-editor]`，同一个 reader 的两层包装均会匹配，无法据此断定 Tiptap 正文已挂载。结果评论的 body、会话匹配、会话打开和单次 provider 请求检查位于失败断言之后。
- 产品路径从 `plugins/tasks/src/engine/index.ts:466–470` 接收回执。它发布 run 更新，未安排即时投递。`plugins/tasks/src/engine/dispatch.ts:198–205` 在任务写锁内消费回执，`plugins/tasks/src/engine/receipt-inbox.ts:99–129,168–179` 先写 pending 并读回 ACK，终态投影直接由回执给出。`plugins/tasks/src/engine/index.ts:570–575` 的默认 5 s 定时器进入 `dispatch.ts:750–755`，在 `receipt-inbox.ts:209–238` 写入带原 run、session 和 body 的评论，再更新投递状态。`plugins/tasks/src/engine/service.ts:378–385` 按消息 ID 去重并发布任务事件。工作台按 run 与 task 事件使 `tasks.*` 查询失效，见 `packages/workbench/src/engine-client/query.ts:7–9,27–49`。
- `plugins/automations/src/ui/RunsPanel.tsx:30–39,75–86,107` 分开订阅运行摘要和原任务。`plugins/tasks/src/ui/TaskDispatchPanel.tsx:60–61,241–245,273–279` 在 pending 时已显示 run 完成，正文只来自匹配评论，且进入 delivered 时立即清掉投递提示。`plugins/tasks/src/ui/compact.tsx:5–14` 懒加载完整阅读器，Suspense fallback 为空。`packages/editor/src/rich/compact.tsx:64–69` 与 `packages/editor/src/rich/RichMarkdownEditor.tsx:568–584,605–617` 说明外层 DOM 与 Tiptap 正文分别就绪。两次 API 已刷新和故障尾部出现空容器，支持检查这个冷读窗口。trace 无评论原文、浏览器 DOM 时间线和控制台，不能进一步断定内层加载、解析或正文错误。

**最小修复建议。** 完成 terminal receipt 持久化后，触发现有 `TaskDispatch.check` 投递链，确保扫描已在运行时仍能合并一次后续唤醒。保留 `check` 的串行约束、恢复定时器和既有评论 ID 去重，在释放任务锁后唤醒。回执 ACK 继续基于持久回读。相邻的界面缺口可以在 `TaskRunDetails` 已完成且仍等匹配评论时保留可见状态，并给本处 reader 增加可见加载态。若复验显示首读仍承担明显的编辑器等待，已有 `packages/editor/src/reading/index.tsx:69–75` 提供同步纯段落阅读和原 Markdown 解析器回退，`paragraphs.ts:1–9` 的分类覆盖本例中文纯文本。可在此结果阅读入口复用，同时验证带链接、列表和代码块的复杂结果。

**复验。** 先在 `plugins/tasks/test/persistence-http.test.ts` 的真实 Engine 入口触发终态收件，用受控的长扫描间隔或检查门闩证明不用等定时器就可得到 delivered 和唯一原任务评论，覆盖检查进行中到件、ACK 截断重试、重开、目标消失和 no_update。现有中断测试在 600–655 行。然后由 Lead 在同一个重新构建的桌面版本串行执行原 `shell.spec.ts:2705` 用例，保留「已完成」、5 s 正文断言、唯一评论及原 run/session、真实原会话分栏、provider 单次请求。至少保留一次冷开 drawer 的证据。若再次失败，在现有诊断附件增加结果正文是否等于合成值和 reader/正文分别出现的时间。

## 2. W05/W06 撤回写能力后西侧任务按钮缺失

**定性。** 已定位到桌面响应拦截夹具。权限目录在断言时仍等待，产品尚未收到可据以区分读写的目录。此次失败没有观察到正常目录返回后任务行消失，也未独立证明真实权限撤回成功。

- `tests/e2e/workflows/acceptance.spec.ts:87–143` 的跨时区筛选、另一卡独立、版本冲突后的重读和重试、原文件保全及迁移后实例/布局均通过。日志 294–315 行在 145–147 行撤回和重载后失败。error-context 显示引擎就绪和 10 个插件，两张卡连同保存后的标题都在，卡内为「正在检查卡片权限…」。
- Trace 中 222228.4 ms 开始按钮断言。真实能力 GET 在 222644.879 ms 返回，`ehvo@237` 和 `ehvo@239` 均通过，分别证明认证 GET 成功且原目录含 `tasks.setStatus`。`ehvo@240` 的 `route.fulfill` 从 222957.163 ms 到 230659.310 ms，约 7.70 s，期间原断言在 227237.912 ms 先超时，随后进入 unroute 清理。该 ZIP 仅含测试动作和 error-context，无法定位 CDP 命令长时间在途的内部原因，也不能从 fulfill 返回推断 renderer 最终拿到 JSON。
- `acceptance.spec.ts:29–42` 在授权 GET 上通过 Playwright 另取真实响应，再换正文并 fulfill。已显式清除长度、编码和分块头。安装的 Playwright 1.65.0 在 `coreBundle.js:61741–61790` 使用显式 headers 并重算长度，`38256–38268` 最终等待 CDP `Fetch.fulfillRequest`。Engine 的真实 CORS、身份和目录路径见 `packages/kernel/src/server/http-app.ts:66–96` 与 `capability-http.ts:106–110`。证据不足以把等待细化成 CORS、正文长度或 Engine 权限错误。
- 在真实 UI，`packages/workbench/src/engine-client/client.ts:45–50` 和 `react.tsx:81–84` 读取认证目录。`packages/workbench/src/home/HomeModule.tsx:28–31,47–69` 在目录 pending 时不挂载卡片内容。任务卡定义只有 `tasks.list` 为 required，`tasks.setStatus` 为 optional，见 `plugins/tasks/src/shared/home-widget.ts:15–18`。`plugins/tasks/src/ui/HomeWidget.tsx:21–29,74–95` 据此只禁用完成，由独立的打开按钮定位原任务。这解释了为什么页面显示权限加载，且西侧任务的整个行和按钮都不存在。

**最小修复建议。** 调整共享的桌面 `hideCapability` 夹具。在重载前用 `page.addInitScript` 安装仅匹配当前 Engine URL 和 GET 的 `fetch` 包装，先等待原生认证请求及浏览器成功解析的 JSON，再在这个响应的 JSON 结果过滤指定条目。沿用 `acceptance.spec.ts:351–359` 或 `tests/e2e/knowledge/session-flush.spec.ts:61–87` 的测试侧原生 fetch 包装方式。记录原目录含目标项、仍含任务读取项，以及过滤已交付给 renderer。正常业务读取和写入保留真实 Engine 路径。共享夹具还用于 Agent 入口读取能力撤回（`acceptance.spec.ts:289–293`），需一起核对。

**复验。** Lead 串行执行原 `acceptance.spec.ts:66` 和 `:256`，保留两卡、时区、版本冲突、迁移布局和原按钮断言。额外实际打开西侧任务并核对标题，确认禁用的完成按钮未发出状态写请求。原目录、过滤后目录和最终卡片状态须一一对应。对照已有同源浏览器用例 `tests/e2e/workflows/web-terminal-widgets.spec.ts:386–409`，它还核验禁用动作不发写及任务版本保持。

## 3. Agent 设置初次显示已有版本

**定性。** 夹具的冷缓存前提缺失。读取能力仍只读缓存。自动化插件可在进入设置前主动完成版本探测，界面按原逻辑显示已有版本。当前代码路径能解释失败，trace 未记录实际探针调用次数。

- 日志 327–352 行与 Agent error-context 在首次显式刷新前已显示假程序的 `2.1.0 (Claude Code) · PATH`。trace `zdmq@39–43` 从 Agent 功能、新终端菜单进入设置页，随后直接断言初始文本。失败行 `tests/e2e/workflows/acceptance.spec.ts:1534` 的初始「已检测」及后续 1536–1547 行刷新、落盘、重启确认中，只有初始检查到达。1518–1524 行的 fixture 预置可立即返回的 Claude 版本，关闭 Codex/Pi，保留默认启用的 Automations。
- `apps/engine/src/boot.ts:447–457` 应用 Automations 时即调用 `detector.detect()`，同一函数还用于扫描前更新，见 462–463 行及 `plugins/automations/src/engine/service.ts:315–316`。`plugins/agent-cli/src/engine/detect.ts:124–127,162–177` 的初始位置快照可被主动探测写入的版本缓存替换。`plugins/agent-cli/src/engine/index.ts:275–285` 的 `agent.catalog.detect` 只读现存缓存，显式刷新走另一个能力。`plugins/agent-cli/src/ui/AgentSettingsPage.tsx:34–35,110–116,226–245` 用 `det.version ?? "已检测"` 显示已安装的 provider。由此可见「初次读设置」与「缓存未被探测」是两个条件。实现契约见 `.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W5.2-W8-linux.md:8`。
- Git blame 显示 1534–1536 行的冷缓存断言由 `fa5d5c3ac` 引入，自动化启动主动探测早已存在，当前复用的 detector 接线为 `68070491`。该失败没有暴露由读取能力启动 CLI 的证据。

**最小修复建议。** 在该设置 E2E 的临时 Vault 启动前，沿用 `packages/kernel/src/exposure.ts:94–105` 的 `.huhu/plugins.json` 内置启停格式预置 `{ "builtin": { "automations": { "enabled": false } } }`。Engine 启动会读取该设置再启用插件，见 `apps/engine/src/boot.ts:517,535`。保留假 Claude 与其余 provider 隔离。可复用 `plugins/agent-cli/test/tool-exposure.test.ts:565–595` 的版本进程打点，证明经过菜单进入设置时仍无探针。保留初始「已检测」和先后两次显式刷新的版本断言。若另有产品决定要求启动时一律不运行 provider，单独验证 Automations 是否只需要可执行位置，并覆盖安装变更、配置变更和任务扫描。目前这条 UI 失败不足以触发该行为改变。

**复验。** Lead 串行执行原 `acceptance.spec.ts:1513`，检查进入设置时为「已检测 · PATH」且探针零次，显式刷新后为 2.1.0，保存 opus 后 agents.json 与命令预览一致，改夹具后再次刷新显示 2.1.1，重启按钮只打开确认并可取消。另用默认启用 Automations 的场景确认已有版本的显示可复现，便于核对上述因果判断。

## 未运行的验证

未启动任何测试、Electron/Playwright 或 Core 实例。未运行 Vitest、构建、打包、全仓类型检查、lint、knip 或全量门禁。报告中的复验步骤均待执行。本轮读取了 Lead 已完成检索的完整 Modern Web Guidance `js` 指南，建议沿用现有的异步查询、浏览器 fetch 和 Markdown 阅读入口。业务和测试源码保持原样。

Lead收取：已核对涉及收件能力、check串行控制及真实日志。报告复制由Lead执行，worker无需写工作树外目录。三项建议进入限定修复，UI最终通过尚待复验。
