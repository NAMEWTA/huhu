# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task02.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report02.md
- 执行结果：done

## 结论

**建议暂缓关闭 Issue #2。** 复审发现两条实质性的手动保存缺陷。设置返回期间，若草稿请求在途，已经在真实编辑器交付的新输入会被重读覆盖，连恢复草稿也找不回来。标签菜单“关闭 / 关闭其他 / 关闭右侧”会静默提交当前打开文档的正文，和普通关闭留草稿的行为冲突。Lead 的最终零重试全量是 220 通过、4 失败、4 跳过。G07 先前候选的同格式包增量已记录，最终 SHA 的低负载启动配对与同格式体积差仍缺。

首轮所报档案正文退出丢字、仅切档案视图就写盘、迟到打开档案、快速换选区丢段落均已有针对原问题的修复和证据。B01 编辑区及标签页就地菜单已接通。F05 原 HTML 文件隔离和新增代码预览的隔离都经过候选验证。F09 的逐键查询回归已移除，5000 行输入绝对 16 ms 门槛仍为红。

### 首轮发现逐条复审

路径以审查 worktree 为起点，短路径在同段已给出组件所在目录。分支证据按原 SHA 使用。

| 首轮规格项 | 状态 | 证据与剩余缺口 |
| --- | --- | --- |
| 1 · C06/E04 档案退出丢末字 | **已解决** | `plugins/notes/src/ui/archives/ArchiveRecordView.tsx:15–18` 使用同一 index.md 会话，`ArchivesViews.tsx:598–632` 的 CompactInput 注册/解除 drainer，正文通过 `replaceBody` 回同一会话。真实慢桥退出、切 Vault 前有未交付尾字，两条分别以新实例和磁盘正文验证。见 `tests/e2e/knowledge/session-archives.spec.ts:27–69`、pC/report03 的判红和最终全量 92、93。复审本地退出用例一次在预备的首笔自动保存超时，切 Vault 通过。同 SHA 零重试单独复跑 2/2 通过。共享会话继续保护档案字段与正文的写序。 |
| 2 · A06 / B01 集成 4 条测试失败 | **已解决**（原四条） | `tests/e2e/knowledge/explorer-keyboard.spec.ts:68–78` 行内按中文可达名称，`editor-parity-closeout-remaining.spec.ts:60–91,190–214,277–305` 使用中文命令/格式提示，保留英文别名输入，关闭按目标文档定位。Lead 全量四条均通过。另三条气泡失败属于本轮不同用例，见下文。 |
| 3 · B01 五个宿主等价项 | **已解决**（入口） | 233 的就地菜单在 `packages/editor/src/rich/EditorAssetMenu.tsx:29–103`，覆盖附件、图片和双链、目标路径、键盘与焦点。235 在 `plugins/notes/src/ui/tabs/TabContextMenu.tsx` 接真实标签操作与键盘。147、149 仍按首轮判断登记为宿主属性/模式和静态路径差异，238 已实跑拖放到正文、真实附件字节和目标标签重开。235 的关闭行为另见新发现，菜单存在不能代替 C06 合格。 |
| 4 · B01/G04 不适用、模板导入、上游对照 | **部分解决** | 独立取固定 Git 树，`evidence/parity/dom-tests-applicability.md:3–13` 596 行与上游集合完全相同，511 不适用、77 原样迁入、8 适配。原 41 个候选全部列为“是”，23 原样、1 适配、17 不适用，较宽口径为 89，迁入目标均存在。OK 专属账户/丢失宿主依赖等理由有据，缺宿主但规格保留的本地功能仍需单独判定。实际模板能导入到“模板”目录、独立编辑保存重开，且源文档不变。导入副本尚无模板消费入口。兼容性矩阵多行仍只有一侧 E2E 或上游单测，固定 OK 同样本同操作对照需用实跑记录或明确差异逐项补齐。 |
| 5 · H03 英文标签与即时切换 | **部分解决** | `packages/workbench/src/settings/SettingsModule.tsx:41–47,79–87` 的 Vault 设置已贯通编辑器、文件树、批注与属性，`tests/e2e/knowledge/i18n-zh-hans.spec.ts:185–317` 扫实际块/占位、错误/表情及在同一 DOM 上换语言并保留草稿。Embed 占位、属性和通知有中文词条。Lead 全量逐命令扫描和切换通过，通用扫描未跑到末尾，气泡未出现。复审零重试定向扫描 3/3 通过，白名单外 0。设置保持挂载的新竞态见下文。 |
| 6 · G07 启动与包体 | **部分解决** | `evidence/layout/g07-budget.md:119–134` 有同格式 rc.4 与 `2c15686` 的 Debian 文件，141,619,672 → 221,168,788 B，+79,549,116 B（+56.17%）。Q9 未设包体上限，增量是旧候选的真实安装包数据，最终 SHA 又更新了依赖和字典，最终 ASAR 已达 557,897,800 B。仍需使用同配置生成最终 Debian 包更新增量。当前 rich JS 为 5,203,663 B，前一候选的 CDP 证明对应阶段的按需加载路径，首轮高负载收件箱尾延迟的留项仍需要 `9b143a4` 与 rc.4 的低负载配对 p50/p95。单次工作台绝对门槛通过不证明无回退，也不代表收件箱和首篇笔记。 |
| 7 · F09 阈值 / H01 大样本 | **部分解决** | F09 有对照、修复和记录，详见下节。H01 在 `packages/editor/test/golden-roundtrip.test.ts:83–123` 补到真实 `ensureRich → PM 节点序列化 → 再 hydrate`，源缓冲整字节、第二轮正文文本/顶层块数和连续 serialize 稳定均断言。归一化后的完整语义（如 mark、属性、表格内部）没有用规格点名的等价判定或逐例登记校验。此部分证明了真实路径和有限等价，H07 另有实际局部改字的整文件证据。 |
| 8 · B06 快速换选区错替换 | **已解决**（首轮复现） | `packages/editor/src/rich/RichMarkdownEditor.tsx:278–316` 在 keydown/beforeinput 捕获里比较 DOMObserver 快照，组合输入时跳过，只有不一致才结算。实际 `editor-parity-selection.spec.ts:7` 无等待地格式、换段、键入斜杠，对照新旧选区段落、格式、最终磁盘并重开。pA/report05 有原故障红灯，最终集成/本轮专项绿。三条偶发气泡失败不等同于复现正文错替换。 |

| 首轮工程项 | 状态 | 证据与剩余缺口 |
| --- | --- | --- |
| 1 · 手动切档案视图与迟到导航 | **已解决** | `plugins/notes/src/ui/NotesModule.tsx:265–289` 切档案只 drain、保留 request 身份并验证当前标签/Vault。`documents/DocumentSessionRegistry.ts:48–60` 微任务移交同一路径的引用。手动切视图时原文件字节不变，明确保存才写。关闭目标档案后挂起请求不会重开。两条实际断言见 `session-archives.spec.ts:73–153`。 |
| 2 · drainer 拒绝后的落盘、错误与清理 | **部分解决** | `DocumentSession.ts:211–222,319–355,475–492` 等所有端口、报错、保全其它已交付的缓冲为草稿、finally 清理。释放被接住，`packages/workbench/src/state/flushers.ts:9–19` 汇总并拒绝。候选单测通过。桌面 preload 仍吞拒绝并无条件回执，main 仍销毁窗口（`apps/desktop/src/preload/index.ts:46–50`、`src/main/index.ts:58–67,91–97`）。端口未交付或草稿也写失败时，用户仍得不到可挽回的退出结果。建议传递有结果的回执，在不可保全时暂停自动销毁或提示明确放弃。3 秒宿主上限是前置约束。 |
| 3 · 受保护路径 | **已解决**（所报附件读取与索引回退） | `packages/vault/src/paths.ts:58–74` 按请求名、Vault 边界和真实目标核对，`list.ts:39–84` 识别受保护路径与链接目标。`packages/kernel/src/capabilities/vault.ts:13–41,159–168` 统一读取守卫。索引回退只显示 metadata，见 `plugins/notes/src/ui/viewers/FileViewer.tsx:78–109`。独立走既有 `packages/kernel/test/vault-assets.test.ts` 两条，含资源拒绝和版本断言。普通 F03/F05/E05 有真实集成证据。 |
| 4 · 大附件分段读版本、卸载后的回调 | **已解决** | `vault.ts:11–42` 按文件描述符和路径复核 dev/ino/size/mtimeNs/ctimeNs，累计实际读取长度，拒绝短读。客户端在 `NoteEditorSurface.tsx:111–138` 固定 expectedVersion，核对分段偏移/实际字节，并使用卸载停止信号。pC 受控同尺寸替换和本轮 kernel 测试均拒绝第二段。普通 11 MiB 下载逐字节通过。 |
| 5 · ASAR 含 vendor 测试 | **已解决**（排除规则和实包检查） | `apps/desktop/electron-builder.yml:8–14` 排除 test/spec/helper、夹具及测试输出，`scripts/check-asar-contents.mjs:10–30` 枚举实际包并读出标识。pB/report03 的 Debian 负载与解包 ASAR 同 SHA-256，50,787 项检查通过，4 条打包冒烟通过。本轮最终包核查见命令表。 |
| 6 · 黄金夹具复用、来源 | **已解决** | `packages/editor/test/golden-roundtrip.test.ts:11–30` 复用 vendor 固定夹具，仅保留 Huhu 自有样本，`docs/upstream/ledger.md` 登记来源。新增重复目录已删除，包排除 vendor 非运行时夹具，不改变样本字节。 |
| 7 · G01/G02 来源映射与可重放 | **已解决** | `evidence/parity/vendor-replay.json` 和压缩二进制差异、`scripts/ok-patches.mjs:86–141` 从固定 OK Git blob 写入空临时目录并应用 diff，然后比整个目录文件集合和哈希。本轮实跑 1,346 文件零差异，267 登记无漏无多余。596 DOM 的适用性账补了非迁入理由。 |

### 本轮新发现

1. **阻断 · 设置返回时写草稿与用户新输入竞争，造成数据丢失。** `plugins/notes/src/ui/NotesModule.tsx:64–79` 在重显后启动 `reopenDraft()`。`documents/DocumentSession.ts:364–368` 先等待 `flushForExit()`，随后才取 `this.revision` 传给 `load`，而 `load:161–187` 只识别读盘过程中发生的新输入。独立 DocumentSession 探针暂停 `notes.draft.save` 请求，写入新 text 后放行，旧草稿成为唯一可恢复版本。本轮在真实 Electron 单独复现：手动模式编辑，进设置等首份草稿落盘，返回知识库时暂停第二个草稿写入，输入“返回后新输入”，确认它已进入源缓冲，放行请求。编辑区回到原文，点击恢复只得到旧草稿，磁盘未变，刚输入的文字消失。建议从重显/请求开始固定会话版本，任一步发现更新修订就保留当前缓冲，同时避免不必要的重复 checkpoint 写入。在回归里分别停住写草稿和读文档两阶段。

2. **阻断 · C06 手动模式下标签右键关闭会无提示保存原文件。** `NotesModule.tsx:189–202,441–443` 普通按钮直接 close，释放会话走 `flushForExit:349–355`，手动模式存草稿。右键三种关闭操作若涉及有 flushRef 的活动 Markdown 标签则先走 `flushRef`，映射到显式保存 `DocumentSession.flush:337–346`。这条差异已被当前 E2E 作为期望行为：`tests/e2e/knowledge/layout-tab-menu.spec.ts:19–23,54–73` 关自动保存，点击“关闭右侧”后要求原文件包含新正文。普通按钮回归 `session-flush.spec.ts:149–182` 要求磁盘原字节和完整可恢复草稿。Issue §14 C06 管关闭前交付与草稿恢复，手动模式更具体的契约 US-KN-05 / ACC-KN-04 在工作台定义 `modules/knowledge.md:13,119`，保存是独立的明确选择。关闭菜单没有“保存”的提示。建议菜单和按钮共用同一关闭入口，保留手动草稿或按规格提供明确的保存/草稿/放弃选择。补齐关闭、关闭其他、关闭右侧各自的磁盘断言。

3. **应修 · 设置页的 Ctrl/Mod+F 会被隐藏的笔记编辑器消费。** `packages/workbench/src/shell/AppShell.tsx:98–106,283–289` 在设置页使用 display:none 保留笔记。仍挂载的 `packages/editor/src/rich/RichMarkdownEditor.tsx:479` FindReplaceController 在 window 上监听，`FindReplaceController.tsx:213–236,245–249` 检查可编辑、模式、组合输入和浮层，未检查笔记是否为活动面。真实探针在设置的语言 select 聚焦时按 Ctrl/Mod+F，设置仍可见，隐藏笔记内出现 1 个查找栏。返回知识库时查找栏可见。建议将模块活动状态纳入窗口快捷键限域，保留可见笔记时的实际快捷键和外部浮层优先。此点来自 06d0afb 的保活与全局监听交互。dedfab7 本身移除全页逐键查询的改法成立。

4. **应修 · 本地模板导入只创建普通副本，未能从模板生成新笔记。** `plugins/notes/src/ui/explorer/filesDeps.ts:118–147` 创建并保存“模板”目录的一份文档，`createPage` 只接受四个内建 ID。`plugins/notes/src/ui/NoteDialogs.tsx:119–125` 只枚举同一固定内建列表。`tests/e2e/knowledge/editor-parity-assets-template.spec.ts:55–95` 验证副本字节与打开，未验证导入以后可作为模板选择。OP-D19 Q2 要求保留模板导入，Issue §5.4 文件树菜单至少接通模板入口。建议最小化接入本地模板清单并让文件树或新建对话框消费它，E2E 用导入模板真正生成另一篇文档。若产品只承诺将副本放入文件夹，需要权威范围决定。

5. **应修 · 最终零重试仍有三条同族气泡失败。** Lead 的 `int4/e2e-full.log:355–438` 对脚注 `editor-parity-closeout.spec.ts:465`、块类型菜单 `:564` 和 H03 `i18n-zh-hans.spec.ts:167` 都在等待气泡控件时超时。脚注和块类型菜单在超时前已读取到预期 DOM 选区，所以统一归因于旧中文 locator 或 Playwright 没有选中并不成立。根因尚未定，候选本地复跑结果见命令表。建议在失败现场同时记录 PM 的选区、窗口焦点、浮层显示条件和 DOM 选区，区分产品选区同步与测试环境，修后以零重试整套确认。pA/report07 启用重试时的通过只说明症状间歇出现。

### 性能、预览与离线词库核对

- **F09。** Issue 原文要求测量并记录。pD/report02 追踪了 `ffbafa8` 每键全页查询的引入，pA/report06 和 `evidence/parity/f09-findreplace.md:30–47` 的五对样本表明 main 22.4 ms、修复构建 21.5 ms（各轮 p95 的中位数），观察差在组内波动范围。双方严格 ≤16 ms 均 0/5。最终 `9b143a4` 全量为 21.6 ms。接受逐键查询回归已移除、配对未检出其余输入回退，项目绝对门槛及 G06 仍有真实红灯。作者配对中的 1 MiB 194 / 433 ms 都过 500 ms，后者单次约慢 2.23 倍。最终全量同用例候选为 209 ms。两个候选读数差 224 ms，现有一次对一次还不足以认定稳定的大文件回退或改善。建议同一应用启动阶段、同一负载、相同预热口径的重复配对，保留原样本和 p50/p95。首次打开笔记的 G07 与 1 MiB 源码优先用例的指标边界不同。
- **F05。** `a2145c3` 新页面走 `apps/desktop/src/main/preview-session.ts:44–65,82–93,121–132` 的固定协议路由。该路由只服务静态内页，CSP 响应含 sandbox、frame-ancestors 及 nosniff，沿用工作台现有允许的协议来源。原 Vault HTML grant 路由保留。内页仅接父窗口和预期 origin，`PreviewFrame.tsx:12–25` 仍只有 allow-scripts，独立 `preview-frame-policy.ts:3–8` 保留默认拒绝、无 connect、无子框架、无表单和限制资源。e99571c 的悬停数据是 source 匹配到当前 contentWindow 的布尔 UI 状态，`CodeBlockView.tsx:169–189` 无桥接权限。Lead 最终现有 F05 两条、`preview-html.spec.ts:29–128` 实际模板、隔离、请求不发生及保存重开通过。当前代码和现有行为证据没有发现 F05 的退化。预览支持执行本地片段的脚本，记录对应的 CSP 允许项和双层限制。
- **表情。** `packages/editor/src/host/offline-emoji.ts:1–20` 经本地路由从锁定的 emojibase-data 提供字典，zh 数据按 hexcode 合并英文搜索词，中文只在请求时按需导入。`emoji-picker.tsx:25–42` 随 Lingui locale 切换；`THIRD_PARTY_NOTICES.md:807–808` 登记 MIT 数据包。真实键盘、鼠标与源码属性图标测试覆盖中文显示、英文搜索、离线、Escape 键和磁盘持久化。未发现本轮词库造成网络请求或编辑降级。
- **设置普通返回。** `14d116c` 的隐藏时 checkpoint 和普通返回恢复正确补齐 06d0afb 的卸载缺口，语言切换保留实例、普通手动模式读回草稿、ACC-KN-04/05 都有集成绿灯。本次发现针对以前未覆盖的第二次草稿写入窗口。

## 产物与改动

工作目录 `/home/wta/projects/huhu-wt-review`，detached `9b143a4ce9af5d6d9dfec6bb131b4adbcc10855f`，首轮基线 `03dc93b50cda7fa1d046a5e8b77207d5c3f45918`，主线 `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。复审比较 194 个文件，新增 83 个（25 证据、49 packages、2 plugins、1 script、6 tests），并核对 main 至候选的 404 文件整体边界。大量删行来自复用原 vendor 黄金数据。业务文件未改动，未提交。目标报告是唯一协作产物，运行产物位于各自的构建或测试目录。

## 验证

| 实际命令或核对 | 结果 |
| --- | --- |
| 读取 task02、topic、manifest、report01 和 pA 05–07 / pB 03–05 / pC 03–06 / pD 02。herdr status、herdr pane current --current | 本地 Herdr 0.9.5，同一共享根，真实窗格 w4:pE，指针 task02.md active，初始无 report02。 |
| `git checkout --detach 9b143a4 && pnpm install --frozen-lockfile && pnpm build` | 全部退出 0，`apps/desktop/out/build-info.json` 读回 9b143a4。 |
| `git log --no-merges 03dc93b..9b143a4`，`git diff --name-status / --diff-filter=A / --check`，对照 `main..9b143a4` | 全部查看，增量 diff check 零输出。按固定 Git 树对拍 DOM 清单，596/596、41/41、无多余路径，迁入目标可读。 |
| `node scripts/ok-patches.mjs --check && OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --replay` | 两条均退出 0。267 条登记，1,346 文件集合和哈希一致。 |
| `pnpm exec vitest run plugins/notes/test/document-session.test.ts packages/kernel/test/vault-assets.test.ts packages/editor/test/golden-roundtrip.test.ts apps/desktop/test/preview-protocol.test.ts --maxWorkers=2` | 4 文件 173 通过。含 DocumentSession 29、资产 2、预览协议 15、黄金往返 127。4 条大文档确实建富文本并 serialize/re-hydrate。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/{session-archives,editor-parity-assets-template,editor-parity-selection,layout-tab-menu,preview-html,editor-parity-shell-mounts,editor-parity-closeout-remaining,explorer-keyboard,i18n-zh-hans,session-flush}.spec.ts --output=test-results/review02-targeted` | 33/35 通过，Playwright 退出 1。档案退出用例一次在第 37 行等首笔自动保存超时，尚未执行退出动作。普通自动保存退出用例第 58 行的完整磁盘断言已过，重新启动后从搜索打开时第 25 行编辑器未出现。两份失败 trace 在该输出目录。此轮主机运行期间多次测到 1 分钟负载高于 20。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/session-archives.spec.ts -g '档案正文慢桥在退出前' --retries=0 --repeat-each=2 --output=test-results/review02-archive-repeats` | 2/2 通过，实际关闭、新实例读取及整份磁盘断言均执行。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/{editor-parity-closeout,i18n-zh-hans}.spec.ts -g '气泡工具栏把选区转换为脚注\|气泡块类型菜单\|H03：简体中文知识库扫描' --retries=0 --repeat-each=3 --output=test-results/review02-bubble-repeats` | 9/9 通过，各 3 次。三轮中文扫描白名单外 0。Lead 全量中的三个失败仍保留，根因未定。 |
| `node --input-type=module` DocumentSession 探针、`xvfb-run -a node --input-type=module` 真实 Electron 两个临时 Vault 探针 | 模拟暂停草稿写入和真实暂停读回前的第二次写入均丢新输入。另在设置 select 按 Ctrl/Mod+F，隐藏查找栏计数 1，返回后显示。详细步骤见新发现 1、3。 |
| ASAR 路径与构建标识 | 独立执行 `node scripts/check-asar-contents.mjs /home/wta/projects/huhu-wt-int/apps/desktop/release/linux-unpacked/resources/app.asar`，通过 51,020 项，包内标识 9b143a4，实际大小 557,897,800 B。Lead 最终 Linux 解包的 `pack.log` 退出 0，`packaged.log` 4/4 通过。该验证覆盖 Linux 解包应用。G07 的最终 .deb 大小仍待记录。 |
| Lead 的 `int4/e2e-full.log`、`build.log`、`vendor.log`、`test.log` 与检查日志，只读 | 全量 228 条，220 通过、4 失败、4 跳过、耗时 22.3 min，Playwright 退出 1。开始负载 9.99。根单测 997 通过/1 跳，vendor 330 文件、6,391 通过/4 跳。保留最终日志中的失败，定向通过只作补充。日志目录为 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int4`。 |
| `pnpx modern-web-guidance@latest search …` 和 `retrieve ime-safe-enter-submit,html,validate-origins,security` | 核对组合输入、可见性和 sandbox 跨框架消息边界。该轮为只读审查。 |

## 阻碍与接续

复审已完成。关闭前处理两条手动保存阻断、完成零重试气泡与严格性能门禁的归因/裁决，并补 G07 最终低负载启动配对。按原契约核对模板可用性与 H01 完整序列化等价，保留 Q7 对真实输入法、硬件鼠标、Windows/macOS 实机的未验记录。未推送、合并、修改台账或关闭 Issue。

## Lead 验收

（Lead 追加，2026-11-19）**验收：复审有效，结论采纳。** 分派：新发现 1、2，工程 2（退出回执），规格 7（H01 语义等价）→ w4:pC/task07；新发现 3（Ctrl+F）、4（模板消费入口）→ w4:pA/task08；规格 4（与固定 OK 基线同样本同操作的实跑对照）→ w4:pB/task06；新发现 5（气泡）→ w4:pD/task03（进行中）；规格 6（G07 最终 SHA 的配对测量与同格式包体积）→ Lead 在空闲时做。修复后由本会话复验。
