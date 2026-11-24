# W04-09 恢复默认看板前可以反悔

[验收报告](../evidences/W04-09-reset-defaults.md)

恢复默认仅换本次草稿，明确区分整板重置和单卡推荐尺寸。合法空板继续提供首卡入口。

**规格范围**　ACC-DASH-01、ACC-DASH-04。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)、[W05-12 首次首页显示已启用的默认卡](W05-12-default-board.md)。用当前已启用定义的有效默认种子及编辑事务。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [capabilities/home.ts](../../../../../../../packages/kernel/src/capabilities/home.ts)。

**原型对照**　编辑板→恢复默认→取消。另走保存并重开。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board-tools) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在有自定义卡的板触发恢复默认，再取消，原 ID、配置和文件字节恢复。重新操作并保存则重开见所选默认板。
2. 在仅启用部分插件及合法空板验证种子筛选。只读或保存失败时不能悄悄恢复默认或重建用户删除的实例。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
