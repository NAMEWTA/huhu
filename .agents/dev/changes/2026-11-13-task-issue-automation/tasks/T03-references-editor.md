# T03 `@` 引用补全、双链解析与改名改写

**规格**：[spec.md](../spec.md) 的 §3.2（代码围栏判定）、§3.4；TD-13。

**交付**：
- 在任务内容编辑器里输入 `@`，可以模糊匹配 Vault 中的文件和文件夹，选中后插入 `[[相对路径]]`。
- 引用渲染成可点击的链接，不存在的引用显示失效标记。
- 笔记或文件夹改名、移动后，任务中的引用随之更新。

**依赖**：
- T01a 的 `<task>` 区段、`codeRanges()` 和任务编辑器结构。
- `@` 补全扩展可以先行开发。
- notes 侧子项（`links-rewrite` 的文件夹前缀改写、`openWiki` 打开文件夹）只依赖 T01a 的 `codeRanges()`，不依赖任务编辑器，可以作为独立提交先合入。[档案 change](../../../archive/changes/implemented/feature_2026-11-13-archives-as-folder-notes/plan.md) 的 AR-S1 依赖它。

**边界**：
- 负责：
  - `packages/editor`：补全扩展、`extensions` 入参。
  - `packages/vault`：`codeRanges` 唯一实现。
  - notes 的改写范围、文件夹前缀改写、`openWiki` 打开文件夹。
  - 任务内容编辑器替换为 `MarkdownEditor`。
- 评论输入框接入补全由 T04 完成，复用本项的扩展。
- 笔记编辑器**不启用** `@` 补全。

## 当前代码指针

- `packages/editor/src/MarkdownEditor.tsx`：props 在 `:219-243`，`extensions` 在 `:325`，`wikiLinks.resolve` 桩函数在 `:320`。
- `packages/editor/package.json`：目前**没有** `@codemirror/autocomplete`。
- `packages/editor/src/wikilink.ts:4-30`：`[[a/b/]]` 解析时保留末尾斜杠。
- `packages/editor/src/MarkdownPreview.tsx:52-62`：渲染 wikilink，`exists` 由 `resolveWikiLink` 决定。
- `plugins/notes/src/ui/NoteDocument.tsx:302-305`：`openWiki` 只匹配文件。
- `plugins/notes/src/engine/service.ts:26-28`：`SEMANTIC_DIRS`、`isNoteFile`。
- `plugins/notes/src/engine/service.ts:188-270`：`moveEntry`，改写调用在 `:223-224`、`:267-270`。
- `plugins/notes/src/shared/links-rewrite.ts:24-32`：`codeRanges`。
- `plugins/notes/src/shared/links-rewrite.ts:45-122`：改写规则。
- `packages/vault/src/index/links.ts:8-10`：`stripCode`。
- `packages/workbench/src/command-palette/palette-model.ts:15`：`scoreText`，已由 `@huhu/workbench` 导出。
- `packages/kernel/src/capabilities/vault.ts:95-103`：`vault.tree`。
- 参考实现：`temp/sources/open-knowledge/packages/core/src/markdown/fence-regions.ts`（只读）。

## 实施要点

- **`codeRanges(text)`**：
  - 由 T01a 建立，本项**不改**它的实现。
  - 本项只负责迁移：`vault/index/links.ts` 的 `stripCode` 和 notes 的 `codeRanges` 都改为调用它，删除原来的两份正则。
  - 如需复制 fence-regions 的代码片段，在 `docs/upstream/ledger.md` 登记来源。
- **补全扩展**：
  - 触发条件：光标前是 `@`，且前一个字符是行首或空白。
  - 候选来自 `vault.tree`，排除 `.huhu/`，并且不经过语义目录过滤，档案和任务文件也可以引用。
  - 用 `scoreText` 打分。
  - 选中文件插入 `[[path.md]]`，选中文件夹插入 `[[dir/]]`，并替换掉 `@` 和已输入的查询文字。
- **`resolveWikiLink`**：任务视图根据 `vault.tree` 判断路径是否存在，文件夹的判定要考虑末尾的 `/`。
- **改写范围**：`Tasks/` 纳入改写。这是 spec §8.1 登记的例外：只改 `<task>` 和 `<comments>` 区段内的双链，frontmatter 不动；使用条件写，冲突时重试；不增加 `inputRevision`。
- **文件夹前缀改写**：
  - 文件夹移动时，`[[旧/]]` 改写为 `[[新/]]`，`[[旧/x.md]]` 改写为 `[[新/x.md]]`。
  - 其余改写规则保持不变。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| A10 | 在任务内容中输入 `@接口` → 候选中出现 `设计/接口说明.md` 和 `设计/旧接口/`；回车后插入 `[[设计/接口说明.md]]` | e2e（新建任务编辑器用例） |
| A10 | 详情中点击 `[[设计/接口说明.md]]` → 打开该笔记；点击 `[[设计/旧接口/]]` → 文件树定位到该文件夹；引用不存在时显示失效样式 | e2e |
| A10 | 改名 `设计/接口说明.md` → 任务文件中的引用同步更新；移动文件夹 `设计/旧接口/` → `[[设计/旧接口/]]` 和其下文件的引用都更新；代码块内的同名链接不变 | `links-rewrite` 单元测试 + notes 服务测试 |
| A07（围栏） | `codeRanges` 覆盖反引号和波浪线、长围栏、缩进代码块、未闭合围栏 | 拟新增 vault 单元测试 |
| 回归 | 笔记的双链渲染、反链、现有改写测试（`plugins/notes/test/links-rewrite.test.ts`）全部通过；笔记编辑器中没有 `@` 补全 | 现有测试 |

## 完成证据

- `audit` 运行 editor、vault、notes、tasks 的测试，以及相关 e2e。
- `dev-verify` 录制一次 `@` 补全和改名联动的截图。
- 实际结果记入 `progress.md`。
