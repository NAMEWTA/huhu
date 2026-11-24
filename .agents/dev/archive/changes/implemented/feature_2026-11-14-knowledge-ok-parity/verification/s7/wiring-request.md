# S7 接线请求（给 S6 / S5 / 整合者）

S7 只做了一处最小必要接线，已与 S6（f81c6b4）合并并解决冲突：

- `plugins/notes/src/ui/NotesModule.tsx`：`FileCard` → `FileViewer`（`import { FileViewer } from "./viewers/FileViewer.js"`，渲染条件沿用 S6 的 `selectedFile?.file && section !== "trash"`）。`FileCard.tsx` 已删除（`git grep FileCard` 只剩注释）。props 不变：`{ path, size, mtimeMs }`。

给其它切片的约定（不需要 S7 再改它们的文件）：

1. **S5 文件树**：行图标用 `@huhu/ui` 的 `FileIcon`（旧 `NoteExplorer` 仍给所有文件用同一个 `FileText`，所以 F06“树 / 标签 / `@` / 搜索一致”里的**树**一项由 S5 完成；标签条（S6 的 `TabStrip`）已经在用）。打开文件 = 触发 `NotesModule` 的文件标签，`FileViewer` 自己按 `chooseViewer(path, size)` 分派。
2. **S5 / S6**：`chooseViewer` / `humanSize` 在 `plugins/notes/src/ui/viewers/dispatch.ts`，只依赖 `@huhu/ui` 的 `extensionOf` / `fileIconKind`；需要“能否在应用内编辑 / 预览”的判断时复用它，不要再各写一份扩展名表。
3. **S6 档案记录**：`.html` / `.pdf` 作为档案附件时同样走 `FileViewer`；档案视图里如要内嵌预览，直接渲染 `<FileViewer path size mtimeMs />`。
4. **整合者（S8）**：
   - `THIRD_PARTY_NOTICES.md` 必须在**主检出**里重新运行 `pnpm notices`（在 `.claude/worktrees/*` 里运行会丢掉大量条目，因为生成器扫描的路径含 `.claude`），以收录 `pdfjs-dist@6.3.289`；`docs/upstream/ledger.md` 已加 R-43 / R-44 / R-45。
   - `pdfjs-dist` 有两个版本（6.3.289 带 ORCA 补丁，6.2.108 是 OK 编辑器 PDF 嵌入块用的）。S8 依赖清理时评估合并。
   - 删除旧 `MarkdownEditor` 之后，`packages/editor/src/index.ts` 里 `MermaidBlock` / `PlainTextEditor` 导出仍要保留（`FileViewer` 与 `TextFileView` 在用）。
