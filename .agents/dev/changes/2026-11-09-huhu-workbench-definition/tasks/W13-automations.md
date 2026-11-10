# W13 自动化

## W13.1 规则、调度与界面

- 目标：规则的增删改、启停、排期配置、激活时间预览、内置默认规则；Croner 调度与错过激活宽限。
- 依据：[automations](../modules/automations.md) §3–4；ACC-AU-01、09。
- 前置：W04.3、W02.4。
- 位置：`plugins/automations/{huhu-plugin.json,src/engine/{rules,scheduler,activations,capabilities}.ts,src/ui/{AutomationsModule,RuleList,RuleDetail,RuleEditor,schedule/}}`、`packages/contracts/src/kinds/automation-rule.ts`、`packages/ui/src/components/cron-picker.tsx`。
- 复用：R-29、R-30。
- 实现要点：内置规则模板（新 Vault 与缺失时补建，不可删除，W04.1 中的临时常量移到这里）；新规则默认停用；每规则一个 `Cron(protect: true)`；`lastActivatedFor` 与宽限补激活；激活记录 ndjson；“接下来的激活时间”3 次。
- 异常：无效 cron 就地报错；时区不存在回退系统时区并提示。
- 测试：可控时钟集成测试（ACC-AU-09）；ACC-AU-01。
- 完成：两个 ACC 通过。

## W13.2 扫描预览与处理记录

- 目标：`automations.preview` 输出候选与跳过原因；claim 与 task-run 文件的创建规则。
- 依据：automations §5 流程图；ACC-AU-02、05、10、12。
- 前置：W13.1、W08.1、W12.4。
- 位置：`plugins/automations/src/engine/{scan,claims,holds}.ts`、`packages/contracts/src/kinds/task-run.ts`、`plugins/automations/src/ui/PreviewDialog.tsx`。
- 复用：R-34（策略常量）。
- 实现要点：通过 `TaskQuery` 读取（tasks 停用时规则显示“任务插件已停用”）；`processingKey` 计算；预检（Space 存在且目录可访问、provider 已检测）；holds 服务 `holdRestoredInput` 与失效清理；预览零写入。
- 异常：Task 文件解析失败跳过并给原因。
- 测试：ACC-AU-02（断言无文件写入）、05、10、12（hold 由测试直接调用服务）。
- 完成：四个 ACC 通过。

## W13.3 无界面 worker 与运行结果

- 目标：扫描后在 Space 根启动 provider 打印模式运行，写 task-run 结果；任务详情显示运行记录。
- 依据：automations §5 worker 启动；ACC-AU-03、04、06、07；ACC-TK-02、03。
- 前置：W13.2。
- 位置：`plugins/automations/src/engine/worker/{supervisor,run,reconcile}.ts`、`plugins/automations/src/engine/contract.ts`、`plugins/tasks/src/ui/TaskRuns.tsx`。
- 复用：R-31、R-32、R-33。
- 实现要点：context 文件与提示；监督进程（Windows job / Unix 进程组）输出 `stdout.jsonl` 与 `exit.json`；并发名额；结果解析与回执块；task-run 状态与正文；站内通知；Engine 启动对账（automations §5）；`run.stateChanged` 事件；任务详情“运行记录”分区。
- 异常：provider 未登录（输出判定 `PROVIDER_UNAUTHENTICATED` → failed 并提示在 Agent CLI 中登录）；监督进程丢失 → unknown。
- 测试：fake provider 成功/失败/长时间运行；强制结束 Engine 后重开（ACC-AU-06）；删除监督进程与输出（ACC-AU-07）；ACC-TK-02、03。
- 完成：六个 ACC 通过。

## W13.4 问答续接、取消、对账、重试

- 目标：回答 Agent 问题并在原会话继续；取消运行；unknown 对账；标记失败并重试。
- 依据：automations §5 回答问题、取消对账重试；ACC-AU-08。
- 前置：W13.3、W12.5（按会话 id 查找原生记录）。
- 位置：`plugins/automations/src/engine/{answer,cancel,retry}.ts`、`plugins/automations/src/ui/RunDetail.tsx`。
- 复用：R-31、R-38。
- 实现要点：`resumeSessionId` 启动新一轮并追加结果分区；取消结束进程树并观察退出；对账利用原生会话记录；重试需确认且 `attempt` 上限 10。
- 异常：回答时 provider 已不可用 → 保持 waiting_input 并提示。
- 测试：ACC-AU-08；取消后进程不存在（进程表断言）；对账成功与仍 unknown 两种路径。
- 完成：ACC-AU-08 与对账测试通过。

## W13.5 agent_prompt、script、notify 动作与激活记录

- 目标：三种非扫描动作可运行；激活记录页与运行详情。
- 依据：automations §3、§6；ACC-AU-11。
- 前置：W13.3、W11.3。
- 位置：`plugins/automations/src/engine/actions/{agent-prompt,script,notify}.ts`、`plugins/automations/src/engine/scripts.ts`、`plugins/automations/src/ui/{ActivationLog,ScriptsDialog}.tsx`、`packages/contracts/src/kinds/automation-run.ts`。
- 复用：R-31（监督进程同样用于脚本）。
- 实现要点：脚本配置存 `scripts.json`；envRefs 经 SecretUse 解析；`spawn(shell:false)`；超时；输出末 200 行写 automation-run；notify 创建站内通知；激活记录 DataTable 与详情抽屉；立即运行（`automations.runNow`）。
- 异常：保险箱锁定（`SAFE_LOCKED` 并通知）；程序不存在；超时。
- 测试：ACC-AU-11；锁定时脚本失败；notify 生成通知。
- 完成：ACC-AU-11 与上述测试通过。
