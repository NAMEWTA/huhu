# S8 旧链路删除清单与零引用证据（design §14，G05）

命令均在 worktree `worktree-agent-ac0cf1e67e421d277` 的最终提交上运行：`git grep -n -E "<模式>" -- apps packages plugins tests scripts ':!packages/editor/src/vendor/open-knowledge' ':!THIRD_PARTY_NOTICES.md'`（**含注释与文案**）。

| design §14 项 | 删除 / 处理 | 零引用证据 |
| --- | --- | --- |
| 1 `MarkdownEditor.tsx`、`vendor/atomic/*`、`editor-cm.css`、旧工具栏 | 全部删除（提交 `1a68b08`）；`editor.css` 里 `.editor-markdown-editor` 块删除；`--atomic-editor-*` 变量改名 `--editor-plain-*`（只剩 `PlainTextEditor` 使用）；`atomic-initial-reveal-fade` 动画、`check-css-layers` 的 atomic 类白名单、不分层白名单里的 `editor-cm.css` 删除；“关于”页致谢里的 Atomic Editor 删除 | `MarkdownEditor\b`、`vendor/atomic`、`editor-cm`（除设计系统说明里的历史句）、`atomic-editor`、`atomic-cm-` 在上述范围 **0 个命中**（命中的 `RichMarkdownEditor` / `SourceMarkdownEditor` 是新实现） |
| 1 `MarkdownPreview.tsx`（marked + DOMPurify）、`wikilink.ts`、`mention.ts` | 删除；`@` 引用补全由 `packages/editor/src/rich/at-reference.ts` 取代 | `MarkdownPreview`、`remarkWikiLinks`、`parseWikiHref`、`referenceCompletion`、`stripFrontmatter`（旧导出）0 命中（`host/core-barrel.ts` 里的同名函数来自 OK core，是不同的东西） |
| 2 `FileCard` 对 JSON / TXT / HTML 的分支 | 随 S7 `FileViewer` 取代（未知类型元信息回退在 `ImageAndUnknown.tsx`） | `FileCard` 只剩两处“取代 FileCard”的注释 |
| 3 由 `notes.list` + `otherFiles` 拼全资源树；`notes.files`；虚拟目录真源 | `notes.files` 删除，`vault.tree` 更名 `vault.indexEntries`，树改由 `vault.list` 逐目录列举 | `otherFiles`、`notes\.files`、`vault\.tree` 0 命中 |
| 4 非 Markdown 菜单 / 拖放限制分支、独立于右键的行内操作 | 随 S5 文件树（OK `FileTree` + 同一分发）取代 | e2e `tests/e2e/knowledge` 与 `workflows` 覆盖 |
| 5 路径字符串数组标签与独立 `folderView` | 随 S6 `DocTab` + `shellState` reducer 取代 | `folderView` 0 命中 |
| 6 旧 `CommentsPanel` 重复入口与源码偏移适配 | 随 S4 删除（`getSourceSelection` / `setSourceSelection` 已删） | 旧 `CommentsPanel.tsx` 不存在；新入口只有 `ui/comments/CommentsHost` |
| 7 顶部与详情两份属性状态；保存时重建整个 YAML | 属性面板读写同一份 `Y.Text('source')`（S3） | `evidence/s3/verification.md` 的属性 e2e |
| 8 无消费者的类型 / 导出 / CSS / 文案 / 夹具 / 依赖 | `pnpm knip` 通过；`marked`、`dompurify`、`react-markdown`、`rehype-katex`、`rehype-sanitize`、`@lezer/common` 从 `packages/editor` 移除（knip 判无消费者，`git grep` 在 vendor 内也 0 命中） | 本文件 + `pnpm knip` 退出码 0 |

## 仍保留（有消费者，不属于旧链路）
- `MermaidBlock` + `.hu-mermaid` 样式：`.mmd` 文件预览（`plugins/notes/src/ui/viewers/FileViewer.tsx`）在用。
- `PlainTextEditor`：JSON / TXT 编辑（`TextFileView`）。
- `katex` 升到 0.16.47：OK 数学渲染使用；`editor.css` 里的 `katex.min.css` 导入保留。

## 本次顺带发现并修复的回归
- `Mod+S` 立即保存（快捷键登记表有它）随旧编辑器的 `Mod-s` 一起丢了——新编辑器里没有任何实现；已在 `NoteDocument` 的编辑区容器上用捕获阶段监听恢复，快捷键登记表测试改为检查它，并在 `shell.spec.ts` 的“设置：编辑器页的开关”里加了手动保存模式下按 `Mod+S` 落盘的断言。
- `mdast-util-gfm-task-list-item@2.0.1` 把任务项序列化成 `- [ ] [ ] x`（上游 `list.test.ts` 抓到）；依赖钉回上游锁文件版本（PATCHES.md P-D-01，ledger R-52）。
