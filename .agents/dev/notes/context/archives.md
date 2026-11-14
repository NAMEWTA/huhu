# 档案 = 文件夹笔记

> 来源 change：`2026-11-13-archives-as-folder-notes`（已归档）。

- **没有独立的档案插件**：档案是 `Archives/<类型>/<名称>/index.md`（路径即判定，不看 frontmatter）。类型 = 文件夹；字段定义在类型文件夹里。UI 合并进知识库（`plugins/notes/src/ui/archives/`），引擎在 `plugins/notes/src/engine/archives/`。
- 档案标题 = 文件夹名；`[[dir/]]` 解析到文件夹笔记；反向链接**排除**裸 `[[index]]`。
- 关系只用正文双链 + 被链接，不做关系字段。重名时追加随机 4 位后缀。
- 文本字段的 YAML 标量保留原始写法（`frontmatterScalarSources`）；改字段名是原子重命名（OperationLog）；删除走笔记回收站。
- 重命名 / 移动笔记时改写双链：文件夹前缀改写；`Tasks/` 下只改正文，不动 frontmatter。
- 搜索 / 命令面板把档案单独分组；demo vault 含“通讯录”示例（`apps/desktop/resources/demo-vault`）。
- 旧的档案插件、`archive` 实体种类与 id 前缀已删除，没有迁移（0→1）。
