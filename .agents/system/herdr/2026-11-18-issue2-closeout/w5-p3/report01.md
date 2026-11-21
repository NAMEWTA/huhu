# 合并工作包 · 评论锚点与收件箱

## 包一 · 评论锚点与权限

### 逐项验收

| 复核编号 | 原分类 | 现状态 | 断言和证据 |
| --- | --- | --- | --- |
| D01 取消后清理 | 缺验证 | Electron 通过 | `tests/e2e/knowledge/comments-s4.spec.ts:64` 先确认草稿高亮出现，Esc 后核临时高亮、永久高亮、边缘按钮与磁盘条目全部为零，切源码再返回后复查。 |
| D02 只读权限 | 未实现 | Electron 通过 | `tests/e2e/knowledge/comments-s4.spec.ts:302` 真实只读 Vault 中，打开正文高亮对应 ID 的线程并定位，检查选区、整篇、属性、回复、解决、重开、删除入口及引擎拒绝回复，逐字比较评论与笔记原盘。只读的孤立线程也收起重新选址。 |
| D02 固定 OK 过滤、重开 | 缺验证 | Huhu 有行为断言，固定 OK 同操作链未覆盖 | `tests/e2e/knowledge/comments-s4.spec.ts:90`、`evidence/parity-ok/comments.md:13`。OK 所测新线程缺手动解决入口，历史对照无法以同一链路到达过滤和重开。 |
| D02 Markdown 与引用呈现 | 未实现 | 待用户决定 | 规格 §8.1 要求 Markdown 和引用渲染。固定 OK 对照显示正文中的 `**bold**` 字面标记且无 `strong` 节点，见 `evidence/parity-ok/comments.md:12`。 |
| D03 双向激活与滚动 | 缺验证 | Electron 通过 | `tests/e2e/knowledge/comments-s4.spec.ts:346` 核正文标记和线程 ID，起点在视口外的尾锚点必须滚入视口，首锚点离开视口，再反向定位回文首。 |
| D03 切换后清理和焦点 | 缺验证 | Electron 通过 | `tests/e2e/knowledge/comments-s4.spec.ts:370` 检查切源码、关详情、切文件后无浮层和临时高亮。扣住真实创建回执，关详情后放行，核评论已落盘、详情仍关闭且工具栏保留焦点。 |
| D04 同偏移与同分 | 未实现 | 已修复并补断言 | `plugins/notes/test/comments.test.ts:63` 覆盖「甲：同句／乙：同句」和同分不同距离。`tests/e2e/knowledge/comments-s4.spec.ts:215` 检查磁盘 `orphaned`、无错误高亮和边缘按钮。vendor `app/src/comments/anchor-search.test.ts:93` 核编辑时也不预先吸附。 |
| D04 已保存锚点格式、表格、链接改写 | 缺验证 | 已补断言及重定位 | `plugins/notes/test/comments.test.ts:72` 核三类已保存锚点重写的实际区间、引用文字与 `sourceVersion`。`tests/e2e/knowledge/comments-s4.spec.ts:439` 核源码字节、评论磁盘版本/偏移及 UI 高亮。 |
| D05 发起时冻结身份、选区及版本 | 未实现 | 已接入 | `packages/editor/test/comment-routes.test.ts:85`、`:118` 核从 quote/prefix/suffix 到引擎字段、会话 epoch 变化时拒绝、flush 回执版本透传且无 PM 坐标。`plugins/notes/test/comments.test.ts:110` 核磁盘再次变化时拒绝且不创建评论。 |
| D05 真实 flush 在途期间继续编辑 | 缺验证 | Electron 通过 | `packages/editor/test/comment-routes.test.ts:93` 显式暂停 flush，修改 revision 后后端无 create 调用。`tests/e2e/knowledge/comments-s4.spec.ts:242` 拦住真实 notes.save 回执，继续输入同文候选，核提示重选及无评论文件，重选后核评论版本与源偏移。 |
| R7 评论字段与持久化边界 | 部分已满足，revision 与歧义处理未实现 | 既有映射有断言，revision 与歧义处理已接入 | `packages/editor/test/comment-routes.test.ts:49` 核 ID、无扩展名 docName、scope、状态、消息与时间映射。`plugins/notes/test/comment-adapter.test.ts:38` 覆盖引擎适配。`selection` 包含 Vault、实际路径、会话 epoch 和缓冲 revision。路由 flush 后只把 `expectedSourceVersion` 和文本选择交给引擎。磁盘继续使用既有 `Comments/` 文件格式和 `sourceVersion`，无 PM 坐标或 Y 相对位置依赖。 |

### 改动

- 既有正文锚点在当前源码中统一核对候选和上下文。符合条件的唯一候选才定位。同分或证据不足则孤立。纯格式改写可按渲染内容找回对应源码区间。
- 选区发起冻结 PM 文档快照和会话身份，提交前后检查 revision。若用户仍在编辑且 revision 已变化，明确提示重选。引擎校验已保存版本后写入评论。暂存高亮跟随输入器生命周期，异步创建回执只在相应活动视图触发导航。
- 正文锚点保持完整文件的源码偏移，前后文只取可见正文。读取旧评论时，仅在源版本一致时裁掉 YAML 前缀，原文件字节不变。
- 使用 `vault.info.readOnly` 接入只读权限，复用已有写入拒绝和评论 UI 只读状态。只读下可展开、过滤及定位已有线程。
- 跨包接线文件为 `plugins/notes/src/engine/index.ts`、`plugins/notes/src/ui/comments/{commentAdapter,useCommentsBridge}.ts`、`plugins/notes/src/ui/documents/NoteEditorSurface.tsx`、`plugins/notes/src/ui/NoteDocument.tsx`、`plugins/notes/src/ui/NotesModule.tsx`、`packages/editor/src/rich/{index.ts,rich.d.ts}`。vendor 补丁登记 P-S4-10 至 P-S4-13。整批集成时重刷 vendor replay 清单和压缩补丁。

### 待用户决定

- **D02 Markdown 和引用。** A 按规格 §8.1 渲染正文和回复中的 Markdown 与引用块。用户看到排版后的强调与引用，评论落盘原文仍可保持，但需接受与固定 OK 字面显示不同，并新增渲染与内容安全验收。B 沿用固定 OK 字面显示。两边呈现一致，用户仍看到原始标点，规格须明确修订才能关闭该条。
- **R7 既有字段差异。** 现有持久化只记录顶层属性键，属性值引用无正文锚点，消息写入采用追加。若要求对齐 OK 的嵌套属性路径、属性值中选区与消息编辑，需明确各字段的持久化语义和旧文件兼容约定。本包记录这三项边界。没有把团队先前登记视为用户豁免。

## 包二 · 收件正文与 compact 输入

| 子项 | 原分类 | 现状态 | 断言与依据 |
| --- | --- | --- | --- |
| G07 普通收件正文冷启动回退 | 行为回归 | 实现轻量阅读，性能结论留集成候选 | `packages/editor/src/reading/paragraphs.ts:7` 仅接受已证明等价的普通段落，`reading/index.tsx` 同步渲染文本。复杂 Markdown 交给原 OK 阅读器，二者共用 `reading/compact-view.css`。 |
| G07 文本、剪贴板、格式与链接 | 缺验证 | 差分和 Electron 通过 | `packages/editor/test/reading-parity.test.ts:8` 以真实 OK 解析器比较 1200 种组合，并验证拒绝样本和选区序列化。 `tests/e2e/knowledge/compact-inbox.spec.ts:40` 用系统剪贴板比较六类选区的两种 MIME，验证强调、链接、列表、代码、双链、空提示、快速切换与磁盘原字节。双链实际打开知识库对应文件。 |
| G07 最终候选冷启动与富格式样本 | 缺验证 | Lead 集成后统一测量 | 按新任务测试纪律，本包不执行性能测量。历史原型 10 对普通正文配对差中位 +2.4 ms，95% 区间 [−25.8, +27.0]，证据为 `w4:pG/report03.md`，该数据属于原型。 |
| H05 收件想法 compact 输入 | 未实现 | 编辑和捕获对话框已接入，Electron 通过 | `plugins/inbox/src/ui/InboxModule.tsx` 使用既有 compact 入口、引用索引、提交前 port flush 和只保存在当前对话框的草稿。 `tests/e2e/knowledge/compact-inbox.spec.ts:133` 核 @、撤销、重做、CDP 组合不写入、已提交中文字落盘、页面重开和取消不写盘。 |
| H05 转任务与新任务描述 | 转任务入口未实现，任务描述撤销和 IME 缺验证 | 转任务接入 compact，两种描述入口 Electron 通过 | `plugins/inbox/src/ui/InboxModule.tsx` 处理转任务正文，`plugins/tasks/src/ui/TaskEditor.tsx` 在组合中拒绝提交。 `tests/e2e/knowledge/compact-inbox.spec.ts` 分别核转任务与新任务的撤销、重做、IME、磁盘正文和重开。 `tests/e2e/workflows/acceptance.spec.ts:143` 覆盖任务描述 @。 |
| H05 compact 文档级菜单和成本 | 缺验证，分别已有工作包归属 | 随集成验证 | OP-D18 文档级 slash／文档批注负例属编辑器核心工作包。可编辑实例成本由释放与性能工作包及 Lead 验证。 |

快速捕获条沿用 rc.4 的单行入口（`9132640:plugins/inbox/src/ui/InboxModule.tsx:199`）。OP-D18 明定收件想法正文编辑和任务描述使用 compact。带「内容」字段的快速捕获对话框也走 compact。转笔记不提供正文编辑字段，转档案的内容输入不属于任务描述范围。

跨模块链接复用任务详情的宿主路径，通过 `requestOpenPath` 与 `onNavigate("notes")` 处理。只有富格式回退实例才读取引用索引。正文由条目 ID 和版本绑定。完整的分支起点是合并提交 `8b58ac0`，两份现场提交为 `7cdceec` 和 `a6490aa`。后续提交为 `6d4502c`、`1f6f950`、`1ed7cb0`，均在本地分支 `closeout4/wp3`。

## 验证

- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm knip`、`pnpm notices` 最终退出 0。lint 首次发现 Inbox 直接引用 editor 私有类，调整为由阅读入口提供布局类，复验通过。
- 最后单独检查 editor 和 Inbox 的类型，退出 0。
- `RAYON_NUM_THREADS=2 pnpm build` 在 `1ed7cb0` 退出 0。桌面两份 CSS 产物的 A/B/C 均为 0。
- `node scripts/ok-patches.mjs --check`、设置 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge` 后执行 `--refresh-replay` 和 `--replay` 均退出 0。固定上游重放 1348 个文件，文件集合和字节均一致。
- 定向 Vitest 使用 1 个 worker。最终 52 项通过、退出 0，含 26 个评论引擎、12 个评论路由、2 个适配、3 个 OK 阅读差分、9 个收件服务断言。D04 原反例判红 5 项，D05 在途 revision 判红 1 项，D02 YAML 上下文单测判红 1 项。
- Electron 44.9.1 / Chromium 152.0.7977.167，启动前用 `pgrep -f 'electron|playwright'` 确认其他相关运行进程为空。使用项目预装二进制、Xvfb、隔离临时 Vault，单 worker、零重试。首轮只选择 `comments-s4`、`comments-edge-rail`、`comments-persistence`、`compact-inbox`、`compact-submit`、`workflows/acceptance` 的相关场景，退出 1，17 通过、2 失败。D05 初次已正确拒绝旧选区，重选驱动需在同一 DOM 文本节点内枚举多个命中。D02 失去高亮的原因是旧锚点把不可见 YAML 算入了上下文。修复后仅复跑失败的 `comments-s4.spec.ts`，8/8 通过、退出 0。合计 19 个不同场景都有通过记录。其余通过 spec 沿用首轮结果。
- Chromium 158 浏览器独立入口检查，退出 0。无 Electron preload 时普通段落正常显示，原生复制的两种 MIME 正确，切换 ID 后投影清除，注入的富格式回退取得相同布局类。真实 OK 富格式解析和系统剪贴板的对拍证据来自 Electron。
- 原始日志、复跑记录、进程检查、trace 和目录隔离记录位于 `/tmp/huhu-w5p3-checks`。旧任务重启前的尝试在 `/tmp/huhu-wp3-gates`，与本次合并工作包的用例计数分开。
- 首轮 `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test` 在高负载下退出 126。CSS 守护 21/21 通过，Vitest 993 通过、24 超时、1 跳过，另有 4 个超时清理期间的错误。1 分钟负载 3.99 时在隔离临时文件系统复跑同一命令，退出 0。CSS 守护 21/21，通过 86 个测试文件、1019 项，跳过 1 项。
- 首轮 `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test:vendor --maxWorkers=2` 退出 126。6427 通过、4 跳过，R13 依赖树扫描超时并报一次 worker 回执超时。1 分钟负载 3.77 时，仅复跑依赖树所在的 `y-prosemirror-patch.test.ts`，退出 0，10/10 通过，原超时的依赖扫描通过。
- 随后在 1 分钟负载 4.04 时开始完整 vendor 复验。命令退出 0，331 个测试文件通过，6428 项通过、4 项跳过。首轮超时与 worker 回执错误均未复现。

## 未完成项

- D02 的 Markdown 与引用呈现等待用户选定方案。固定 OK 仍缺同操作链进入过滤与重开的行为证据。
- 集成候选的普通及富格式收件正文冷启动分位、H05 可编辑实例成本和全量 Electron 验收由 Lead 汇总。

- 2026-11-20 Lead：接受，待集成后复验。D01–D05、H05 收件与转任务入口均有 Electron 断言；首轮 2 失败修复后仅复跑失败 spec。D02 Markdown 呈现、R7 字段语义交用户决定；G07 富格式正文仍走完整 OK 阅读器，冷启动由 Lead 在集成候选上实测后交用户判断。
