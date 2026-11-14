# W08 任务

## W08.1 Task 领域与能力

- 目标：`tasks.*` 能力完整实现，规则符合 [tasks](../modules/tasks.md) §1、§5。
- 依据：tasks §5；ACC-TK-01（数据部分）、08、09、10。
- 前置：W04.3、W04.4。
- 位置：`plugins/tasks/{huhu-plugin.json,src/engine/{index,capabilities,task-query}.ts,src/shared/{categories,input,reminders}.ts}`、`packages/contracts/src/kinds/task.ts`。
- 复用：R-27。
- 实现要点：分类计算（时区来自设置）；`inputRevision` 递增规则与 `inputHash`；`setCompleted`（Agent 任务重开时递增 inputRevision）；标题变更重命名文件；删除进回收站；复制；外部编辑重新解析并发布 `task.completedChanged`；Cordis 服务 `TaskQuery`（`listOpenAgentTasks`、`snapshot`）。
- 异常：版本冲突、解析失败任务列入问题列表、`execution.spaceId` 指向不存在的 Space 允许保存。
- 测试：单元测试分类（时区、跨午夜、未来 7 天边界）、输入版本规则；集成测试 ACC-TK-08、09、10。
- 完成：上述 ACC 通过；`tasks.list` 契约测试覆盖全部分类。

## W08.2 任务模块：列表与分类

- 目标：模块侧栏五分类、表格分组、勾选、搜索、详情面板。
- 依据：tasks §3；ACC-TK-02（界面部分）、03、05；原型 `task-workbench.jsx`。
- 前置：W08.1、W02.4。
- 位置：`plugins/tasks/src/ui/{TasksModule,TaskTable,TaskRow,TaskDetail}.tsx`。
- 复用：R-28。
- 实现要点：DataTable 分组（未完成/已完成，已完成可折叠）；CompletionCircle 乐观更新；逾期样式；未来 7 天页头日期范围；窄屏隐藏列；详情面板字段与运行记录分区（W13.3 前隐藏）；分钟级刷新分类。
- 异常：勾选失败回滚并 toast 错误。
- 测试：E2E 勾选/重开；ACC-TK-05。
- 完成：US-TK-02、03 可演示。

## W08.3 编辑对话框与 ResourcePicker

- 目标：新建/编辑任务全部字段，资源模糊多选。
- 依据：tasks §3 编辑对话框、§4；ACC-TK-01、06。
- 前置：W08.2。
- 位置：`plugins/tasks/src/ui/TaskEditor.tsx`、`packages/ui/src/components/resource-picker.tsx`。
- 复用：R-19、R-18。
- 实现要点：执行方式 Agent 时读取 `agent.spaces.list` 与 `agent.providers.detect`（agent-cli 未实现或停用时禁用并说明）；ResourcePicker 键盘规则与失效显示；Markdown 正文可切预览（W06.2 组件）。
- 异常：保存失败保留输入；必填校验。
- 测试：ResourcePicker 组件测试（ACC-TK-06）；ACC-TK-01 E2E（断言没有子进程启动：Engine 子进程计数不变）。
- 完成：ACC-TK-01、06 通过。

## W08.4 看板与月历

- 目标：两列看板（拖动完成/重开）与月历投影。
- 依据：tasks §3；ACC-TK-11。
- 前置：W08.2。
- 位置：`plugins/tasks/src/ui/{TaskBoard,TaskCalendar}.tsx`。
- 复用：@dnd-kit；R-28（`TaskCalendar`）。
- 实现要点：看板拖放与卡片菜单键盘等价；月历按周起始设置，日期格“+”新建带截止日。
- 异常：拖放失败回滚。
- 测试：ACC-TK-11 E2E。
- 完成：ACC-TK-11 通过。

## W08.5 提醒

- 目标：软件内提醒到点通知，应用关闭期间到点的补发。
- 依据：tasks §5 提醒；ACC-TK-07。
- 前置：W08.1；通知展示需 W18.2（之前用 toast 验证）。
- 位置：`plugins/tasks/src/engine/reminders.ts`、`plugins/tasks/src/ui/RemindersEditor.tsx`。
- 复用：R-27（`collectDueReminders`、`markReminderDelivered`）。
- 实现要点：30 秒检查（`ctx.setInterval`）；写 `deliveredAt` 后发布 `reminder.due`；非 in_app 渠道禁用。
- 异常：写入失败下次检查重试，不重复通知（以 `deliveredAt` 为准）。
- 测试：用可控时钟的集成测试；ACC-TK-07。
- 完成：ACC-TK-07 通过。
