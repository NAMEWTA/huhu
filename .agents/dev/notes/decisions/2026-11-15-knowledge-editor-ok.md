# 知识库编辑器改用 Open Knowledge（取代 D-08 / D-09 / D-31 中关于编辑器与样式的部分）

- 日期：2026-11-15（change `knowledge-ok-parity`，归档见 [feature_2026-11-14-knowledge-ok-parity](../../archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/README.md)）
- 状态：现行。取代 `D-08`（CM6 单实现、否决 Tiptap + Yjs）、`D-09`、`D-31`（编辑器范围与“不用 Tailwind”）在**知识库编辑器**上的结论；D-31 对 Huhu 自有界面的“不用 Tailwind”仍然有效（Tailwind 只存在于 `.ok-root` 内）。

## 决定

知识库编辑器直接复制 Open Knowledge `44a2e0a`（GPL-3.0-or-later，与本项目同许可）的编辑器闭包到 `packages/editor/src/vendor/open-knowledge/`，保留 Tiptap + Yjs（**本地运行，无 Hocuspocus 与同步**），Tailwind v4 与 Lingui 随源码进入，样式限定在 `.ok-root` 与 `vendor.ok-*` 子层。会话、保存、冲突、草稿、标签、资源目录，以及评论 / 文件树 / 查看器的适配是 Huhu 自有代码。**磁盘文件仍是唯一真源**，Y.Doc 只是编辑表示。不保留旧编辑器，不做兼容层或新旧开关。

## 为什么

- 用户目标是 OK 的编辑与渲染体验（`/` 命令、属性面板、评论、文件树、大文档渲染优化）；自研要重复实现数十个行为且无法对照基线。
- 实测可行：931 文件闭包在 OK 编译选项下 typecheck 零错误；真实 Electron 里 `LocalDocProvider` 挂编辑器后来回切 / 切源码 / 撤销 / 无编辑不写盘全部成立；Huhu 侧补丁 5 个文件、替换约 630 行，均低于写死阈值（150 文件 / 1200 行）。

## 代价（如实）

- 931 个 vendor 文件与约 115 个新增依赖；依赖版本必须钉在上游锁文件（浮动安装会导致 tiptap 版本漂移并抛 `Adding different instances of a keyed plugin`，见 `context/knowledge-editor.md`）。
- 上游冻结在固定 SHA，升级是单独 change；首次编辑会把 Markdown 规范化（往返字节保真约 66%，规范化后相等约 85%，无编辑不写盘靠保留原始源文本）。
- 编辑器相关验证必须在真实 Electron 里做；`test:vendor` 通过率口径是三分类（70 个文件因被测模块不在闭包而不适用）。

## 回头检查

上游升级需求；`test:vendor` 适用文件通过率跌破 70%；vendor 补丁超过 `PATCHES.md` 现有量的 2 倍；编辑器 chunk 体积 / 冷启动回退；见到“新旧编辑器切换”类需求时先读本条。

## 未验证与已知限制（归档时仍然成立）

- 真实输入法、硬件鼠标、Windows / macOS 实机未验证（按 OP-D19 Q7 不作为归档条件）。
- 用户最初报告的“鼠标选区 / 上下行光标异常”在 rc.4 上**未能复现**（合成事件探针）；新编辑器上发现并修复了一个相近的真实缺陷（短文档 `content-visibility` 导致拖选落到别的段落，P-S3-06），很可能同源但未用真实鼠标证实，B06 因此不写“已解决”。
- 复刻矩阵 283 行中 82 行没有逐行验证（上游 jsdom 测试未迁入、无专门 e2e），列在 `parity-matrix.md` §18。
- 1 MiB 文档切实时预览偶发卡死：诊断指向 Playwright 在 12790 块 DOM 上的 ARIA 遍历，不是应用观察者；用例改为页内轮询后 10/10 通过，**但应用侧是否也有同类触发没有证伪**。

原规格的 [R-21、R-22](../../archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/reuse.md) 分别记录 Atomic 实时预览与单一 CodeMirror EditorView 装配。本决定在知识库编辑器范围替代两项历史复用方案，并修订原[产品非目标](../../archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/product.md)中的可视化 WYSIWYG 条款。
