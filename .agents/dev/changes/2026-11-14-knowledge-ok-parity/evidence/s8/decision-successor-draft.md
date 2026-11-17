# 后继决定草稿：知识库编辑器改用 Open Knowledge（取代 D-08 / D-09 / D-31）

> 归档时由整合者写入 `.agents/dev/notes/`（建议 `decisions/…-knowledge-editor-ok.md`）。来源：change `2026-11-14-knowledge-ok-parity` 的 `decisions.md` OP-D01、OP-D19。

- **取代**：D-08（CM6 单实现、否决 Tiptap + Yjs）、D-09（样式否决 Tailwind）、D-31（编辑器范围）。
- **决定**：知识库编辑器直接复制 Open Knowledge `44a2e0a` 的编辑器闭包（GPL-3.0-or-later，与本项目同许可），保留 Tiptap + Yjs（本地运行，无 Hocuspocus），Tailwind v4 与 Lingui 随源码进入，样式限定在 `.ok-root` 与 `vendor.ok-*` 子层；编辑器壳（会话、保存、冲突、草稿、标签、资源目录、评论 / 文件树 / 查看器适配）是 Huhu 自有；磁盘文件仍是唯一真源，Y.Doc 只是编辑表示。不保留旧编辑器、不做兼容层或新旧开关。
- **代价（如实）**：931 个 vendor 文件与约 115 个新增依赖；依赖版本必须钉在上游锁文件（否则行为变，见 `knowledge-editor.md`）；上游冻结在固定 SHA，升级是单独 change；首次编辑会规范化 Markdown；编辑器相关 e2e 需要真实 Electron。
- **回头检查**：上游升级需求；`test:vendor` 通过率跌破 70%；vendor 补丁超过 `PATCHES.md` 现有量的 2 倍；编辑器 chunk 体积 / 冷启动回退。
