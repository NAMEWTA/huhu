# 需求简报：档案改为“文件夹笔记”形态

> 状态：需求已澄清（2026-11-13 两轮 dev-grill），规格见 [spec.md](spec.md)，切片见 [plan.md](plan.md)。

## 用户目标（2026-11-13 原话整理）

- 档案本质上就是 Markdown 文档，是笔记模块里一种特殊的笔记类型，而不是独立的数据实体。
- 目录形态：

  ```text
  Archives/
    通讯录/                 ← 档案类型
      index.md              ← 类型的字段模板
      姓名A/                ← 一个档案 = 一个文件夹（文件夹名就是档案名）
        index.md            ← 该档案的字段内容
        xxx.md              ← 属于该档案的笔记
        fff.pdf             ← 属于该档案的附件
      姓名B/
  ```

- 档案可以通过双链关联其他笔记，也可以在自己的文件夹里新建属于它的文件。
- 只有重名时，才在文件夹名后面追加 4 位随机码避免冲突。随机码生成后就是文件夹名的一部分，持久保留。
- 引用档案和引用其他文件一样，都用路径（如 `[[Archives/通讯录/姓名A/]]`）。

## 已作出的决定

| 问题 | 决定 | 来源 |
| --- | --- | --- |
| 档案类型怎么表达 | 类型 = `Archives/<类型>/` 文件夹；字段模板写在该文件夹 `index.md` 的 frontmatter 中。删除 `Archive Types/` 目录与 `archive-type` kind | 用户 2026-11-13（选推荐项） |
| 档案之间、档案与笔记之间的关联 | 全部改为正文中的 `[[路径]]` 双链，档案视图显示“链接到 / 被链接”。删除 `relatedIds`、`noteIds` 及相关能力 | 用户 2026-11-13（选推荐项） |
| 档案界面放在哪里 | **并入笔记模块**。删除独立的档案模块和 archives 插件；笔记模块打开类型或档案文件夹时，显示类型视图或档案视图 | 用户 2026-11-13 |
| 字段放在哪里 | index.md 的 frontmatter，**键名就是字段名**（如 `电话: "138…"`），用户和 Agent 都能直接读写 | 主会话决定（用户“档案就是 md 文档”的自然推论） |
| 稳定 id | 不再单独生成档案 id。档案以路径为准；API 额外返回 index.md 的笔记 id（笔记模块现有的 `identities.json`，移动后不变），供审计和 MCP 使用 | 主会话决定 |
| 随机码与改名 | 只在新建或改名时检查重名，重名才追加 `-` 加 4 位 `[a-z0-9]`；之后它就是文件夹名的一部分。改名时按新名重新检查 | 主会话决定（用户：随机码持久化） |
| 档案文件夹内的笔记 | 都是普通笔记，参与笔记索引、搜索、双链、反链和改名改写 | 主会话决定（用户：档案是笔记的一种） |
| 现有平铺档案与 `Archive Types/` | 不迁移、不兼容（项目 0→1 约束，用户 2026-11-13 再次确认“无需任何兼容”） | 用户 |

## 当前事实（HEAD `8283c5c`，2026-11-13 由只读子代理核对）

- **契约**：
  - `packages/contracts/src/kinds/archive.ts`：字段 `{id, label, type: text|date|url|number}`；archive 的 frontmatter 为 `name`、`type`、`fields`、`relatedIds`、`noteIds`、`updatedAt`。
  - `kinds/index.ts:32-33`：目录 `Archive Types`、`Archives`。
  - 文件名 `<name>--<id>.md`（`vault/semantic/filename.ts:19-21`）。
- **仓储**：`vault/semantic/repository.ts:55-99` 的 `scanKind` 只读顶层 `.md`，这是平铺形态的根源。
- **引擎**（`plugins/archives/src/engine/`）：
  - 能力：list、read、create、update、delete、changeType、setRelations、linkNote、unlinkNote，以及 `types.list/save/delete`（types 为 `exposable: false`）。
  - 字段校验 `validateFields` 在 `service.ts:98-108`。
  - `relatedIds` 靠双写维护；`noteIds` 没有反向查询。
- **界面**：`ArchivesModule.tsx` 是独立模块。
  - 关联笔记只显示标题，不能点击打开。
  - 关联任务按 `tasks.resources` 的路径匹配（任务 change 已删除 `resources`）。
  - 类型对话框根据标签用正则推断字段类型，界面上建不出 url、number 字段（缺陷）。
- **索引**：
  - 带 `huhu.kind` 的文件不进入笔记映射，不参与反链和标签（`vault-index.ts:147`）。
  - notes 的 `isNoteFile` 排除所有语义目录（`notes/engine/service.ts:26-28`），所以 `Archives/` 下的双链不会被改写。
  - 标题取 frontmatter `title`，否则取 H1，再否则取文件名（`vault-index.ts:143`），因此 `index.md` 会显示为 “index”。
- **双链与文件夹**：
  - `[[文件夹/]]` 目前无法解析（`links-rewrite.ts:63-68`、`NoteDocument.tsx:301-304`）。
  - 笔记模块没有“文件夹笔记”的概念，点击文件夹只展开或折叠。
  - [任务 change 的 T03](../feature_2026-11-13-task-issue-automation/tasks/T03-references-editor.md) 会加入文件夹引用的插入、文件夹前缀改写，以及在文件树中定位文件夹。
- **附件**：`FileCard` 能内联显示图片，可以只读查看文本；PDF 只显示元信息，在桌面端可以用系统应用打开。`[[a.pdf]]` 不解析。
- **其他消费者**：
  - inbox 的“转为档案”（`inbox/src/engine/index.ts:19-22,87`、`InboxModule.tsx:42,247,462`）。
  - `NoteInspector.tsx:124-157` 的“相关档案”。
  - 命令面板 `kind: "archive"`（`CommandPalette.tsx:25,102`、`main.tsx:257`）。
  - `kernel/permissions.ts:12-13`（archives.read / write 权限组）。
  - `kernel/capabilities/vault.ts:12`、`event-log.ts:86,101`、`StoragePage.tsx:28`、`NotificationBell.tsx:21`、`query.ts:10-11`。
  - 桌面端注册（`main.tsx:8,71`、`apps/desktop/package.json:18`、`electron.vite.config.ts:18`）与引擎注册（`apps/engine/src/boot.ts:36,47,172-173`）。
- **测试**：
  - 单元测试：`plugins/archives/test/service.test.ts`、`plugins/inbox/test/service.test.ts:110-112`、`apps/engine/test/engine.test.ts:169-191`。
  - e2e：`tests/e2e/shell.spec.ts:614-634`、`states.spec.ts:55`、`perf.spec.ts:63-66,285`、`workflows/acceptance.spec.ts:977-985`。
  - 性能脚本：`tests/perf/scale-vault.ts:18-48`。
- **种子数据**：没有内置类型；随包的 demo vault 中没有档案。

## 范围与非目标

**范围**

- “文件夹笔记”基础规则：`index.md` 的标题、文件夹链接的解析与反链、文件树中打开文件夹笔记。
- 在 notes 插件中重建档案的类型、字段、读写能力与视图。
- 删除 archives 插件与两个 kind。
- 适配 inbox 的转换、命令面板、权限和审计。
- 在 demo vault 中加入一个“通讯录”示例。

**非目标**

- 必填字段、字段默认值、选项型字段：现在没有，本期也不加。
- `[[附件.pdf]]` 的解析与内嵌预览。
- 跨类型的统一档案表格。
- 旧数据迁移。

## 依赖

- 任务 change 的 [T03](../feature_2026-11-13-task-issue-automation/tasks/T03-references-editor.md)：文件夹引用插入、`[[旧/]]` 前缀改写、`openWiki` 处理文件夹。本 change 在它的基础上加入“文件夹有 `index.md` 时，打开并解析为文件夹笔记”。
- [设计系统重构](../feature_2026-11-13-brand-and-windows-installer/design-system.md)：档案视图的样式遵循新的 token 与目录规则。两边哪个后合入，由后合入的一方适配。
