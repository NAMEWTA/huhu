# W01-01 网格比较与选择

[任务票据](../tasks/W01-01-grid-comparison.md)。下文记录当时的验证范围与结果。

2026-11-23，Lead 串行运行冻结夹具 t1fc，32 项中 30 项通过，2 项失败，零跳过、零重试变化。使用 Huhu `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2` 的生产组件作 Huhu 对照。所有候选使用同样的三张卡、空位、约束与手势。保存由合成本地草稿实现，候选通过证明只覆盖夹具所测入口。 [复跑源码与固定依赖](../verification/grid-comparison-harness/README.md)

| 候选 | 结果 | 固定来源与行为 |
| --- | --- | --- |
| Huhu | 7/8 | 拖动、预览、回滚、读写草稿、触摸与重挂通过。键盘落点成功后 live region 为空，该断言失败。 |
| react-grid-layout 2.3.0 | 8/8 | MIT 发布包，npm gitHead `9b01a614bcdd13e7e921cf3f4b1c7e77942421c1`。本地参考 `ec4ab79c97448947b04601c2237b2861d94a0fcb`。专用适配 106 行，支持裁切前检测、取消回滚及复用 Huhu 缩放让位策略。 |
| GridStack 14.1.1 | 7/8 | MIT 发布包，npm gitHead `9e45ce898c3bfd9d7b78d62110c60dd219e1c3b9`。本地参考 `a7f828af1c5366c02aff8a8c8fafda2abbff58a6`。专用适配 114 行。越界手势被裁切后提交，回滚和提示断言失败。 |
| Homarr 2.13.1 | 8/8 | Apache-2.0 源码 `b440fdd574c9daa229f5cf64f7b2532770799664`。124 行交互包装调用上游 `placeGridItem`、阅读顺序和逻辑像素几何。结果覆盖这些函数与本地包装。 |

RGL tarball integrity 为 `sha512-4ofzuR/MlYchp+ixDUVBxH6ybaw+JH51M+rpf675ik/++4Dn0Kax/Vf2Gv/7Z++mV1ZC7mY9UV2sRRycjGjKXQ==`。GridStack tarball integrity 为 `sha512-7oxosr/htheY2QCgONtyMt/lQAS0z/34aQpib7X/VEDTWsINIiJQ/aI7+yVAvoW1GI7BhRBlbo/gXlXhLM/LOg==`。 [独立 npm 锁文件](../verification/grid-comparison-harness/package-lock.json)

按 W01-01 规则选择 RGL。生产宽画布接 RGL 传感、格点、占位和缩放。Huhu 现有领域几何决定让位、回滚、键盘与数据提交。生产以公开格点约束的提议和手势前布局调用同一放置函数，使键盘与指针在碰撞时也使用相同策略。原观察器区分 Playwright 注册堆栈，各候选仍检查应用监听、异常、重挂和草稿。 [选型规则](../design.md#布局选型与-poc-决策记录) · [生产适配](../../../../../../../packages/workbench/src/home/DashboardGrid.tsx)

原件路径均以 Huhu 仓库根为基准。原始 32 个 trace、32 张截图、Playwright JSON 和终端日志写入哈希清单。失败项仍保存在 JSON 与各自 trace。原文件可达时从仓库根执行 `sha256sum -c .agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/verification/W01-01-grid-artifacts.sha256` 核对。 [原件 SHA-256](../verification/W01-01-grid-artifacts.sha256)
