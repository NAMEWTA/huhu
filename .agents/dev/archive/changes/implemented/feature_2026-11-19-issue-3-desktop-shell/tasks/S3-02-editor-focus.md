# S3-02 将保存与编辑命令交给原焦点

菜单打开前记录窗口、Vault、活动文档与上下文世代。激活时重核。普通输入、笔记编辑、命令面板各有单次处理者。

**规格范围**　TB-12、TB-13、TB-17。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S3-01 用平台入口打开 HUHU 菜单](S3-01-product-menu.md)。复用产品菜单的命令传递与文档实际保存结果。

**现有代码入口**　[main/index.ts](../../../../../../../apps/desktop/src/main/index.ts) · [preload/index.ts](../../../../../../../apps/desktop/src/preload/index.ts) · [command-palette/CommandPalette.tsx](../../../../../../../packages/workbench/src/command-palette/CommandPalette.tsx) · [src/shortcuts.ts](../../../../../../../packages/workbench/src/shortcuts.ts) · [ui/NoteDocument.tsx](../../../../../../../plugins/notes/src/ui/NoteDocument.tsx) · [documents/DocumentSession.ts](../../../../../../../plugins/notes/src/ui/documents/DocumentSession.ts)。

**原型对照**　在笔记 A/B 与普通输入框切换。菜单保存、撤销、复制和取消。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#menu) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. A/B 各输入不同文字，从 A 菜单保存，回读仅 A。普通输入框撤销/复制只影响原选区。记录菜单、Mod+S/Mod+K 各自触发次数。
2. 菜单展开中关闭标签或切 Vault，再激活失效命令应拒绝。只读、停用和无活动文档时不会改动其他文档。取消后焦点可继续输入。

记录测试窗口、平台与步骤，随本切片保留能证明上述结果的截图、动作记录或持久化回读。原生控件需拍到系统窗口区域。
