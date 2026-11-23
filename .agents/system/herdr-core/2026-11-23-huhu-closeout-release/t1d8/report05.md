# W01-01 网格失败归因与适配复验

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead — `t3p`
- terminal_address — `t1d8`
- task — `task05.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/task05.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report05.md`
- 执行结果 — `done`，归因和夹具适配已交付，浏览器复验和选型待 Lead。

## 第三轮证据

在 `/home/wta/projects/huhu` 的共享主工作树实施，基线 `cc551778`。完整原始结果为 20 通过、12 失败、零跳过、零 flaky。Huhu 6/8、RGL 5/8、GridStack 2/8、Homarr 7/8。各失败用例的诊断与截图保留在原目录。 [原始 JSON](../../../../../temp/closeout-release/grid-comparison-results/artifacts-mounted/result.json) · [原始日志](../../../../../temp/closeout-release/grid-runtime-mounted.log)

| 失败 | 证据与归因 | 本轮处理 |
| --- | --- | --- |
| 四个候选卸载后共同增加五个 window capture 监听 | Playwright 1.65.0 的 `InjectedScript._setupHitTargetInterceptors` 调用 `addHitTargetInterceptorListeners`。将安装包中的原方法放到 Node VM，替换 window 以记录调用和堆栈，精确复现 `mousemove`、`mouseup`、`pointerup`、`touchend`、`touchcancel` 的 capture 集合。 | 预热无业务副作用的 Playwright trial，之后采集原封不动的基线，登记监听来源堆栈。仍比较全部监听数，并检查卸载期间的浏览器异常。 |
| Huhu 键盘提示为空 | 坐标、键盘焦点、尺寸和 125% 缩放断言走完。生产 `changeLayout` 对成功的键盘操作清空反馈，指针提交路径另设位置文本。 | 保留失败断言和真实生产组件，交 Lead 处理产品播报。 |
| RGL 最大尺寸停在 2×2 | 最后一条 native `onResize` 已报告 focus 6×6，tasks 仍为 (3,2,3,3)。v2.3.0 南东缩放在 x/y 未变时绕过 `moveElement` 碰撞路径，`noCompactor` 只克隆；夹具正确拒绝重叠。 | 依赖 RGL 原生尺寸、吸附和预览，在 resize compactor 中从本次缩放前草稿复用 Huhu 的 `movePlacement` 给邻卡让位。键盘改尺寸沿用这一策略。 |
| RGL 越界提交 (3,1) | 实际拖动请求 x=4。原生默认约束先裁到 x=3，导致尾端回调只见合法格。Node 直接调用已安装包的 `applyPositionConstraints`，确认自定义 constraint 先拿到 x=4，再由默认边界裁到 x=3。 | 在默认 constraint 前记录原始格点。越界时恢复拖动前的草稿，由现有反馈告知越界。有效操作沿用原生拖动。 |
| GridStack 碰撞、尺寸、键盘／缩放、触摸和越界出现回写异常 | 原 trace 已见碰撞让位与一格触摸增量。序列化保留 id、x/y，但 `removeInternalForSave` 会省略等于 `minW/minH` 的 w/h。在 Node 用 2×2 样本执行包内原方法复现。夹具把缺少 w/h 的有效原生结果拒绝为「实例或坐标无效」。 | 继续调用 `save(false)`，在公开 SaveFcn 回调填回原生节点实际宽高。复验真实坐标、边界策略、键盘与缩放。 |
| GridStack 快速离开还有独立异常 | 原 trace 的 `_removeHelperStyle` 在物理 mouseup 时读取已销毁的 `grid.el.classList`。包内 `_leave` 可在拖动中暂时把项移出引擎列表，普通 destroy 遍历当前节点时会遗漏该手势。 | 记录原生 drag/resize 的活跃 DOM 项，在 grid 尚存活时经公开 `getDD()` 销毁这一个手势，再销毁 grid。待重跑验证。 |

参考位置。 [回归与探针](../../../../../temp/closeout-release/grid-comparison/comparison.spec.ts) · [生产键盘反馈](../../../../../packages/workbench/src/home/Dashboard.tsx#L102) · [RGL 适配](../../../../../temp/closeout-release/grid-comparison/rgl.tsx) · [GridStack 适配](../../../../../temp/closeout-release/grid-comparison/gridstack.tsx)

## 候选原生能力与成本

RGL 在原始运行通过拖动、碰撞、输入、键鼠与 CSS 125% 缩放、窄列和触摸相关用例。专用适配由 53 行增至 106 行，新增的越界回滚与缩放让位属于 Huhu 策略。GridStack 原始数据已观察到原生拖动、碰撞预览和触摸运动，其保存、键盘、边界和 teardown 契约需要在本次适配后实测。专用适配由 94 行增至 112 行。Homarr 124 行适配覆盖原件 `placeGridItem`、阅读序与逻辑像素几何，再加本地 Pointer Events、尺寸约束、键盘和缩放包装。7/8 描述这套适配的观测结果。三者另共享夹具的卡片、窄列投影和存取层。 [Homarr 适配](../../../../../temp/closeout-release/grid-comparison/homarr.tsx) · [版本与运行边界](../../../../../temp/closeout-release/grid-comparison/README.md)

| 实际运行入口 | npm gitHead | 本地参考 pin |
| --- | --- | --- |
| react-grid-layout 2.3.0，MIT | `9b01a614bcdd13e7e921cf3f4b1c7e77942421c1` | `ec4ab79c97448947b04601c2237b2861d94a0fcb` |
| GridStack 14.1.1，MIT | `9e45ce898c3bfd9d7b78d62110c60dd219e1c3b9` | `a7f828af1c5366c02aff8a8c8fafda2abbff58a6` |
| Homarr 2.13.1，Apache-2.0 | 使用源码原件 | `b440fdd574c9daa229f5cf64f7b2532770799664` |

RGL 和 GridStack 的运行证据对应独立安装的 npm 发布包，源码检出用于参考。两个发布包的 tarball integrity 见版本记录。 [入口报告](report02.md#版本与许可)

## 已验证与待复验

- Node 源码探针确认 Playwright 注册堆栈和五个监听、GridStack 序列化最小尺寸且保留 ID、RGL 默认裁切前的坐标。定向 TS/TSX 语法、格式与 `git diff --check` 通过。原始第三轮 JSON 和日志散列一致。
- Worker 未运行浏览器、Playwright、截图或重型检查。32 场景保留。Huhu 键盘提示仍需产品修复，GridStack 真正的越界表现待有效回写后观察，RGL 新增策略与清理修复均待浏览器复验。选型以这批复验结果为准。

在夹具目录使用新的产物路径运行下列增量场景，随后可用同一入口完整重跑。

```bash
HUHU_GRID_OUTPUT_DIR="$PWD/../grid-comparison-results/artifacts-adapted-$(date -u +%Y%m%dT%H%M%SZ)" node ../../../node_modules/@playwright/test/cli.js test -c playwright.config.mjs -g '按住把手|指针尺寸|非法放置|拖中让位|桌面键盘|真实浏览器触摸'
```

### Modern Web Guidance

- **`drag`** 我保留专用拖动把手与库的原生指针处理，在夹具卸载时处理已经离开网格的活跃手势（“Keep the drag active after the pointer leaves the handle”）。

## Lead 验收
