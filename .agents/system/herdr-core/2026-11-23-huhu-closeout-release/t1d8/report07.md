# W01-01 RGL 生产接入

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead `t3p`，执行终端 `t1d8`
- 任务 `task07.md`，交付 `report07.md`
- 基线 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`

## 对照与依赖

Lead 在冻结夹具 t1fc 上跑完 32 项，30 项通过，2 项失败。RGL 和 Homarr 各 8/8，Huhu 7/8（键盘调整成功后无播报），GridStack 7/8（越界被裁切并提交）。按 W01-01 选择 RGL 2.3.0，生产代码直接使用发布包。仓内归档保留 17 个冻结夹具文件、锁文件和重跑说明。检查 17 文件与原夹具逐字节相同，66 项原始 JSON、日志、trace 和截图的 SHA-256 全部校验通过。 [比较记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/evidence/W01-01-grid-comparison.md) · [重跑说明](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/evidence/grid-comparison-harness/README.md) · [校验清单](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/evidence/W01-01-grid-artifacts.sha256)

| RGL 来源 | 版本或校验值 |
| --- | --- |
| Workbench 精确依赖 | `react-grid-layout@2.3.0` |
| npm 发布 gitHead | `9b01a614bcdd13e7e921cf3f4b1c7e77942421c1` |
| npm tarball integrity | `sha512-4ofzuR/MlYchp+ixDUVBxH6ybaw+JH51M+rpf675ik/++4Dn0Kax/Vf2Gv/7Z++mV1ZC7mY9UV2sRRycjGjKXQ==` |
| `temp/sources` 独立参考提交 | `ec4ab79c97448947b04601c2237b2861d94a0fcb` |

Lead 在 t1ff 安装，新增 5 包，共享 lock 差异 56 行新增、2 行删除，包含同批此前 MCP 删除。上游台账收录发布包 MIT 全文，Lead 已通过 `pnpm notices` 生成通知。 [依赖声明](../../../../../packages/workbench/package.json) · [安装日志](../../../../../temp/closeout-release/rgl-dependency.log) · [许可台账](../../../../../docs/upstream/ledger.md) · [通知生成日志](../../../../../temp/closeout-release/rgl-notices.log)

## 生产接入

- 一个 `GridLayout` 实例保有按 `instanceId` 标识的卡片。宽屏使用 RGL 鼠标、触摸、吸附、占位和缩放。窄列投影让同一组 DOM 节点自然排列，实测容器宽度决定单列、编辑按钮和传感器开关。现有定义提供尺寸上下限。
- 公开 constraint 读取 RGL 裁切前的候选格点。宽屏拖动和缩放从手势前的草稿复用 `movePlacement`，与键盘共享让位规则和空位策略。拖动结束才回传合法变更。移除了生产自有的 pointer move、捕获和缩放管线。
- 画布的 Escape 与 `touchcancel` 将对应手势标为取消，再发送标准结束事件，由 RGL 常规停止路径清理传感器和占位并恢复上一份有效草稿。Escape 用例检查实际鼠标松开前已复位。触摸用例检查中断后原实例、原位置、播报、零写，以及下一次拖动仍能保存。
- 窄列重排、尺寸选择和宽屏键鼠成功后在同一个状态区播报。草稿、保存、并发冲突、离场、只读、卡片业务输入和 Engine 布局格式继续由既有入口处理。新增样式使用现有主题 token。

[RGL 画布](../../../../../packages/workbench/src/home/DashboardGrid.tsx) · [Dashboard 编辑入口](../../../../../packages/workbench/src/home/Dashboard.tsx) · [领域布局函数](../../../../../packages/workbench/src/home/dashboard-layout.ts)

## 生产运行证据

Lead 的首轮合并产物 t1fm 定向类型检查与构建通过。该产物的 8 项实际 Electron E2E 为 6 通过、2 失败，触摸拖动、保存和重载通过。原始结果、输出及两份 trace 均保留。 [定向类型检查](../../../../../temp/closeout-release/rgl-mail-types.log) · [构建](../../../../../temp/closeout-release/rgl-mail-build.log) · [首轮 E2E 日志](../../../../../temp/closeout-release/dashboard-rgl-ui.log) · [首轮 E2E JSON](../../../../../temp/closeout-release/dashboard-rgl-ui/result.json)

| 首轮失败 | 跟进修订 |
| --- | --- |
| 原 `acceptance.spec.ts:788` 首次宽屏拖动预览差 88 px，尚未执行 Escape。第二轮先等待传感器启动仍复现。独立探针证实 RGL 记录像素位移，卡片却停在发生格点变化的 132 px，余下 176 和 220 px 都在同一格，memo 跳过重绘。 | 用 RGL 公开 `onDrag`、`onResize` 刷新活跃卡片元素，保持原键和 DOM。独立探针逐步观察到 44、88、132、176、220 px。E2E 保留 2 px 断言，检查 Escape 后真实鼠标释放前的占位清除和复位，也核对播报、持久化及实例身份。 |
| 原 `acceptance.spec.ts:932` 在 700 px 名义视口仍见宽屏拖动按钮。原 trace 记录视口请求及可见按钮，未捕获看板实际量测值。 | 在 600 px 视口明确等待看板进入单列，再断言宽屏按钮隐藏和键盘重排。React 从同一个 `narrow` 状态渲染对应控件，宽窄切换仍检查卡片节点身份及磁盘字节。 |

### 首轮原件 SHA-256

| 原件 | SHA-256 |
| --- | --- |
| `temp/closeout-release/dashboard-rgl-ui.log` | `928a93264034172917e03f3d9a9f7d3e9a6b19df2e60498d9c83ae436221db3e` |
| `temp/closeout-release/dashboard-rgl-ui/result.json` | `38909d50767bebbbcb50b083c0c70f24f4b211b5603cb8bae8c4d7b9d9c8b5d9` |
| 同目录 `artifacts/workflows-acceptance-首页看板：宽屏拖动与缩放预览保持草稿，退出拖动恢复原位置/trace.zip` | `5582eebe75bdf9f9741ab8f9a3c27c5b2f4d9c2a79ea5b783f0e141c86840c40` |
| 同目录 `artifacts/workflows-acceptance-首页看板：窄屏调整顺序时保留草稿，保存后在宽屏重开使用同一布局/trace.zip` | `c9afe9c1c2998d130d8bf313d4e53546e9329f5d4455bb249ffd96726f50c72f` |

第二轮 7/8，窄列键盘重排及持久化通过，宽屏首拖仍差 88 px。t1fw 定向类型检查、Desktop 和 Web 构建以及完整 Electron E2E 退出 0，8/8 通过。t1fr 独审另外用触摸取消探针复现旧版释放缺口，并在上一版观察到跨格后立刻停住时，原生占位可显示上一格，下一输入更新占位，鼠标释放会提交正确格点。 [第二轮 JSON](../../../../../temp/closeout-release/dashboard-rgl-recheck/result.json) · [8/8 JSON](../../../../../temp/closeout-release/dashboard-rgl-pixel/result.json) · [8/8 日志](../../../../../temp/closeout-release/dashboard-rgl-pixel.log) · [构建日志](../../../../../temp/closeout-release/rgl-pixel-build.log) · [独立审查](../../../../../temp/closeout-release/t1fr-report01.md)

触摸中断补丁处理 `touchcancel` 后无 `touchend` 的情况。只将对应触点送入常规停止事件，使用同一回滚草稿和卡片节点。CDP 回归追加了真实 `touchCancel`、2 px 几何回滚、占位清除、播报、原节点、零写和重新拖动保存。待 Lead 对最后修订定向复验触摸中断及相邻宽屏用例。

## Worker 验证

- `pnpm exec vitest run packages/workbench/test/dashboard-layout.test.ts` 对应 t1fk，退出 0，1 文件 3/3。覆盖让位、保留空位、越界回滚、窄列重排和播报格式。
- 定向 `oxfmt --check`、TypeScript 语法解析及 `git diff --check` 通过。

## 未运行的验证

Worker 未运行浏览器、Electron、Playwright、打包、全仓类型检查或测试。源码验收沿用 Lead 的隔离用户目录、DBus／keyring、Xvfb 和独立报告路径。最后修订仅复验触摸中断及相邻宽屏拖动。候选包验收由 Lead 按发布流程安排。

- `tests/e2e/workflows/acceptance.spec.ts`。`首页看板：宽屏拖动与缩放预览保持草稿，退出拖动恢复原位置`、`首页看板：触摸中断回滚，下一次拖动可保存并在重载后保留位置`。窄列重排与其余用例的结果见 t1fw 日志。 [源码 E2E](../../../../../tests/e2e/workflows/acceptance.spec.ts)
- `tests/e2e/workflows/dashboard-appearance-package.spec.ts`。`候选看板：四主题明暗、减少动效、放大与键盘移动保存`，断言键盘结果播报和 Vault 持久化。 [候选包 E2E](../../../../../tests/e2e/workflows/dashboard-appearance-package.spec.ts)

```bash
pnpm exec playwright test tests/e2e/workflows/acceptance.spec.ts -g '首页看板：(触摸中断|宽屏拖动)' --workers=1 --retries=0
scripts/accept-linux-candidate.sh dashboard "$APPIMAGE" "$SHA256" "$GIT_SHA" "$CODEX"
```
