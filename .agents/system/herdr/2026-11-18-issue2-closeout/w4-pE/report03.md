# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task03.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task03.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report03.md
- 执行结果：done
- 审查目标：`471dfdfc8dd859a35430b925d5858637275e297f`，对照 `9b143a4`。按 Lead 追加指令复审集成新 HEAD `ca28e78306b553a10844a45744cc704d716b9484` 内的 A07 修复 `4f5d524`。

## 结论

**建议暂缓关闭 Issue #2。** `471dfdf` 修复了 report02 的五项原症状。A07 过期拖放目标导致的静默目录移动在追加候选 `ca28e78` 中已修复，独立复核通过。G07 的非知识库冷启动无回退仍缺最后交付构建的配对证据，G06 的发行包冒烟记录也停在较早 SHA。D02 符合本次对照与本地交互要求。富文本 Mod+K 的选区行为符合固定 OK，旧工作台全局契约有一处经 Lead 裁定的例外。模板的目录继承和外部能力范围仍宜收紧。

Lead 在该 SHA 运行的全量 E2E 为 **236 通过、2 失败、4 跳过，零重试，20.9 分钟**。两项失败为 A07、F09 严格 16 ms 阈值。该日志对应修复 A07 之前的提交。跳过的是默认未启用的 10 万文件用例与三项截图用例。下文的「全量 #」为该日志中的用例序号。 [候选全量日志](/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/e2e-full-471dfdf.log:422)

## report02 五项复审

| 原发现 | 判定与代码 | 可重复的行为与证据 |
| --- | --- | --- |
| 1 · 设置返回覆盖新输入 | **已修复。** `f8f5710` 在重显时捕获会话修订号。checkpoint 完成后校验是否仍在原会话。磁盘与草稿读取后，再结算编辑器并核对修订号和草稿正文。修订变化时保留缓冲，更新草稿。[NotesModule.tsx](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/NotesModule.tsx:64) · [DocumentSession.load](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/documents/DocumentSession.ts:161) · [reopenDraft](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/documents/DocumentSession.ts:368) | 关自动保存，编辑后进设置再返回，分别暂停 `notes.draft.save` 和 `notes.read`。放行前继续输入，原 Markdown 不变，编辑区及可恢复草稿均有新字。全量 #114–115 通过。独立会话探针复核两种在途及无新输入三条路径，无新输入分支只写一次草稿。[session-flush.spec.ts](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/session-flush.spec.ts:189) |
| 2 · 右键关闭在手动模式写正文 | **已修复。** `f8f5710` 让批量关闭逐个使用普通关闭入口。释放会话按自动保存设置决定落正文或留草稿，显式保存仍走原入口。[NotesModule.tsx](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/NotesModule.tsx:448) · [DocumentSession.flushForExit](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/documents/DocumentSession.ts:352) | 分别执行关闭、关闭其他、关闭右侧。手动模式逐项检查原文件和重开恢复，自动模式逐项检查落盘。全量 #95–100 通过。[layout-tab-menu.spec.ts](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/layout-tab-menu.spec.ts:54) |
| 3 · 设置页 Mod+F 由隐藏编辑器消费 | **已修复。** `4394d12` 在调用 `preventDefault` 前跳过没有布局框或处于 `inert` 子树的编辑器，保留现有浮层与组合键分流。[FindReplaceController.tsx](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/find-replace/FindReplaceController.tsx:213) | 打开笔记、进入设置，聚焦语言选择框按 Ctrl+F，隐藏笔记的查找栏计数为零。回笔记后能打开并用 Escape 关闭。查找、定位、替换落盘也通过。全量 #31–32。[editor-parity-closeout.spec.ts](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-parity-closeout.spec.ts:28) |
| 4 · 导入模板无法用于新建 | **已修复原症状。** `4394d12` 接通按原字节导入、清单和 `templatePath` 消费。树菜单和新建对话框都可取用。首次写入带 `expectedVersion: null`，同进程大小写等价名称先占位。[service.ts](/home/wta/projects/huhu-wt-review/plugins/notes/src/engine/service.ts:175) · [filesDeps.ts](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/explorer/filesDeps.ts:119) | 用两个入口从导入模板建笔记，检查正文，独立编辑并重开后验证模板不变。全量 #21 通过。服务探针也验证 BOM、CRLF 与非法模板路径。服务单测覆盖首次写入失败和并行同名。目录范围见下。[editor-parity-assets-template.spec.ts](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-parity-assets-template.spec.ts:55) · [service.test.ts](/home/wta/projects/huhu-wt-review/plugins/notes/test/service.test.ts:49) |
| 5 · 三项气泡零重试失败 | **修复证据充分。** `77d5add` 修复聚焦后的延迟选区回写。原脚注、块类型、H03 扫描全量 #42、#45、#90 均首跑通过。快速格式后改选、键盘扩选、鼠标拖选 #47、#83–84 通过。 | 用 `editor-selection-focus.spec.ts` 等浏览器形成完整选区后再执行原定时回调，同时断言 DOM、PM 模型和气泡。pF 在分支上另用 4 个 CPU 压力进程验 8 条路径各 10 次，80/80、零重试。证据分开标明各自 SHA 与环境。[回归用例](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/editor-selection-focus.spec.ts:75) · [压力记录](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/pm-focus/README.md:25) |

另核对 `f8f5710` 的退出回执与 H01。退出 IPC 核对同窗口 webContents、主框架、请求 ID 和布尔结果，清掉监听。草稿写入明确失败时保留窗口供重试，真实 Electron 故障注入用例全量 #116 通过。无回执仍沿用 3 秒退出，慢写或挂死时仍可能没有落盘确认，属于既有行为。H01 先查字节，只有差异才按 vendor 规范化规则判断语义，并加入粗体丢失和 URL 改变的反例。候选全量 #117 验证无编辑零次保存及一次输入一次保存，分支 H01 专项 128/128。 [退出 IPC](/home/wta/projects/huhu-wt-review/apps/desktop/src/main/index.ts:57) · [H01 黄金测试](/home/wta/projects/huhu-wt-review/packages/editor/test/golden-roundtrip.test.ts:103) · [H01 分支证据](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/runs.md:160)

## 新增内容与固定 OK 对照

- **D02 边缘提示、正文高亮与线程。** 固定 OK `44a2e0a` 和 Huhu `fbea0f6` 的配对 JSON、截图都显示，选择 `Anchor sentence to discuss.`、输入 `Compare **bold** detail.` 后有对应「打开评论」按钮，点击切为「关闭评论」并选中相同线程。原文的 Markdown 标记在两端均按字面显示，正文都没有 `<strong>`。Issue D02 写的是「Markdown 内容、……与 OK 对照验收」，该样本的字面呈现符合要求。两端都能删除，Huhu 有确认，并提供本地回复、解决、过滤、重开。OK 活动线程没有同样处理入口，OK 已解决线程的完整操作链在这组样本中没有验证。候选将 rail 接到当前富文本笔记，通过鼠标与键盘打开两个对应锚点，并在 1100px 详情浮层下把按钮让到左侧，关闭和切换详情页会清理激活状态。全量 #9、#11–13 通过。 [D02 逐步对照](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity-ok/unaligned.md:5) · [Tiptap 挂载](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/editor/TiptapEditor.tsx:1278) · [rail](/home/wta/projects/huhu-wt-review/packages/editor/src/vendor/open-knowledge/app/src/comments/CommentMarginRail.tsx:132) · [双锚点测试](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/comments-edge-rail.spec.ts:26)
- **Mod+K 在选区上的等价判断成立。** 在两端选中 `Edit link` 后按 Mod+K，气泡 URL 输入取得焦点，改目标后 Markdown 落盘。本样本的输入初值均为空。折叠光标在链接内时，固定 OK 走链接属性控件，Huhu 先扩选链接再用气泡，结果是都能更新链接，交互入口有已知差异。候选 e2e 另验富文本外和源码仍开命令面板，设置只显示一条双用途说明，全量 #19 通过。Issue 和移植 spec 没有要求富文本内保留命令面板。原工作台 US-WB-07、ACC-WB-07 及设计 §5 的全局约定原先包括编辑器聚焦，这是 Lead 决定覆盖的范围，底部按钮仍可打开面板。普通无链接折叠光标没有合法编辑目标，代码沿用 OK 的空操作。 [链接对照](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity-ok/link.md:5) · [富文本接管](/home/wta/projects/huhu-wt-review/packages/editor/src/rich/RichMarkdownEditor.tsx:93) · [命令面板分流](/home/wta/projects/huhu-wt-review/packages/workbench/src/command-palette/CommandPalette.tsx:56) · [工作台契约](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/modules/workbench.md:87)
- **ProseMirror 补丁登记完整。** 锁定 1.41.8 的源码、ESM、CJS 都有补丁，集成 worktree 的 `@tiptap/pm/view` 实际解析到带 `c40118af…` 指纹的版本。核对 1.42.9 官方发布包，回移遵循同一保护原则，1.42.9 比较聚焦时的 focus 端点，Huhu 额外在可编辑、非组合、内部非折叠选区先同步 observer，再比较完整端点。保留折叠光标恢复。THIRD_PARTY_NOTICES 与上游台账 R-53 已登记。另核对 `ok-patches --check` 和固定 OK `--replay`，268 条登记无缺漏或多余，重放 1346 文件集合及字节零差异。 [补丁](/home/wta/projects/huhu-wt-review/patches/prosemirror-view@1.41.8.patch:75) · [依赖台账](/home/wta/projects/huhu-wt-review/docs/upstream/ledger.md:22) · [1.42.9 发布包](https://registry.npmjs.org/prosemirror-view/-/prosemirror-view-1.42.9.tgz)
- **语言、表情与宿主挂载。** H03 三条用例 #90–92 覆盖页面扫描、逐个斜杠执行后的界面以及设定语言即时改变且保留未保存草稿。#48–52 覆盖离线表情的键鼠、Escape 归还焦点、保存重开、零选择器网络请求、源码属性图标、标签弹窗、富文本到源码定位、附件失败提示。上游账户、协作、终端等外壳按已登记范围处理，对这组改动未发现新增回归。 [宿主映射](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/shell-mounts.md:5) · [集成用例日志](/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/e2e-full-471dfdf.log:54)

## A07 追加复审

**阻断已解除。** 在 `471dfdf` 建 `甲/里面的笔记.md` 和 `目标/`，把甲拖入目标后，如果根级旧甲行还在，立即将目标拖向这行。全量 #199 在检查 `目标/甲/里面的笔记.md` 时失败。独立临时 Vault 探针区分了两种请求。拖向真实的 `目标/甲` 会被拒绝，过期目标 `甲` 会被 `moveEntry` 重建，文件实际移到 `甲/目标/甲/里面的笔记.md`。 [原服务入口](/home/wta/projects/huhu-wt-review/plugins/notes/src/engine/service.ts:323) · [原全量失败](/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/e2e-full-471dfdf.log:396)

`4f5d524` 只在 `NotesService.move` 接收非空目标目录的入口检查目标必须现存且为目录。合集 `ca28e78` 与该修复提交的树字节一致。基于合并后源文件独立重跑，缺失目标、普通文件及普通文件的后代均得到 `NOT_FOUND`，真实目录后代仍返回 `INVALID_INPUT`。逐次验证原目录、笔记及占位文件字节未变，空目录参数移回 Vault 根及同目录改名均通过。档案仍调用 `moveEntry`，其预计算目标目录语义保留。测试按完整树路径等待旧行消失，另外透过真实引擎能力确定性地测试过期目标，保留真实拖放到后代和磁盘断言。pC 原始日志复核为引擎与相关单测 **72/72**、零重试工作流验收 **43/43**、A07 压力 **20/20**、树同目录改名 **1/1**。MoveDialog 回根也在工作流验收内。 [合入后服务入口](/home/wta/projects/huhu-wt-int/plugins/notes/src/engine/service.ts:323) · [引擎测试](/home/wta/projects/huhu-wt-int/apps/engine/test/engine.test.ts:173) · [工作流用例](/home/wta/projects/huhu-wt-int/tests/e2e/workflows/acceptance.spec.ts:618) · [pC 原始报告](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report08.md) · [独立复验](/tmp/huhu-review03.Eq2v3I/a07-ca28e78.log)

## 关闭问题分级

### 阻断

1. **G07 · 启动无回退证据未闭环。** spec §5.2 要求对 rc.4 实测首屏及非知识库冷启动无回退，同时记录安装包、chunk 和首篇笔记 p50/p95。较早候选两轮的工作台和收件箱 p95 均慢于 rc.4，正式样本当时的负载有干扰。已有惰性块加载证据，旧版同格式 Debian 增量为 +79,549,116 B（+56.17%），两者均有价值，启动条款仍需以最终生产构建和 rc.4 在低负载下交错采 20 对，并更新相同格式的包体记录。Q9 只取消体积上限。 [G07 规格](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:79) · [G07 原始测量与批次](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md:91)
2. **G06 · 待确认最后交付包。** 可核验的 Debian 解包冒烟 4/4 与 ASAR 内容检查来自 `2c15686`，已有全量用的是 `471dfdf` 的生产构建，追加修复的生产构建标识为 `ca28e78`。我未找到这两个候选 SHA 的 packaged E2E 记录。构建最终安装包后，从 ASAR 读回构建 ID，核对测试夹具排除及构建内容，并对同一解包应用执行 `pnpm e2e:packaged`。 [G06 规格](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:78) · [上一发行包验证](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/asar-contents.md:17)

### 应修

1. **树菜单把同级目录模板误列为继承。** 建同级甲、乙，在甲导入笔记模板，再从乙的树菜单新建。宿主 `/api/folder-config` 将全 Vault 清单映射为本地或继承，独立探针证实甲的模板会在乙的响应中显示为 `inherited`。固定 OK 的同一接口按当前目录、祖先、根逐级收集，同名最近优先。可保留工作台全库选择器，同时让树菜单的文件夹清单遵循祖先范围。Q2 的本地导入和消费已经可用，这一差异应修或经产品明确登记。 [Huhu 路由](/home/wta/projects/huhu-wt-review/packages/editor/src/host/routes/files.ts:158) · [OK 目录解析](/home/wta/projects/huhu/temp/sources/open-knowledge/packages/server/src/content/templates-resolver.ts:31)
2. **本地模板参数拓宽了可选外部写能力。** 列举和导入保持 `exposable: false`，来源有 Vault 边界与真实路径受保护目录检查。`notes.create` 仍可独立向外部赋权，现在还接受 `templatePath` 并读取 Vault 内模板正文。旧契约的 `notes.read` 与 `notes.write` 分开，已有复制也有独立的能力名。这里确认的是新增能力范围，未验证越权取得内容。建议将 Vault 模板参数限定在桌面入口，保留外部原有内置模板，并补一个只有创建授权的外部调用方应被拒绝本地模板输入的断言。 [能力注册](/home/wta/projects/huhu-wt-review/plugins/notes/src/engine/index.ts:70) · [权限表](/home/wta/projects/huhu-wt-review/packages/kernel/src/permissions.ts:6) · [路径校验](/home/wta/projects/huhu-wt-review/packages/vault/src/paths.ts:59)
3. **F09 · 严格输入阈值仍红。** 候选 5000 行、80 次输入的全量 p95 为 **17.9 ms**，超过项目 **16 ms** 阈值。历史同机配对的 main/较早候选 p95 中位数为 22.4/21.5 ms，两侧各 0/5 达标，未发现本轮特有回归。按 Issue 的「测量并记录」口径登记为未达性能目标，G06 也应记录原始失败。以低负载运行 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟'` 可验该门槛。 [全量失败](/home/wta/projects/huhu/.agents/dev/changes/2026-11-18-issue2-closeout/e2e-full-471dfdf.log:369) · [配对证据](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/f09-findreplace.md:22)

### 可选

- 将 Mod+K 的富文本限定及普通光标空操作写入原全局快捷键契约。可手动核对四种焦点状态：文字选区、链接内折叠光标、普通折叠光标、源码。当前设置帮助和候选 e2e 已覆盖主要产品路径。

## 审查范围与产物

- 使用 detached `471dfdf` 核对提交图和 `9b143a4..471dfdf`。共 141 文件，新增 101 文件，主要为成对采集证据，另有 PM 补丁、配对驱动和 E2E。追加核对 `471dfdf..ca28e78` 的业务与测试三文件，`git diff --check` 通过。工作树业务文件保持清洁。初次范围 `git diff --check` 的三条输出为两份斜杠样本的 EOF 空行和一条 unified diff 的空上下文行。
- 机器负载检查时一度为 20.80 和 35.99（1 分钟平均值）。本轮未另起 E2E 或启动性能采样，使用上述固定 SHA 的 Lead 日志、分支原始记录、两端可见结果和轻量探针。未验证 Windows/macOS 真机、真实输入法和硬件鼠标，按 Q7 登记。
- 独立探针位于 `/tmp/huhu-review03.Eq2v3I/`。执行 `node probe.mjs` 复核草稿竞态、同级模板清单以及配对数据。执行 `node notes-service.mjs` 确认原 A07 故障与模板字节，执行 `node a07-ca28e78.mjs` 验证追加修复，使用同目录隔离 Vault。原始输出分别为 `results.log` 和 `notes-service.log`，配对截图拼图为 `parity-contact.png`。现代 Web 指南检索与读取覆盖快捷键限域、键盘焦点与 IME，读取记录 `/tmp/mwg-guide-399043-1795090342463.md`。

## Lead 验收

Lead（2026-11-19）：接受。阻断 1（G07 低负载配对与同格式包体）与阻断 2（最终 SHA 的打包 / ASAR / e2e:packaged）由 Lead 在最终候选上执行；应修 1、2 派 pB task08；应修 3（F09）按 Issue「测量并记录」登记，台账写明最终候选读数；可选项写入台账的 Mod+K 决定说明。pB 修复后会追加复核。
