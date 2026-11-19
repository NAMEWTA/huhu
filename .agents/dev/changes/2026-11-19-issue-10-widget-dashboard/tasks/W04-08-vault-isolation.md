# W04-08 切换 Vault 后隔离迟到的布局与业务结果

将草稿、查询、焦点、实例与提交绑定发起 Vault/endpoint。新会话丢弃旧事件、回包和观察器。

**规格范围**　ACC-DASH-10、ACC-DASH-11、ACC-DASH-16。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-07 带改动离开时可保存、放弃或继续编辑](W04-07-leave-draft.md)。切换若经过模块离场或关窗，沿用该入口的草稿处置。确定离开后再替换 Vault 和订阅。

**现有代码入口**　[renderer/main.tsx](../../../../../apps/desktop/src/renderer/main.tsx) · [engine-client/query.ts](../../../../../packages/workbench/src/engine-client/query.ts) · [engine-client/react.tsx](../../../../../packages/workbench/src/engine-client/react.tsx) · [src/home](../../../../../packages/workbench/src/home) · [src/vault.ts](../../../../../packages/vault/src/vault.ts)。

**原型对照**　A/B Vault 切换、A 有草稿或迟到返回。回 A 查看已存板。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#vault) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 建立两个不同实例/配置的测试 Vault，保存 A、切 B、回 A。核对双端文件、缓存键和焦点，每处只见各自已提交的板。
2. 延迟 A 的查询/保存回包或事件直到 B 打开。B 不显示 A 数据，提交地址不变。若模块离场选保存且 A 拒写，保留草稿并停在 A。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
