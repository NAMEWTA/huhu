# W01-01 测量修复与生产方案建议

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead — `t3p`
- terminal_address — `t1d8`
- task — `task06.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/task06.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report06.md`
- 执行结果 — `done`，夹具改动与静态核对完成，等待 Lead 重启后复验。

## 复验与测量

基线为共享主工作树 `cc551778`。t1f7 增量运行 24 项，17 通过、7 失败、零跳过、零 flaky。旧结果的 JSON、trace 和日志保留。 [原始 JSON](../../../../../temp/closeout-release/grid-comparison-results/artifacts-adapted/result.json) · [原始日志](../../../../../temp/closeout-release/grid-runtime-adapted.log)

| 现象 | 已核对的原因和处理 |
| --- | --- |
| 四个卸载用例均多五个 window capture 监听 | 四份浏览器 JSON 的五条注册堆栈都包含连续的 `addHitTargetInterceptorListeners → InjectedScript._setupHitTargetInterceptors → new InjectedScript`。夹具以这三层来识别测试工具监听，保留原始计数与完整来源，并单独比较应用监听。移除无效的 trial 预热。将四份原证据回放给新分类函数，均能识别五条工具监听。注入同名同作用域的模拟业务监听和仅一个同名调用帧的堆栈，均继续计入。 |
| RGL 拖中 `inspectDashboardGrid` 消失 | t1f7 于当地 13:11:42 开始，RGL 第一项于 13:11:59.696 开始。13:12:00 t1dz 打印依赖新增 `react-grid-layout/core` 并重载，13:12:02 又因我格式化写回两份适配文件触发重载。该 trace 同页出现三次 Vite 重连，React 依赖 URL 的优化版本在首两次之间改变。将三个实际发布包入口列入 `optimizeDeps.include`。本报告发布后停止写入，交 Lead 重启再运行。 |
| GridStack 卸载附有另一条 `gridstack` 空值异常 | 与五条监听无关。trace 指向本地 `draggable(active, "destroy").resizable(active, "destroy")` 后半段。销毁拖动同步触发 stop，清掉 `active`。夹具在销毁前保存同一个 DOM 节点传给两步。Node 探针模拟同步重入，确认第二步仍取到原节点。 |
| GridStack 越界保留裁切后位置 | 修复尺寸回写后，向右请求 4 列仍提交 `(3,0)`，并给成功反馈。原生边界策略与 ACC-DASH-03 的回滚和提示有差异，若选择该库需边界适配。 |
| Huhu 键盘结果播报为空 | 键盘位置、尺寸和 CSS 125% 的实测仍有证据，Huhu 生产 `changeLayout` 在成功时清空文本。规格断言保留，待产品修复。 |

[监听比较和附件](../../../../../temp/closeout-release/grid-comparison/comparison.spec.ts) · [预优化配置](../../../../../temp/closeout-release/grid-comparison/vite.config.mjs) · [GridStack 夹具清理](../../../../../temp/closeout-release/grid-comparison/gridstack.tsx) · [生产播报入口](../../../../../packages/workbench/src/home/Dashboard.tsx#L102)

## 生产选型建议

建议优先把锁定的 RGL 2.3.0 用作桌面宽网格的 React 画布。先完成冻结后的同样本复验，再按 W01-01 决定实施。原完整轮已通过 RGL 的碰撞让位、保存重载、输入、窄列与触摸。增量轮确认适配后的 6×6 尺寸与越界回滚通过，键鼠和 125% 缩放也通过。当前还需在同一修订中确认碰撞重载和快速卸载。 [W01-01 判据](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/tasks/W01-01-grid-comparison.md) · [RGL 适配](../../../../../temp/closeout-release/grid-comparison/rgl.tsx)

- 在 Dashboard 内只引入一个 RGL 宽画布组件。它接收按实例 ID 排序的 `Placement[]`、定义尺寸和编辑状态，承担 RGL 布局映射、容器量测、指针预览及停止后的几何回传。RGL 负责鼠标／触摸传感、吸附、原生缩放和有效拖动的碰撞反馈。保持无自动压紧，让现有空位可持久化。RGL 类型和拖动临时状态留在画布内。
- 当前 106 行候选适配中的主要新增成本是两个领域约定。越界时用公开 constraint 在默认裁切前读原始格点并恢复本次手势前的草稿。缩放时用 RGL 量化尺寸与约束，复用现有 `movePlacement` 按手势前布局给邻卡让位，键盘改尺寸走相同操作。两个回调都只返回几何。应用收到成功落点后更新草稿并通过现有状态区播报，取消和卸载清理手势状态。拖中对整份布局重复计算的成本应按实际卡片数测量。
- React 按 `instanceId` 保持卡片身份和阅读序，沿用现有 Frame、业务控件与报告区域。窄容器继续用同一草稿的窄列投影和重排控件。Dashboard 和 `useDashboard` 继续负责草稿、保存、取消、冲突及 leave，Engine 继续校验持久化坐标。生产验收应覆盖同一草稿宽窄转换、把手内外输入、退出过渡、键盘播报以及真实 Electron 和 Web 宿主。锁定依赖并记录 MIT 许可及实际采用版本。 [布局运算](../../../../../packages/workbench/src/home/dashboard-layout.ts#L13) · [草稿与保存](../../../../../packages/workbench/src/home/useDashboard.ts#L111)

GridStack 14.1.1 已经通过碰撞、尺寸、键鼠、CSS 缩放与触摸的一轮实际对照。它值得保留为备选，若选用需承担命令式节点生命期和越界回滚，已复现的包装清理错误也需复验。Homarr 适配在增量轮五个业务交互通过，调用了真实几何和 reflow，并由夹具提供传感、尺寸约束、视图缩放和 React 壳。全面移植会增大维护面，适合作为行为参考。保留现有 Huhu 画布可减少本次接线，但仍由项目承担全部传感维护及键盘播报缺口。 [候选职责和版本](../../../../../temp/closeout-release/grid-comparison/README.md)

运行基线为 npm RGL 2.3.0 的 `9b01a614bcdd13e7e921cf3f4b1c7e77942421c1`、npm GridStack 14.1.1 的 `9e45ce898c3bfd9d7b78d62110c60dd219e1c3b9`。两者各自的本地参考提交与发布提交不同。Homarr 从 `b440fdd574c9daa229f5cf64f7b2532770799664` 原件执行。 [发布完整性与本地 pin](report02.md#版本与许可)

## 已验证与待运行

- Node 回放四份真实监听堆栈与同事件业务监听，验证 reentrant cleanup；静态语法、定向格式与 `git diff --check` 通过。原增量 JSON 和日志 SHA-256 与检查前一致。32 项场景原样保留。
- Worker 未启动浏览器、Vite、Playwright 或重型检查。由 Lead 在夹具目录重启 `npm run start`，确保依赖预优化完成，输出到新目录完成 32 项。RGL 的碰撞和重挂、四候选的应用监听、GridStack 清理、Huhu 键盘缺口均带原断言复验。

```bash
HUHU_GRID_OUTPUT_DIR="$PWD/../grid-comparison-results/artifacts-stable-$(date -u +%Y%m%dT%H%M%SZ)" node ../../../node_modules/@playwright/test/cli.js test -c playwright.config.mjs
```

## Lead 验收

Lead t1fc冻结完整复验30/32：RGL8/8与Homarr8/8，Huhu7/8播报缺，GridStack7/8边界策略差异。接受本轮选型证据，依照design优先RGL，转task07生产接入。
