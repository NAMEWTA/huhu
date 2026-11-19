# #10 看板的实例、网格与保存边界

## 两条调用路径

1. **编辑两张 SSH 卡。** 当前 Vault 已有主机 A、B。用户打开抽屉，选择 SSH 主机类型，配置 A。复制卡片，将副本改为 B，再移动、缩放。目录按可信内置定义、启用状态及实际可读能力过滤，两个 instanceId 不同，config 只存 hostId。网格反馈更新本次编辑草稿。保存提交一次完整 board 和 baseRevision，成功返回规范化实例、坐标、新 revision。读回仍是 A、B 两卡。配置目标已删除时卡内提示重新选主机。只读 Vault 拒绝布局写，冲突/写失败保留草稿。不触发 SSH 连接或修改主机。
2. **查看态勾选任务。** 任务卡以本实例 filter 对当前 Vault 调用 `tasks.list`，用户勾选只发 `tasks.setStatus({id,status:"completed",expectedVersion})`。任务能力拥有业务写及权限检查，成功后由相关任务/摘要查询更新数量，磁盘看板字节不变。版本冲突时本卡重取任务并解释状态。只读、停用或不具授权时控件不写入。另一张筛选不同的任务卡按自己的数据更新，拖动把手在查看态不工作。现有 renderer 用桌面调用者身份。内置 UI 在受信任装配内按定义允许的业务能力接入，不能靠卡片配置选择任意 capability/caller。外部扩展继续受独立宿主/Dispatcher 约束。

## 数据与状态归属（拟议）

| 所有者 | 契约 |
| --- | --- |
| 内置插件 / kernel 定义 | 在现有贡献体系扩展 HomeWidgetContribution。建议沿用 `widget:<owner>:<id>` 作稳定类型键，manifest 仍以所属插件的局部 id 声明。纯数据部分含名称/说明、默认与 min/max 尺寸、多实例规则、允许的配置 schema/默认值及可用条件。Engine 和 UI 复用同一可信描述。图标、config 表单、组件或受控惰性加载器仅存在于 Renderer。用集合比对 manifest、引擎描述与实际 UI 注册，捕获重名、多报和漏报。kernel 系统项单独核对。停用仅移除可用贡献。 |
| 看板 / Frame / Catalog | 唯一页面负责添加、重复、改名、显隐、移除、位置和编辑状态。Frame 提供标题/动作插槽、可访问把手、加载/空态/无权/失败状态、每实例 ErrorBoundary 与重试。插件得到 instanceId、已校验 config、容器尺寸/编辑态和现有导航。查询使用既有 EngineProvider。目录提供系统/插件分类、搜索、尺寸预览和配置。定义未加载前不乐观挂载。卸载或切 Vault 解绑查询、订阅、观察器和计时器。 |
| 网格 | 接收以 instanceId 为 key 的格坐标及约束，负责吸附、碰撞、让位预览和停止后的候选布局。React 只保存一个编辑草稿。引擎组件内部可以有指针临时状态，查看/取消/重挂载均从对应快照投影。持久化只接受模型字段。 |
| HomeStore / Engine | 单写者为持有 Vault 写者锁的 Engine。拟在 `registerHomeCapabilities` 注册 `home.dashboard.get`（read）、`home.dashboard.update`（write）。get 从当前 Vault 取快照、revision、可写性与新格式恢复提示。update 接收 baseRevision 与完整草稿，校验成功后返回权威快照。输入输出 Zod schema 可生成目录描述。Dashboard 不代理任何业务写。 |

建议唯一文件沿用 `<Vault>/.huhu/home/widgets.json`，正常由 `vault.stateDir/home` 定位。数据形状为 schemaVersion、boardId（一期固定一张）、revision、updatedAt、instances（instanceId/widgetType/title?/config/hidden）与 layout（instanceId/x/y/w/h）。实例 ID 在添加/复制时生成一次。保存重试、渲染、缩放和插件启停均保留。定义/组件、函数、任意 HTML、口令/令牌和业务内容不得序列化。业务引用为稳定 ID。未知类型仅原样保留以前读到的受限 JSON 配置，不能通过更新请求注入新未知类型或修改其不透明配置。隐藏的单例也计入数量。

## 校验、备份与故障窗口

保存策略也可让网格在每次 dragstop 直接覆盖文件，取消时再回写进入编辑时的备份。这沿用旧首页的即时写法，却会让其他会话读到半成品，崩溃时还会留下用户尚未保存的修改。推荐 Renderer 持有整份草稿，Engine 串行校验后一次替换。代价是要显式处理旧 revision 和内存草稿离场，但取消可以做到零文件写入。layout 与 instances 使用同一个提交边界，杜绝有位置无实例或实例已删位置仍在的中间态。

| 输入/窗口 | 建议处理与可复验的不变量 |
| --- | --- |
| 有效板、空板、首次加载 | 一个 Vault 一份已提交快照。每个实例有且仅有一条几何，关联键唯一。x/y 为非负整数，w/h 为正整数，x+w 不超列数，尺寸满足定义约束。隐藏或暂缺定义的原位置保留。编辑已占位置按同一碰撞规则显式让位。持久化无重叠。排序以 y、x、instanceId 决定。缺文件时在内存构造稳定默认。合法空 instances 维持空板。 |
| 新格式备份 / 恢复 | 仅从已通过当前 schema 校验的已提交板制作备份；恢复时先验证整份备份和目标 Vault 的可写性、revision，再一次性提交。损坏的新格式样本须先保全原件，备份失败仍保留当前字节。遇到已有旧格式或不能确认来源的非空文件，只读提示、保留原件，可在空测试 Vault 验证新板恢复。设计不安排旧格式识别转换器、导入向导或回写。业务文件、focus.json 和 habits.json 均在布局操作之外。 |
| 可修复的数据与未知定义 | 已存新格式的空/重复实例键导致几何关联含混，保全原件并进入显式恢复。不要猜重复项对应的业务配置。可解读布局的孤立几何丢弃于恢复视图，缺失/非法尺寸按定义默认、越界夹到界内，按稳定顺序把冲突项放入首个可用格。恢复前显示具体调整。无法解析的 JSON 或结构、非法版本显示安全默认及恢复提示。覆盖前必须成功另存原件，复制失败则不落盘。未知更高版本只读保护并提示升级。缺失插件保留实例与位置。已知定义升级使某卡配置失效时隔离该卡，允许修改其他卡时原样带回该未动记录。新提交的非法配置、非有限/负坐标、重复 ID、未知新增类型、非法交叠直接拒绝，不部分写入。 |
| 只读与切 Vault | 当前 boot 将 HomeStore 仅指向 `vault.stateDir/home`。`Vault.open` 对不可写的只读 Vault 或只读普通目录可能改用 scratch。拟把持久布局的只读来源显式指向原 Vault 下已有文件，缺失则内存默认。读取权限不足与缺文件分开显示。update 在 handler 检查 `vault.assertWritable()`，只读时禁止任何布局写入或自动修复。切 Vault 经过模块离场或关闭窗口时先落实 [ACC-DASH-04](spec.md#用户验收)。完成切换后清除旧编辑会话、卸载卡片，查询键始终含 vaultId，过滤迟到回包/事件。提交应绑定发起时的 endpoint。 |
| 并发、断电/失联与重试 | 在同一 Vault 写入临界区重读 revision、校验、同目录写临时文件再 rename。仅在替换成功后回快照并通知。旧 revision 返回 VERSION_CONFLICT，UI 保留草稿供对照最新后重做/重新保存。显式保存生成稳定幂等键及固定输入，重复点击共用在途操作。当前 `EngineClient.call` 默认每次生成新键，需支持本次保存复用。临时写失败仍读旧板，rename 已完成但回执/幂等记录未写时重取并对照规范化内容和 revision。已提交则采用已存结果，已被再次更新则提示冲突，绝不盲重发覆盖。重试不重建实例。 |
| 事件、缓存与编辑中外部变化 | 目前 queryKey 为 [vaultId, capability, input]，`invalidateForEvent` 还会失效 `home.`。改为业务事件只失效有关卡片及真正依赖的汇总。布局写只使当前 Vault 的布局失效。插件状态变化刷新定义/权限、停止停用卡请求。编辑期间刷新只更新已提交参照并提示冲突，不覆盖草稿。单卡查询错误和 render 错误分别处理。 |

现行 D-37 暂留内置卡在首页是因为共用聚合、迁移面大。本设计建议只替代该条中的卡体归属。保留贡献注册、Vault 隔离和内置聚合按调用者读取业务能力。实施时记录后继决定、更新调用方并删旧路径。[D-37 原记录](../../archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/decisions.md) · [实际装配](../../../../apps/engine/src/boot.ts) · [Vault](../../../../packages/vault/src/vault.ts) · [Dispatcher](../../../../packages/kernel/src/dispatcher.ts) · [查询失效](../../../../packages/workbench/src/engine-client/query.ts)

## 布局选型与 PoC 决策记录（静态预选）

先查 Huhu 的两列排版、@huhu/ui、React 19、ContributionRegistry、HomeStore。[本批来源清单](../2026-11-19-huhu-issues-3-10/sources.md)登记了实际检出。本批只读核对 `temp/sources` 的默认分支检出，实际依赖以 Huhu 锁文件为准。锁文件无 RGL/GridStack，`packages/editor/package.json` 已有 dnd-kit core 6.3.1、sortable 10.0.0。为二维拖拽、尺寸约束、可留空位、碰撞和键盘编辑，按下表拟先试 RGL。复用范围按具体职责描述。运行成本/交互等价性待同样输入实测。

| 结构 | 能直接复用的部分与状态所有者 | 对 Huhu 的代价、验证重点 |
| --- | --- | --- |
| React Grid Layout，受控 React 布局 | GridLayout、useContainerWidth、约束与 compactor。instanceId 对应 layout key，查看/编辑复用同一 Frame，仅编辑启用把手。草稿和提交仍归 Huhu。 | 首选。适配库的坐标/事件和 CSS、保证可留空位与碰撞让位同时成立。测拖中其他卡渲染次数、窄窗和缩放命中。键盘/数字输入走同一布局变换。本地 `origin/master@ec4ab79c97448947b04601c2237b2861d94a0fcb`，package 2.3.0/MIT。准备采用 npm 包时另验实际发布内容。[研究代码](../../../../temp/sources/react-grid-layout/src) · [发布元数据](https://registry.npmjs.org/react-grid-layout/2.3.0) |
| GridStack，DOM/引擎主导 | GridStack 管 DOM 几何、dragstop/resizestop、load/save，React 管卡内容。在保存、取消和卸载处须协调 React 与命令式节点。 | 备选。适合复用其自带交互。附加 makeWidget/destroy 归属、监听清理、React 节点复挂成本。必须只摘取几何（save 默认包含内容），量测批量载入后的反馈环与焦点。核对本地 `origin/master@a7f828af1c5366c02aff8a8c8fafda2abbff58a6`（14.1.1/MIT），引用发布包时另验其内容。[源码](../../../../temp/sources/gridstack/src/gridstack.ts) · [发布元数据](https://registry.npmjs.org/gridstack/14.1.1) |
| Homarr 的固定逻辑画布与 in-place editor | 上游自己管理几何、占用、选区、键盘、可视缩放和提交，产品交互覆盖面高。若移植整套则 Huhu 拥有算法及升级维护。 | 参考添加、配置、预览与取消的行为，在 Huhu 的组件、导航和文案中呈现。固定画布整体缩放与 Huhu 的窄窗重排/内容适应不同，直接移植 Next/Mantine 状态会增加概念与主题迁移成本。dnd-kit 的本地参考为 `origin/main@ccaf3d583903a5d0b68616310a24aec891ee0d69`，与已安装的 editor 依赖分别核对。dnd-kit 可复用传感器，但 Huhu 仍承担二维几何/resize，只有成熟网格未达标才评估。 |

**PoC 判据。** 用同一批真实定义、相同空隙/边界与一张含输入框的卡，比较 RGL、GridStack 和 Homarr 行为样本：跨列跨行、保留空位、碰撞让位、min/max、缩放、多次 save/reload、取消无写、键盘替代、正文不误拖。桌面与窄容器记录指针/焦点轨迹、序列化坐标、React commit 次数及交互长帧。登记复用/需改写的路径、卸载残留、版本与许可证。RGL 达标则只接它。失败须写出最小失败样例与同条件 GridStack 结果，择一。两者均未达标再估算 Homarr 局部适配。本轮没有运行结果。

**窄窗。** 按 [ACC-DASH-14、15](spec.md#用户验收) 投影同一个逻辑网格。按 y、x、id 投影为窄列，宽度限于容器，内容由 compact/normal/expanded 布局呈现，页面只纵向滚动。被动 resize/reflow 只更新投影。窄屏显式前移/后移、改尺寸作用于同一草稿，计算合法格位、预览受影响的卡，再由保存提交一个 revision。窄屏不提供自由二维定位，持久模型只有一套 layout。查看/编辑均以同一坐标系测量，DPI、文本缩放及主题变化要重新量测。Frame 使用语义 token、shell- 前缀。插件样式仅在本插件作用域，第三方样式纳入 vendor 层。沿用 theme/tokens/base/vendor/components/shell/modules 层序、Radix、Lucide 与 MotionProvider。抬升、占位及让位反馈在 reduced-motion 下用静态边框/位置和读屏通知。容器尺寸查询已属 Web Baseline Widely available。Electron 44.9.1 自带 Chromium 152.0.7977.167，仍须实际验证库手势与缩放。按 handle 分离触摸/内部滚动，为键盘提供坐标与尺寸控件，视觉顺序同步可理解的 DOM 顺序。不把一维拖动指南当作二维布局库。[项目设计系统](../../notes/context/design-system.md) · [Electron 发布版本](https://releases.electronjs.org/release/v44.9.1) · [容器查询](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)

## 上游行为映射

以下路径已在 `temp/sources/homarr` 的 `origin/dev@b440fdd574c9daa229f5cf64f7b2532770799664` 核对（Apache-2.0）。上游行为和授权源码可参考，使用 Huhu 自有视觉、导航、组件及文案。Issue 固定 SHA 仅作历史出处。本轮核对路径/职责，尚未复制。后续若依赖或移植，记录实际版本/SHA、文件/符号、修改与测试，保留版权、LICENSE、适用 NOTICE，适配 [Huhu 来源台账](../../../../docs/upstream/ledger.md) 与 [notices 生成器](../../../../scripts/gen-notices.mjs)。Huhu 许可为 GPL-3.0-or-later。RGL、GridStack 和 dnd-kit 已核对 MIT。

| 固定上游行为 | Huhu 拟适配边界 | 验收样本 |
| --- | --- | --- |
| [layout/geometry.ts 与 reflow.ts](../../../../temp/sources/homarr/apps/nextjs/src/components/board/layout) 中 normalizeGridPlacement、placeGridItem、sortGridPlacementsForReadingOrder。README 的统一缩放 | 借用格单位、预览/落定和阅读序的判据。workbench/home 的画布使用所选库，不照搬整板缩放 | ACC-DASH-02、03、14、16 |
| [in-place-editor](../../../../temp/sources/homarr/apps/nextjs/src/components/board/in-place-editor) 的 occupancy.firstFreeCell、keyboard.handleAreaShortcut、store.addInPlaceActions | 目录选择→配置→找空位，编辑把手/占位及键盘路径。Huhu 自己拥有草稿/保存/取消 | ACC-DASH-04～06、13、15 |
| [definition、registry 与 widget-card-shell](../../../../temp/sources/homarr/packages/widgets/src) 的 createWidgetDefinition、widgetComponentLoaders、WidgetCardShell | 接现有贡献注册与可信内置 UI，按实例运行/释放，外壳沿用 @huhu/ui | ACC-DASH-01、08、09、17、18 |

## 待决选择

| 体验问题 | 选项与建议（待用户确认） | 前置 / 具体影响 |
| --- | --- | --- |
| 新 Vault 首页首屏放哪些卡？ | 建议按已启用定义显示任务、最近笔记、专注与摘要，把其余可用卡放入抽屉。也可默认保留与当前首页接近的更完整集合，但首屏会更长。两者均须保留 §4.2 的全部可用能力。 | W01 核对真实数据密度，用户确认后确定 W02 默认种子/W05 回归图。存储结构与已有布局不受影响。 |
