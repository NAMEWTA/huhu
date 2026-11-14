# W06 编辑器

## W06.1 迁移实时预览扩展与 MarkdownEditor

- 目标：Markdown 文档在实时预览、源码模式下可编辑，有行号与双侧留白，工具栏命令可用。
- 依据：[knowledge](../modules/knowledge.md) §5；ACC-KN-01、02；原型 `editor.jsx`。
- 前置：W05.1。
- 位置：`packages/editor/src/{MarkdownEditor.tsx,codemirror/live-preview/,codemirror/extensions.ts,commands.ts}`。
- 复用：R-21、R-22。
- 实现要点：一个文档一个 EditorView，模式用 Compartment 切换；行号 gutter 可关闭；内容 `max-width` 与留白随设置；工具栏命令每次一个事务；`[[` 补全（R-19 打分）；查找替换（@codemirror/search）；组合输入期间延迟模式切换（原型 `huhu-composition.ts`）；未编辑时不产生任何写入。
- 异常：Atomic 扩展与 CodeMirror 新版本 API 差异按其 `UPSTREAM.md` 补丁说明修正，修正记入 ledger。
- 测试：原型编辑器行为测试改写为 Vitest（模式切换保留选区与撤销、命令事务、组合输入）；CDP `Input.imeSetComposition` E2E；ACC-KN-01 字节比较。
- 完成：ACC-KN-01、02 通过；1440 与 1024 宽度下留白与行号位置截图自查。

## W06.2 阅读与双栏预览

- 目标：阅读模式与双栏右侧安全渲染 Markdown（GFM、数学、Mermaid、代码高亮、双链）。
- 依据：knowledge §5；ACC-KN-09；security §1。
- 前置：W06.1。
- 位置：`packages/editor/src/preview/`。
- 复用：R-20。
- 实现要点：react-markdown + remark-gfm/math/frontmatter + rehype-sanitize（schema 扩展仅限 KaTeX 类与 `data-wikilink`）+ rehype-katex；Mermaid 围栏组件 `securityLevel: 'strict'`；双链渲染为可点击元素；图片地址重写为 Engine 资源路由 `/api/v1/asset?path=`（带令牌，路径守卫）；双栏同步滚动按源码行映射（remark position）。
- 异常：Mermaid 语法错误显示错误块与原文。
- 测试：恶意 Markdown 夹具 E2E（ACC-KN-09）；渲染快照测试。
- 完成：ACC-KN-09 通过。

## W06.3 保存、草稿与关闭

- 目标：自动/手动保存、草稿、关闭四出口、Vault 切换时处理未保存文档。
- 依据：knowledge §5 保存与关闭；data-model §8；ACC-KN-03、04；ACC-WB-03。
- 前置：W06.1、W04.2。
- 位置：`plugins/notes/src/engine/{save,drafts}.ts`、`packages/editor/src/session/document-session.ts`、`packages/workbench/src/shell/unsaved-guard.tsx`。
- 复用：无。
- 实现要点：`DocumentSession` 跟踪 `baseVersion`、`savedSource`、当前源码与提交中的版本；回执只确认对应提交（保存中继续输入则再次保存）；草稿每 2 秒；关闭对话框；窗口关闭与 Vault 切换汇总未保存文档；`notes.save` 版本冲突返回当前磁盘内容。
- 异常：保存失败保持标签打开并显示“保存失败（重试）”；只读 Vault 时保存禁用并提示另存为（导出）。
- 测试：时序集成测试（慢保存 + 继续输入）；ACC-KN-03、04；ACC-WB-03 E2E。
- 完成：三个 ACC 通过。

## W06.4 外部修改与合并

- 目标：磁盘文件被外部修改时，无修改则重载，有修改则 Banner 处理（差异、保留、使用磁盘、合并）。
- 依据：knowledge §5 外部修改；ACC-KN-05。
- 前置：W06.3、W04.4。
- 位置：`packages/editor/src/merge/`、`plugins/notes/src/ui/ExternalChangeBanner.tsx`、`packages/ui/src/components/diff-view.tsx`。
- 复用：R-23、R-47（DiffView 组件在此首次实现）。
- 实现要点：订阅 `vault.fileChanged`；重载用不入历史的事务并重置撤销栈；三方合并以上次加载内容为 base；文件被删除处理。
- 异常：合并结果仍有冲突标记时保存前提示确认。
- 测试：ACC-KN-05 集成测试；三方合并单元测试。
- 完成：ACC-KN-05 通过。

## W06.5 其他文件类型

- 目标：文本/代码、Mermaid、图片、PDF、未知/超大文件按规则打开。
- 依据：knowledge §4；ACC-KN-10。
- 前置：W06.1、W06.2。
- 位置：`plugins/notes/src/ui/viewers/`、`packages/kernel/src/server/asset-route.ts`。
- 复用：@codemirror/lang-*（按需动态导入）。
- 实现要点：按扩展名选择查看器；资源路由设置正确 MIME、`Content-Security-Policy: sandbox` 给 PDF 与 SVG；JSON/YAML 诊断；“用系统应用打开”经 Main `shell.openPath`（仅 Vault 内路径）。
- 异常：二进制误判（含 NUL 字节）按未知文件处理。
- 测试：每种类型打开的 E2E；ACC-KN-10。
- 完成：ACC-KN-10 通过。

## W06.6 详情面板：属性、大纲、关联

- 目标：属性编辑、大纲跳转、反向链接、关联任务与档案。
- 依据：knowledge §6；US-KN-08。
- 前置：W06.1、W05.2。
- 位置：`plugins/notes/src/ui/details/`、`plugins/notes/src/engine/properties.ts`。
- 复用：R-10（frontmatter 局部改写）。
- 实现要点：`notes.updateProperties` 局部改写并与正文共用版本检查（打开中的编辑器同步更新 frontmatter 区域）；大纲由 Lezer Markdown 语法树生成；关联任务与档案通过能力查询（tasks/archives 停用时隐藏对应分区）。
- 异常：属性 YAML 非法时属性页显示原文并提示在源码中修正。
- 测试：属性修改后正文其余字节不变；大纲跳转 E2E。
- 完成：US-KN-08 可演示。

## W06.7 导出与保存版本入口

- 目标：导出当前文档为 Markdown 文件；“保存版本”与“版本历史”入口。
- 依据：US-KN-11。
- 前置：W06.3；“保存版本”需 W15.1。
- 位置：`plugins/notes/src/ui/DocumentActions.tsx`。
- 复用：无。
- 实现要点：导出经 `huhuHost.saveFile`；保存版本调用 `history.checkpoint`；版本历史按钮跳转版本模块并选中此文件。
- 异常：versioning 停用时两个入口隐藏。
- 测试：E2E。
- 完成：US-KN-11 可演示。
