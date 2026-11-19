# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task01.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md
- 执行结果：done

## 结论

**暂缓关闭 Issue #2。** 在 `03dc93b` 实际复现了档案正文退出丢字及手动保存模式在切视图时写盘。两批集成 E2E 共 53 通过、4 失败，失败集中在各子分支分别通过后未同步的定位和标签测试前提。B01 的两种目标右键入口、H03 即时语言切换、G07 收件箱尾延迟和安装包增量仍缺合格验收证据。F09 严格复跑的一项超过门槛，尚未证实是本次集成引入的性能回归。

普通笔记自动及手动退出、切 Vault 草稿回读、快速任务评论、档案字段与 Markdown 在途保存、PDF 和附件查看、主题与窄窗口矩阵、H07 字节保真均有本次集成实跑证据。Linux 解包产物的既有 4 条打包门禁通过。

### 规格轴发现

1. **阻断 · C06 / E04 · 档案正文存在可复现的退出数据丢失。** `plugins/notes/src/ui/archives/ArchiveRecordView.tsx:19–23` 注册的是 index.md 会话，`ArchivesViews.tsx:576–631` 的紧凑正文端口、最新正文和写盘队列在组件内部。退出 IPC 只等待已注册 flusher，然后销毁窗口（`apps/desktop/src/main/index.ts:58–67,91–97,382–390`）。本次用临时 Vault，首笔显示并落盘后，按现有慢桥测试方法让第二笔留在 PM，确认 UI 已有尾字且 Y.Text 尚无该字，直接退出。磁盘没有尾字。现有档案用例点击标题触发失焦，再关闭标签，绕开了此退出路径（`tests/e2e/knowledge/compact-submit.spec.ts:87–112`）。建议把档案正文结算及写入纳入同一 index.md 会话的退出协议，等待队列与错误结果，再加上不失焦退出、切 Vault 和新实例回读测试。该入口缺口至少在当前候选仍存在，基线未复跑此档案路径。

2. **阻断 · A06 / B01 / G06 · 候选上有四条确定失败的交付用例。** `tests/e2e/knowledge/explorer-keyboard.spec.ts:70` 仍找 `Options`，候选实际名称是“文件操作选项”。`tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts:59–67,191–204` 仍按英文 `Embed`、`underline` 和英文 tooltip 查找，布局分支已本地化这些标签。同行文件的 296 行调用重开 helper，28 行断言全局无 ProseMirror，但拖放前起始笔记标签仍开着，关闭目标后选中相邻标签是合法结果（`plugins/notes/src/ui/tabs/docTabs.ts:78–83`）。实际已走到目标文件包含附件引用的磁盘断言，后续重开和图片字节断言未执行。建议将前三条按实际界面语言定位，保留英文 alias 输入。拖放用例按目标标签、正文标识或路径验证关闭与重开。四条分别关联 A06、矩阵 126 / 补充 115、225、238。失败 trace 位于本 worktree 的 `test-results/` 及 `test-results/review-layout-persistence/`。测试失败的原因和相关产品路径的剩余证据见下表。按中文命令定位的独立 Electron 探针中，英文 `/embed` 找到“嵌入”，占位可打开属性，填入 URL 后保存并关闭重开，无 iframe 和外部请求，按钮的自动聚焦未获稳定结果。下划线中文按钮和快捷键即时结果另有实测，未用它替代两种格式的原复合持久化断言。

3. **阻断 · B01 · 五个等价项中有两项没有同目标入口。** `evidence/parity/parity-82.md:51–53,84–87` 的 147 行（模式和属性入口）、149 行（路径提示）有可以接受的宿主呈现，147 的服务端 Lint 由 Q2 排除。149 的静态路径与树导航支持同类需求，若承诺逐段面包屑操作，还应单列差异。238 行真正把树的负载送入编辑器并打开 DocTab，行为可等价，完整版重开证据受发现 2 影响。233 行归档目标是**就地右键编辑区的附件、双链或图片并使用该目标**，235 行是**就地右键标签目标**。当前证据在资源树右键复制路径、点击打开资源、切换和关闭标签（`editor-parity-closeout-remaining.spec.ts:245–263`）。design §7 迁移标签模型，§8 规定资源树菜单，两处均未豁免这两个入口，Q2 仅排除 Share 等。应补原位置、目标及键盘可达的宿主适配，或由有权限的规格决定明确移出范围。82 行号集合核对无遗漏，77 / 5 / 0 是台账标签数。

4. **应修 · B01 / G04 · 不适用范围和测试清单仍缺闭合。** `parity-82.md:113–124` 自述没有逐文件适用性清单。固定上游对照发现 41 个同名实现已在 vendor 中、同路径 DOM 测试未迁入的候选，例如 `FileTargetMenuItems`、`PropertyDisclosure`，需要逐项评估，41 个候选不等于 41 个验收失败。两条明确跳过的 OK 应用壳 / Ask AI 用例，以及 `sidebar-drop` 上游宿主模块用 Huhu 真实入口补验的分流，有依据。归档矩阵第 276 行把模板属性判为不适用可以适用于 OK 专属模板元数据页，不能依此豁免 OP-D19 Q2 明定保留的模板导入。当前 `packages/editor/src/vendor/open-knowledge/PATCHES.md:48` 仍登记移去导入，模板接口未映射。这是基线遗留的范围缺口。补模板导入实现或已生效的范围修订，同时补逐文件排除理由和宿主替代证据。OK 同样本同操作实跑对照在多行仍只有上游单测或 Huhu E2E，不能把两者直接计为完成规格 §7 的对照证明。

5. **阻断 · H03 · 简体扫描样本遗漏实际英文，语言即时切换条件尚未由权威规格移除。** `tests/e2e/knowledge/i18n-zh-hans.spec.ts:10–27,58–97` 过滤混合汉字文本，并停在通用样本与菜单，没有覆盖实际插入后的 Embed。复核看到占位按钮 `Embed a URL`，属性/删除按钮也含 `Embed`（`packages/editor/src/vendor/open-knowledge/core/src/registry/built-ins.ts:845–857`、`app/src/editor/components/Embed.tsx:23–32`）。建议把命令结果、占位、属性和错误状态纳入同一中文验收，用实际消息 ID 或已登记的专有名词白名单。知识库 Rich、Explorer、Comments 当前各自固定 zh-Hans（`NoteEditorSurface.tsx:116`、`ResourceTree.tsx:155`、`CommentsPanelSurface.tsx:31`），设置契约没有语言项。Lead 的“不适用”解释了为什么无法操作，规格 §5.2 及 OP-D19 未把该条移出。应完成设置贯通，或记录有权修改规格的决定。

6. **阻断 · G07 · Q9 只取消安装包体积上限，不能用它关闭未测项或尾延迟。** `evidence/layout/g07-budget.md:23,89–110` 的两轮 21 / 20 对，收件箱 p95 增加 442.8 / 230.4 ms，均超过基线两轮自身波动。三次低负载探针的点击至 DOM 中位数增加 6.8 ms，计时口径和统计量不同。本次 `03dc93b` 再做 6 对，收件箱 p50 115.1 → 113.6 ms、p95 206.9 → 333.0 ms，6 对的 p95 等于最大值，且有其他 worktree 负载。两组证据都不足以归因，亦不足以给出“无回退”。首次笔记 p50 93.1 → 726.7 ms、p95 558.9 → 805.9 ms，按规格记录。CDP 六次均证实工作台和收件箱无命名富文本块、进入笔记后出现。当前 out 可比，Linux 解包也已构建，实际同格式安装包增量仍缺。建议复测同宿主低负载的配对分位数和同格式安装包体积，分别登记懒加载、冷启动和大小。

7. **应修 · F09 / H01 · 证据的证明范围有限。** 严格候选实跑 `tests/e2e/perf.spec.ts:86,148–174`，1 MiB 到可编辑 414 ms 通过，实时预览 5000 行 p95 17.9 ms（80 样本）超过 16 ms。同模块此前在不同负载的分支结果有成败，未做同负载主线配对，暂列阈值未通过。另 `packages/editor/test/golden-roundtrip.test.ts:54–79` 真实加载 LocalDocProvider 并核对 122 条原文本字节，大于 256 Ki 字符的样本走 lazyRich，未强制经历 `ensureRich`、序列化并回读。该测试证明源码优先 hydrate 保真，H07 则确实验证特定富文本样本的字节修改边界。建议把大样本源码优先和建富文本后的往返分开断言，注明固定上游目录的 22 项由 16 个数据文件、4 个 `.gitkeep` 和 2 个 TypeScript 管理文件组成，并列出 JSON 用例展开数。

8. **应修 · B06 · 格式操作后快速切换选区可复现旧正文被替换。** 在真实 Electron 的两段笔记，给后一段加下划线，点回第一段后紧接 End、Enter 和输入 `/embed`。候选与 `main` `9f870c0` 的同一快速序列各 3/3 在选中命令前就丢掉后一段。插入与保存重开探针进一步看到磁盘也缺该段。逐步采样的两版本对照各保留后一段，基线点击后出现 DOM 已折叠而 PM 仍持有上一段的范围。推断是输入先于选区同步。现有同步守卫只处理带修饰键的 keydown（`packages/editor/src/rich/RichMarkdownEditor.tsx:238–269`）。建议给格式后立即点选另一段、换行并继续输入增加真实 Electron 回归，验证实际范围、保留邻段和磁盘内容。已有基线同样可复现，属于关闭前仍未解决的 B06 行为。

### 工程轴发现

1. **应修 · 手动保存的 Markdown 仅切到对应档案视图就写盘。** `plugins/notes/src/ui/NotesModule.tsx:171–196,216–222` 调用 `flushRef.current()`，`NoteDocument.tsx:108–112` 接到 `DocumentSession.flush()`，后者在 241–247 行直接保存，绕过手动偏好。在应用设置关闭自动保存后，本次在同一档案 Markdown 中输入，切视图前字节未变，点“以档案视图打开”就落盘，未点保存或编辑档案字段。基线此导航只切标签，档案实际写操作才调用 `beforeWrite`。建议切换只结算并传递同一会话的版本和缓冲，在明确写动作时合并保存，或采用规格允许的显式保存 / 草稿选择。另异步导航只比较起始标签和 Vault，等待期间关闭目标档案标签仍可被迟到的 `show()` 重新打开，属于代码推断。

2. **应修 · 异步 drainer 拒绝会跳过保存和清理。** `DocumentSession.ts:188–194,241–265,385–403` 用 `Promise.all`，异常在写盘与清理前传播。`useDocumentSession.ts:55–68` 丢弃 `release()` 的拒绝，登记表的 `finally` 只清理全局注册和 map（`DocumentSessionRegistry.ts:52–60`），内部 timer / poll / listener 清理可跳过。`packages/workbench/src/state/flushers.ts:9–11` 吞掉失败，preload `apps/desktop/src/preload/index.ts:46–50` 仍 ack。注入拒绝 drainer 的只读单元探针确认 `runFlushers` 成功返回、无 save / draft 调用，dirty 仍为 true、flushError 为 null，`dispose()` 拒绝。生产触发概率未测。建议保留已交付快照、聚合并报告结算失败、在 finally 释放资源，并为关闭协议增加可观察的失败处理。正常端口 effect 的 `onPort(null)` 经 `NoteDocument.tsx:113–121` 解除注册，未见正常路径遗留。

3. **应修 · 附件与索引回退应在 Engine 按真实路径落实受保护资源策略。** `plugins/notes/src/ui/documents/NoteEditorSurface.tsx:78–95` 对传入路径的字符串段做保护检查，`packages/kernel/src/capabilities/vault.ts:124–149` 读段只经 `resolveInVault`。该守卫（`packages/vault/src/paths.ts:9–45`）拒绝越界并核对 realpath 位于 Vault 内，未在真实目标上核对受保护目录。静态推断，Vault 内别名路径指向 Vault 内受保护目录时，保护语义存在缺口。`plugins/notes/src/ui/viewers/FileViewer.tsx:69–97` 请求受保护元数据后只比较 path 和 kind，未消费 `entry.protected`，会将匹配项交给查看器内容入口。正常 11 MiB 真实字节下载和 E05 通过。建议 Engine 在共享资产读取边界同时核对规范化路径及受保护真实目标，回退查看器保持受保护项的既有元数据/权限语义，并补边界测试。未运行针对受保护内容的探针。

4. **应修 · 分段附件读取的大小相同不代表版本相同。** `NoteEditorSurface.tsx:85–95` 只比较 size 和进度，`packages/kernel/src/capabilities/vault.ts:131–149` 每次单独打开文件，并返回计划读取长度，未检查实际 `readSync` 返回值。同尺寸并发替换可能得到混合版本，stat 后截短可能带入零字节。建议固定读取版本或文件句柄，确认实际读取长度并按版本变动拒绝下载。下载成功的 Object URL 在 finally 中异步撤销。下载错误回调在组件切走后仍可执行一次 `setFailure`（`FileBubbleButtons.tsx:66–95`），属于代码路径，未观察到持续泄漏。用取消信号或作用域 token 同时处理读段和 UI。

5. **应修 · 实际 Linux 包带入 vendor 测试。** `apps/desktop/electron-builder.yml:8–11` 的主文件白名单未排除被 electron-builder 作为 workspace 运行依赖收集的 editor 树。读取本次 ASAR 目录，134 个新增 vendor 文件均在包内，其中 130 个匹配本次测试 / helper / test-utils（981,583 B 未压缩）。`packages/editor/test/fixtures/golden`、`vendor-jsdom-setup` 和新增 `@testing-library/user-event` 不在包内。仓库原有 vendor 的 perf 夹具仍以一份打入 ASAR。建议排除依赖目录中的测试源码和非运行时夹具，并对实际包清单加断言。

6. **建议 · 黄金夹具与来源登记。** `packages/editor/test/fixtures/golden/ok` 的 16 个文件约 7.5 MiB，逐 Git blob 对照与 `44a2e0a` 完全相同，也和仓库已有 vendor 夹具完全相同，已有 Git blob 可复用，工作树仍物理复制一份。可让测试读取固定 vendor 夹具并明确入口，减少维护与检出体积。现有 vendor `UPSTREAM.md`、GPL-3.0-or-later LICENSE 与固定上游逐字节匹配，ledger R-46 当前只覆盖 vendor 运行闭包，没有记新测试目录的夹具映射。建议登记外部夹具来源、范围和许可证。加密 PDF 是本地生成的专项样本，生成命令在 `evidence/session/runs.md:34`。

7. **建议 · G01 / G02 补可重放依据。** `scripts/ok-patches.mjs --check` 对实际 vendor 差异检查得到 203 条登记、无遗漏和多余，H03 与本地补证两节均保留（`PATCHES.md:72–97`）。检查脚本只对照固定清单和路径登记（`scripts/ok-patches.mjs:11–82`），新增上游文件记为新增路径，无法从该结果推出文件级来源映射和从干净上游重放的零差异。建议为新增闭包和测试维护上游路径、改写说明及可重放输入。

正常路径的合并核对也已完成。索引命中及未命中的两个 FileViewer 入口均位于 Suspense，PDF 的二级边界也保留，E05、PDF/HTML 和 TXT/JSON 已实跑。任务评论以 task.id 为 key，忙状态和 ref 防重复发送，成功追加后按查询所得版本 CAS 结束任务。现有会话保存仍通过版本化串行队列，普通笔记 drainer 只由保存、退出、切换等边界调用。`RichMarkdownEditor.tsx:101–110,373–375` 的显式 flush 同步结算潜在待办并读出全文。没有新增每键调用，F09 尾延迟不能据此归因到 drainer。

## 产物与改动

审查工作目录 `/home/wta/projects/huhu-wt-review`，detached HEAD `03dc93b50cda7fa1d046a5e8b77207d5c3f45918`，基线 `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。共 291 个差异文件，236 个新增。按 Git 新增清单核对 64 个证据文件、134 个 vendor 文件（105 个上游原样、27 个适配、2 个本地）、16 个固定 OK 黄金数据文件和 22 个其他本地文件，覆盖测试、启动脚本、辅助代码与夹具。共 178,599 行新增，主要由黄金数据构成。运行产物在 `apps/desktop/out/`、`apps/desktop/release/linux-unpacked/`、`test-results/` 和 `packages/editor/test-results/vendor.json`。未修改业务文件，未提交或推送。

## 验证

以下相对路径以审查工作目录为起点。分支证据按原 SHA 使用。实跑与代码推断已在发现中标明。

| 验收项 | 实际结论与证据 |
| --- | --- |
| A01–A05 | 归档 S5 资源、隐藏和引用证据适用，pA 分支另跑 105,000 文件探针。本轮未全量重验。集成 A07、E03 和 i18n 用例经过真实文件树，不能替代全场景 A01–A05。 |
| A06 | 边缘、右键及键盘步骤走到了行内定位才失败，无法接受整条通过。见发现 2。 |
| A07 | 集成核对 Pierre 树空白处拖回根目录、重名及移入自身，按实际文件断言通过。其余移动、复制、恢复沿用归档。 |
| A08–A10 | D06 的移动 / 回收站恢复、C06 切换有证据。未重新覆盖所有脏父目录、计数及 CLI/MCP 外部边界。A10 新回退路径见工程发现 3。 |
| B01 | 82 行集合与归档最终状态以“未逐项验证”开头的 82 行相同。五个替代项逐个判断见规格发现 3，模板和排除见发现 4。集成图片对齐、11 MiB 下载、Callout 属性、预览模态、DocTab 和树菜单通过。126/115、225、238 分支证据不等于集成通过。 |
| B02–B05 | 黄金源字节与 H07 本次通过，vendor 绿。真实本地化关键词 `accordion` 仍筛出中文。`embed` 亦能找到“嵌入”。固定 OK 同场景逐项对拍、B03 原斜杠逐项负载复跑未独立重做。pA 保留原用例 13/20 与定向新用例 20/20 证据，原测试修订在本 SHA 之外。B04 的真实 IME 按 Q7 记录。B05 文件来源撤销单测使用合成 UndoManager，另有现有 Electron 撤销用例支持。 |
| B06–B10 | 归档真实 Electron 选区和合成 IME、各模式、焦点、不写盘记录按原版本使用。此次核实 H07 与 H01、C06 无编辑字节/mtime、H05 撤销。快速换选区的两版本证据见规格发现 8。完整选区、渲染与模式矩阵未再次跑。 |
| C01–C04 | Vendor 属性默认布尔及正式 Callout 保存重开、H01/H07 辅证。归档 S3 属性矩阵仍是其余 frontmatter / 冲突顺序的来源。 |
| C05 | 真实 UI 错误状态、进入源码、修复、关闭重开，断言原文件在修前未改、修后字节正确。新用例主要断言诊断可见与修复成功，未核对逐字文案。 |
| C06 | 普通笔记自动/手动关闭后新实例、真实切 Vault 再切回读草稿、切笔记与无写通过。档案正文退出丢字及错误处理仍缺，分别见规格发现 1 和工程发现 2。 |
| D01、D06 | 属性评论取消时实际无存储文件，提交后再开、移动与回收站恢复仍同一线程。档案评论重开及任务评论通过。D02–D05 的原布局/评论锚点矩阵未重跑，沿用 S4。 |
| E01–E05 | 全部档案套件通过。E04 新用例实际挂起 notes.save，确认切换等待，然后修改字段、关两个标签重开并核对正文/字段及磁盘。单一操作序列未覆盖档案正文退出和手动导航，见发现。E05 附件使用统一查看器，`@` 插入和外部笔记反链路径有断言。 |
| F01–F06 | F01/F02 文本、JSON、BOM/CRLF 与冲突，F03 PDF 大文件/受密码保护/损坏/外部修改，F04/F05 prod 预览与隔离通过。F05 的既有 dev 限制仍登记，F06 图标完整映射沿用原证据。附件新增路径守卫另见工程发现。 |
| F07、F08 | 候选 F07 15 条通过，含 6 宽度 × 4 缩放 × 4 详情/批注状态和实际中心点命中。F08 四主题 × 明暗、compact / reduced-motion 用例通过，Electron 44.9.1、Chromium 152.0.7977.167，既有 axe 日志见布局证据。 |
| F09、F10 | 严格 F09 输入延迟超过阈值，见规格发现 7。本次查看器 PDF/HTML 多轮用例通过。200 轮编辑器泄漏已有 pA 分支通过，候选当前未重新跑 200 轮。 |
| G01–G04 | 固定 SHA、License、脚本登记及 6,009 vendor 测试通过。新增来源映射、重放及不适用清单部分见发现。G03 ledger 旧位置与新夹具路径核对，未执行会写入 notices 文件的生成命令。 |
| G05 | 检查 rich export 与 notes/tasks/compact 调用入口和历史零引用资料。本轮未重跑全部零引用守卫。 |
| G06 | 本次 Linux 候选 build、vendor、定向单测及 4 条打包 E2E 通过，合并后 E2E 有四条明确失败。类型 / lint / format / knip 靠分支记录，本轮未重跑完整门禁。 |
| G07 | 按需加载通过，非知识库尾延迟、同格式安装包增量证据不合格。见规格发现 6。 |
| H01 | 122 条原字节断言通过。真实关闭重开 0 次及一次编辑 1 次 `notes.save` 已实际数请求。大样本强制富文本往返仍需补证。 |
| H02 | Scope 使用现有 token cascade，主题副作用范围沿用归档差异报告。由于此候选更动 token 映射和加载入口，旧 `visual:compare rc4` 无法单独证明新 SHA 的非知识库像素零差异。 |
| H03 | 中文样本扫描 0 白名单外，实际 Embed 占位仍英文，语言切换明确缺实现/权威豁免。 |
| H04 | `core.ts:37–76` 新 tags/headings/forward/backlinks 路由及 `DocumentHostCallbacks.readAsset` 已接正常路径。旧 endpoint-matrix 未同步这些新增路径的完整输入/错误映射证据。建议更新并核对错误断言。 |
| H05 | 两种任务评论与撤销到空通过，关闭状态和重新打开读取同一条评论都有检查。任务表单及收件箱完整输入、引用、组合与每实例成本未在集成专项重跑。收件箱两处仍用原生 textarea（`plugins/inbox/src/ui/InboxModule.tsx:400,479`），需区分“无桥待结算”与 OP-D18 的 compact 迁移契约。 |
| H06–H07 | 本地 provider 没有新增网络或 IndexedDB，200 轮引用原分支。H07 在候选正常关闭并重开标签，两次都比较完整磁盘字节、断言表格与列表保持，通过。 |

### 判红核对

- C06 上游适配分支 `290e8f7` 的 `/tmp/huhu-issue2-session-02/red-proper.log:133–163` 在已输入 DOM 尾字后，真正退出并从文件读回旧文本。同日志 192 行以后切 Vault 实际漏列。任务评论两种入口发出的旧值、重复请求和撤销至空仍发请求在同一日志可定位，候选按实际请求体、重开与次数转绿。
- 手动模式 baseline 在旧的树定位就超时，不能称其通过行为断言判红。切笔记是基线本来通过的回归保护。候选手动草稿有新进程 RPC 回读及恢复 UI。不要把此证据与档案正文退出混用。
- E04 挂起写入用例的真实落盘、双视图回读和顺序断言在集成上成立。分支偶发旧评论/旧文本与旧缓存的证据在 `evidence/session/e04-flake.md`。F07 的旧遮挡有 baseline 命中失败以及前后截图，候选通过。B01/H07 为补证，本身未声称首次局部保真在基线失败。

### 实际运行

| 命令或探针 | 结果 |
| --- | --- |
| `herdr status`、`herdr pane current --current`、任务/主题/清单读取、`git rev-parse HEAD main` | Herdr 0.9.5 / 本地继承 socket，真实 pane w4:pE，manifest 为 task01.md active，初始无报告。 |
| `git diff --name-status main..HEAD`、`--numstat`、`--diff-filter=A`、`git diff --check main..HEAD` | 枚举 291 / 236。diff check 的两处 EOF 空行均与固定上游黄金样本字节相同。 |
| `pnpm build` | 退出 0，out/build-info.json 证实 03dc93b，实际 `FileViewer-DmNpWHhF.js` 38,724 B。 |
| `node scripts/ok-patches.mjs --check`、Git blob 和固定 SHA 清单对照、矩阵测试引用检查 | 203 项，无遗漏/多余。16 个 OK 数据 blob 完全一致，82 个目标行一致。本地证据 3 处用例描述与实现标题不同，分别为 IME、尾部可写区、属性选择，实际文件存在，建议维护可跳转引用。 |
| `pnpm exec vitest run plugins/notes/test/document-session.test.ts plugins/notes/test/archives.test.ts packages/editor/test/golden-roundtrip.test.ts packages/editor/test/markdown-parity.test.ts --maxWorkers=2` | 4 文件 172 测试通过。 |
| `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test:vendor` | 290 文件，6,009 通过 / 4 跳过，输出 `packages/editor/test-results/vendor.json`。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/{session-flush,compact-submit,fidelity-local-edit,i18n-zh-hans,editor-parity-closeout-remaining}.spec.ts tests/e2e/workflows/{archives-tabs,viewers}.spec.ts` | 33 通过、3 失败，失败 trace 见 `test-results/`。三项详见规格发现 2。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/{session-persistence,comments-persistence,explorer-keyboard,editor-s3-toolbar,theme-ok-tokens}.spec.ts --output=test-results/review-layout-persistence` | 20 通过，A06 一条失败。 |
| Node + Playwright 临时 Vault 探针 | 手动切档案证实落盘。档案慢桥退出尾字未落盘。模拟异步 drainer 拒绝证实跳过 save/draft 且退出协调层已成功返回。中文 Embed / 下划线探针及两版本选区对照见发现。 |
| `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '打开 1 MiB|编辑输入延迟' --output=test-results/review-perf` | 414 ms 通过，输入 p95 17.9 ms 失败。启动前 1 分钟负载 2.52。 |
| `xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 6 --trace-modules` | 退出 0。对照 `9132640` tag `v0.0.1-rc.4` 与 `03dc93b`，各 6 次，2,001 篇夹具，工作台 p50/p95 2341.0/8345.6 → 1599.7/2094.5 ms。out 13,535,700 → 36,980,803 B，rich JS 4,303,337 B。收件箱、首次可编辑延迟及判定见发现 6。 |
| `pnpm --filter @huhu/desktop run dist --dir --linux --publish never`，同命令加 `-c.electronDist=<本 worktree 已安装 Electron dist 的 realpath>` | 首次 Electron 下载后停滞，终止本次 builder。使用本地 Electron 44.9.1 重试退出 0。ASAR 522,985,544 B，内含 03dc93b 的构建标识。已用 `@electron/asar` 的 listPackage/statFile 检查测试夹具和运行包。 |
| `HUHU_PACKAGED_EXE=<候选 linux-unpacked/huhu> xvfb-run -a pnpm e2e:packaged --output=test-results/review-packaged` | 隔离 XDG 临时目录，4/4 通过。覆盖笔记/任务/导出、随包 Herdr、CLI、fake provider 监督进程。现有打包套件未专测 PDF/HTML。 |
| `pnpx modern-web-guidance@latest search …`、`retrieve toolbar,css-layout,design-token-reactivity,security` | 审查时核对实际容器宽度、作用域主题和跨源预览边界。业务改动为零。 |

## 阻碍与接续

本次独立审查已完成。建议 Lead 保持 Issue 打开，优先安排档案退出保真、集成失败用例和 B01/H03/G07 的权威验收缺口。Windows/macOS 实机、真实输入法和硬件鼠标仍按 OP-D19 Q7 登记为未验证。索引回退的安全判断来自静态路径链检查。集成 E2E、性能和打包结果仅对应本报告列出的平台及命令。

## Lead 验收

（Lead 追加，2026-11-18）**验收：审查有效，结论采纳，Issue 保持打开。** 逐条处理：
- 规格 1（档案正文退出丢字）、工程 1（手动保存模式切档案视图就写盘）、工程 2（drainer 拒绝）、工程 3（受保护路径）、工程 4（分段读版本）、规格 7 的 H01 大样本部分、工程 6（黄金夹具复用和登记），以及 explorer-keyboard 的失败用例 → w4:pC/task03.md。
- 规格 8（B06 格式后快速换选区丢段落，main 上也能复现，按缺陷修）、规格 3 中的 233（编辑区就地右键）、规格 4（模板导入按 Q2 保留，必须实现；41 个 DOM 测试候选逐项评估）、工程 7（G01/G02 来源映射）、规格 2 中 parity 用例的本地化与标签假设 → w4:pA/task05.md（排在 task04 表情选择器之后）。
- 规格 5（H03 的 Embed 英文；“即时切换语言”：Lead 撤回之前的不适用判定，按规格实现最小的知识库编辑器语言设置并贯通）、规格 3 中的 235（标签页右键）、工程 5（安装包排除测试）、规格 6（G07 在低负载下配对复测与同格式包体积，在其他任务完成后、机器空闲时做）→ w4:pB/task03.md。
- 规格 7 的 F09：由 Lead 在最终候选版本上、机器空闲时，对 main 与候选做配对的严格测量。
修复完成后，由同一审查会话对新的候选版本复审。
