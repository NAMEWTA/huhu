# W04-05 窄屏调整顺序与尺寸后在桌面恢复

[验收报告](../evidences/W04-05-narrow-layout.md)

按阅读顺序投影同一布局。窄屏仅提供顺序与尺寸调整，保存后写回同一份主布局。被动窗口变化零写入。

**规格范围**　ACC-DASH-02、ACC-DASH-03、ACC-DASH-04、ACC-DASH-14、ACC-DASH-15。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[W04-02 跨列跨行移动卡片并保留空位](W04-02-drag-grid.md)、[W04-03 按尺寸约束缩放卡片与内容](W04-03-resize-grid.md)。复用主网格的合法放置与尺寸约束。单布局、窄屏仅顺序和尺寸已确定。仅确认控件呈现。

**现有代码入口**　[src/home](../../../../../../../packages/workbench/src/home) · [shell/shell.css](../../../../../../../packages/workbench/src/shell/shell.css) · [src/home.ts](../../../../../../../packages/contracts/src/home.ts) · [engine-client/query.ts](../../../../../../../packages/workbench/src/engine-client/query.ts)。

**原型对照**　宽→窄→前移/后移与尺寸→保存→宽。另走取消。窄屏无自由 x/y 拖放。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#board) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 在 1366×768 建三卡含空位的板，缩到窄容器调整 B 的顺序与尺寸。保存并在宽窗重开，读取同一实例和 layout，比较顺序、尺寸、无重叠，数据中无断点副本。
2. 1024×768、最小窗及窄 Web 容器仅缩放往返，文件字节不变。主动改后取消再回宽窗也保持原板。试边界尺寸、键盘操作与可见命中。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
