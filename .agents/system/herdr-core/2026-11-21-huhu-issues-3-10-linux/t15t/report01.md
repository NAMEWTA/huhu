# t15t/task01 报告

Lead 为 `t3p`。已核对 Linux 主题、manifest 与 `HC_TERMINAL_ID=t15t`，工作树为 `integration`，分支 `impl/huhu-acceptance-followup`，基线 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。实施前定位见 `t15t-position01.md`。以下差异仅统计本任务文件。

## Agent 变更审查

候选失败日志第 300–319 行和两个同源 trace 显示 Git 差异、加意见、预览、确认均已到达，意见最后仍为待发送。输入路径可复现该现象。终端 WebSocket 持有 `manual`，旧 `sendComments` 尝试另取 `review`，在调用 Core 前得到 `INVALID_INPUT`。新增单测在基线复现 `HuhuError: 该会话的输入权当前已被占用`。详见 `t15t-review-red.log`。

- `plugins/agent-cli/src/engine/input-ownership.ts`、`terminal-bridge.ts`、`sessions.ts`、`capabilities.ts`、`index.ts`（合计 +56/−15）复用现有终端控制握手。Engine 向获权 WebSocket 发送会话内的临时控制证明。工作台确认时提供当前证明，Engine 在 `InputOwnership` 同步核实后取得这一轮审查的写入资格。Herdr Core 自有队列串行处理控制视图键盘与审查提交。派遣占用继续排他，其他视图、过期证明和外部工具的证明字段无法取得该资格。发送中若断开，仲裁等原发送结束再通知后续视图接管。未决回执恢复连接可明确重交选中的未知意见，该连接在核实完成前保持只读，随后通过现有 `control-free` 重新接管。现有无视图直接调用在没有输入持有者时沿用原能力路径。
- `packages/ui/src/components/TerminalView.tsx`（+19/−2）在现有连接生命周期发布和撤回控制证明。`AgentCliModule.tsx`、`WorkspaceCanvas.tsx`、`ReviewPanel.tsx`、`i18n.ts`（合计 +51/−19）按 pane 或预览视图保留证明，确认与明确重交时提交。观察视图的发送控件为禁用态，附控制权说明。
- `plugins/agent-cli/test/sessions.test.ts`（+99）核对正确证明、错误或脱离的证明、无证明、Tasks 派遣独占、断开和恢复流。`tests/e2e/shell.spec.ts` 的 ACC-AG-10 多核对真实视图的发送可用，终端收到正文和标记已发送的原断言保留。

## Safe 网关批量预览

候选失败日志第 372–390 行与快照显示 Safe 选项已选中，页面仍显示先前的 `tasks.create` 保存版本 2。`ToolPolicyCatalog.save` 先关闭对话框，再等策略和目录查询刷新。期间批量按钮可点击，`showPreview` 对 `busy` 直接返回。`safe.entries.list` 仍是可批量开放项，`safe.accounts.reveal` 仍按单项开放。

`packages/workbench/src/gateway/ToolPolicyCatalog.tsx`（+3/−3）在忙碌期间禁用批量范围内的操作与逐项开关，并在原状态区显示正在处理。目录刷新完成后原操作恢复可用。保留批量目标、敏感项排除及取消、逐项开放的原 E2E 断言。

## W05–W06 任务卡及 Agent 设置

`tests/e2e/workflows/acceptance.spec.ts`（+30/−17）包含两处夹具修正。

- 任务卡候选第 403–426 行只在撤权后失败，冲突提示、重读、二次提交、筛选、时区及布局断言均已通过。失败快照里卡片标题存在，插件总数为 0，两卡显示正在读取卡片目录。冲突拦截原本继续包住重载后所有引擎 POST。现在在首次冲突断言后撤下，第二次写入直达引擎。撤权仅改写真实且认证成功的发现 GET，其他方法直通，保留响应的来源头并重建正文长度。用例核对目标能力原本存在、读路径仍可用及西侧任务的完成按钮禁用。原故障是重载阶段夹具干扰的判断仍需同一 E2E 复核。
- Agent 设置候选第 438–458 行在保存模型后的第二次点击失败。首轮探测约 3.38 秒且版本出现，第二轮原 5 秒内只见位置快照。模型保存先清空探测版本并重读位置，显式探测等待所有启用的 CLI，各探测上限为 5 秒。本机 PATH 具备额外 Codex/Pi，旧夹具只替换 Claude。现在预置测试 Vault 中的 Agent 设置，仅启用被测的假 Claude，第二次写入唯一新版本 `2.1.1`。保留首轮版本、模型预览、落盘及重启确认断言和各自阈值。当前证据支持宿主探测拖慢的判断，trace 没有逐 provider 耗时。

## 自动化运行结果

候选第 335–356 行显示 Run 已完成，正文容器从等待任务时间线投递变成空。运行摘要和任务详情分开查询，回执 `replay` 在原任务写评论后发布投递事件，正文再由惰性加载的 Markdown 阅读器渲染。两组 trace 只含 Playwright `test.trace`，缺少响应和组件加载数据，无法区分任务读取和首载渲染。

按 Lead 指示仅在 `tests/e2e/shell.spec.ts` 保留失败诊断（整文件合计 +28/−1，与 ACC-AG-10 改动共计）。若正文断言超时，附件“自动化运行结果读取”提供 `tasks.dispatch.recent` 的任务、运行和投递状态，`tasks.read` 结果评论归属以及 Markdown 容器是否出现。记录限定为运行和任务标识、状态、时间及计数。正文断言、超时、唯一评论、会话定位与单次 provider 调用断言均保留。仍需 Lead 复跑单例采集确定根因。

## 验证与待验

- 定向单文件 `pnpm exec vitest run plugins/agent-cli/test/sessions.test.ts -t '变更审查意见'` 使用 Node 24.21.0，基线聚焦复现失败，最终 11 通过、46 过滤。详见 `t15t-review-red.log` 和 `t15t-review-green.log`。
- `oxfmt` 覆盖本任务 14 个文件，`git diff --check` 通过。TypeScript `transpileModule` 解析 14 个 TS/TSX 文件通过，属于语法检查。
- 未运行验证为五条指定 Playwright E2E、共享撤权夹具的相邻 Agent 卡用例、真实 WebSocket 多视图和实际 Herdr Core 联调、构建、打包、全仓类型检查、全量测试、lint 与 knip。E2E 由 Lead 串行执行。重点是审查控制连接实际重接、网关保存后的批量预览、W05–W06 撤权后的插件目录及 Agent 二次探测。自动化单例目前只具备诊断。
- 工作树交付，Lead 读取同号报告。未修改 agent-linux、SSH、Mail、性能或 Vault 所属文件，未提交和推送。

## Modern Web Guidance

Lead 先执行 `search 'abort stale fetch results'` 和 `retrieve js`。我全文读取 396 行。本机缓存 CLI 再执行 `search 'manage WebSocket connection state'`、`search 'handle WebSocket close events'` 及 `list`，目录缺少匹配的 WebSocket 生命周期主题。重新 `retrieve js` 得到逐字节一致的指南。实现复用原生 WebSocket 的现有连接、模式事件和清理回调，以及原查询忙碌状态。
