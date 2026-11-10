# W05 知识库：文件与笔记管理

## W05.1 notes 插件与文件树

- 目标：知识库模块显示 Vault 文件树，可按文件/星标/日记/标签/回收站筛选与搜索。
- 依据：[knowledge](../modules/knowledge.md) §2；US-KN-01。
- 前置：W04.5、W02.3。
- 位置：`plugins/notes/{huhu-plugin.json,src/engine/index.ts,src/ui/file-tree/,src/ui/NotesModule.tsx}`。
- 复用：R-17、R-56。
- 实现要点：能力 `notes.list`（筛选）、`notes.read`；文件树数据来自 `vault.tree` 并订阅 `vault.fileChanged`；排序（修改时间/文件名）；“显示隐藏文件”；星标 `notes.setFavorite`（`.huhu/notes/favorites.json`）；标签从索引读取；空状态三种。
- 异常：树加载中骨架；索引构建中搜索显示“正在建立索引”。
- 测试：组件测试筛选；E2E 打开示例 Vault 浏览树。
- 完成：US-KN-01 可演示；停用 notes 后 rail 项消失（W16.1 后复测）。

## W05.2 新建、重命名、移动、复制

- 目标：笔记与文件夹的创建、重命名、移动、复制，路径双链同步更新。
- 依据：knowledge §3；ACC-KN-06。
- 前置：W05.1、W04.2。
- 位置：`plugins/notes/src/engine/{files,links-rewrite,templates}.ts`、`plugins/notes/src/ui/dialogs/`。
- 复用：R-17（`file-tree-rename-validation.ts`、`file-tree-operations.ts`）、R-26。
- 实现要点：模板（空白、会议纪要、项目计划、每日笔记，内容取原型 `knowledge.jsx` 中的模板文本）；名称校验（大小写不敏感同名、非法字符、保留名）；重命名/移动在一个操作中写入目标文件与所有需更新链接的文件，更新 `identities.json` 与批注 `documentPath`；文件夹登记；拖放移动；导入文件。
- 异常：移入自身或后代、目标同名、部分写失败（`WRITE_PARTIAL`）。
- 测试：链接改写单元测试（代码块、行内代码、别名、标题锚、同名歧义）；ACC-KN-06 集成测试。
- 完成：ACC-KN-06 通过。

## W05.3 回收站与删除

- 目标：移到回收站（可撤销）、恢复（冲突时改名）、永久删除、删除文件夹。
- 依据：knowledge §3；data-model §8；ACC-KN-07。
- 前置：W05.2。
- 位置：`plugins/notes/src/engine/trash.ts`、`plugins/notes/src/ui/trash/`。
- 复用：R-56（对话框文案）。
- 实现要点：`notes.trash`/`restore`/`deletePermanent`；toast 撤销 8 秒；批注随文档移动；永久删除 AlertDialog。
- 异常：恢复目标同名、回收站条目损坏（meta 缺失 → 健康问题）。
- 测试：集成测试；ACC-KN-07。
- 完成：ACC-KN-07 通过。

## W05.4 日记

- 目标：日记筛选与“打开今天的日记”。
- 依据：knowledge §3（打开日记）；ACC-KN-11。
- 前置：W05.2。
- 位置：`plugins/notes/src/engine/daily.ts`、`plugins/notes/src/ui/DailyFilter.tsx`。
- 复用：R-18（日历）。
- 实现要点：按设置时区计算日期；`notes.openDaily`；日历中有日记的日期加点标记。
- 异常：日记目录被删除时重建目录。
- 测试：时区边界单元测试；ACC-KN-11。
- 完成：ACC-KN-11 通过。
