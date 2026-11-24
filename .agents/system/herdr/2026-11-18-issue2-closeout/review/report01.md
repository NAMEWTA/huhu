# Issue #2 集成候选独立审查

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| 清单标识 / 实际 pane | `review` / `w5:pA` |
| 任务 | `task01.md` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/task01.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report01.md` |
| 执行结果 | done |
| 工作树 / 范围 | `/home/wta/projects/huhu-wt-int`，`closeout4/final`，`git diff f16f614..e550c52`，508 文件 |
| 候选 | `e550c52de1fe5c568a40eb17184b5588ea2cd72e`，含 w5:p8 的 G04、H04 与合并结果 |

**暂缓关闭 Issue #2。** 已复现源码模式改错磁盘缓冲位置、无效 UTF-8 静默改写、目录移动遗漏实际条目、复制覆盖新生成的同名文件，以及删除原段后的批注误定位。ORCA 计数正好卡在 70% 闸门，至少一套列为通过的适配缺失其上游关键断言。B01 仍有逐能力证据空缺。本报告审查的是上述提交，b01 后续提交另验。

## 正确性发现

| 严重度与条款 | 位置和触发条件 | 实际结果与建议修法 |
| --- | --- | --- |
| **阻断 · B09 / C03 / F02 源码修改错位置** | `packages/editor/src/host/markdown-file-envelope.ts:11–23`、`packages/editor/src/vendor/open-knowledge/app/src/editor/SourceEditor.tsx:204–230`、`packages/editor/src/rich/RichMarkdownEditor.tsx:212–223`。打开无 BOM 的 CRLF Markdown，或带 BOM 的混合行尾 Markdown，进入源码模式并修改第一个 CRLF 之后的字符。 | CodeMirror 文档把 CRLF 算一个位置，`y-codemirror.next/src/y-sync.js:143–151` 将位置直接应用到仍含 CRLF 的 Y.Text。用锁定依赖实测，输入 `first\r\nSECOND\r\n` 后，CM 显示 `first\nXECOND\n`，待保存的实际缓冲却为 `first\rXSECOND\r\n`。带 BOM 的混合行尾有同一结果。两视图应在统一坐标的表示上工作，写回时恢复未修改行的原始分隔符。无法无损映射时应要求显式转换。现有 `editor-s3-properties.spec.ts:152–167,192–228` 测的是顶栏属性与富文本，不会触发此错误。复现见 `cm.cjs`。 |
| **阻断 · F02 非 UTF-8 Markdown 可被覆盖** | `plugins/notes/src/engine/service.ts:581–586,604–607`、`plugins/notes/src/ui/NotesModule.tsx:562–605`。普通笔记含无法按 UTF-8 解码的旧字节，打开后在其他位置输入并保存。 | 真实 NotesService 读入 `41 c3 28 0a`，追加一个字符后落盘 `41 ef bf bd 28 0a e6 94 b9`，旧字节已经丢失。TXT/JSON 走 `TextFileView.tsx:20–52` 的探测，Markdown 没有同等保护。建议在进入编辑及会改写文本的服务入口做无损解码检查，提示用户选择编码和显式转换，保留原字节作为转换前的依据。TXT/JSON 已显示只读错误，仍缺显式转换入口。复现见 `probes.mts`。 |
| **阻断 · A07 / A08 / E04 目录移动成功却没移完整目录** | `plugins/notes/src/engine/service.ts:407–459,615–624`。在含笔记的目录再放一个空子目录，并在 watcher/索引更新前写入新文件，随后从树改目录名或移动。 | 真实服务返回成功，映射只有原来已索引的笔记。新文件留在旧目录，空子目录在旧路径被递归清掉且新路径没有它。结果是同一目录拆成两边，标签、隐藏规则及草稿可以跟着不完整映射走。应以真实目录内容和保护规则规划移动，使用可恢复的整目录移动，或在日志中显式处理全部真实子项和目录，并以实际结果生成前缀映射。增加 watcher 尚未交付时的混合子树验收。复现见 `probes.mts`。 |
| **阻断 · A07 复制可覆盖并发创建的文件** | `plugins/notes/src/engine/service.ts:310–318,356–368`、`packages/vault/src/operations.ts:6,68–89,93–105`。副本名选定后，另一个写者在 OperationLog 准备之前创建该名称。 | 新的复制调用去掉原来的 `expectedVersion: null`。日志把竞争写者的版本登记为操作前版本，正常提交时直接覆盖。钩子只在实际 `ops.run` 前落同名文件，真实复制返回成功且该文件变成了副本内容。建议让日志支持“目标必须是新文件”的前置条件，提交时使用无覆盖的原子创建或保留机制，同时预留同进程名称，并测试外部同名出现后两份字节都保留。复现见 `probes.mts`。 |
| **阻断 · D04 删除原段后批注仍能吸附到另一段** | `plugins/notes/src/engine/comments/anchor.ts:70–88`、`plugins/notes/src/engine/comments/passage-match.ts:196–221`、`plugins/notes/src/engine/comments/service.ts:238–257`。甲、乙段仅段首不同，引文前后有重复模板，给甲段中间引文批注，删除整段甲。 | 前次复核覆盖的短重复例已补且通过。新探针中仅剩乙段，`refind` 仍返回 anchored，偏移指向乙。唯一幸存命中与最多 8 字符的上下文下限会把共享模板当作身份，随后服务更新持久锚点。应以旧版本的对应区间与编辑映射为优先证据，对可能是幸存同文的情况保留孤立状态和重选。新增“重复长上下文 + 删原段”的磁盘线程、边缘按钮及高亮断言。复现见 `probes.mts`。 |
| **应修 · A08 文件操作在途仍可产生旧路径草稿** | `plugins/notes/src/ui/explorer/filesDeps.ts:97–127`、`plugins/notes/src/ui/documents/DocumentSessionRegistry.ts:105–117`、`plugins/notes/src/engine/index.ts:66–73`。在树移动打开的笔记或父目录，延迟移动回执，在初次 flush 结束及服务读取旧草稿之后继续输入。 | 静态确认前置 flush 和路径改动之间没有会话锁或最终 revision 握手。回执后卸载的会话仍绑定旧路径，其退出结算最多将新增编辑留在旧路径草稿。现有 A08 用例只在操作前造脏文档。建议覆盖 flush 到 remap 的同一个会话迁移区间，或在操作期间明确暂停相关编辑，保留失败重试。用可控回执验证新输入在新路径恢复。 |
| **应修 · A08 大小写改名的物理变更绕过回滚** | `plugins/notes/src/engine/service.ts:466–505`。用仅大小写不同的名称改一个带草稿的文件，第二次物理改名或后续日志写入失败。 | 两次 rename 先于 OperationLog，在日志中只有草稿、身份等步骤。落在临时名或新名字时，调用方收到失败，旧标签及草稿可继续指向旧路径。建议以唯一、保留的临时名在日志内记录两次移动及回滚，再提交元数据。现有大小写断言只涵盖成功。 |
| **应修 · H04 读错提示取决于两次并行刷新结果** | `packages/editor/src/vendor/open-knowledge/app/src/comments/CommentsPanel.tsx:19–36`、同目录 `store.ts:73–85,104–110,122–138`。第一次打开尚未读过的笔记批注列表，快照读取先触发 `ensureLoaded`，组件 effect 再主动刷新。 | 两个请求可各自提交全库列表。若快照触发的请求成功而 effect 的请求失败，成功线程与“无法加载批注”可以并显。更早的慢回执也可替换较新的列表。现有用例同步拒绝所有读取，重试只验证空库。建议把加载/错误状态与给列表的快照统一到同一个按上下文的请求代次，合并同一轮 in-flight 请求，并测试失败/成功乱序、切标签与非空恢复。H04 显示错误、重试与剪贴板两类失败提示的基本路径已接通。 |
| **建议 · 只读检查发现尾随空格** | `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/red3.log:56,98`、`patches/prosemirror-view@1.41.8.patch:266,334,353,395`。 | `git diff --check` 报六处。补丁中的单空格可能是 unified-diff 空上下文行，保留其句法并按项目口径免检。原始日志可在不影响证据时清理。 |

本报告中的文件位置以候选工作树为根。探针脚本与输出位于 `/tmp/huhu-e550c52-review.vh8KEK/`。实际 CodeMirror/Yjs 绑定探针用 JSDOM 验证偏移，磁盘探针使用真实 NotesService、VaultFiles 与 OperationLog，在临时目录内运行。

## 逐项复核 w4:pQ 的缺口

这里的「断言覆盖」表示候选源码包含目标行为的明确检查。分包历史运行、候选本轮复跑、以及仅检查源码的场景在文末列明。文中的 `K/` 为 `tests/e2e/knowledge/`，`W/` 为 `tests/e2e/workflows/`。其余路径相对候选工作树。

| 条款 | 候选行为、断言与剩余缺口 |
| --- | --- |
| A01 | 已补一棵真实树的根目录组合和展开嵌套 Tasks 后代。断言实际行名，包含点目录、Comments、业务目录、JSON/TXT/PDF/HTML、未知后缀与空目录。见 `K/journey.spec.ts:81–131`。 |
| A02 / A03 | `K/journey.spec.ts:258` 关闭重启后查隐藏的根和子项，经管理入口恢复并重读偏好。隐藏期间在原标签输入并等磁盘，双链和搜索打开目标并保留规则。@ 插入真实路径仍有 :131 起的断言。 |
| A04 / A05 | `K/huge-vault.spec.ts:58–68` 树确实截断，真编辑器选中截断之后的唯一项并验磁盘双链。此用例按需启动。 `K/explorer-keyboard.spec.ts:158` 在页面已挂载后以外部 mkdir/rmdir 验真实行出现和消失。 |
| A06 | `K/explorer-keyboard.spec.ts:85–155` 根空白右键新建后看磁盘，三入口检查同一禁用原因，右键不清已有多选，验证菜单的 `isComposing` 忽略。组字事件为合成，按 Q7 记录实机边界。 |
| A07 | 复制操作已接日志。 `plugins/notes/test/service.test.ts` 有记录状态及非 Markdown 字节/冲突断言，`K/explorer-keyboard.spec.ts:176–200` 用真实树复制/回收/恢复再比较字节。单文件并发覆盖、目录条目遗漏为上表的阻断。 |
| A08 | `K/session-flush.spec.ts:170–233` 断言首轮被拒时磁盘稳定、最新 TXT 字节、MD 与 JSON 停放草稿从新路径恢复。注册表按 Vault 和路径段结算，旧单一活动 MD 限制已消除。操作在途与大小写失败场景见上表。 |
| A09 / A10 | 原计数层与部分统计证据有效。 `K/explorer-keyboard.spec.ts:85–155` 查文件和文件夹受限标记及元信息，`apps/engine/test/engine.test.ts:93–125` 显式开放外部 list 后验证保护性拒绝。 |
| **B01 · 应修** | `K/editor-s3-matrix.spec.ts:83,247` 从“节点有变化”增强为 13 种格式的节点与内容、36 项命令的对应节点或行为，包含图片解码、链接属性及上传字节。旧矩阵列表边界合并已链接 `K/editor-s3-parity.spec.ts:414–415`。但归档 `evidence/parity-matrix.md:316,419` 示例 file-tree-merge 及总计 94 个旧勾选主动撤回。触发是把通用套件或构造样本当该行的行为验收。按能力给出具体动作、结果，或登记用户已批准的范围差异。 |
| B02 | `K/editor-parity-closeout.spec.ts:619–702` 同一夹具在编辑、阅读、保存重开复用语义断言，检查结构、任务状态、链接、内容、图片与脚注。先前只查非空和原字节的问题已补。 |
| **B03 · 应修** | `K/editor-s3-menus.spec.ts:157–227` 检了前缀、首尾循环、同菜单滚动定位、右缘与换标签清理。固定 OK 的旧对照 `tests/parity-ok/compare.spec.ts:81–152` 没在同操作序列重跑这些新边界。补双端同样序列记录，并检查遮挡时行为。 |
| B04 / B05 | 真实 Electron CDP 用例 `K/editor-s3-menus.spec.ts:229` 涵盖全半角、组合 Enter、代码/URL、表格以及撤销/剪贴板后再组合。 :70、:119 验证交错编辑回退、一次撤销 H2 和外部磁盘写回不入栈。 `document-history.ts` 的共享历史接入 SourceEditor 和 Tiptap，`packages/editor/test/golden-roundtrip.test.ts` 还有同片段来源交错断言。 |
| B06 / B07 | `K/editor-s3-parity.spec.ts:64,232,391` 核反向选择、横坐标误差、表格边界、拖选换区、退格合并、键盘出入代码块、表格键盘及正常拖放后正文。 `K/editor-parity-closeout.spec.ts:704` 经系统快捷键核原生剪切/复制/粘贴的文本、格式和真实保存。Windows/macOS 与硬件鼠标依 Q7 未验证。 |
| B08 | `K/editor-s3-parity.spec.ts:318–390` 对比 Editor 对象、DOM、焦点、选区和组合输入，并观察保存、评论刷新、属性及列表更新。覆盖已加入的内部属性变更与普通刷新场景。外部编辑同一文件且当前文档有未保存输入走 C06 冲突语义。 |
| B09 / B10 | `K/session-flush.spec.ts:46,96,141` 检查保存回执前保持旧模式、三态同内容、章节位置、关闭后放回旧读请求及同路径重开，注册表单测检查跨 Vault 同路径。源码 CRLF 的实测结果见阻断。 `K/editor-s3-properties.spec.ts:243` 大纲排除 YAML / 围栏，并检查重复标题、Setext 行和定位。 |
| C01 / C02 / C03 | `K/editor-s3-properties.spec.ts:192–239` 检查详情/顶部双向同值、阅读只读、三种 BOM 或 CRLF 组合的目标字节及正文，`packages/editor/test/sp5-yaml.test.ts` 有固定值回归。Vault 和 vendor 调用同一 codec。上述 UI 字节断言集中在富文本，C03 的源码阻断仍在。 |
| C04 / C05 / C06 | `K/editor-s3-properties.spec.ts:70,103,134` 断言延后正文→属性、未保存属性→正文的完整磁盘结果和坏 YAML 原文。 `K/session-flush.spec.ts:235,284,338,386,427,491` 检失败提示、编辑保留、重试落盘和移除后草稿恢复，`W/acceptance.spec.ts` 真只读拒绝富文本与源码写入。最后引用双写失败可重新取得原会话，有单测。 |
| D01 | `K/comments-s4.spec.ts:64–120` 开始时先查临时高亮，取消后查临时/永久标识、边缘提示与磁盘无伪线程，切换模式复查。 |
| **D02 · 应修（对照证据）** | Markdown 和引用渲染按最新用户决定交付。 `K/comments-s4.spec.ts:302,346–452` 查只读限制、语义节点、危险内容未落入 DOM、外链经宿主，及原评论字节保留。Huhu 有过滤/重开实测，固定 OK 同操作的缺口仍见 `w5:p3/report01.md`。需为确实不可达的上游入口记录对应证据与差异。 |
| D03 / D04 / D05 / D06 | `K/comments-s4.spec.ts:454–545` 核目标线程 ID、反向首尾滚动、切模式/文件关闭与晚回执焦点。 :215、:547 查删短重复段落孤立和重写后持久锚点，长重复上下文反例见上。 :242 实际挡住 save 回执后继续输入并拒绝旧选区，重选后验版本与源偏移。路由测试确认 epoch/revision、目标版本及无 PM 坐标。改名移动回收恢复、档案回到原线程继续有断言，三个 R7 差异由用户确认。 |
| E01 / E02 / E03 / E04 / E05 | 已有六入口、独立展开、切换及真实标签断言。 `W/archives-tabs.spec.ts:114,177` 补普通树内定义/附件、同时打开文件和档案后外写、改名与移除。目录物理条目未移完整时仍会影响 E04。附件真实路径与统一查看器沿用旧断言。 |
| F01 / F02 | `W/viewers.spec.ts:66–181` 验无效 JSON 跨关开、显式格式化、BOM/CRLF，真实冲突双向决策及最终字节。非 UTF-8 Markdown 仍会保存替换字符，TXT/JSON/HTML 编辑路径的转换提示与保真依输入类型另验。 |
| F03 / F04 / F05 | `W/viewers.spec.ts:183,312,340` 有大文件分段、真实文本选择、位置、错误、密码及外改分支。外改原生 watcher 条件跳过见下。 :368、:471 对真实 UI 的 HTML 保存、预览更新与旧 grant 撤销断言。 :418、:517、:621 对隔离、下载和凭据边界，:799 对右键在主进程确认外链的路径。F05 的三位白名单与 OP-D08 两候选对跑决策以用户修订为准。 |
| F06 / F07 / F08 | `W/viewers.spec.ts:650` 查树、标签、引用、搜索、详情的本地 SVG 与无外联。工具栏长标题、缩放、窄宽及菜单可点沿用 `K/editor-s3-toolbar.spec.ts`。四主题明暗/动态偏好与 a11y 有测试，非知识库零污染证据缺口见 H02。 |
| **F09 · 应修** | `tests/e2e/perf-note-journey.ts`、`tests/e2e/perf.spec.ts:350–390` 有三夹具和五项分位记录代码，需 `HUHU_NOTE_PERF=1`。比较旧台账的输入 p95 与 rAF 采样只能支持对应的单维结论。缺本候选的 10 万文件、长文、多批注各五项的机器/样本/分位输出。运行并留存三份数据。 |
| F10 / H06 | `K/leak.spec.ts:14–178` 实际开关并轮换 200 轮，检查 Tiptap、CM、Y.Doc、Y/DOM observer、worker、HTTP/WS/IDB 计数，实际创建并回收 Blob URL。 `K/leak.spec.ts:191`、`W/viewers.spec.ts:471` 检旧文件和 grant 迟到。w5:p2 提供 200 轮专项成功记录。provider 持会话租约，最后关闭请求 drop，自建、借入文档销毁分支有单测。当前候选的 200 轮留在组合验证。 |

## 来源、宿主和交付证据

| 条款 | 候选结果 |
| --- | --- |
| G01 / G02 / G03 | 分别执行 `--check-catalog`、`--check-vendor-directories`、`--check`、`--replay` 和 `--replay --orca`。固定 OK/ORCA 来源 7,621/39,025 文件，重放 OK 1,542 与 ORCA 13 文件集合及字节零差异。OK 登记 531、未登记与多余登记均 0。归档 `evidence/slice-patch-delta.md` 有各实施切片边界及计数，`docs/upstream/ledger.md`、`THIRD_PARTY_NOTICES.md` 指向统一清单并登记来源许可。当前来源清单计 OK 的 175 个映射补丁，其中 147 个非测试映射。S0 闸门以当时 5 改/4 删通过，如将“150 文件”继续作为交付总上限，应说明正式计数是否含测试适配。 |
| **G04 · 阻断（ORCA 闸门）** | OK 逐文件目录重算一致。112 待定中 40 适用、72 不适用，512/639（80.13%），保守 512/1315。ORCA 台账 8/11，8 是门槛。 `packages/editor/build/vendor-test-catalog.mjs:27–47,203–206` 只按报告中的四个标题和终态计数。 `W/viewers.spec.ts:861–882` 重开查找后重新输入，再轮询数量，有效覆盖可见结果，但固定 ORCA `PdfFind.test.tsx:54–80` 的两条关键断言是同步缓存响应订阅顺序与清空后强制晚旧回执。当前测试既未制造同步响应也未等到晚旧事件，`plugins/notes/src/ui/viewers/PdfView.tsx:237–253` 的 count listener 可无条件写入晚返回的计数。至少应把这一个文件标作部分，已证明的上限为 7/11。另查 counter 上游还断言活动高亮所在文本、关闭后移除高亮，`W/viewers.spec.ts:834–855` 只断言数值。补对应事件顺序与高亮断言，再重新计算。 |
| G05 | 按归档 G05 搜索范围在当前 SHA 复跑旧核心标识，零命中，输出在 `/tmp/huhu-e550c52-review.vh8KEK/g05.txt`。已看其余旧入口的替代调用边界。notes 使用富文本，tasks/inbox compact 功能有真实入口的新增断言。公开旧能力名的外部消费者独立核实仍留 Q8。 |
| **G06 · 应修（候选门禁）** | 已查分包的静态门禁、定向运行及较早集成的全量原始记录。最终 SHA 全量 E2E、打包 E2E、各目标平台及完整门禁记录尚缺，不能从较早 SHA 或本轮定向测试推出。CI 已加独立 `test-vendor` job。待交付执行者在同一构建补齐。 |
| **G07 · 应修（候选度量）** | `K/compact-inbox.spec.ts:40–132` 实测普通与富格式的渲染、剪贴板及双链，普通阅读路径已轻量化。 `scripts/measure-notes-startup.mjs` 有新端点。候选缺对 rc.4 的普通/富格式正文及其他非知识库模块冷开、首次笔记分位和最终打包/chunk 增量记录。旧 `ce913d2` 与 `d6a4663` 数据仍有历史边界。Q9 没有硬体积上限。 |
| H01 / H07 | `packages/editor/test/golden-roundtrip.test.ts:132–212` 对实际样本增加了 hydrate→serialize，比较完整字节或按样本登记的等价例外。主应用无编辑零次保存/单次保存及旧回执的测试仍在。 `K/fidelity-local-edit.spec.ts:34–117` 真实初始化 Git Vault，逐次保存查单文件单 hunk、字节和重开表格/列表。源码偏移是额外触发方式，见阻断。 |
| **H02 / OP-D05 · 应修（视觉证据）** | Tailwind 无 preflight，层序和宿主 scope 已修，候选工作包构建 A/B/C 为 0。 `K/theme-ok-tokens.spec.ts` 查根变量加载前后、portal 与编辑区字号。 `evidence/reopened/README.md:7` 的七屏计算样式是 `f16f614` 基线，较早 rc.4 七屏仍有像素差，仓库容差和批准的变更并非同一个口径。需在交付候选录完整目标屏、状态、主题对 rc.4 的 computed/像素结果及获准差异。 |
| H03 / OP-D06 | 既有四屏扫描与即时语言切换，新增 Frimousse 两份打包字典断言和无外部字典请求。w5:p8 修订 `K/editor-parity-shell-mounts.spec.ts:37–72` 的表情用例，明确断言请求两份本地词典及无其他外部请求。 |
| **H04 / OP-D04 · 应修（覆盖与作用域）** | `packages/editor/test/host-feedback.test.tsx:425–515` 及 `K/comments-s4.spec.ts:588–622` 核失败、重试和空状态；剪贴板缺失、拒绝及模拟平台已补，部分路径见端点表。 `packages/editor/build/check-host-endpoints.mjs:34–45,82–101` 取 JS 字符串路径并按路径匹配，不能证明 GET/POST 及 I/O 形状均闭环，也不能识别所有动态路径/间接桥成员。 `host-fetch-scope.test.ts:6` 确认全局 fetch 身份未替换，但 `packages/editor/src/host/host-fetch.ts:17–24,31–53` 是同 renderer 的全局可变路由栈，多 Root 同端点时最后注册者接收，缺并挂/逆序卸载、异步切换测试。建议按调用的宿主范围绑定路由并校验方法、输入/输出及典型失败到 UI 的实际调用。 |
| **H05 / OP-D18 · 应修（成本）** | `K/compact-inbox.spec.ts:133,184`、`W/acceptance.spec.ts` 核真实想法、新建任务与转任务的输入保存、重开、撤销、IME 与 @。compact 文档级 slash 与批注负例见 `K/editor-compact-commands.spec.ts:6`。 `K/compact-cost.spec.ts:74–108` 测 click 到可编辑，以及挂载前后堆，当前缺最终候选的实际两入口样本及任务详情对照。旧任务评论只读成本无法作为 Q4 回退依据。 |
| OP-D03 / OP-D07 / OP-D11 / OP-D12 / OP-D13 / OP-D17 | 300 ms 编辑交付变更已由用户确认，保存仍为 800 ms，微任务不会假装仍有 300 ms timer。旧会话双写失败保留、同会话 park、语义门禁与源码编辑路线已接。隐藏偏好改用类型化 stateDir 并迁移旧格式，外部改名保留原规则；标签身份同步、共享图标与 YAML 库分别见 E04、F06、C01–C03。 |
| OP-D08 / OP-D09 / OP-D10 | 用户确认 OP-D08 采用 (a) 的证据。右键选外链→主进程确认已接。OP-D09 的快捷键已按当前分栏适配。**应修（复制范围）**，`decisions.md:82–86` 指定复用 PdfViewer、PdfFind 与缩放命令部分，`plugins/notes/src/vendor/orca/pdf/UPSTREAM.md:5–8` 仍登记为重写外壳，用户修订只涉及 OP-D08。建议复用可拆出的原模块，或记录获准的等价适配及相同的查找、缩放与反馈断言。OP-D10 补了系统文件、祖先循环可见及路径样本。 |
| R1–R13 / Q1–Q10 | R1/2/6/7/8/9/11/13 对应 G01、B05/H06、A01/A10、D04/D05、C01/C03、B02、H02、H05。R3/R4/R5/R10 的取舍在预览、隐藏、模板与用户范围中登记。R12 已在原产品与复用条款加后继引用。Q1/Q2/Q5/Q9/Q10 沿授权默认。Q3 已接默认关、显式打开、主进程受控请求和失败保留 URL。Q4 成本见 H05。Q6 有固定的 Git 引用比对，历史远端状态不可恢复。Q7 保留实机未验证。Q8 两项契约变更已在台账登记，发布说明仍应明确写入 `notes.move` 目标目录要求和 `notes.create.templatePath` 仅桌面，另保留外部消费者核实的边界。 |

## 宿主安全、仓库规范及跳过项

- 评论 Markdown 经 remark/HAST 再显式生成许可节点，未发现把原始 HTML 或插件输出直接注入 DOM 的路径。外链主进程入口校验受信来源、顶层 frame 和 HTTP(S) URL，执行前检查 frame 以及预览授权是否仍有效。邮件、电话使用已登记的系统处理。相应单元与历史 D02 Electron 检查已看。 `apps/desktop/src/main/index.ts:229–257`、`apps/desktop/src/main/external-link.ts:3–29`、`packages/editor/src/vendor/open-knowledge/app/src/comments/CommentMarkdown.tsx:16–85`。
- HTML 预览保持独立协议、sandbox 不给 same-origin、CSP 限连接、主进程路径守卫和权限控制。用户已接受 `standard/secure/corsEnabled`，单元锁定。评估了外链 IPC、帧来源、撤销、下载及协议边界，没有确认新增越过这些防线的路径。恢复、路径与实际 Electron 报告有环境边界，见 F03–F05。
- 在本轮只读审查执行了 zh-modern-web-guidance 的 search 和 retrieve，核对 `sanitize-untrusted-html`、`security`、`validate-origins` 与本地 Electron 44.9.1 / Chromium 152 的分包证据。w5:p5/p6/p7/p8 留有指南应用记录，w5:p2/p3/p4 报告中未找到同样的 search/retrieve 记录，无法仅由提交证明所有前端编辑的先后流程。宿主能力经现有 `window.huhuHost`，无桥时评论走浏览器回退，有独立 Chromium 历史证据。适配层 strict 类型守卫与 vendor CI 已接，不以全局 fetch 拦截来复用 OK 路由。
- G04 JSON 明列四个 vendor skip。两项 PowerShell 依赖实机工具，`shared.dom.test.tsx:165` 单项空壳本身不能证明该契约，`trailing-affordance.dom.test.ts:432` 是被跳过的上游 Ask composer 保留区分支，Huhu 没挂载该 composer，源码写明原因。计入文件须按仍执行的断言理解。 `W/viewers.spec.ts:328–341` 原生 watcher 不可用时跳过 PDF 外改，应该用实际外改或有结果的重跑销账。 `K/huge-vault.spec.ts:12` 与 `tests/e2e/perf.spec.ts:351` 按需夹具，不会在普通 E2E 自动完成。此次未发现把这些跳过记成单个用例通过的证据，发现的计数问题是 ORCA 的部分适配被记为整文件通过。

## 验证与接续

- 本轮在当前候选运行 Vitest 13 文件，**441/441 通过**，包括黄金往返 254 项、宿主反馈 28 项，以及 notes 会话/路径/批注、Vault 监听、外链和预览主进程单测。上表的最小复现另行运行，通过指已观察到并断言了缺陷。
- 本轮使用固定上游 Git 树验证清单与重放，结果见 G01–G03。以候选的逐文件清单、w5:p8 的原始 Vitest/Playwright JSON 与固定 ORCA 测试源码核对 G04，OK 结果记录为 516 个收集文件、9,070 通过、4 跳过，其中 512 个对应上游；ORCA 基础 Vitest 为 4 个文件、13 个用例。
- 本轮没有启动 Electron。已有另一个 worktree 的 Playwright/Electron 在运行，且本工作树的本地桌面构建生成时间早于候选。历史包证据依其构建归属使用。没有启动全量 E2E。
- 已读取归档 spec、decisions、issue 摘录，前次独立审查、用户决定、w5:p2–p8 报告及对应候选断言。业务工作树保持干净。报告及清单是本轮交付。

## Lead 验收
