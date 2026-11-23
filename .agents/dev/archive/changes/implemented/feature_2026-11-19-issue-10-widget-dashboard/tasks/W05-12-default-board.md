# W05-12 首次首页显示已启用的默认卡

首次缺文件时从已启用、可用的真实定义生成稳定默认板。合法空板显示首卡入口。其余可用功能在目录可达。

**规格范围**　ACC-DASH-01、ACC-DASH-17、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W01-02 走查完整看板与默认首屏](W01-02-board-review.md)、[W02-01 读取新格式布局并区分首次与空板](W02-01-read-board.md)、[W03-01 从目录查找可用的小组件类型](W03-01-widget-catalog.md)。首屏种子需有用户确认的卡片组合、能区分缺文件与空板的读取结果，以及当前可用定义的集合。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts) · [src/boot.ts](../../../../../../../apps/engine/src/boot.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　首次首页、默认卡密度、合法空板及添加首卡入口。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#empty) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在新测试 Vault 与有业务数据但无布局的新模型测试 Vault 首次读板，按已确认组合核对卡/空态、再次读取的稳定身份，首次读无写盘。
2. 仅启用部分插件时检查默认板过滤。重开已有合法空板不得自动加回卡。目录可找到未列入默认但可用的类型。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
