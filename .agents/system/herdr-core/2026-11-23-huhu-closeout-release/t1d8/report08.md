# RGL 跨格落点预览修复

- 执行终端 `t1d8`，Lead `t3p`
- 任务 `task08.md`，交付 `report08.md`
- 工作区 `/home/wta/projects/huhu`，生产依赖 `react-grid-layout@2.3.0`

## 复现与修复

在格距 220 px 的看板上，从首格拖卡片向右 132 px 后停住。独审和本轮 Node/JSDOM 探针均观测到卡片跟手移动到 132 px，RGL 占位仍在 0 px，松手后卡片吸附并提交到 220 px。锁定版先用旧坐标构建占位，再调用 `onDrag` 和自定义 compactor。RGL v2 的文档要求把回调参数视为只读。 [独立复核](../../../../../temp/closeout-release/t1fr-report02.md) · [探针失败原件](../../../../../temp/closeout-release/t1d8-rgl-preview-red.log)

生产通过公开 `onDrag` 取得布局，复用既有领域投影计算当前落点。同一投影结果交给 RGL compactor 和视觉占位，避免每次移动计算两遍。视觉占位用 RGL 公开 `calcGridItemPosition` 和 `transformStrategy` 生成，出现时隐藏滞后的原生拖动占位。原生缩放占位、传感器、提交、回滚和卡片身份继续走 task07 的入口。 [落点投影与画布](../../../../../packages/workbench/src/home/DashboardGrid.tsx) · [占位样式](../../../../../packages/workbench/src/home/dashboard.css)

## 验证

- 使用同一 Node/JSDOM 探针只发送一次跨格 `mousemove`，无后续移动就松手。修复前占位 0 px、最终 220 px，断言失败。修复后占位和最终位置同为 220 px，移动卡片在松开前仍位于 132 px，保留节点和焦点，草稿只提交一次。 [探针源码](../../../../../temp/closeout-release/t1d8-rgl-single-crossing.mjs) · [通过输出](../../../../../temp/closeout-release/t1d8-rgl-preview-green.log)
- 复跑独审三个低成本 Node 探针。鼠标 44、88、132、176、220 px 分步跟手、缩放 Escape 即时撤销、触摸取消后复位并可重拖均通过。定向 `oxfmt --check` 和 `git diff --check` 通过。
- task07 的最终 Electron 定向原件仍为 2/2。其 JSON SHA-256 是 `d60f6cd72228471718ac7cfe1f5fb12830103eedc89437a22c813da67ceb87b6`，日志 SHA-256 是 `088b8ee5cdf971ab01bb49a31f86d87c3c31bb7e27273de2db0321146a09971f`，与本轮读取前一致。 [原始 JSON](../../../../../temp/closeout-release/dashboard-rgl-cancel/result.json) · [原始日志](../../../../../temp/closeout-release/dashboard-rgl-cancel.log)

## 未运行的验证

Worker 未运行 Electron/Playwright、构建、打包、全仓类型检查或全量测试。新增 E2E `首页看板：跨格停住时预览与松手落点一致` 只发一次跨格鼠标移动，在松开前以 2 px 容差核对实际可见占位，松开后以同一容差核对卡片落点并断言播报及草稿零写入。宽屏拖动／缩放／Escape 和触摸中断两项保留原有行为断言，选择器改为可见占位。源码已冻结，交 Lead 定向运行。 [生产 E2E](../../../../../tests/e2e/workflows/acceptance.spec.ts#L820)

```bash
pnpm exec playwright test tests/e2e/workflows/acceptance.spec.ts -g '首页看板：(跨格停住|宽屏拖动|触摸中断)' --workers=1 --retries=0
```

## Lead 验收
已核对公开坐标投影复用与真实E2E结果。t1fz types/build 和跨格停住/宽屏/Escape/触摸中断三项E2E全部通过，零跳过，证据 history-rgl-reviewed.json。task08签收，最终安装包仍待统一发布门禁。
