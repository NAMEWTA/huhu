# W05-04 专注计时跨模块持续并在关窗时暂停

系统专注卡使用原计时能力和文件。关闭监听归全局挂载，隐藏卡或换模块不改变计时所有权。

**规格范围**　ACC-DASH-09、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W03-04 隐藏并找回布局实例](W03-04-instance-visibility.md)。已有 FocusCard 与全局 FocusPauseOnClose。本片接入定义，不另建计时器。

**现有代码入口**　[home/FocusCard.tsx](../../../../../packages/workbench/src/home/FocusCard.tsx) · [home/FocusPauseOnClose.tsx](../../../../../packages/workbench/src/home/FocusPauseOnClose.tsx) · [home/HomeModule.tsx](../../../../../packages/workbench/src/home/HomeModule.tsx) · [capabilities/home.ts](../../../../../packages/kernel/src/capabilities/home.ts)。新贡献接入所属插件或系统卡的注册入口。

**原型对照**　专注卡开始/暂停、离开首页再返回。关闭保存作为宿主联验。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在测试 Vault 启动 25 分钟专注，切模块再回来核对剩余与状态。关窗后重开核对按现行行为暂停。
2. 隐藏卡或重复挂载不应重置计时或重复订阅。给布局保存制造失败，专注文件不受布局写入影响。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
