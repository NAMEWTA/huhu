# W01-01 用同一布局样本比较网格实现

[验收报告](../evidences/W01-01-grid-comparison.md)

比较 Homarr 行为与 RGL、GridStack 的实际候选版本。由 PoC 负责人给出选用依据，生产画布只接入胜出的一种。

**规格范围**　ACC-DASH-02、ACC-DASH-03、ACC-DASH-13、ACC-DASH-14、ACC-DASH-15、ACC-DASH-16。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。本地上游默认分支已可读，网格库的选择仍需运行 PoC。

**现有代码入口**　[home/HomeModule.tsx](../../../../../../../packages/workbench/src/home/HomeModule.tsx) · [board/layout](../../../../../../../temp/sources/homarr/apps/nextjs/src/components/board/layout) · [board/in-place-editor](../../../../../../../temp/sources/homarr/apps/nextjs/src/components/board/in-place-editor) · [react-grid-layout/src](../../../../../../../temp/sources/react-grid-layout/src) · [src/gridstack.ts](../../../../../../../temp/sources/gridstack/src/gridstack.ts)。

**原型对照**　编辑态移动、碰撞让位、尺寸边界、窄窗、键盘、滚动与选中文字。HTML 用于对齐动作，库结论来自各自运行样例。运行与数据判据可先核对。本场景中界面表达的确认状态按评审记录。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 用同一带空位、输入框和不同尺寸卡的样本，记录相同手势后的坐标、重载结果、触摸/键盘命中与渲染轨迹，登记版本和许可。
2. 制造碰撞、非法缩放、快速移出画布并卸载。记录错位、掉帧、残留监听或额外适配成本。失败样本可复现后再选型。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
