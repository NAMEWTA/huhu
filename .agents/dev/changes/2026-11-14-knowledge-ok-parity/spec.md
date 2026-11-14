# 知识库完整重构：移植 Open Knowledge 编辑器（规格）

> 来源：[source-issue-2.md](source-issue-2.md)（GitHub issue #2 原文，含用户补充评论）。简报：[brief.md](brief.md)。方案：[design.md](design.md)、[decisions.md](decisions.md)、[ui-design.md](ui-design.md)。复用核对：[reuse.md](reuse.md)。计划：[plan.md](plan.md)。验证：[verification.md](verification.md)。
> 本文是**行为契约**；issue 正文 §1、§5–§10、§14 是长篇细则，**本规格采纳它们为有效条款**，并在 §3 列出调查后的**订正与补充**。冲突时：本规格 §3 > issue 评论 > issue 正文。
> 现状证据观察于 2026-11-14，`9132640`（`v0.0.1-rc.4`）。**目标行为不因现状代码改变；现状变化时先记录差异再按新基线实施。**

## 1. 问题与目标

**问题。** 知识库（`plugins/notes`）的编辑器是 CodeMirror 上的 Atomic 实时装饰，不是用户要的 Open Knowledge（OK）富文本体验；文件树只显示被笔记分类过滤后的文件，没有真正的右键菜单；非 Markdown 文件大多只读或只有元信息；YAML 属性只在详情抽屉里；评论只有基础面板；档案是旁路页面。用户还报告了鼠标选区与上下行光标的异常（未复现归因，只列为高风险排查点）。

**目标。** 在不引入第二套文档数据库、不保留旧编辑器的前提下，把 OK 的本地编辑体验（编辑 / 渲染 / `/` 命令 / 浮动工具栏 / 块与表格 / 剪贴板 / 输入法 / 评论 / 属性）整体移植进 Huhu 现有知识库插件；结合 ORCA 的文件查看（PDF、文件分派）与 obsidian-huhu 的档案导航交互；允许为此重构 Huhu 的技术栈。用户最终要能连续完成：

> 打开全部真实文件 → 自行隐藏目录但仍能 `@` 引用 → 在 OK 式编辑器中选择、输入、用 `/` 插块、编辑属性和评论 → 正确保存并重开 → 在同一资源系统里编辑 JSON/TXT、查看 PDF/HTML → 打开真实档案标签并切换侧栏 → 切回普通文件继续编辑。

只有复刻矩阵、全部验收项、数据保真与真实交互证据完成、旧链路清理到位，才算完成；仅新增 slash 菜单、只换外观、继续把非 Markdown 当只读卡片、或保留旁路档案页面，都不满足。

## 2. 来源与已确认约束

| 来源 | 内容 |
| --- | --- |
| 用户口头指令（本次） | 拉取 issue #2，新建 change；以 issue 为源内容，按项目知识库实际情况做完整文档与设计；`temp/sources/orca`、`temp/sources/open-knowledge` **复制复刻即可**，**编辑器以 open-knowledge 为主**；**技术栈等均可完整重构**。本次只写文档，不写代码。 |
| issue 评论（优先于正文的技术选型限制） | 直接复制 OK 编辑器并重构；CodeMirror 不再是必须保留的选型；不预先禁止 Yjs 等编辑器确实依赖的文档状态库；样式技术可随源码移植、需要时同变更内更新规范与检查；不保留旧编辑器兼容层 / 双运行链路 / 双写 / “试用新版”开关；磁盘文件仍是持久内容的事实来源；主笔记编辑器不再以 ORCA 或自研方案替换 OK 为基准。 |
| 复用原则（CLAUDE.md） | Huhu 现有 → `temp/sources` → 成熟依赖 → GitHub 项目 → 小范围适配 → 自行开发；记录见 [reuse.md](reuse.md)。 |
| 现行规范 | `.agents/dev/notes/context/{design-system,archives,workbench}.md`；样式层序、前缀、守护脚本按 design-system；档案规范按 archives（`Archives/<类型>/<名称>/index.md`，不恢复独立插件）。 |
| 已核实事实 | 来源工作副本与固定 SHA 一致；Huhu 与 OK 同为 GPL-3.0-or-later，ORCA 为 MIT；OK 文档真源是 `Y.Text('source')`；ORCA 的 HTML 预览**入口**依赖内嵌浏览器标签页、不可单独抽出（其 `doc-preview-protocol` 与 Huhu 现有 `huhu-app` 协议处理能否复用：未核实，S7 SP-7 评估）；OK 的 Hide 是 `.okignore`；OK 有属性面板但 issue 没列；OK 评论是 REST + 文件而非 Yjs；`zh-Hans` 目录现成。详见 [evidence/e0-source-survey.md](evidence/e0-source-survey.md)。 |
| 未证实假设 | 用户报告的选区 / 上下行异常的根因（issue 只列排查点：装饰重算、异步保存 / 外部重载、编辑器实例与焦点生命周期）；**S0 先在 rc.4 上用真实 Electron 复现并存证**，被替换的编辑器是否一并消除问题，要在 B06 验收中证明，不能默认。 |

## 3. 对 issue 的订正与补充（调查结果）

> 这些是对 issue 正文的修正，实施以本节为准。

| 编号 | issue 说法 | 调查结果 | 对规格的影响 |
| --- | --- | --- | --- |
| R1 | 未取得 `temp/sources` 工作副本，需补核 | 两个来源均在本地，SHA 与固定提交一致；仅根 LICENSE 在工作区被删 | S0 的“核对来源”缩减为固化清单；许可证全文取 `git show HEAD:LICENSE` |
| R2 | 不照搬 Hocuspocus / Yjs 网络协作运行时；“本地模式必须适配单一撤销历史” | OK 的文档真源是 `Y.Text('source')`，撤销由 y-tiptap 接管；去掉 Yjs 要改 52 个非测试文件 | **保留 Yjs 在渲染进程本地运行，不要 Hocuspocus 服务**（OP-D02）；撤销沿用 y-tiptap 的单一历史（不装第二套）；B05 改写见 §5 |
| R3 | 复制 ORCA 的 HTML 打开 / flush / 异步归属控制 | ORCA 的 HTML 预览**入口**是内嵌浏览器标签页 + 自定义协议，无法单独抽出；其协议处理文件是否可复用**未核实** | S7 先评估复用，再在“协议 + sandbox iframe”与“独立分区隔离视图”间按安全用例集选一个（OP-D08）；F04 / F05 验收不变 |
| R4 | OK 右键菜单“沿用结构”，隐藏语义改为仅视图 | OK 的 Hide 写 `.okignore`（影响索引 / 搜索），含 Share / OpenWithAi / 账户云项 | 隐藏用 `hiddenPaths`（OP-D11）；Share / OpenWithAi 等不带，登记 |
| R5 | `FileCard` 把 HTML 退化为元信息卡 | 实际是把 HTML **当源码文本只读显示**；PDF 才是“请用应用打开” | 描述订正，验收不变 |
| R6 | `isNoteFile` 排除语义目录 | 只检查**第一段**目录，嵌套 `Tasks/` 不被排除；点路径过滤在 `notes.files` 服务层 | 资源目录改造时一并核对这两处（A01） |
| R7 | OK 评论“接 Huhu 评论持久化” | OK 评论纯 PM + quote 搜索，**不依赖 Y 的相对位置**，REST 存文件；Huhu 的 R-24 已复制锚点算法 | D05 的“PM 坐标 ≠ 源码偏移”风险降低，但 `CommentThread` ↔ `CommentDto` 字段对照仍要在 S4 第一步做 |
| R8 | OK 属性 / 顶部区未列入复制清单 | OK 有完整属性面板（约 3163 行，经 provider 读写 Y.Doc 里的 frontmatter） | 属性面板按 OK 整体复制（reuse §2），并解决“两套 YAML 编解码”（OP-D17） |
| R9 | 阅读模式“同语义阅读” | OK 只有 wysiwyg / source，无独立阅读模式 | 阅读模式 = 同一 schema 的不可编辑渲染（`ReadonlyMarkdown`），属 Huhu 适配 |
| R10 | 评论 / 文件树 / 编辑器之外的 OK 功能范围 | OK 还有 lint / audit、Share / OpenWithAi、presence、history（git 影子仓库）、Excalidraw / Mermaid 文档编辑器等 | 需要用户确认分类（§9 Q2）；默认值见该处，**不得暗中缩减** |
| R11 | 技术栈放开 | OK 样式 = Tailwind v4（`globals.css` 7079 行）、i18n = Lingui（61 文件、`zh-Hans` 4064 条现成）、构建 = Vite 8 | OP-D05 / OP-D06；规范与守护脚本同变更内更新 |
| R12 | 无 | 取代 D-08 / R-21 / R-22 / D-31（编辑器范围）；`product.md:66` 非目标要改 | 后继决定（decisions OP-D01）；归档时进入 `notes/decisions/` |
| R13 | 消费者：笔记 | `@huhu/editor` 还被 tasks（`TaskDetail`、`TaskEditor`）与 inbox（`InboxModule`）使用 | 一并迁移（OP-D18），H05 回归 |

## 4. 目标行为（采纳 issue 正文 §1、§5–§10 全文，下面只列骨架与硬性边界）

- **资源与可见性**（issue §5）：文件树 = 真实文件系统（含空目录、点目录、`Tasks/`、未知扩展名）；**可见性、可引用性、内容索引、读写权限四件事分开**；隐藏仅影响文件树，存在每 Vault UI 偏好的 `hiddenPaths`，`@` / 双链 / 搜索 / 已打开标签不受影响；`@` 候选不依赖惰性树的已展开节点；计数区分文件 / 目录、可见 / 总数，未加载完不冒充总数；受保护的内部目录可见但带明确的受限标记；路径统一规范相对路径，处理大小写 / 中文 / 空格 / Unicode / 越界 / 符号链接循环。
- **右键菜单与操作**（issue §5.4）：真正的 `contextmenu`；行内更多按钮、右键、键盘走同一操作分发；移动 / 拖放 / 重命名 / 复制 / 回收站走同一业务能力和 `OperationLog`；对打开且未保存文件（或其父目录）的移动 / 删除先 flush 或提示，失败不丢草稿；非 Markdown 同样适用。
- **编辑器**（issue §6）：默认 OK 富文本；源码、阅读是明确模式；`/` 命令复刻触发 / 过滤 / 分类 / 预览 / 键盘 / IME / 边界细节，一次事务可撤销；选区、上下行、IME、`setContent` 覆盖、异步迟到结果、实例生命周期按 OK 成熟处理；**每一项以复刻矩阵（S0）为准，缺项是待完成项，不是默认允许的降级**。磁盘永远是 Markdown / YAML，不保存 Tiptap JSON；无编辑打开 / 关闭不写盘；未知语法可见可恢复。
- **属性与顶部布局**（issue §7）：YAML 属性在正文顶部可折叠区正常渲染，与详情面板共用同一份会话数据；保留未知字段 / 注释 / 顺序 / 标量原意；坏 YAML 给诊断与原文修复入口；顶部工具栏按真实容器宽度收纳，不固定两行留空白。
- **评论**（issue §8）：选区 / 整篇 / 属性评论，高亮、边缘提示、线程、回复、解决 / 重开 / 删除确认 / 过滤、点正文 ↔ 点线程双向定位、孤立锚点；发起评论时冻结 quote / prefix / suffix / 缓冲 revision；歧义和删除原文显示孤立，不吸附相似段落；复用 Huhu `comments.*`，不建评论后端。
- **档案**（issue §9）：顶部分区顺序“文件 / 星标 / 日记 / 标签 / 回收站 / 档案”；档案首页 / 类型 / 记录是真实视图标签（判别联合），活动档案标签使侧栏切到档案树，切回文件标签恢复文件树，两者展开状态独立；普通目录不自动渲染为档案；`index.md` 在文件树里可作 Markdown 打开，也可“以档案视图打开”——**同一文件同一会话**；文件计数不重复。
- **文件格式与图标**（issue §10）：`.md` OK 富文本；`.txt` 可编辑；`.json` 可编辑、语法高亮与诊断、无效 JSON 不被清空、格式化是显式动作；`.html/.htm` 隔离整页渲染且可切源码；`.pdf` 内嵌查看器（浏览 / 查找 / 缩放 / 选择 / 状态保持 / 资源释放，大于 10 MiB 的受控读取）；图片 / 音视频保留既有能力；未知格式仍可见并给元信息与适用操作。编码 / BOM / 换行保留，无法无损处理时提示并要求显式转换。图标固定映射（lucide + OK Markdown 图形 + 静态扩展名表），树 / 标签 / `@` / 搜索 / 详情一致，不联网。

## 5. 验收

**采纳 [source-issue-2.md §14](source-issue-2.md) 的 A01–F10 全部 47 项为本规格验收原文**（A 资源 / 隐藏 / 操作 10 项，B 编辑器 10 项，C 属性与保存 6 项，D 评论 6 项，E 档案 5 项，F 格式 / 图标 / 布局 / 性能 10 项；以原文编号为准），并有下列修订与新增。每项的验证层与证据位置见 [verification.md](verification.md)。

### 5.1 对原验收项的修订

- **B05**：改写为——“命令执行消费正确触发范围，光标可继续输入，一次撤销（y-tiptap 单一历史）正确撤回；撤销 / 重做不被配置误禁用；**没有第二套撤销历史**；`FILE_WATCHER_ORIGIN` 的外部写回不进撤销栈。”
- **B09**：补充“源码 ↔ 富文本 ↔ 阅读 切换共用同一个 `Y.Text('source')` 与同一 `DocumentSession`，切换前统一 flush；迟到的加载 / 保存结果由 `(vaultId, path, sessionEpoch)` 隔离”。
- **D05**：改写为——“发起评论后异步 flush 期间继续编辑，锚点仍对应正确缓冲版本（冻结 quote / prefix / suffix / revision）；**适配层不把 PM `from/to` 直接写成 Markdown 源码偏移**，字段对照表有单测。”
- **F03**：补充“PDF 经 `vault.readRange` 分段读取，单次 ≤ 4 MiB；10 MiB 以上、受密码保护、损坏、外部修改的样本有明确反馈”。
- **F05**：补充“预览协议 `huhu-preview` 不带特权；iframe 不含 `allow-same-origin`；`connect-src 'none'`；越界 / 符号链接逃逸 / 相对路径逃逸被路径守卫拒绝”。

### 5.2 新增验收

**G 来源、许可与 vendor**
- [ ] G01：固定 SHA（OK `44a2e0a…`、ORCA `7041ea02…`，若 S0 决定更新上游则整体更新并重做 G 与 H）和**文件级清单**（`closure-manifest.json`：上游路径 → 目标路径 → 复制 / 适配 / 不复制 + 原因）入库；缺清单的目录不得合并。
- [ ] G02：`PATCHES.md` 逐条登记对上游文件的修改（编号、文件、原因、重放脚本）；用脚本从干净的上游重放后，与仓库内 vendor 目录**零差异**；每个切片结束汇报新增补丁数。
- [ ] G03：`docs/upstream/ledger.md` 新增条目；`pnpm notices` 通过且**没有**为让它通过而放宽 `ALLOWED`（逐包记录理由）；vendor 目录带 `LICENSE`（取自 `git show HEAD:LICENSE`）与 `UPSTREAM.md`。
- [ ] G04：上游测试接入结果表（总数 / 通过 / 需适配后通过 / 不适用及原因）存入 `evidence/`；**“不适用”清单可审**，没有静默跳过。
- [ ] G05：issue §13 的 8 类旧路径逐条删除并有 `git grep` 零引用证据；`@huhu/editor` 的所有消费者（notes、tasks、inbox）与测试迁到新接口，没有旧 `.view` 直取、没有兼容包装。
- [ ] G06：`pnpm lint`、`typecheck`、`test`、`test:vendor`、`build`、`e2e`、`e2e:packaged`、`knip`、`format:check`、`notices` 全部执行并记录结果；**vendor 目录的检查口径**按 OP-D15（不进 oxlint / stylelint / 前缀与颜色守卫，但进 typecheck / build / 上游测试）。
- [ ] G07：产物体积与启动预算——编辑器闭包**懒加载**（首屏与非知识库模块的冷启动指标对 rc.4 基线无回退）；记录安装包体积增量、编辑器 chunk 体积、首次打开笔记的耗时（p50 / p95）。

**H 技术栈接入（H01–H07）**
- [ ] H01：`LocalDocProvider` 契约测试——对 OK 黄金样本（22 个，7.5 MB）与 Huhu 的 frontmatter 样本，hydrate → serialize 与原文**字节相等**（或在登记的“规范化”例外内，且该例外由 `markdownSemanticallyUnchanged` 判为无变化）；无编辑打开 / 关闭不调用 `notes.save`；一次编辑只产生一次保存，回执不清除更新的 dirty。
- [ ] H02：Tailwind 作用域——不导入 preflight；层序声明包含 `ok-theme`、`ok-utilities`；`check-ok-class-collisions` 为空交集；**非知识库界面**的 `pnpm visual:compare rc4`（S0 先生成 `rc4` 基线）计算样式 / 像素 0 差异（已批准的预期变化除外并登记）。
- [ ] H03：`zh-Hans` 渲染——在知识库的编辑器、评论、文件树、属性面板各屏上，用扫描脚本检查**未翻译的英文 msgid** 为 0（或登记的白名单：专有名词、代码）；切换语言设置即时生效。
- [ ] H04：宿主适配表覆盖——vendor 中每一处 `hostFetch` / `okDesktop` 调用都有 handler 或在 `evidence/endpoint-matrix.md` 登记“不适用 + 原因”；handler 有单测（输入 / 输出形状、错误码到 UI 反馈的映射）。
- [ ] H05：`compact` 变体——任务描述、收件箱想法的输入、保存、`@` 引用、撤销、输入法在 e2e 中通过；每实例的内存 / 初始化耗时有记录，超预算按 OP-D18 回退。
- [ ] H06：Yjs 本地化——无网络 provider、无 IndexedDB 持久化；关闭文件后 Y.Doc / Tiptap / observer 全部释放（F10 的专项断言：重复打开 / 关闭 200 次后实例计数不增长）。
- [ ] H07：**局部编辑只产生局部字节差异**——对用 git 管理的 Vault，在一篇含 frontmatter / 表格 / 列表 / 注释的长文里只改一个字，保存后 `git diff` 只含该处（及登记的规范化例外，如末尾换行），不整篇重排；首次编辑同样成立（H01 只覆盖“无编辑”）。

## 6. 实现决定（摘要，详见 [design.md](design.md)、[decisions.md](decisions.md)）

- 编辑器内核：OK 的 Tiptap 3 编辑器 + core 保真链整体复制进 `packages/editor/src/vendor/open-knowledge/`；Yjs 在渲染进程本地运行（`LocalDocProvider`）；`DocumentSession`（notes 插件）是唯一写盘 / 冲突权威，Y.Doc 是编辑表示。
- 宿主适配：`OkHost` + HTTP 面适配表；vendor 中的 `fetch('/api/…')` 机械替换为 `hostFetch`。
- 样式 / i18n：Tailwind v4 作用域化接入 + `ok-*` 层；Lingui 与 OK 的 `zh-Hans` 目录，仅限编辑器包。
- 资源：新增 `vault.list`（惰性、含空目录）与 `vault.readRange`，`vault.tree` / `notes.files` 的消费者一次迁完；`hiddenPaths` 存每 Vault UI 偏好。
- 标签与档案：`DocTab` 判别联合，去掉 `folderView`；档案业务与存储不变。
- 查看器：JSON / TXT = CM6 `PlainTextEditor`；PDF = ORCA 摘取 + `pdfjs-dist 6.3.289`；HTML = 自研 `huhu-preview` 隔离方案；图标 = 共享 `FileIcon`。
- 不变量：磁盘文件是持久内容的唯一真源；所有写操作仍经 Dispatcher 的鉴权 / 校验 / 幂等 / 事件路径；UI 不直写文件；编辑器包不导入 notes 业务；公开包入口统一，不经跨包 `/src` 私有路径。

## 7. 验证决定

- 真实入口：Electron 应用（`pnpm e2e` 的 Playwright Electron 夹具、`pnpm visual:*`）；选区 / 键盘 / IME / 菜单 / 滚动 / PDF / HTML / 标签 / 焦点**必须**在真实 Electron 中验证；jsdom 与模拟 DOM 事件**不能**代替 B04 / B06 / B07 / F03 / F04 的结论。
- 对照基线：`rc4`（v0.0.1-rc.4）的视觉基线，用于证明非知识库界面无回归；OK 行为对照用**同一份样本文档、同一操作序列**在固定 OK 基线（`temp/sources/open-knowledge` 本地运行，S0 记录运行方式）与 Huhu 间逐项比对（`evidence/parity/`）。
- 环境限制：真实输入法（Windows 微软拼音 / macOS）与 Windows / macOS 的选择、快捷键差异在本机 Linux 环境无法验证——按事实写“未验证”，由 CI 三平台 e2e 子集补充，**不写已通过**。
- 门禁、数据与性能记录见 [verification.md](verification.md)。

## 8. 范围之外

- OK 的账户 / 组织 / 云协作 / 多人 presence / Share / OpenWithAi / 云同步；Hocuspocus 服务端；git 影子仓库历史（Huhu 有自己的版本模块）。
- 恢复独立档案插件；Obsidian 虎符的 schema / 实体迁移系统；ORCA 的 Git worktree / WSL / 远程 / 浏览器标签页体系。
- 历史格式迁移框架、旧接口适配层、双写、旧 / 新两套知识库、“试用新版”开关。
- 任务、终端、调度等不相关业务的重写。
- Windows / macOS 实机验证与真实输入法（见 §7，按“未验证”登记，不阻止归档，是否接受由用户决定）。

## 9. 待决问题（不阻塞文档与 S0，影响 S2 之后）

| 编号 | 问题 | 建议 | 受影响 | 解除条件 |
| --- | --- | --- | --- | --- |
| Q1 | 许可证：Huhu 与 OK 同为 GPL-3.0-or-later，复制合规；是否有闭源 / 双许可计划？ | 无——按现状继续，ledger / notices 如实登记 | OP-D14 | 用户一句确认 |
| Q2 | OK 里**不属于本地编辑核心**的功能怎么分类：lint / audit 面板（需服务端 markdownlint 约 1.9k 行）、Share、OpenWithAi / handoff、presence、history、Excalidraw / Mermaid 文档编辑器、模板导入（分屏 / pane 见 Q10） | 默认：lint / audit **不接**（登记不适用，因其为服务端能力）；Share / OpenWithAi / presence / history 不接；模板导入、Mermaid 块保留（Mermaid 块在编辑器内，Excalidraw 文档编辑器 S0 评估后定） | reuse §2、H04、B01 | 用户确认分类；**未确认前不得在“完成”里写“复刻完成”** |
| Q3 | 外链预览（`/api/link-preview`）需要联网抓取 | 默认关闭（不联网，显示 URL 与域名），设置项可开启并经主进程抓取、限时限大小 | H04、安全 | 用户确认 |
| Q4 | tasks / inbox 的 `compact` 变体是否可以接受 OK 编辑器的每实例成本 | 先量（S2 bench），超预算回退到 `PlainTextEditor` + `ReadonlyMarkdown` | OP-D18 | S2 数据 |
| Q5 | `reconciliation.ts` 块级三方合并作为后续增强是否要排期 | 不排（沿用 Huhu 现有冲突 UI） | OP-D03 | 用户意见 |
| Q6 | 是否更新上游（OK / ORCA）到比固定 SHA 更新的提交 | 否；整体冻结在固定 SHA，升级作为单独 change；**S0 仍记录一次与上游最新提交的差异**（评论要求“核对上游”） | G01 | — |
| Q7 | Windows / macOS 实机验证是否作为归档条件 | 与此前 change 相同：不作为条件，但逐项登记未验证 | §8 | 用户确认 |
| Q8 | **对外接口变化**：`vault.tree` 更名 / 删除、`notes.files` 删除会影响 MCP（`huhu://notes/recent`，`GatewayModule.tsx:39`）、CLI 与权限组 | 无外部调用方依赖时直接删除；有则保留一个版本并标记弃用（与“不保留兼容”不冲突，因为这是**对外**契约，不是内部兼容层） | design §6、S5 | 用户确认 |
| Q9 | 安装包 / 编辑器 chunk 体积预算（G07 目前只记录、不设上限） | S0 测得增量后由用户设上限 | G07 | S0 数据 |
| Q10 | OK 的分屏 / pane 能力（`editor-panes.ts` 1054 行）算不算“本地编辑功能” | 默认按本地功能纳入复刻矩阵，S0 评估与 Huhu 标签模型的冲突，冲突大则登记为不适用并请用户确认 | B01、S3 | 用户确认 |

## 10. 现状证据（实施前核对最新代码）

见 [evidence/e0-source-survey.md](evidence/e0-source-survey.md) §7（F01–F10 逐条核对）。关键入口：`plugins/notes/src/ui/{NotesModule,NoteDocument,NoteExplorer,NoteInspector,CommentsPanel,FileCard}.tsx`、`plugins/notes/src/engine/{service,index}.ts`、`plugins/notes/src/engine/{comments,archives}/`、`packages/editor/src/{MarkdownEditor,MarkdownPreview}.tsx`、`packages/kernel/src/capabilities/vault.ts`、`packages/vault/src/{index/vault-index,watch/snapshot,semantic/frontmatter}.ts`、`packages/workbench/src/{engine-client/query,state/flushers}.ts`。
