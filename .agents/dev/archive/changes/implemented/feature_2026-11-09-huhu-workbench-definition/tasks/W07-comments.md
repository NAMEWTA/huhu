# W07 批注

## W07.1 批注数据与锚点

- 目标：批注作为 `Comments/` Markdown 文件创建、回复、解决、重开、删除；文档保存后自动重定位。
- 依据：[knowledge](../modules/knowledge.md) §7；[data-model](../data-model.md) §5 comment；ACC-KN-08。
- 前置：W06.3、W04.3。
- 位置：`plugins/notes/src/engine/comments/{service,anchor,codec}.ts`。
- 复用：R-24。
- 实现要点：comment kind 注册；`comments.*` 能力；保存成功后对该文档未解决批注运行 `refind`，状态变化写回；文档移动/回收时更新/移动批注（与 W05.2、W05.3 的操作合并为同一操作）；作者为“我”（单用户），外部入口创建的批注作者为调用者身份。
- 异常：锚点不唯一 → orphaned；批注文件解析失败 → 问题列表。
- 测试：锚点单元测试（重复句、emoji、跨行、属性锚点）；ACC-KN-08。
- 完成：ACC-KN-08 通过。

## W07.2 批注界面

- 目标：选区气泡新增批注、正文装饰、详情面板批注列表、文件级与属性批注、重新选择位置。
- 依据：knowledge §7；US-KN-09。
- 前置：W07.1、W06.6。
- 位置：`plugins/notes/src/ui/comments/`、`packages/editor/src/codemirror/comment-decorations.ts`。
- 复用：R-25。
- 实现要点：CodeMirror `Decoration.mark` 按锚点范围装饰（源码偏移直接可用）；点击装饰定位到列表项，反之滚动到正文；orphaned 显示“原文已变化”与“重新选择位置”；空内容不能提交。
- 异常：只读 Vault 时批注只读。
- 测试：组件与 E2E（创建、解决、删除、取消零写入）。
- 完成：US-KN-09 可演示。
