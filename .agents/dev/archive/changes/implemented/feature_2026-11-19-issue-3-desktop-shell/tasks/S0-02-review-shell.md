# S0-02 走查标题栏与关闭提示

由真实用户选择窄窗入口并圈定确认版本、平台、主题和状态。原型产物归 t18，规划侧仅引用。

**规格范围**　TB-02、TB-05、TB-09、TB-10、TB-11、TB-12、TB-15。[行为规格](../spec.md#可观察行为) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　无其他前置切片。Huhu 原型和对应评审记录可读后走查。安装包证据单独归 S0-01。

**现有代码入口**　[shell/AppShell.tsx](../../../../../../../packages/workbench/src/shell/AppShell.tsx) · [shell/BrandMark.tsx](../../../../../../../packages/workbench/src/shell/BrandMark.tsx) · [shell/VaultMenu.tsx](../../../../../../../packages/workbench/src/shell/VaultMenu.tsx) · [launch/LaunchPage.tsx](../../../../../../../packages/workbench/src/launch/LaunchPage.tsx)。

**原型对照**　切换平台、启动/错误、专注与窗口状态。长 Vault 名、窄窗搜索、笔记关闭失败。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#compact-choice) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 从正常页操作菜单、编辑笔记、触发故障，再取消或重试。记录用户实际确认的文件版本和场景。
2. 未走查或没有明确答复的范围保持待确认。Snap、系统菜单、系统全屏只能在安装版取得证据。

保存相应基线或走查记录，注明实际环境与覆盖状态。
