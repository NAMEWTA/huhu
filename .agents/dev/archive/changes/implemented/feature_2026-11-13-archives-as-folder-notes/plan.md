# 实施计划：档案改为“文件夹笔记”形态

- **目标**：把档案改为 `Archives/<类型>/<名称>/` 下的文件夹笔记，并入笔记模块；删除 archives 插件。
- **规格**：[spec.md](spec.md)；决定与事实：[brief.md](brief.md)。
- **交付点**：合入 `main`。提交、推送、发布需要用户另行授权。**当前授权只到文档，还没有授权写代码。**
- **进度**：开工时创建 `progress.md`，这是唯一记录进度的位置。

## 切片

| 切片 | 完成后的行为 | 真正依赖 | 唯一写入者与边界 | 验收 |
| --- | --- | --- | --- | --- |
| AR-S1 文件夹笔记基础 | `index.md` 显示为文件夹名；`[[目录/]]` 能解析、打开并计入反链（`[[index]]` 不再误匹配）；文件树中点击文件夹名即可打开文件夹笔记 | 任务 change T03 中 notes 侧的子项（文件夹前缀改写、`openWiki` 处理文件夹）。它只依赖 T01a 的 `codeRanges()`，不依赖任务编辑器，可以作为独立提交先合入（已在 T03 文档中标注） | `packages/vault`（`vault-index.ts` 的标题与 backlinks）、`NoteDocument.tsx` 的已知判定与 `openWiki`、`MarkdownPreview` 的解析回调、`NoteExplorer.tsx` / `NotesModule.tsx` 的文件夹点击 | AR-06（不含档案视图的部分）、AR-10、AR-18 |
| AR-S2 档案能力 | notes 插件提供 §5 的全部能力；`Archives/` 下的文件成为普通笔记；inbox 转换可用；archives 插件、两个 kind 及其在 engine、desktop 中的注册全部删除（中间状态：暂时没有档案界面，但能构建、能运行） | AR-S1 | notes 引擎：新增 `src/engine/archives/`，清单加上能力；`packages/contracts`（删除 kinds，新增 `archives.ts`，修改 `capture.ts`）；`vault/semantic/repository.ts` 的前缀；kernel 的权限、域映射、event-log 与 `boot.ts` 的 `titleOf`；workbench 的 `query.ts` 失效规则；inbox 引擎与清单；删除 `plugins/archives/`；engine 与 desktop 的注册（`boot.ts`、两个 `package.json`、`main.tsx`、`electron.vite.config.ts`）与 lockfile；相关单元测试与 `engine.test.ts` | AR-02～AR-05、AR-07、AR-08、AR-11、AR-13、AR-15、AR-19、AR-20（能力层，用单元测试与引擎测试验证） |
| AR-S3 档案视图 | 笔记模块中有档案首页、类型视图、档案视图；命令面板分组；demo vault 示例 | AR-S2 | notes UI：新增 `src/ui/archives/`；`NoteInspector.tsx`（删除相关档案区块）；`CommandPalette.tsx` 与 `main.tsx:257`（打开方式）；`StoragePage.tsx`、`LaunchPage.tsx`、`NotificationBell.tsx` 的文案；inbox UI；demo vault；agent-guide 的说明文字；e2e | AR-01～AR-20 的界面部分 |

```mermaid
graph LR
  T03[任务 change T03 的 notes 侧子项] --> S1[AR-S1 文件夹笔记基础]
  S1 --> S2[AR-S2 档案能力]
  S2 --> S3[AR-S3 档案视图]
```

**与其他 change 的共享文件**

- `plugins/notes/src/shared/links-rewrite.ts`、`NoteDocument.tsx` 的 `openWiki`：任务 change 的 T03 先改，AR-S1 在其上增加 index.md 解析。
- 设计系统的 DS-S3a 会把 notes 的样式迁入 `plugins/notes/src/ui/`。AR-S3 若在 DS-S3a 之后合入，直接写到新位置；若在之前合入，DS-S3a 在迁移时一并处理档案视图的样式。

## AR-S1 文件夹笔记基础

**当前代码指针**（基线 `8283c5c`，T03 合入后复核）：
- `packages/vault/src/index/vault-index.ts:142-148`（kind 与标题）、`:221`（backlinks）。
- `plugins/notes/src/engine/service.ts:26-28`（`SEMANTIC_DIRS`、`isNoteFile`）、`:105-110`（`otherFiles`）、`:372-385`（`list`）。
- `plugins/notes/src/shared/links-rewrite.ts:63-68`（路径解析）。
- `plugins/notes/src/ui/NoteDocument.tsx:301-304`；`packages/editor/src/MarkdownPreview.tsx:54-58`。
- `plugins/notes/src/ui/NotesModule.tsx:150`、`NoteExplorer.tsx:153`（文件夹点击）。

**实施要点**：标题规则；文件夹链接解析到 index.md，并取消 index.md 的裸名匹配（预览、打开、反链三处使用同一个解析函数，放在 `packages/vault` 或 notes 的 `shared/`，由实施者按 T03 的落点决定）；文件树交互。语义目录的调整随删除 kind 一起放到 AR-S2，避免 AR-S1 期间旧的平铺档案混进笔记列表。

**验证**：vault-index 与 links 的单元测试；`dev-verify` 驱动应用，验证 AR-06、AR-10 的笔记部分。

## AR-S2 档案能力

**实施要点**：
1. 用 `grep` 子代理列出 archive kind、archives 插件、`archives.*` 能力的全部引用（brief 的“其他消费者”是起点），写进 `progress.md`。
2. 写 `contracts/src/archives.ts`（字段模板与 DTO 的 zod schema）。
3. 在 notes 引擎中实现 §5 的能力。
   - 字段校验从 `plugins/archives/src/engine/service.ts:98-108` 搬过来。
   - 重名检查与随机码复用 `sanitize`。
   - 移动与改名走 `moveEntry`。
   - 字段改名使用一个 OperationLog 操作。
4. 笔记回收站已经支持整个文件夹，并能带走和恢复 identities（顾问核对：`notes/engine/service.ts:296-339`）。本切片只为档案补测试（AR-12）。
5. 适配 inbox 引擎；调整 kernel 的权限、域映射与 event-log；删除 archives 插件、两个 kind 与 engine 注册。
6. 测试：
   - 新写 notes 的 archives 单元测试，覆盖 AR-02～AR-05、AR-07、AR-08、AR-13。
   - 更新 `plugins/inbox/test/service.test.ts:110-112`、`apps/engine/test/engine.test.ts:169-191`。
   - 重写 `tests/perf/scale-vault.ts:18-48`，改为直接写文件夹；检查 `tests/perf/index.bench.ts`。

**验证**：`audit` 跑 typecheck、lint、单元测试；AR-15 用引擎测试检查暴露表。

## AR-S3 档案视图

**实施要点**：
1. 按 spec §4 实现三个视图与“编辑字段”对话框。
   - 表格使用 DataTable（D-43）。
   - 字段表单使用现有表单控件。
   - 正文使用笔记编辑器。
2. 删除 `NoteInspector` 的相关档案区块；命令面板分组并改为打开档案视图；删除 desktop 中档案模块的注册与依赖。
3. 在 demo vault 中加入通讯录示例；更新 agent-guide 的说明文字。
4. 更新 e2e：
   - `shell.spec.ts:614-634`：改为在笔记模块中新建类型与档案，并断言 `Archives/<类型>/<名称>/index.md`。
   - `states.spec.ts:55`。
   - `perf.spec.ts:63-66,285`。
   - `workflows/acceptance.spec.ts:977-985`：linkNote 改为双链加反链。
   - 检查 `a11y.spec.ts`、`screenshots.spec.ts` 中经过档案模块的路径。

**验证**：AR-01～AR-17 用 `dev-verify` 在真实应用中操作并截图（浅色、深色），同时检查磁盘文件内容；`audit` 跑全部 e2e。

## 规格覆盖

| spec 章节 | 切片 |
| --- | --- |
| §1、§2 文件形态与命名 | AR-S2（能力），AR-S3（界面） |
| §3 文件夹笔记基础 | AR-S1 |
| §4 视图 | AR-S3 |
| §5 能力 | AR-S2 |
| §6 其他调整 | AR-S2（contracts、kernel、inbox 引擎、删除插件）、AR-S3（命令面板、inbox UI、demo、guide、desktop 注册） |
| §7 验收 | 见上表“验收”列 |

## 完成边界

三个切片合入后，用 `audit` 跑 lint、typecheck、单元测试和 e2e，再按 CLAUDE.md 请顾问复核，最后交付。
