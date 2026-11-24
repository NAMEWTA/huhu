# #16 自动化中心 · 原型走查与用户确认

## AW0 基线与复用映射

| 固定来源 | 现场与已有行为 | 原型适配与后续落点 |
| --- | --- | --- |
| Huhu `2af88fd6fc55a9cfd92280e60146b38b634139b7` | [AutomationsModule](../../../../plugins/automations/src/ui/AutomationsModule.tsx) 现役规则、激活和运行，已有版本化保存、手动意图、未知结果核对。[RuleEditor](../../../../plugins/automations/src/ui/RuleEditor.tsx) 已使用 U1 容器布局。统一计划的类型接口已合入，目录、来源迁移和真实运行投影仍按实施票据接线。 | 中心整合为计划、运行与来源跳转。实施沿现有插件及唯一计划端口替换重复入口。 |
| [Orca 固定提交](https://github.com/stablyai/orca/commit/484454c17ec4c69e293fcda47f3a55d9fe5d49a3) | `AutomationListLocalRow.tsx` 的行、下次、最近与独立操作；`AutomationDetail.tsx` 的摘要与独立读取失败；`AutomationEditorDialog.tsx` 的草稿基线；`AutomationSchedulePicker.tsx` 的预设与高级切换；`use-automation-editor-actions.ts` 的模板预填；`AutomationRunDetailsPage.tsx` 的运行上下文。根许可证为 Lovecast Inc. MIT。 | 从行为映射到 Huhu 现有 `AutomationsModule`、`RuleEditor` 和 `RunsPanel`。复用信息层级、草稿和返回方式。采用 Huhu 的主题、真实目标和排期语义。 |
| [T3 Code 固定提交](https://github.com/pingdotgg/t3code/commit/d1a6c35f7382beead7fb3125e530baf50a60786d) | `packages/contracts/src/scheduledTask.ts` 的 trigger 与 threadMode；`ScheduledTasksSettings.tsx` 与 `scheduledTasksSettings.logic.ts` 的目的地/模型；`Schedule.ts` 与 `ScheduledTaskService.ts` 的时刻和调度失效。`WorkflowRunsView.tsx` 属 Labs Workflows 的运行入口。根许可证为 T3 Tools Inc. MIT。 | 目标语义落实于 `editor.js` 的 Space、Agent、模型与来源对象。固定需求使用 Tasks 创建并派遣，没有额外提供续同线程配置。运行详情复用 Huhu 的执行身份。 |

本原型未复制上游业务源码或品牌素材。后续实现沿现有 Huhu 模块逐个替换旧激活页、无身份的运行跳转及跨插件私有 DTO 消费。上游 CSS、存储、调度器、Webhook 中继与 Labs 工作流均留在研究范围。#14 图 18–20 来自固定图片提交 `993eaa44bba908e1769cc1b9ceba927c18d1b419`，可核对固定侧栏与选择/日期弹出态报告。尚未知原安装包哈希、缩放、原始窗口与日志。U0 在 Linux x64 的 Electron 44.9.1 / Chromium 152.0.7977.167 与独立 Chromium 158.0.8127.18 上记录了实际 Huhu 基线，图 10 的工作区为 800 × 576 CSS 像素。AW0 本轮为源码与截图对照，未重新启动 Huhu 或上游产品，图 18–20 的原始窗口、缩放与触发输入仍待实机复现。
