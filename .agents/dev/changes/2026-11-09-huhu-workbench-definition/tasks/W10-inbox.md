# W10 收件箱

## W10.1 捕获与列表

- 目标：快速捕获（快捷键、输入条、首页、能力）与三种状态列表、来源筛选、搜索、编辑、归档、删除。
- 依据：[inbox](../modules/inbox.md) §2–3；ACC-IN-01、05。
- 前置：W04.3、W02.5。
- 位置：`plugins/inbox/{huhu-plugin.json,src/engine/{captures,capabilities}.ts,src/ui/{InboxModule,CaptureList,CaptureDetail,QuickCaptureDialog}.tsx}`、`packages/contracts/src/kinds/capture.ts`。
- 复用：R-56（`InboxView`）。
- 实现要点：`source` 由调用者身份决定；标题自动取首行；`Mod+Shift+N` 命令贡献；批量归档；删除进回收站。
- 异常：空内容不可提交。
- 测试：ACC-IN-01 E2E；ACC-IN-05 集成测试（MCP 身份调用在 W17 前用测试令牌模拟 `mcp` 身份）。
- 完成：两个 ACC 通过。

## W10.2 转换与撤销

- 目标：转为任务/笔记/档案，处理后跳转生成内容，撤销处理。
- 依据：inbox §3；ACC-IN-02、03、04、06。
- 前置：W10.1、W08.1、W05.2、W09.2。
- 位置：`plugins/inbox/src/engine/convert.ts`、`plugins/inbox/src/ui/ConvertDialogs.tsx`。
- 复用：R-56。
- 实现要点：目标创建通过调用对应插件能力（`tasks.create`、`notes.create`、`archives.create`），与捕获状态更新纳入同一操作日志（data-model §7）；目标插件停用时卡片禁用；关联内容被删除时提示。
- 异常：转换中断恢复（ACC-IN-03）；目标创建失败时捕获保持 pending。
- 测试：ACC-IN-02、03（故障注入）、04、06。
- 完成：四个 ACC 通过。
