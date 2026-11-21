# Issue #2 集成候选复审

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| 清单标识 / 实际 pane | `review` / `w5:pD` |
| 任务 | `task02.md` |
| 任务路径 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/task02.md` |
| 报告路径 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report02.md` |
| 执行结果 | done |
| 工作树 | `/home/wta/projects/huhu-wt-int`，`closeout4/final` |
| 候选 | `4f6b70326caba39e17892924fa0db6b2f70758ea` |
| 差异 | `e550c52..4f6b703`，126 个文件 |
| 审查日期 | 2026-11-20 |

**暂缓关闭 Issue #2。** 常规源码编辑、混合子树移动、单文件复制冲突和上一轮的批注例均已复现修复。新的探针确认源码撤销可改写混合换行，改名及显式编码转换可在竞争窗口内覆盖第三方写入。B01 尚有证据缺口，镜像和 Excalidraw 块的真实宿主加载也未兑现。ORCA 的查找修复有直接证据，70% 闸门仍取决于 PDF 恢复套件的适用分类。

以下代码路径以候选工作树为根。矩阵、规格和决定在 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/`。本轮 [探针和原始日志](/tmp/huhu-4f6b703-review.5V5z1p) 使用临时 Vault。操作时序由探针控制，磁盘读写走实际实现。

## 正确性发现

| 严重度 | 位置与触发条件 | 结果与建议修法 |
| --- | --- | --- |
| **阻断 · A07/A08 并发改名覆盖文件** | `packages/vault/src/operations.ts:132–150`、`plugins/notes/src/engine/service.ts:470–475`。重命名找到空目标后，另一个写者在最终改名之前保存同名笔记。普通改名及大小写改名的第二跳共用这一提交路径。 | 用真实 NotesService 和 OperationLog 控制最后一次存在性检查后的写入，改名返回成功，目标里的并发字节被源笔记替换。应让最后一步使用文件系统支持的原子独占移动或可恢复的等价提交，并保留撞名双方。当前测试在目标检查之前制造冲突，补查验之后、提交之前的竞争回归。 |
| **阻断 · F02 编码转换覆盖检查后的外部更新** | `plugins/notes/src/engine/service.ts:590–605`、`packages/vault/src/write.ts:59–68,107–113`。用户提交旧编码转换，外部编辑器在最终版本比较后更新该文件。 | 注入受控时序后，真实转换成功返回，磁盘中的新修改被先前快照转换出的 UTF-8 替换。现有版本测试只传入一开始已过期的版本。转换应采用有提交前置条件的写入，或者保留可恢复的原件和当前版本，冲突时停下让用户核对。补两份字节都可恢复的断言。 |
| **阻断 · B05/B09/C03/F02 撤销恢复文本时改写换行** | `packages/editor/src/host/markdown-file-envelope.ts:46–70`、`packages/editor/src/rich/RichMarkdownEditor.tsx:213–225,266–279`。源码模式打开 `A\r\nB\nC\r\n`，删除 `B` 后的 LF，待变更交付后撤销。 | 真实 CodeMirror、Y.Text 和 Y.UndoManager 恢复了规范化视图，文件信封却得到 `A\r\nB\r\nC\r\n`。重新插入的分隔符继承前一个 CRLF，`emitNow` 会采用该映射。应随编辑历史保留删除位置的原始分隔符，撤销及重做应恢复相应字节版本。补实际输入、保存、撤销、再保存及重开的完整 Buffer 断言。 |
| **应修 · E03/E04/F02 单个旧编码档案阻断整个列表** | `plugins/notes/src/engine/archives/service.ts:66–68,110–131,233–235,262–274`。某个档案记录或类型的 `index.md` 含无效 UTF-8，同库还有正常类型与记录。 | 真实 `ArchivesService.list()` 因一个坏记录拒绝整个跨类型列表，类型模板有同样输入时 `types()` 整体失败。原字节保住，正常兄弟项随之不可见。应让读取按项降级、带路径给出编码提示和转换入口，写入及批量属性改写仍拒绝无损解码失败，并验证正常项可进入。 |
| **应修 · A07/E04 跨深度移动后库内相对链接失效** | `plugins/notes/src/engine/service.ts:417–434,470–475`。移动包含相对符号链接的目录到更深的父目录。链接原先合法地指向该子树之外的库内文件。 | 实测源目录消失，事务为 `committed`，回执把链接列入已迁移文件，目标链接却无法再读取。应在规划时比较移动前后链接指向，对获准的链接同时迁移相对目标，或在移动前拒绝并说明受影响的链接。补仍指向同一资源及失败时整个目录留原位的断言。 |
| **应修 · F02 转换入口漏掉可显式解码的 UTF-16** | `plugins/notes/src/engine/text-encoding.ts:20–24`、`plugins/notes/src/engine/service.ts:576–595`、`plugins/notes/src/ui/viewers/EncodingConversion.tsx:31–53`。打开没有 BOM 的 UTF-16LE 文本，其中 ASCII 字符含 NUL 字节。 | 探针得到 `binary`，即使明确选择 `utf-16le`，服务也拒绝转换。UI 只为 `encoding` 状态显示选项。应为文本类型提供明确的解码预览及确认，保持二进制默认不可编辑，覆盖有 BOM、无 BOM、错误编码三个分支。 |
| **应修 · A10/F02 新编码探测绕过原资源边界** | `plugins/notes/src/engine/service.ts:584–603`、`plugins/notes/src/ui/viewers/TextFileView.tsx:17–28`、`packages/kernel/src/capabilities/vault.ts:13–25,226–235`。旧文本探测复用 `vault.readBinary` 的实际目标保护和读前容量检查，替换后以 `VaultFiles.read` 整读。 | 新能力的路径检查只保证解析后仍在 Vault 内，且使用前端索引大小作分派。对真实条目大于索引所记大小或受限目标的场景，代码缺少原有读前约束。应复用资源守卫，按文件实际大小与查看器类型限额，并为转换执行相同前置检查。此项为源码证据。 |
| **应修 · A07/A08 新增文件系统依赖影响已有写入** | `packages/vault/src/write.ts:75–96`、`packages/vault/src/operations.ts:132–149`。在不支持硬链接的可写卷上新建资源，或文件系统不提供稳定 inode 时改名。 | 所有 `expectedVersion:null` 写入均需 `link`，影响普通笔记、日记、语义实体、档案模板及附件。改名也会因缺少文件身份拒绝。应验证现有可写卷的支持范围，保留安全的独占创建或记录明确的卷级限制，避免只在用户提交时暴露。当前 Linux ext4 支持该路径，未在其他卷实测。 |

## 上一轮发现的复核

| 原发现 | 在候选上的结果 |
| --- | --- |
| B09/C03/F02 第一个 CRLF 后编辑错位置 | **原样例已修。** 原 `cm.cjs` 的失败断言得到正确字节后终止。临时副本以正确结果为预期，两个原输入都通过。同一 `probes.mts` 混合行尾缓冲样例通过。`tests/e2e/knowledge/editor-s3-properties.spec.ts:274–306` 明确断言磁盘 Buffer、富文本与重开。撤销时的字节偏差见上表。 |
| F02 非 UTF-8 Markdown 被覆盖 | **原样例已修。** 临时副本用真实 `notes.read`／`notes.save` 拒绝 `41 c3 28 0a` 并逐字节确认原件。`plugins/notes/test/service.test.ts:474–498` 覆盖普通拒写、旧版本和选择编码成功。`editor-s3-properties.spec.ts:308–342` 通过真实 UI 覆盖 MD、TXT、JSON。新转换的并发、无 BOM、档案影响见上表。 |
| A07/A08/E04 整体移动漏掉未索引文件和空目录 | **原样例已修。** 回执含两篇文件，空子目录在新路径，旧目录不存在。`plugins/notes/test/service.test.ts:111–143` 另查准备后新增文件、任意二进制、隐藏规则、ID、保护性拒绝。相对链接和目标竞争另见上表。 |
| A07 复制可覆盖选名后出现的文件 | **原样例已修。** 原探针的写者不改时序，复制现在返回 `NAME_CONFLICT` 且保留双方字节。`service.test.ts:228–246` 有对应断言。`packages/vault/test/operations.test.ts:51–62,156–166` 还检查并发独占发布及回滚只清理本事务文件。 |
| D04 删除原段后抓到另一段 | **原样例已修。** 在原输入上按生产调用传入版本匹配的旧文档，`refind` 返回 `orphaned`。`plugins/notes/test/comments.test.ts:67` 确认落盘状态。`tests/e2e/knowledge/comments-s4.spec.ts:215–248` 查长重复正文、边缘按钮和高亮。`anchor-search.test.ts` 核渲染层在源尚未保存时也拒绝该幸存副本。 |
| A08 文件操作在途仍可输入 | **已接入修复。** `NotesModule.tsx:212–227` 在 flush 前设 `inert`，回执重定位提交后解除。`session-flush.spec.ts:234–283` 扣住实际移动回执，断言旧视图不可编辑、随后新路径收字节及旧路径无草稿。`plugins/notes/test/explorer-deps.test.ts:124` 核 pause、flush、move、remap 顺序。 |
| A08 大小写改名未纳入日志 | **原回滚场景有断言。** 两次物理移动和元数据步骤进同一日志。`operations.test.ts:117–153` 检查第二跳失败和模拟大小写不敏感冲突的暂存原件。`service.test.ts:145` 检查原路径、ID、草稿，`:380` 检查成功。原子性竞争另见上表。 |
| H04 批注两次并发刷新互相覆盖 | **已验证所报时序。** `packages/editor/test/host-feedback.test.tsx:430–581` 核首次共用请求、换标签后旧成功／失败、不同 Vault、卸载后迟到，以及恢复已有线程。`comments-s4.spec.ts:595` 检查真实失败后恢复。列表与状态共享请求代次，旧回执被丢弃。 |
| H04/OP-D04 全局 HTTP 路由、method | **已验证测试覆盖的根。** `host-fetch-scope.test.tsx:35,75` 拒绝未登记方法，真实 OkRoot 并挂、逆序卸载、换处理器期间旧请求归属均通过。端点清单和少数运行时闭环见后文。 |
| G04/OP-D09 查找订阅、晚回执、活动高亮 | **原查找断言已补。** `plugins/notes/test/orca-pdf-find.test.tsx:28–82` 对同步缓存、清空晚到和真实 PDF.js Controller 重跑通过。`tests/e2e/workflows/viewers.spec.ts:830–910` 逐步查活动高亮所在文字、前后／首尾导航、换词、清除及重开。fix 的原始 Playwright 四个 ORCA 用例均通过。分母仍见后文。 |
| F03 PDF 外改可能跳过 | **原跳过已移除。** `viewers.spec.ts:332` 明确等待外部修改和重载，核新正文及旧正文退出。fix 的定向原始 JSON 为通过。 |
| Q8 发布说明缺两项接口变化 | **已补。** `evidence/s8/release-notes-draft.md` 明列 `notes.move` 目标目录约束和 `notes.create.templatePath` 仅桌面。旧名外部消费者边界另见后文。 |
| 空白建议 | **收口差异通过。** `git diff --check e550c52..4f6b703` 零输出，前轮日志行尾已修。整段自 `f16f614` 检查排除补丁的旧 unified-diff 空上下文行后也通过。 |

## B01 矩阵

机械检查第 1–13 节的 283 条能力行。248 条的末列含本地断言链接，链接目标文件和行号均存在。33 条登记不适用。2 条末列仍明写未单独验证。以下列出末列出现未单独验证、未核实、待定或推定（含未逐行核实）的全部行，并复核任务点名的其他行。

| 行 | 判定 | 具体依据与处理 |
| --- | --- | --- |
| 98 SkillPathLinks | **范围已定，文字残留** | 末列写 Huhu 对应实体未核实。用户 2026-11-20 已排除技能体系，直接引用该决定及 §14。 |
| 169 skill-ref-* | **范围已定，文字残留** | 末列仍写「推定」，§14 第 6 条及 `user-decisions.md` 已确认排除，修正两列旧字样。 |
| 208 代码块预览剪贴板 | **应修，末列缺证** | 本轮跑过 `app/src/editor/clipboard/codeblock-preview-clipboard.test.ts:151,163,188` 的固定上游断言。HTML payload 保留代码、去掉 iframe／预览框，预览节点未挂载时保留围栏源码。源文件已定位。回填这些断言和实际入口。上游格式层证据可直接入矩阵，必要时补 Huhu 真实富文本预览复制链。 |
| 214 默认格式键 | **满足给出的格式键范围** | `tests/e2e/knowledge/editor-s3-rules.spec.ts:119–129` 实际建立选区、按键、查相应 rich 标记。 |
| 254 Markdown fixtures | **满足** | `packages/editor/test/golden-roundtrip.test.ts:270–305` 枚举固件，经 Y 缓冲、hydrate 和 serialize，比较完整字节、已登记的源／输出摘要和语义，单测本轮通过。 |
| 255 markdownlint | **有效不适用** | spec §9 Q2、OP-D19 排除服务端 lint。 |
| 346 BackgroundThrottleReporter | **应补出处即可** | 上游生产逻辑接 `collabUrl`、推送后台协作暂停。全链随 Q2 排除。引用该文件的调用和 spec §8，删未核实旧表态。 |
| 348 branch-invalidation / client-removal-reconciliation | **应补出处即可** | 以固定源的协作依赖及 spec §8 / OP-D19 Q2 支撑排除范围，区分 OP-D03 已交付的本地会话冲突与草稿。 |
| 353 landing-flash／agent flash | **应修，组合行缺证** | 本轮运行 `app/src/editor/plugins/landing-flash-source.test.ts:105`、`landing-flash-wysiwyg.test.ts:137`，两态实际产生目标范围装饰。把本地跳转和模式落地的断言入表，将 `agent-insert-flash` 的 AI 挂载部分按 Q2 登记。§15 两条旧状态亦需更新。 |
| 354 agent-follow-scroll | **应补出处即可** | 固定源由 AI 编辑场景引用，按 spec §8 / Q2 排除。改用实际生产调用证据，删除根据文件名推定的旧说明。 |

第 152、153、265、277 行已按用户决定完成技能、托管产物及幻灯片范围登记。第 120、121、360 行给出了独立文档编辑器或分屏排除的依据。§15 仍把已处理的能力列作待定，§18 的组内计数不能用来覆盖整表。发现六个行锚点已落到空行或闭括号（65、128、266、288、297、300）。尤其第 297 行的 `host-feedback.test.tsx#L454` 落在另一个 H04 用例，合并后的实际 B01 测试起于 :653。第 316 行列表合并与第 319 行选中状态均已链接对应行为。

**应修 · 第 118、119 行的真实宿主加载。** 固定 OK 的镜像 DOM 用例注入 FakeProvider 和协作 URL，Excalidraw 用例 mock 了 `useLiveDocText` 和渲染导出。Huhu 保留的镜像与 Excalidraw 块实际仍从 `useCollabUrl` 获取连接并走 live-doc pool。该 pool 最后经别名进入本地 provider，`packages/editor/src/host/doc-bindings.ts:13–22` 只读已登记的缓冲。用候选的 Vite 别名及真实 LocalDocProvider 探测一个未打开的 Markdown 源和一个真实块会引用的 `.excalidraw` 名称，均返回「文档未登记」。对正常用户来说，选择 Vault 磁盘中的来源仍可能只显示加载或不可达。生产调用见 `app/src/editor/components/use-mirror-source.ts:109–126`、`ExcalidrawEmbed.tsx:75–87` 和 `live-doc-pool.ts:152–169,215–221`。应让保留的块通过当前 Vault 的受控本地读取及失效通知加载，随后在应用入口验证已有文件、变更后更新、切 Vault 和资源释放。独立 Excalidraw 编辑器的排除不能覆盖保留的块。

**应修 · 组合行证据边界。** 第 114 行 PDF 块指向插入节点和尺寸计算，`app/src/editor/components/Pdf.tsx:86–135` 使用不同的加载路径。应补实际已有 PDF 从内嵌块逐页显示及重开，或明确登记该能力的认可范围。第 119 行现有验证结论只适用于给定的组件夹具。第 265 行的决定已落地，B01 两份分包报告中的历史待定不再成立。

## 对 w4:pQ 规格清单的复核

本节逐组核对 `w4:pQ/report01.md` 的 A01–H07、R1–R13 与 OP/Q。定位及测试含已收录的分包证据，当前运行范围见末节。

| 条款 | 当前候选及仍必需的子项 |
| --- | --- |
| A01–A06、A09 | 本轮差异未撤下原复核确认的断言。真实树组合、隐藏持久化／双链／搜索／已开标签见 `tests/e2e/knowledge/journey.spec.ts:81,258`，截断后的 @ 见 `huge-vault.spec.ts:58`，外部空目录更新及三个菜单入口见 `explorer-keyboard.spec.ts:85,158`。A04 专项依 `HUHU_E2E_HUGE_VAULT=1` 启动，应保留专项运行证据。 |
| A07、A08、A10、OP-D10/11 | 真实非 MD 回收恢复、受限原因、同一 Vault 草稿、内部移动后身份与隐藏偏好已接入。仍需修复上表的改名竞争、相对链接、读前资源边界。合成大小写别名证明回滚分支，实机限制按 Q7。 |
| B01 | 见矩阵。保留能力从真实宿主可达及所有末列证据仍缺。 |
| B02、B04、B06–B08、B10 | 三态同夹具、真实 Electron CDP、跨段选取、退格/拖放、编辑器身份和文档大纲已有实际目标断言，见 `editor-parity-closeout.spec.ts:619,704`、`editor-s3-menus.spec.ts:229`、`editor-s3-parity.spec.ts:64,232,318,391`、`editor-s3-properties.spec.ts:243`。Q7 之外的 Linux 合成输入是实际验证项。 |
| B03 | **应修证据。** `tests/parity-ok/compare.spec.ts:81–152` 与 `evidence/parity-ok/slash.md:9–15` 有固定两端基线。Huhu 增补的合法前缀、越过首尾、已展开浮层滚动、右缘、切换清理见 `editor-s3-menus.spec.ts:157–227`。补同序列对拍与遮挡时归属。旧对照的单次定位和单步上下不足以覆盖这些边界。 |
| B05、B09、C01–C06、OP-D03/07/17 | 共用撤销历史与会话、持久化、坏 YAML、局部属性、草稿、旧回执、保存前语义门禁和共享 codec 有断言。见 `editor-s3-menus.spec.ts:70,119`、`session-flush.spec.ts:46,96,141,285`、`editor-s3-properties.spec.ts:70,103,134,192,274`。仍需修复混合行尾撤销和转换竞争。事务微任务与 800 ms 保存按用户修订。 |
| D01、D03–D06、R7 | 原段删除反例已修。选区取消、目标线程、回跳、版本冻结、改名回收恢复已有实际断言，见 `comments-s4.spec.ts:64,215,249,461`、`comments-persistence.spec.ts` 和 `archives-tabs.spec.ts`。嵌套属性路径、属性值选区与消息编辑按用户决定登记。 |
| D02 | **应修对照证据及过时说明。** Huhu 按用户要求渲染正文/回复 Markdown 和引用，安全与磁盘原文查 `comments-s4.spec.ts:353`。旧 `evidence/parity-ok/comments.md:12–15` 仍写字面等价，固定 OK 的同链路遇到手动解决入口限制。应以已预置解决态的固定 OK 夹具查过滤／重开，或记录所需状态不可达的具体依据。把正文显示差异和同一固定来源的回复／删除路径所见结果按当前决定更新。 |
| E01–E05、OP-D12 | 入口、展开、共享会话与实际附件断言在 `tests/e2e/workflows/archives-tabs.spec.ts:44,77,114,177,286`。仍需处理移动相对链接和旧编码档案的列表级失败。 |
| F01、F02 | F01 无效 JSON、显式格式化、两类会话冲突及重开有真实断言（`viewers.spec.ts:66–181`）。F02 新增转换可达性、版本竞争和实际容量限制见上表。 |
| F03–F05、OP-D08/09 | 历史 PDF 范围读、加密／损坏、实际外改、HTML 保存与授权归属、隔离与外链同样有直接断言（`viewers.spec.ts:183,332,368,418,471,517,621,799`）。OP-D08 双方案对跑与三位 scheme 白名单按用户修订。ORCA 外壳获准适配，PDF 分母和恢复覆盖仍需下项处理。 |
| F06–F08、OP-D13 | 共享图标含压缩包，跨树／标签／@／搜索／详情及本地图形见 `viewers.spec.ts:644–714`。窄宽、长标题、缩放、四主题和动效已有 `editor-s3-toolbar.spec.ts`、`theme-ok-tokens.spec.ts:86`、`a11y.spec.ts`；非知识库视觉见 Lead 终验。 |
| F10、H06 | 200 次打开／切换／关闭，Tiptap、CM、Y.Doc、observer、worker、URL 及迟到场景已有 `leak.spec.ts:14–191`。已保留却尚无真实接线的跨文档块需按 B01 补加载／切库／释放证据。 |
| G01–G03、G05、OP-D01/02/14–16 | 固定源、两个重放、文件级来源、补丁和许可证路径在候选可核对。G05 原八类零引用及消费者迁移有前轮记录。Q6 历史远端差异及 Q8 外部消费者见后文。 |
| **G04** | **阻断关闭闸门的确认。** OK 历史原始结果 9,182 通过、4 跳过，台账适用 516/639，超过 70%。ORCA 报告列 8/11。先前被质疑的 PdfFind 组件和计数／高亮已补，确认其对应断言通过。仍需重审 `packages/editor/build/vendor-test-catalog.mjs:72–77` 的 `pdf-viewer-failed-load-recovery.test.tsx` 整文件不适用。固定 ORCA 该套件 :268、:324、:402、:459 实测过期任务、替换时的加载与释放顺序、滚动／缩放恢复、反复重载的任务／事件／本地化资源，均有 Huhu `pdf-document-loader.ts:18–125` 与 `pdf-viewer-session.ts:197–223` 的交付对应。外壳与 Base64 的差异可按子项登记，其余不能由 viewer 恢复画面断言代表。将该套件整体还原适用且保守留为 partial 后是 **8/12（66.67%）**，需补恢复行为的等价测试或逐子项说明为何无对应交付能力。也应确认 `pdf-viewer-zoom-ownership` 中当前分栏拥有缩放键盘命令的子项。 |
| H01、H03、H07 | 黄金样本、语言切换、Git Vault 局部保存及重开已有覆盖，见 `golden-roundtrip.test.ts:270`、`i18n-zh-hans.spec.ts`、`fidelity-local-edit.spec.ts:34–117`。混合换行撤销的局部字节要求仍有反例。 |
| H04、OP-D04 | **应修端点实证。** 宿主局部请求和方法分派已有行为证据。生成的 `evidence/desktop-host-endpoints.json` 把 `/api/comments` 登记为 `handler-method`，识别到的 method 只有 POST，GET 经过 URL 变量。`check-host-endpoints.mjs:42–67,107–123` 仍以路径归组，不能确认每个调用的 method、实际绑定的 handler 或 I/O。更具体地，`/api/config` 在 :78 被登记排除，但保留的镜像／Excalidraw 确实通过 `app/src/lib/api-config.ts:14–26` 调用它。宿主完整映射应记录可执行调用和对应输入／输出／失败反馈，修复两种保留块的本地调用路径。 |
| H05、R13、OP-D18 行为 | `compact-inbox.spec.ts:133,184` 验想法、新建及转任务的保存、撤销、IME，`editor-compact-commands.spec.ts:6` 验新建入口的 @/命令过滤和无文档批注。与 `TaskEditor` 合用的已有任务修改入口仍宜补同一路径的输入、撤销后再组合、保存及重开联合验证。成本见终验。 |
| R1–R13、其余 OP/Q | R8 与 R12 的旧 YAML／产品边界已接共享 codec 和后继条款链接。Q2/Q5/Q10 按授权范围。**应修 Q6 证据边界**，`evidence/s0-facts.md:24` 的本地冻结引用比对无法证明 S0 时点的远端最新差异，保留来源与历史限制。**应修 Q8 核实**，发布草稿新增两项已确认变化，`vault.tree`／`notes.files` 外部消费者结论仍只有仓内搜索证据。按既定公开契约核实外部依赖并记录是否须做一版弃用过渡。 |

### Lead 最终构建需留存的结果

| 条款 | 测量或门禁 |
| --- | --- |
| G06 | 在同一最终 SHA 记录 lint、typecheck、test、test:vendor、build、e2e、e2e:packaged、knip、format:check、notices 的退出码、用例数与跳过项。打包后记录实际安装包和应用运行结果，按 Q7 登记可跑的 CI 子集与未验实机。 |
| G07 | 对 rc.4 同环境比较首屏与非知识库模块冷开，含普通／富格式收件正文、任务等实际入口和 OK 闭包加载归属。记录首篇笔记 p50/p95、同格式安装包增量与编辑器 chunk。 |
| F09 | 分别在 10 万文件 Vault、长文、多笔记批注夹具量冷开、热切换、输入、保存和内存。留机器、样本、p50/p95 和原始运行。`tests/e2e/perf.spec.ts:347–352` 用环境变量选择专项。 |
| H05 成本 | 在实际任务描述及收件想法记录每实例内存和初始化耗时，并据 OP-D18 评估回退条件。 |
| H02 视觉、F08 无污染 | 在最终构建跑所有约定的非知识库屏及状态与 rc.4 的计算样式、像素对照。仅已批准的预期差异随报告登记。 |

## 合并、规范与运行证据

- 审查了两个 B01 工作包、fix 和三个合并提交的解决边界。`c1c0220` 的 `host-feedback.test.tsx` 确实曾少两个闭合符号，`2fbe53f` 已补。最终 H04 剪贴板、平台和 B01 批注上下文三组都存在且独立跑过。fix 提交至最终候选在 `packages/editor/src`、`plugins/notes/src`、`packages/vault/src` 没有二次合并差异。B01 task02 的宿主类型配置与剪贴板测试也保留。来源产物独立重放验证通过。
- 候选的 `node scripts/ok-patches.mjs --check` 为 555 条补丁登记，未登记／多余 0。设置固定本地 `OK_SRC`、`ORCA_SRC` 后，`--check-catalog`、`--check-vendor-directories` 通过，固定 OK 7,621 和 ORCA 39,025 个来源文件。 `--replay` 及 `--replay --orca` 分别重放 1,556 和 13 个文件，集合及字节零差异。工作树和收口差异检查干净。
- 当前 SHA 单 worker Vitest 共 **34 文件、651 用例通过**。11 文件 182 项覆盖事务、编码、锚点、路由作用域和 PDF 查找。[定向输出](/tmp/huhu-4f6b703-review.5V5z1p/huhu-review02-vitest.log)
- 当前 SHA 上游改动及补充定位 20 文件、192 项通过，包含预览剪贴板、landing flash、Excalidraw、属性、树和镜像 UI。3 文件 277 项通过，包含黄金样本、档案及查看器分派。上游组件夹具的模拟范围见 B01。[上游专项](/tmp/huhu-4f6b703-review.5V5z1p/huhu-review02-vendor.log) · [黄金样本等](/tmp/huhu-4f6b703-review.5V5z1p/huhu-review02-extra.log)
- 执行旧探针后，以相同输入生成了当前候选的临时副本。日志记载实际 CodeMirror/Yjs 的两组正确替换和混合行尾撤销反例、NotesService 原磁盘反例与目录回执、档案列表及两个竞争窗口。跨文档探针调用生产 LocalDocProvider。两处竞争为受控本地 I/O 时序。[源码模式](/tmp/huhu-4f6b703-review.5V5z1p/cm.log) · [上一轮场景](/tmp/huhu-4f6b703-review.5V5z1p/probes.log) · [新增磁盘反例](/tmp/huhu-4f6b703-review.5V5z1p/new-probes.log) · [跨文档读取](/tmp/huhu-4f6b703-review.5V5z1p/by-reference.log)
- 查看了 fix 原始 Electron JSON，首轮 24 通过、2 失败，只有这两项的后续复跑通过，四个 ORCA 项在首轮通过。本轮仓内桌面构建标记为 `ce913d2`，故候选的 Electron 结果沿用明确标注的分包证据。没有启动 Electron 或全量 E2E。旧 watcher 相关条件跳过已移除，G04 的四项旧 skip 和按需夹具仍需各按实际执行结果登记。[fix 首轮](/tmp/huhu-fix-e2e.json) · [fix 两项复跑](/tmp/huhu-fix-e2e-retry.json)
- 规范轴查了现有 preload、作用域及 Web 兼容。宿主局部 OK 传输以组件和编辑器实例绑定。引入的声明式输入暂停使用 `HTMLElement.inert`，编码用原生严格解码与显式提交，PDF Enter 跳过组合确认。已执行现代 Web 指南的 search/retrieve，核对 `js`、`forms`、`ime-safe-enter-submit`。OP-D05 原疑点中，base/components 已映射到 `vendor.ok-*`、完整主题表导入已剔除，宿主 token 映射已去掉新增的 `!important`。真正的非知识库视觉对照由最终构建出证。

- 2026-11-20 Lead：接受。3 项阻断与各应修项分派 fix2a（数据层）、fix2b（编辑器/证据层）。
