# t1fr/task02 · RGL 最终定向复核

- Lead `t3p`，终端 `t1fr`，工作目录 `/home/wta/projects/huhu`，HEAD `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`。审查工作树上的 `DashboardGrid.tsx` SHA-256 `8091290d764d017e6da7df174cdbffdeb992dfe7f6982992a3287d1a2240b745` 和 `acceptance.spec.ts` SHA-256 `ba3dc18c699372a0ff4d69ee25aadd2c8796e5edd9aaf4286f0ccbb04d86445c`。
- task01 已结束，本报告补充正式派发的 task02。已读实施者 report07。原独审报告保留。 [report01](/home/wta/projects/huhu/temp/closeout-release/t1fr-report01.md) · [实施报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report07.md)

## 复核结论

- **P2 触摸中断已修复。** 对当前生产组件和锁定的 RGL 2.3.0 执行 `touchstart → touchmove → touchcancel`。活动时卡片位移为 155px，document 上 `touchmove` 和 `touchend` 各一条。取消后、卸载前位移复位到 0px，拖动类和占位清除，监听各归零。取消回调一次，提交零次，卡片 DOM 身份保持原样。随即以新触点重拖并释放，吸附到 x=1，草稿提交一次，两条监听清理。补丁按触点识别中断，在标记取消后走 RGL 常规结束事件。 [生产入口](/home/wta/projects/huhu/packages/workbench/src/home/DashboardGrid.tsx:141) · [触摸探针](/tmp/huhu-t1fr-rgl-touchcancel-fixed.mjs)
- **像素刷新保留。** 220px 格距下同一五步探针得到 44、88、132、176、220px，卡片 DOM 与把手焦点保持，松开提交 x=1。 [五步探针](/tmp/huhu-t1fr-rgl-pixel-fixed.mjs)
- **P3 占位滞后仍存在。** 测试格距 220px，卡片从 x=0 向右移动 132px 并停住，卡片已经跟手移动，原生占位仍标在 x=0。保持不动并松手，卡片吸附到 220px 并提交 x=1。对照组在松手前增加一次鼠标移动，原生占位才更新到 x=1。RGL 2.3.0 在应用新格点前读取旧卡坐标构造占位。用户跨格后停住检查落点时，反馈可一直留在原格。该偏差影响 ACC-DASH-02 的落点预览和 W04-02 的预览吸附，实际松手吸附和草稿位置均正确。该探针覆盖拖动，没有据此判定 ACC-DASH-03 缩放占位或写盘行为失败。 [跨格后停住的探针](/tmp/huhu-t1fr-rgl-placeholder.mjs) · [RGL 占位实现](/home/wta/projects/huhu/packages/workbench/node_modules/react-grid-layout/dist/chunk-CUP5Y2ZG.js:959) · [规格](/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/spec.md:12) · [W04-02](/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/tasks/W04-02-drag-grid.md:3)

## 运行边界

本会话运行三个 Node/JSDOM 探针和定向 `git diff --check`，业务文件只读。Lead 的全组 8/8 对应上一个像素刷新版本。最终触摸补丁的两项 Electron 复验另计。 [前版 Electron 结果](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-pixel/result.json)

已核对 Lead 在最终触摸补丁上的定向 Electron 结果，宽屏鼠标拖动／缩放／Escape 与触摸中断／后续拖动／保存／重载两项均通过，零跳过、零 flaky。两项用例未断言跨格后停住时占位的坐标。 [最终 Electron JSON](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-cancel/result.json) · [日志](/home/wta/projects/huhu/temp/closeout-release/dashboard-rgl-cancel.log)

共享任务目录为只读，按任务发布至备用路径。

Lead 已收取，原报告与探针位置保留；P3占位预览转 task08 修复。
