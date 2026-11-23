# W01-02 走查完整看板与默认首屏

用 Huhu 自有文案与组件核对首屏默认集合、添加配置、宽窄切换、故障及离场。规则按规格，只请用户确认可见实现与尚未确定的首屏选择。

**规格范围**　ACC-DASH-01、ACC-DASH-04、ACC-DASH-05、ACC-DASH-09、ACC-DASH-14、ACC-DASH-15。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。待本 change 的可操作原型与评审记录可读。网格库选择可独立调查。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [shell/AppShell.tsx](../../../../../../../packages/workbench/src/shell/AppShell.tsx) · [shell/shell.css](../../../../../../../packages/workbench/src/shell/shell.css) · [board/in-place-editor](../../../../../../../temp/sources/homarr/apps/nextjs/src/components/board/in-place-editor)。

**原型对照**　默认板→目录→两张同类卡→编辑→保存重载。另走取消、缺插件、窄屏编辑和带草稿离开。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#dashboard) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 以宽屏/窄屏各走一遍，核对同一主布局，记录用户确认的 HTML/资源版本、交互范围及默认板决定。
2. 明确指出未演示的动作。存储、真实业务查询、权限和持久化证据由实现切片取得。无用户答复时保持待确认。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
