# #16 自动化中心 · 原型走查与用户确认

## 入口与版本

用文件方式打开 [自动化中心原型](prototype/automations/index.html)。目录内容 SHA-256 为 `96b22cdaa663016ae351a006be8e46fbb936a85c17489b52059f6debf3018775`。随入口保留同目录全部本地资源。「原型演示」可以切换只读、受阻或错误并重置。刷新本文件回到初始样例。可从 [工作台原型](prototype/workbench/index.html) 的任务提醒、周期同步与首页卡片按样例计划 ID 进入。

- Huhu 源码基线为 `2af88fd6fc55a9cfd92280e60146b38b634139b7`。当前树已合入 [PlanAPI](../../../../packages/contracts/src/automation-plan.ts) 及 [HostUI](../../../../packages/ui/src/components/host-ui.ts)。界面沿用 Huhu 外壳、主题和组件语义。来源页与中心按同一个计划 ID、修订和引用对象操作。
- 计划、运行、来源和外部动作均使用内置样例。跨 HTML 文件以 ID 定位同名样例。计划的双向变更在本原型的中心和来源页演练，同一份内存数据保存当前状态。

## AW0 基线与复用映射

| 固定来源 | 现场与已有行为 | 原型适配与后续落点 |
| --- | --- | --- |
| Huhu `2af88fd6fc55a9cfd92280e60146b38b634139b7` | [AutomationsModule](../../../../plugins/automations/src/ui/AutomationsModule.tsx) 现役规则、激活和运行，已有版本化保存、手动意图、未知结果核对。[RuleEditor](../../../../plugins/automations/src/ui/RuleEditor.tsx) 已使用 U1 容器布局。统一计划的类型接口已合入，目录、来源迁移和真实运行投影仍按实施票据接线。 | 中心整合为计划、运行与来源跳转。实施沿现有插件及唯一计划端口替换重复入口。 |
| [Orca 固定提交](https://github.com/stablyai/orca/commit/484454c17ec4c69e293fcda47f3a55d9fe5d49a3) | `AutomationListLocalRow.tsx` 的行、下次、最近与独立操作；`AutomationDetail.tsx` 的摘要与独立读取失败；`AutomationEditorDialog.tsx` 的草稿基线；`AutomationSchedulePicker.tsx` 的预设与高级切换；`use-automation-editor-actions.ts` 的模板预填；`AutomationRunDetailsPage.tsx` 的运行上下文。根许可证为 Lovecast Inc. MIT。 | 从行为映射到 Huhu 现有 `AutomationsModule`、`RuleEditor` 和 `RunsPanel`。复用信息层级、草稿和返回方式。采用 Huhu 的主题、真实目标和排期语义。 |
| [T3 Code 固定提交](https://github.com/pingdotgg/t3code/commit/d1a6c35f7382beead7fb3125e530baf50a60786d) | `packages/contracts/src/scheduledTask.ts` 的 trigger 与 threadMode；`ScheduledTasksSettings.tsx` 与 `scheduledTasksSettings.logic.ts` 的目的地/模型；`Schedule.ts` 与 `ScheduledTaskService.ts` 的时刻和调度失效。`WorkflowRunsView.tsx` 属 Labs Workflows 的运行入口。根许可证为 T3 Tools Inc. MIT。 | 目标语义落实于 `editor.js` 的 Space、Agent、模型与来源对象。固定需求使用 Tasks 创建并派遣，没有额外提供续同线程配置。运行详情复用 Huhu 的执行身份。 |

本原型未复制上游业务源码或品牌素材。后续实现沿现有 Huhu 模块逐个替换旧激活页、无身份的运行跳转及跨插件私有 DTO 消费。上游 CSS、存储、调度器、Webhook 中继与 Labs 工作流均留在研究范围。#14 图 18–20 来自固定图片提交 `993eaa44bba908e1769cc1b9ceba927c18d1b419`，可核对固定侧栏与选择/日期弹出态报告。尚未知原安装包哈希、缩放、原始窗口与日志。U0 在 Linux x64 的 Electron 44.9.1 / Chromium 152.0.7977.167 与独立 Chromium 158.0.8127.18 上记录了实际 Huhu 基线，图 10 的工作区为 800 × 576 CSS 像素。AW0 本轮为源码与截图对照，未重新启动 Huhu 或上游产品，图 18–20 的原始窗口、缩放与触发输入仍待实机复现。

## C9 与 C3/C7 对照

| 视图或动作 | 唯一事实与交互边界 | 原型源码 |
| --- | --- | --- |
| 计划目录、详情、来源页 | `PlanSummary.planId/revision/source/owner/action/intent/availability/nextAt/actions`。来源变更在中心直接可见。全局暂停保留单计划意图。只读和设备归属约束可操作项。 | [fixtures.js](prototype/automations/fixtures.js) `makePlan`；[prototype.js](prototype/automations/prototype.js) `planRow`、`planDetail`、`showSources` |
| 编辑、排期与对应动作 | 预设与高级排期投影到 `PlanTrigger`。间隔保持 seconds/minutes，一次性用 UTC，Cron 保留 IANA 时区，高级值无法等价简化时保留原式。草稿额外字段是展示所需的后续目标配置，实施由相应领域端口接线。 | [editor.js](prototype/automations/editor.js) `toScheduleDraft`、`explainDraft`、`planEditor` |
| 保存、启停、删除、手动运行和核实 | 计划修订是乐观编辑前提，模拟保存或运行使用单一 intent。未知结果查看原记录。模板只填草稿，计划删除后保留来源与历史。`PlanWrite` 对应改期、启停、删除、运行；新增与完整编辑由后续实施补齐真实合同。 | `planEditor`、`showTemplates`、`togglePlan`、`removePlan`、`runPlan`、`verifyOccurrence` |
| 发生、执行与效果 | `PlanOccurrence.plan/timing/state/acceptedAt/frozenInput/execution/effects`。发生受理、领域运行和通知等效果分别显示。运行定位含原 Task、dispatch、run、attempt 与会话代次。公开样例省去 Core 地址。按原身份提交答复或停止。 | `makeOccurrence`、`sampleExecution`、`domainRuns`、`occurrenceDetail`、`openDomainRun` |
| 布局与宿主 | 原生 Dialog 负责模态焦点，编辑器按自身容器宽度重排，窄目录详情独立显示并保留返回焦点。纯时间与固定日期数据按各字段含义使用。 | [shell.js](prototype/automations/shell.js) `modal`；[shell.css](prototype/automations/shell.css) `.form-container`；[module.css](prototype/automations/module.css) `.centre-layout` |

## 需求、走查路径与源码

| 需求 | 操作与可见结果 | 源码定位 |
| --- | --- | --- |
| AU01–AU03、AU16 | 默认目录包含任务、跟进、Agent、邮件、Git、SSH、专注和账本等来源。按名称、来源、动作和状态筛选。窄屏详情返回原列表。从来源切换启用状态后查看中心同 ID 新修订。 | `listPlans`、`paintPlans`、`showSources` |
| AU04–AU05、AU19 | 编辑宽窗与窄窗，主区正文保持可编辑，操作始终可达。Esc 弹出草稿确认，可返回。其他工作台改动时留草稿并读当前修订。 | `planEditor`、`paintTarget`、`paintSchedule` |
| AU06–AU07、AU11 | 一次性、间隔、每日、每周、高级、观察及事件切换。高级无法等价时保留，纽约样例明确夏令时缺口/两个时刻。预览只读，过期预览无法覆盖更新的输入。复杂 Cron 的真实下次时刻由上线后的正式服务给出。 | `explainDraft`、`offsetPreview`、`paintPreview` |
| AU08–AU10 | 扫描模板预填标签、范围、并发与说明。切换 Agent 清理失效模型。从模板取消不创建，保存默认暂停。缺 SSH 对象的模板不能执行。 | `showTemplates`、`planEditor`、`templates` |
| AU12–AU13 | 立即运行记录独立手动发生，核实未知后保留发生 ID。待答复与普通评论分开，通知和建任务的效果结果可分别处理。 | `runPlan`、`verifyOccurrence`、`openDomainRun` |
| AU14、AU18 | 按来源、日期、状态过滤并加载历史；输出按点击读取，错误重读只读取输出。真实查询、历史规模和停机恢复成本留给实施验收。 | `paintRuns`、`outputDialog`、`occurrenceDetail` |
| AU15、AU17、AU20 | 全局暂停仍能编辑；停止指定运行；只读和其他设备归属有明确反馈；来源不可用的计划仍可按权限管理；删除后原对象与历史保留。迁移、权限和重启持久性在真实入口验证。 | `setDemoMode`、`removePlan`、`canManage`、`showSources` |

## 实际走查

- 2026-11-25 在 Linux 上用 Playwright 1.65.0、Chromium 158.0.8127.18，从离线 `file:` 地址走通 7 条旅程。1440 × 1000 浅色和 390 × 844 深色均覆盖实际选择与状态变化，未记录外部请求、资源失败、JavaScript 异常或页面横向溢出。
- 验证同一计划在来源和中心的变更，组合筛选、新建与冲突恢复、高级 Cron 保真、纽约夏令时缺口和回拨、未知保存及手动发生的核实、等待答复、效果重试、限定对象停止、只读和其他设备归属、插件恢复及删除后重新读取。
- 使用当前仓库的 schema 解析 14 个 PlanSummary、6 个 PlanOccurrence、14 个改期输入、1 个 TaskActivity 和 4 个 HostDateField 样例。回执保留 `fixtures-validation.log`，浏览器证据在 `walkthrough-final.log` 和 `prototype-walkthrough-final.json`。这些检查针对模拟对象。生产调度、真实领域动作、权限、迁移、进程恢复及历史规模下的性能尚待相应实施验收。

## 用户确认

- 2026-11-25，用户在 Lead 会话中对四套原型的确认提问回复「基本表示同意，我提出的地方请你继续优化」，未对本原型提出修改。确认版本 SHA-256 `96b22cdaa663016ae351a006be8e46fbb936a85c17489b52059f6debf3018775`，范围为本记录场景表所列页面与状态；后台约束仍以规格与原 Issue 为准。
