# W03-02 为同一类型添加两张独立卡

[验收报告](../evidences/W03-02-add-instance.md)

添加时配置目标、校验约束并在首个合法空位放置，一次分配稳定 ID。隐藏单例占用名额并可找回。

**规格范围**　ACC-DASH-04、ACC-DASH-05、ACC-DASH-17。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-01 编辑并保存或取消同一份草稿](W04-01-board-draft.md)、[W05-07 按实例显示主机列表或指定主机](W05-07-ssh-widget.md)。需要真实目录、可保存的编辑会话和可按 hostId 展示的 SSH 卡。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [src/contributions.ts](../../../../../../../packages/workbench/src/contributions.ts) · [ui/HomeWidget.tsx](../../../../../../../plugins/ssh/src/ui/HomeWidget.tsx) · [ssh/huhu-plugin.json](../../../../../../../plugins/ssh/huhu-plugin.json) · [src/home.ts](../../../../../../../packages/contracts/src/home.ts)。

**原型对照**　目录搜 SSH，分别添加两台主机。再查已存在或隐藏的单例。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#catalog-search) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 从目录把同型卡分别配置为 A/B，保存重开，两张卡的实例 ID 不同、各取自己的数据。取消添加则无新记录。
2. 选择已失效目标、非法配置或重复单例时给出原因，草稿和业务主机文件原样。隐藏单例重新显示后仍是原 ID。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
