# t1fr/task01 · #10 RGL 生产接入独立审查

- Lead `t3p`，终端 `t1fr`，工作目录 `/home/wta/projects/huhu`。
- 基线为主工作树 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`。审查其未提交的看板增量，含新增的 `DashboardGrid.tsx`、单测与生产 E2E 改动，也核对了 Lead 通知的两项在途修订。采样时 `DashboardGrid.tsx` SHA-256 为 `33e6def4db25f870a6f518749c2c272830f31275bc4430236c4712639d09374c`。
- 已读 `t1d8/task07.md`、`report06.md`、#10 规格、设计、原型确认和 W04 格点验收。报告生成时同目录及约定备用目录均无 `t1d8/report07.md`。本次执行完成，建议修复下列触摸中断缺陷后验收。

## 规格轴

### P2 · 触摸取消后，界面留在已取消的拖动预览

在触摸设备打开宽看板并编辑，从把手拖出至少一格。手势被系统中断时，对该触点产生 `touchcancel`。当前页面播报「已取消卡片调整」，移动的卡和占位继续停在拖动状态。后续 `touchend` 不会为同一已取消的触点再发。卸载会清理残留监听。

用 Node/JSDOM 挂真实生产 `DashboardGrid` 和锁定的 RGL 2.3.0，按 `touchstart → touchmove → touchcancel` 投递。取消前后卡片保持 `translate(155px)`、`react-draggable-dragging` 和占位，document capture 下的 `touchmove` 与 `touchend` 仍各一条。取消回调执行一次，草稿提交零次。相同输入把末事件改为 `touchend` 后，卡吸附到 152px、占位和监听归零、草稿提交一次。取消路径卸载后监听也归零。 [触摸中断对照探针](/tmp/huhu-t1fr-rgl-touchcancel.mjs)

`onTouchCancel` 只标记适配器草稿快照已取消。已锁定的 `react-draggable@4.7.2` 为卡片自身的传感器监听 `touchend`，清理在 stop 或卸载执行。RGL 内的 `touchcancel` 监听属于外部投放且生产未启用。原画布在 `pointercancel` 即清理预览。按 ACC-DASH-16 与 W04-02，结束或中断须在当前画布立即恢复手势前的草稿视图，清理占位和监听，并允许下一次手势。 [取消实现](/home/wta/projects/huhu/packages/workbench/src/home/DashboardGrid.tsx:124) · [W04-02 验收](/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/tasks/W04-02-drag-grid.md:11) · [规格](/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/spec.md:26)

### 已跟踪失败的独立复核

- **宽屏首拖。** 原 Electron trace 的 `irox@56` 把鼠标从 113 移到 333，随后首个预览几何轮询超时。trace 中没有 Escape 动作，原始记录不能判断 Escape 是否恢复。新版测试等待 `react-draggable-dragging`，保留 2px 及保存文件断言。独立探针在鼠标按下后先确认该类已渲染，再逐个发送 44px 的五步移动，每步等待 React 刷新。最后两步卡片仍在 132px，格点占位已经在 220px，释放后卡片吸附至 220px 并提交 x=1。复现偏差同为 88px。锁定版 GridItem 以 ref 累积像素位移，memo 在布局格坐标及其他属性相同期间跳过卡片渲染，与观察吻合。单凭等类出现无法保证消除此偏差。若收尾按格点吸附验收，可在按住时测量目标占位与让位卡，在释放后以同样 2px 容差核对真实卡片，再核对落盘。 [原日志](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-ui.log:118) · [逐步移动探针](/tmp/huhu-t1fr-rgl-early-move.mjs) · [最新版用例](/home/wta/projects/huhu/tests/e2e/workflows/acceptance.spec.ts:777)
- **Escape。** 当前生产在交互态通过 document capture 处理 Escape，并结束鼠标传感器。独立探针从初始焦点在 BODY 的状态拖动原生缩放把手，宽度从 444px 到 596px。派发 Escape 后、物理 mouseup 前，宽度回到 444px、占位移除，随后 mouseup 草稿提交仍为零。该结果验证当前修订的鼠标缩放取消路径。 [Escape 探针](/tmp/huhu-t1fr-rgl-resize-escape.mjs) · [取消入口](/home/wta/projects/huhu/packages/workbench/src/home/DashboardGrid.tsx:53)
- **窄列。** 原 trace 只记录设置 700px 视口与拖把手仍可见，缺少实际容器尺寸或单列属性。当前 `narrow` 同时控制常规文档流投影、坐标／顺序按钮和指针使能。修订后的用例设 600px 且等待实际单列标记，再验证键盘重排、原卡 DOM 身份和保存。该路径等待 Lead 本轮真实结果。 [原日志](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-ui.log:148) · [单列状态](/home/wta/projects/huhu/packages/workbench/src/home/Dashboard.tsx:80) · [最新版用例](/home/wta/projects/huhu/tests/e2e/workflows/acceptance.spec.ts:918)

## 规范轴

RGL 2.3.0 是生产画布实际入口。它承担容器量测、原生鼠标及触摸传感、格点量化与尺寸约束。原有指针捕获、像素换算与拖动预览状态已移除。适配层封装 RGL 类型，在同一份起始草稿几何上调用 `movePlacement`，键盘控件也沿用该领域函数。尺寸上下限随定义传入，定义缺失时禁止缩放。排序和实例渲染使用 `instanceId`，宽窄共享同一个 GridLayout 子树和布局数据。拖动入口限于把手，查看态禁用布局手势，编辑态正文继续使用现有 inert 边界。布局变更仍交由 `useDashboard` 草稿及显式保存，部署同时使用 Desktop 和 Web 的既有共享入口。查阅供应商 CSS、项目 reduced-motion 规则以及本地 Modern Web Guidance 的拖动、重排、响应式与无障碍指南。 [画布接线](/home/wta/projects/huhu/packages/workbench/src/home/DashboardGrid.tsx:131) · [领域几何](/home/wta/projects/huhu/packages/workbench/src/home/dashboard-layout.ts:21) · [保存入口](/home/wta/projects/huhu/packages/workbench/src/home/useDashboard.ts:146) · [动效规则](/home/wta/projects/huhu/packages/ui/src/styles/base.css:1)

## 证据范围

- 本会话单文件 `pnpm exec vitest run packages/workbench/test/dashboard-layout.test.ts` 3/3，定向 `git diff --check` 通过。Node 探针使用本仓锁定 React 19、RGL 2.3.0 和 JSDOM，手工模拟视口几何和事件，未测真实浏览器布局与事件调度。
- 冻结 PoC 共 30/32，RGL 和 Homarr 各 8/8，Huhu 与 GridStack 各 7/8。此前真实 Electron 共 6/8，关联的是两项修订前版本。已读取 Lead 的先前类型和构建证据。本会话未运行浏览器、Electron、Playwright、打包或全仓检查。Lead 正在串行复验新版本，当前报告不将该轮计为通过。 [PoC JSON](/home/wta/projects/huhu/temp/closeout-release/grid-comparison-results/artifacts-stable/result.json) · [Electron JSON](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-ui/result.json)

验收文件按任务约定发布到备用路径。共享任务目录在当前会话为只读。

## 最新生产修订复核

本节更新前文「证据范围」和两项原运行失败的结论。复核的 `DashboardGrid.tsx` SHA-256 为 `1125bb852fb9ce7c34917281a869fb098687655bcd6de08ed34d2492d3112215`。

- **首拖像素刷新已修复。** 当前通过 RGL 原生 `onDrag`、`onResize` 刷新活跃卡片的 React 元素。克隆保留原键，RGL 继续计算实际位置与尺寸，未增设传感器。按上面的五步探针重新运行，卡片位移依序为 44、88、132、176、220px，每一步活跃卡片 DOM 与把手焦点均保持，松开提交 x=1。独立重跑的鼠标缩放 Escape 也在实际松开前恢复 444px，清掉占位，提交零次。 [刷新实现](/home/wta/projects/huhu/packages/workbench/src/home/DashboardGrid.tsx:115) · [新版像素探针](/tmp/huhu-t1fr-rgl-pixel-fixed.mjs)
- **Lead 最新真实 Electron 运行 8/8。** 已读取最终 JSON 和日志。首拖、缩放预览、Escape 前于物理 mouseup 恢复、窄列键盘重排和正常触摸保存重载均过，零跳过、零 flaky。上一轮只加启动等待时为 7/8，首拖仍相差 88px。两轮差异与本会话探针一致。Lead 的 Desktop/Web 构建日志显示 rc.1 完成。 [7/8 原件](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-recheck/result.json) · [8/8 原件](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-pixel/result.json) · [构建日志](/home/wta/projects/huhu/temp/closeout-release/rgl-pixel-build.log)
- **P2 触摸中断仍可复现。** 同一探针复跑的新版本在取消后仍显示拖动预览和占位，document 上 `touchmove`、`touchend` 各一条，卸载后归零。Electron 的触摸用例发 `touchEnd`，其通过验证了正常释放、保存与重载路径。 [触摸探针](/tmp/huhu-t1fr-rgl-touchcancel.mjs) · [Electron 触摸用例](/home/wta/projects/huhu/tests/e2e/workflows/acceptance.spec.ts:820)
- **P3 跨格时占位落后一帧输入。** 在最新代码上从 x=0 开始拖动，指针移到 132px（格宽 220px）并停住，卡片跟手到 132px，占位仍在 x=0。此时释放会吸附并提交 x=1。如果继续移动一次，占位才到 x=1。RGL 在移动布局前从旧卡坐标创建占位，故鼠标刚跨入目标格后停住时，落点提示显示的是原格。ACC-DASH-02/03 要求预览显示实际落点。 [停住后直接释放的探针](/tmp/huhu-t1fr-rgl-placeholder.mjs) · [看板规格](/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/spec.md:12)

当前独立结论是原两项失败已由最新真实运行关闭。触摸中断及刚跨格便停住时的落点提示仍有上述缺陷。继续保持只读业务范围，定向 `git diff --check` 仍通过。

Lead 已收取，原报告与探针位置保留；P3占位预览转 task08 修复。
