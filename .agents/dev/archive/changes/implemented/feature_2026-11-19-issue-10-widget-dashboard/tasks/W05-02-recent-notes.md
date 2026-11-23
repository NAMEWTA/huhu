# W05-02 从最近笔记卡定位所选笔记

notes 插件负责最近列表与明确的条目入口。导航要定位所选文件，列表及错误态不阻塞其他卡。

**规格范围**　ACC-DASH-09、ACC-DASH-13、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。使用定义契约及现有笔记模块和导航。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [ui/NotesModule.tsx](../../../../../../../plugins/notes/src/ui/NotesModule.tsx) · [ui/index.tsx](../../../../../../../plugins/notes/src/ui/index.tsx) · [state/open-request.ts](../../../../../../../packages/workbench/src/state/open-request.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　最近笔记卡的条目和明确的模块入口，空数据时的引导。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 准备两篇不同文件，更新 B 后从卡点 B，验证模块和实际打开的文件均为 B。在列表里选中文字不触发导航。
2. 删除选中的目标或撤销读权限再打开，展示可恢复状态，不误打开其他笔记。空 Vault 能从卡进入真实笔记入口。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
