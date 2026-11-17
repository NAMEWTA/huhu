# S5 ↔ S6：NotesModule / NoteExplorer 接线（合并 S6 后的结果）

S5 分支已合入 S6（`f81c6b4`），`NotesModule.tsx` 以 S6 的 `shellReducer` 为准，S5 只重新接了下面几处：

| 位置 | S5 的接线 |
| --- | --- |
| `NoteExplorer` 的 `section==="all" && !query` | `<ResourceTree/>`（OK FileTree，懒加载）；旧树、HTML5 拖放删除；`archivesActive` / `archivesPanel`（S6）保留 |
| props | 删 `folders` / `expanded` / `onToggleFolder` / `onMoveNote`；加 `beforeMutate`、`onMoved`、`onTrashed`、`onMenuAction`、`isFavorite` |
| `onMoved(moved)` | 对映射里每个 from→to 调用 S6 的 `remapSelected`（reducer `remap`） |
| `beforeMutate(paths)` | 选中项在被操作路径内 → `flushRef.current()`（A08） |
| `notes.files` | 删除；非 Markdown 元信息与标签存活判断改用 `vault.indexEntries`（`fileRefs`） |
| 右键菜单“移动到… / 星标 / 保存版本…” | 经 `onMenuAction` 打开既有 `NoteDialogs` / `notes.setFavorite` |
| `expandTo` / 侧栏 files 展开状态 | 仍由 reducer 记录，但新树自己管展开，S6 若需要“按活动文件展开树”要改成给 `OkExplorer` 的 reveal 能力（未做） |

S5 没有触碰 `ui/tabs`、`ui/archives`、`ui/viewers`、`documents`、`comments`。S7 的查看器分派可直接用 `vault.list` / `vault.indexEntries` 取元信息；树对 `.txt` 等文本文件按“文档”打开（上游行为），`OkExplorer` 已按真实路径还原。
