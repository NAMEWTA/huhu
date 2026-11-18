# S6 验证记录（2026-11-15，fork 在本 worktree 内直接运行，未经 `audit` 子代理）

基于 `feat/knowledge-ok-parity` @265043d（已合并）。

| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | 通过（oxlint + 5 个 CSS 守护全绿） |
| `plugins/notes` `tsc --noEmit`（先 `build:types`） | 无错误 |
| `vitest run plugins/notes` | 7 文件 / 104 通过（含新增 `shell-state.test.ts` 8 条） |
| `pnpm build` | 通过 |
| `xvfb-run playwright test tests/e2e/workflows/archives-tabs.spec.ts a11y.spec.ts states.spec.ts` | 15 通过 |
| 既有知识库 / 档案 e2e 子集（shell.spec、a11y、workflows，-g 档案/知识库/笔记/AR-/批注/草稿/冲突/外部修改/拖/标签） | 35 通过、1 跳过（Agent CLI 分屏，与本任务无关） |

## 验收对照

- **E01**：分区顺序 `文件/星标/日记/标签/回收站/档案`（`.notes-explorer-filters` 文本断言）；“档案”在最右；点击打开唯一档案首页标签，连点 3 次仍 1 个；类型页 / 记录页是标签，可切换可关闭。
- **E02**：活动档案标签 → `archives-sidebar`，文件标签 → `notes-explorer-tree`；两种上下文展开状态各自记忆（资料 / 通讯录 往返后仍展开）；点“文件”分类只切上下文不关标签；25×(档案↔文件) = 50 次切换，页面无 `pageerror`、标签数不变。reducer 层另有“无 effect 回路”的单测（`shell-state.test.ts`，含 50 次 `choose`）。
- **E03**：点普通目录只展开；点 `Archives/` 目录只展开真实子目录，不打开档案首页标签。
- **E04**：文件树点档案文件夹笔记打开 Markdown（不是档案视图）；Markdown 里输入后**立即**切到档案视图改字段，磁盘同时含两边修改且 `电话` 只出现一次；`以档案视图打开 / 以 Markdown 打开` 互通。机制：档案记录标签通过 `ArchiveRecordView` 持有同一 `(vaultId, index.md)` 的 `DocumentSession` 引用，改字段前 `flush()`。
- **E05（部分）**：档案文件列表、双链 / 反链仍是真实文件资源语义，AR-06 / AR-09 / AR-10 / AR-16 与 shell 档案 e2e 全绿；**“档案附件走统一查看器分派”依赖 S7，尚未做**。

## 偏差 / 限制

1. `NoteExplorer.tsx`（S5 将迁入 `ui/explorer`）：顶部分区条追加“档案”（`notes-open-archives`，沿用原 testid）、移除标题区的档案图标按钮、新增 `archivesActive` / `archivesPanel` 两个 props。S5 迁移时必须保留。
2. 标签随 Vault 记录用 `localStorage`（键 `huhu.notes.tabs.v1:<vaultId>`）；加载前不裁剪（列表就绪后才 `prune`）。
3. 档案记录标签不被 `prune` 自动裁剪（`docTabsReducer` 未改）；记录被删除 / 改名由 `ArchiveView` 的 `onGone` / `onOpenFolder` 回调关闭或替换。外部（磁盘）删除档案目录后，该记录标签显示“这个档案不存在”，不会自动消失。
4. 档案侧栏（`ArchivesSidebar`）是 `archives.types.list` / `archives.list` 的投影，每个展开的类型各发一次 `archives.list`。
5. E04 的 e2e 通过 `.cm-content` 在 Markdown 编辑器里输入——S2b 换编辑器后要同步更新该定位。
6. 没有收到 S5 / S7 的 `wiring-request.md`，所以未做 6.7 接线；NotesModule 由 S6 保持为唯一写入者。
7. 没有运行 `audit` 子代理（fork 不能派生子代理）；没有做真机 / Windows / macOS / 输入法验证。
