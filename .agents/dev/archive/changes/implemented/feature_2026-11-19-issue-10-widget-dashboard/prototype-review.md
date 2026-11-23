# #10 首页看板原型走查与用户确认

## 入口与依据

- 将 [index.html](prototype/index.html) 用浏览器打开即可操作。在宽窗用「添加小组件」开目录，点「编辑布局」进入草稿，点小组件右侧菜单配置或调整。页尾「原型演练」提供保存故障、插件与只读状态、主题和重置。
- 版本为当前 `prototype/` 的六个资源文件，SHA-256 为 `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342`。以 `node .agents/skills/dev-prototype/scripts/fingerprint.mjs .agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/prototype --expect <SHA-256>` 复核整个目录。
- 沿用 Huhu `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10` 的 Shell、首页内容、贡献定义和 SSH／Git 小组件信息结构。原型包随附 Huhu 自有品牌及语义 token。 [HomeModule](../../../../../../packages/workbench/src/home/HomeModule.tsx) · [贡献注册](../../../../../../packages/workbench/src/contributions.ts) · [SSH 卡](../../../../../../plugins/ssh/src/ui/HomeWidget.tsx) · [Git 卡](../../../../../../plugins/versioning/src/ui/HomeWidget.tsx)
- 对照 Homarr `dev@b440fdd574c9daa229f5cf64f7b2532770799664` 的几何、重排与就地编辑路径，核对 RGL、GridStack 与 dnd-kit 本地来源。独立 HTML 以格点 CSS 和小型状态模型展现交互，生产网格 PoC 由 W01 验证。 [批次源码](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md) · [Issue](source.md) · [规格](spec.md) · [设计](design.md) · [实施计划](plan.md)

## 需求与场景覆盖

| 验收项 | 演练入口与可见结果 | 实际源码 | 后续验证 |
| --- | --- | --- | --- |
| ACC-DASH-01、18 | 默认显示概览、待办、笔记、专注。移除全部后出现空态；宽窗可添加第一张卡。今日安排、习惯、活动、收件箱、Git、Agent CLI 和自动化可从目录选择。 | `defaults`、`definitions`、`widgetContent`、`#empty` | 默认卡种子和业务数据入口回归 |
| ACC-DASH-02～04、14～16 | 桌面把手可移动和缩放，拖中显示格点和碰撞让位；越界恢复上次可用位置。键盘方向键和位置／尺寸表单进入同一布局计算。取消恢复已保存版本，默认和推荐尺寸可撤销。 | `pointerPreview`、`applyGeometry`、`reflow`、`geometryForm`、`cancelEdit` | 真机网格库、长帧、触摸、字体缩放和主题矩阵 |
| ACC-DASH-05～07 | 目录可搜索，按系统／插件／单插件筛选。有归属、尺寸、单例和隐藏恢复反馈。配置两张 SSH 卡、复制、改名、显隐和移除分别更新独立实例。 | `renderCatalog`、`configure`、`widgetMenu`、`actions.duplicate` | 清单与服务端配置校验、业务配置原样保留 |
| ACC-DASH-08、09、17 | SSH 停用或定义缺失时查看态隐藏，编辑态保留实例占位。授权不足、读取失败、重试加载或配置过期均有卡片状态；重新启用可恢复同一 ID 与位置。 | `visibleItems`、`available`、`widgetContent`、`actions['retry-ssh']` | 独立组件边界、订阅与权限、清单一致性 |
| ACC-DASH-10～12 | 两个 Vault 分开保存。只读显示布局并限制编辑。写入失败保留草稿，冲突对照最新版本，成功回执丢失时可核对已提交布局。新格式损坏演练显示安全默认与备份恢复。 | `requestLeave`、`leave`、`saveDraft`、`compareLatest`、`actions.backup` | Engine 锁、文件原子写、实际备份、并发和幂等。根据用户决定采用新格式，原 Issue 的旧布局迁移条款仅保留历史出处。 |
| ACC-DASH-13、18 | 查看态选任务、导航、开始专注；布局版本与业务任务状态分别更新。 | `taskList`、`widgetContent`、`businesses` | 真实 Dispatcher、任务并发版本、时区、各插件数据 |
| 追加决定 · 共享布局 | 窄窗显示单列，只开放顺序与尺寸调整和草稿撤销。顺序按主网格从上到下、从左到右重排，窄窗的宽度输入在宽窗可见，窄窗自身仍占单列。缩放视口保留原布局和 revision。 | `nudgeOrder`、`packInOrder`、`updateGeometry`、`@container board` | 文案、重排预测和真实视口联验 |
| 追加决定 · 离场 | 有改动时切模块、切 Vault 或关窗，出现「保存并离开／放弃并离开／继续编辑」。失败回到原看板并保留草稿。 | `requestLeave`、`saveDraft`、`actions['keep-editing']` | 宿主关闭协调和跨模块单一离场事务 |

## 实际走查

2026-11-19 在 WTA 使用 Playwright Core 1.65.1 启动 Microsoft Edge 157.0.4341.60，以 `file://` 打开交付文件。检验品牌图、CSS 与脚本运行，页面错误、资源失败、HTTP 请求均为零。浏览器环境启用减少动效。

- **1366 × 900，Claude 浅色。** 从目录查找 SSH，添加归档主机，复制为预览主机并选不同主机。核对实例 ID 和卡片详情，指针跨列跨行移动和键盘扩大尺寸，保存并重开，核对坐标。模拟定义缺失后检查编辑占位，恢复时 ID 一致。模拟查询失败，重试恢复。恢复默认后撤销。保存冲突时原草稿仍见，对照并确认提交到下一版本。
- **390 × 850，Notion 深色。** 通过 Enter 打开小组件菜单，向前移动、调高，确认窄窗隐藏拖动把手、配置和桌面坐标入口，页面无横向溢出。带草稿切模块选择继续编辑。模拟关窗保存失败，确认仍在看板且有草稿。再次选择保存并离开，重开后保留位置及 5 格高度。回到宽窗核对同一布局。再次修改后切任务，放弃返回时仍是已保存版本。
- **1366 × 900 与 1024 × 768。** 只读禁用编辑。查看态勾选任务后当前待办减少一项、布局版本保持。改变草稿后取消恢复既有布局。模拟提交后回执丢失，核对已提交布局后生效。进入新格式损坏演练并恢复备份。切到另一 Vault 时没有原 Vault 的 SSH 实例，切回核对坐标。1024 宽度检查卡片无重叠、页面无横向溢出，最后重置。
- 临时证据为系统 `%TEMP%` 下的 `huhu-t18-prototype-qa.cjs`、`huhu-t18-board-wide.png` 和 `huhu-t18-board-narrow.png`。已验证浏览器模拟，实际引擎保存、断电、新格式完整损坏矩阵、生产网格库对比、触摸和读屏仍待执行。

## 用户反馈与确认

2026-11-21 用户在批次会话确认采用八份完整原型。本页对应资源包指纹为 `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342`，实施按本 Change 与 Issue 的验收场景推进。

**用户于 2026-11-20 确认看板布局、宽窄窗调整、保存冲突和带草稿离场。** 确认对象为指纹 `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342` 的完整资源包。用户在批次会话选择「确认这两个版本及上述场景」。共享布局以及窄窗顺序、尺寸和三种离场动作沿用此前决定。 [批次用户决定](../../../../../system/herdr-core/2026-11-19-huhu-prototypes-and-slices/topic.md)

原型采用六列格点，默认显示概览、任务、笔记和专注。窄窗重排时维持阅读顺序。演练中的「重新打开工作台」读取模拟保存数据，刷新 HTML 会重载初始示例。
