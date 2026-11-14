# 规格：档案改为“文件夹笔记”形态

> 状态：已定稿（2026-11-13 经顾问复核）。决定与事实见 [brief.md](brief.md)，切片见 [plan.md](plan.md)。
> 约束：0→1，不兼容旧的平铺档案与 `Archive Types/`；删除的代码不留别名。

## 1. 术语

| 术语 | 含义 |
| --- | --- |
| 文件夹笔记 | 带有 `index.md` 的文件夹。打开这个文件夹即打开它的 `index.md`。这是对所有文件夹通用的规则，不限于档案 |
| 档案根 | Vault 顶层的 `Archives/` 文件夹 |
| 档案类型 | `Archives/` 的直接子文件夹，例如 `Archives/通讯录/`。它的 `index.md` 是字段模板，可以没有（没有就表示没有字段） |
| 档案 | 档案类型的直接子文件夹，例如 `Archives/通讯录/张三/`。它的 `index.md` 存放字段值与正文，可以没有（第一次保存字段时创建） |
| 档案文件 | 档案文件夹内的其他文件：普通笔记、附件、子文件夹 |

判定**只看路径**，不看 frontmatter 标记。用户或 Agent 直接新建文件夹，就等于新建类型或档案。

## 2. 文件形态

### 2.1 类型模板 `Archives/<类型>/index.md`

```markdown
---
icon: users
fields:
  - name: 电话
    type: text
  - name: 生日
    type: date
  - name: 主页
    type: url
  - name: 年龄
    type: number
---
类型说明（正文自由书写，可以为空）
```

- `icon`：lucide 图标名，默认 `folder`。
- `fields`：有序列表。
  - `name` 在类型内唯一，也就是档案 frontmatter 的键名。先去掉首尾空白并做 NFC 规范化，再判断重复。
  - `name` 不能为空，不能包含 `:`、`#` 或换行，也不能是保留键：`title`、`tags`、`aliases`、`__proto__`、`constructor`，以及任何以 `huhu` 开头的键。保留键会被笔记索引另作解释，例如 `title` 会覆盖显示名、`tags` 会进入标签索引。
  - `type` 取 `text`、`date`、`url`、`number`。
- 其他键原样保留，不解释。

### 2.2 档案 `Archives/<类型>/<名称>/index.md`

```markdown
---
电话: "13800000000"
生日: 1990-05-01
主页: https://example.com
年龄: 34
---
自由正文。关联写成双链：[[Archives/公司/某某科技/]]、[[项目/年度计划.md]]
```

- 字段值直接写在 frontmatter 顶层，键名等于模板中的 `name`。
- 校验规则沿用现有的 `validateFields`：空值跳过；`date` 必须是 `YYYY-MM-DD`；`url` 必须是 http(s)；`number` 必须能转成数字。
- **文本字段的 YAML 陷阱**：手写的 `电话: 0123` 会被 YAML 解析成数字 123。
  - 读取文本字段时取标量的原文（yaml v2 节点的 `source`），不取解析后的值。
  - 能力写入文本字段时一律加引号。
- **模板外的键**（例如模板删了某个字段，或用户手写的键）原样保留，在视图中列为“未定义字段”，可以逐个删除。
- 写入时用 `patchFrontmatter` 保留未知键与顺序（复用 R-T02）。
- **不合法的值**：
  - 经能力写入时会被拒绝。
  - 直接改文件写入的不合法值仍会被读出，视图中标红并提示原因。这一点和任务 change 一样：文件系统不是校验边界。

### 2.3 名称与随机码

- **档案名**等于文件夹名。新建或改名时先用现有的 `sanitize` 规则清理名称（替换非法字符，最长 80 字）。需要加随机码时，先把名称截到 75 字，再追加 `-xxxx`，然后重新判断是否重名。
- 同一类型下已有同名文件夹时（按大小写不敏感比较，以兼顾 Windows 与 macOS），在名称后追加 `-` 加 4 位 `[a-z0-9]` 随机码，例如 `张三-k3f9`。生成后随机码就是文件夹名的一部分，以后不会再变。
- 改名时按新名重新检查：新名不冲突就不加随机码。
- 界面显示完整的文件夹名，不尝试去掉随机码。
- 类型名采用同样的规则，在 `Archives/` 下检查重名。

### 2.4 标识

- 档案、类型都以 **Vault 相对路径**为主标识，例如 `Archives/通讯录/张三/`，文件夹路径以 `/` 结尾。
- DTO 另外返回 `noteId`：index.md 在笔记模块 `identities.json` 中的 id，移动后不变，供审计和 MCP 使用。
  - 笔记 id 是按需分配的（`ensureId`，`notes/engine/service.ts:60-68`）。`archives.create`、`archives.types.save`（新建时）以及任何写入 index.md 的能力都会调用 `ensureId`。
  - `list` / `read` 不分配 id，没有就返回 `null`，例如还没有 index.md 的档案，或用户手工创建、尚未经能力写过的档案。

## 3. 文件夹笔记基础规则（通用）

1. **标题**：文件名是 `index.md`（不区分大小写）且没有 frontmatter `title` 时，标题取所在文件夹名（不取 H1）。Vault 根目录下的 `index.md` 不适用这条规则，沿用原有规则。
   - 修改 `vault-index.ts:143` 的标题规则。
   - 搜索结果、命令面板、反链列表、标签页标题都会因此显示文件夹名。
2. **链接解析**：`[[目录/]]` 在 `目录/index.md` 存在时，解析为这个 index.md：
   - 用于预览中的已知判定（`NoteDocument.tsx:301`）；
   - 用于点击打开（`openWiki`）；
   - 用于反链统计（`vault-index` 的 backlinks）。
   - **index.md 不参与裸名匹配**：现在的反链按文件名匹配（`vault-index.ts:221-224`），`[[index]]` 会被算成每一个文件夹笔记的反链。改为只认 `[[目录/]]`、`[[目录]]` 和完整路径 `[[目录/index.md]]` 三种写法。
   - 不存在 index.md 时，沿用 T03 的行为：在文件树中定位该文件夹。
3. **文件树**：带 index.md 的文件夹，点击名称时打开该文件夹笔记，点击箭头时展开或折叠；文件夹图标加一个小标记。展开后的子项中仍然列出 index.md，方便直接操作文件。不带 index.md 的文件夹，行为不变。
4. **改写**：文件夹改名或移动时，`[[旧/]]` 与 `[[旧/…]]` 的改写由 T03 负责；本 change 不另写改写逻辑。
5. **语义目录**：`Archives/` 与 `Archive Types/` 不再是语义目录。`Archives/` 下的所有 md 文件都是普通笔记，参与笔记列表、索引、标签、反链与改名改写。`SEMANTIC_DIRS` 由 KINDS 推导（`notes/engine/service.ts:26`），所以删除两个 kind 后会自动生效，这件事在 AR-S2 中完成。
6. **空文件夹**：索引快照只收集文件（`snapshot.ts:37-52`），目录监听也不报告目录事件。所以类型与档案的枚举**不依赖索引**，而是由档案能力直接读取 `Archives/` 下两层目录。档案首页与类型视图在打开、重新聚焦窗口、执行任何档案写操作后都会重新读取；视图里也有“刷新”按钮。

## 4. 档案在笔记模块中的视图

删除独立的档案模块：左侧图标栏不再有“档案”。档案的入口是笔记模块文件树中的 `Archives/`，以及命令面板。

| 打开的对象 | 视图 | 内容 |
| --- | --- | --- |
| `Archives/` | **档案首页** | 类型卡片（图标、名称、档案数）、“新建类型”。`Archives/` 不存在时显示空状态，并提供“新建第一个类型” |
| `Archives/<类型>/` | **类型视图** | 头部：图标、类型名、档案数。工具栏：搜索、“新建档案”、“编辑字段”、更多（改名、删除类型）。主体是 DataTable：第一列为名称，其余列为模板字段，最后一列为更新时间；点击行打开档案视图。类型说明（index.md 正文）折叠显示在表格上方 |
| `Archives/<类型>/<名称>/` 或其 `index.md` | **档案视图** | 字段表单（按模板逐行显示，可以就地编辑，失焦后保存；不合法的值标红）；未定义字段（可以删除）；正文（普通笔记编辑器，编辑 index.md 的正文）；档案文件（列出文件夹内的笔记、附件和子文件夹，提供“新建笔记”“添加附件”）；链接到（index.md 正文中的出链）；被链接（指向该文件夹或其中任意文件的反链）。更多：改名、移到其他类型、删除 |
| 档案文件夹内的其他笔记 | 普通笔记视图 | 面包屑显示所属档案，可以点击回到档案视图 |

- **编辑字段**对话框：逐行编辑名称与类型（类型用下拉框显式选择，修复现在“按标签推断类型”的缺陷）；支持拖动排序、新增、删除；可以修改图标。
- **删除类型 / 删除档案**：整个文件夹进入笔记回收站（复用笔记模块的回收站），确认框中写明会一并删除的文件数量。
- **移到其他类型**：移动文件夹，并按新模板重新判定未定义字段。值不变，不做字段映射。
- **反链与关联**：NoteInspector 中的“相关档案”区块（`NoteInspector.tsx:124-157`）删除，由档案视图中的“被链接”以及笔记已有的反链功能替代。
- “被链接”列出档案文件夹**外部**指向该文件夹或其中文件的链接；档案文件夹内部文件之间的互相链接不计入。

## 5. 能力

能力由 **notes 插件**注册，保留 `archives.*` 命名空间与 `archives.read`、`archives.write` 两个权限组（`kernel/permissions.ts:12-13` 中的归属插件改为 notes）。删除 archives 插件。

| 能力 | 入参 → 返回 | 说明 | 对外 |
| --- | --- | --- | --- |
| `archives.types.list` | `{}` → `TypeDto[]` | `TypeDto = {path, name, icon, fields, count, noteId}` | 否（仅内置） |
| `archives.types.save` | `{path?, name, icon?, fields, renames?: {from, to}[]}` → `TypeDto` | 不传 path 时新建（处理重名）；传 path 时更新模板。**字段改名**由 `renames` 显式声明，不靠前后列表比对来猜：同一次调用中，把该类型下所有档案的 `from` 键改为 `to` 键，在一个 OperationLog 操作中完成，失败整体回滚。以下情况整体拒绝并列出相关文件：某个档案中目标键已经存在；某个档案的 frontmatter 无法解析（`patchFrontmatter` 会抛错，`frontmatter.ts:69`）。**类型改名**：经 notes 的移动逻辑移动文件夹，双链随之改写 | 否（仅内置） |
| `archives.types.delete` | `{path}` → `{trashed: number}` | 整个文件夹进入回收站 | 否 |
| `archives.list` | `{type?, query?}` → `ArchiveDto[]` | `ArchiveDto = {path, name, type, fields, undefinedFields, invalidFields, noteId, updatedAt}`。query 对名称、字段值和正文做子串匹配 | 是（archives.read） |
| `archives.read` | `{path}` → `ArchiveDetailDto` | 在 ArchiveDto 上增加 `body`、`files[]`、`outgoing[]`、`backlinks[]`、`version` | 是（archives.read） |
| `archives.create` | `{type, name, fields?, body?}` → `ArchiveDto` | 处理重名，校验字段，创建文件夹与 index.md | 是（archives.write） |
| `archives.update` | `{path, expectedVersion, fields?, body?, name?, removeKeys?}` → `ArchiveDto` | 条件写 index.md；`fields` 与已有值合并；`removeKeys` 删除未定义字段；`name` 变化时移动文件夹 | 是（archives.write） |
| `archives.move` | `{path, type}` → `ArchiveDto` | 取代 `changeType`：移动到另一个类型文件夹，并处理重名 | 是（archives.write） |
| `archives.delete` | `{path}` → `{trashed: number}` | 整个文件夹进入回收站 | 是（archives.write） |

- 删除 `archives.changeType`、`archives.setRelations`、`archives.linkNote`、`archives.unlinkNote`。
- **对外暴露**：表中“是”的能力 `exposable: true`、`defaultExposed` 沿用现有取值（`plugins/archives/src/engine/index.ts`）；`archives.types.*` 为 `exposable: false`。
- **注册与权限的具体改动**：
  - 能力定义的 `plugin` 字段为 `"notes"`（`kernel/context.ts:99` 会校验）。
  - notes 清单的 `capabilities` 加上 `archives.*`。
  - `kernel/permissions.ts:7-18` 的权限组映射：`archives.write` 加入 `archives.move`，删除 4 个旧能力。
- 所有写操作发出 `entity.changed {kind: "archive", id: path, path, noteId, op}`；`id` 取 path，因此 `event-log.ts:103` 与 `boot.ts:346` 的 `titleOf` 对档案改为取文件夹名（原先走语义仓库，删掉 kind 后会拿不到标题）。
- **查询失效**（`query.ts`）：
  - `entity.changed` 的 archive 事件，失效 `archives.` 与 `notes.` 查询。
  - `vault.fileChanged`（`:23`）与 note 事件，**同样失效 `archives.` 查询**。否则在笔记编辑器或磁盘上直接修改 index.md 后，档案视图仍会显示旧内容。
- 移动与改名都复用 notes 现有的 `moveEntry`（双链改写和笔记 id 迁移都在这里完成），不另写移动逻辑。`moveEntry` 遇到重名会抛 `nameConflict`，所以随机码由档案层先算好，再调用它。
- `archives.update` 同时传了字段和 `name` 时：先条件写 index.md，再移动文件夹。移动失败时，字段的修改保留，返回错误说明改名没有成功。

## 6. 其他调整

| 位置 | 调整 |
| --- | --- |
| `packages/contracts/src/kinds/archive.ts`、`kinds/index.ts:32-33`、`common.ts:3` 的 `KIND_NAMES`、`ids.ts:3` 的前缀 | 删除 `archive`、`archive-type`；新增 `contracts/src/archives.ts`，定义字段模板与 DTO 的 zod schema |
| `vault/semantic/repository.ts:34-35` 的 ID 前缀 | 删除对应项 |
| `kernel/capabilities/vault.ts:12` 的目录到域映射、`StoragePage.tsx:28`、`NotificationBell.tsx:21`、`event-log.ts:86,101` | 档案的域改为按路径前缀 `Archives/` 判定，显示名仍为“档案” |
| `vault.search` 的 kind 过滤（`vault.ts:144-151`） | `Archives/` 下的文件 kind 为 `note`，另加 `archive: true` 标记，供命令面板分组 |
| 命令面板（`CommandPalette.tsx:25,102`、`main.tsx:257`） | 档案结果打开笔记模块中对应的档案视图 |
| inbox 的“转为档案” | 改为调用新的 `archives.create({type: 类型路径, name, fields})`；类型列表改用 `archives.types.list`。<br>收件箱的转换结果 `{kind: "archive", id}`（`contracts/kinds/capture.ts:12`、`inbox/src/engine/index.ts:19`）中，`id` 改为档案的 path。<br>`TARGET_PLUGIN.archive`（`inbox/src/engine/index.ts:22`）改为 `"notes"`。<br>`inbox/huhu-plugin.json:8` 的 `optionalDeps` 删除 archives |
| `plugins/archives/` 整个目录；engine 注册（`apps/engine/src/boot.ts:36,47,172-173`、`apps/engine/package.json`）；desktop 注册（`main.tsx:8,71`、`apps/desktop/package.json:18`、`electron.vite.config.ts:18`） | 删除（全部在 AR-S2 中完成，避免中间状态构建失败） |
| 文案：`StoragePage.tsx:31,153,259`、`LaunchPage.tsx:74` 中提到档案或 Archive Types 的地方 | 按新形态修改 |
| demo vault（`apps/desktop/resources/demo-vault`） | 新增 `Archives/通讯录/`：模板含电话、生日、主页三个字段，另有 2 个档案；其中一个档案的文件夹内有一篇笔记，并且被 demo 中的一篇普通笔记双链引用 |
| agent-guide 的说明文字（`guide-files.ts:28`） | 改为描述“档案是 `Archives/<类型>/<名称>/` 下的文件夹笔记”，并说明 Agent 可以直接读写文件 |

## 7. 验收

| 编号 | 动作 → 可观察结果 |
| --- | --- |
| AR-01 | 在笔记模块打开 `Archives/` → 显示档案首页；“新建类型”输入“通讯录”，添加电话（文本）、生日（日期）、主页（链接）三个字段 → 磁盘上出现 `Archives/通讯录/index.md`，frontmatter 与 §2.1 一致 |
| AR-02 | 在类型视图中新建档案“张三”并填写字段 → 出现 `Archives/通讯录/张三/index.md`，frontmatter 键名为字段名；再新建一个“张三” → 文件夹名为 `张三-xxxx`（4 位随机码）；重启后名称不变 |
| AR-03 | 生日填 `1990/5/1` → 能力拒绝写入并提示格式；直接用编辑器把文件改成同样的值 → 档案视图中该字段标红，提示“日期格式应为 YYYY-MM-DD” |
| AR-04 | 编辑字段：把“电话”改名为“手机” → 该类型下所有档案的键同步改名，其他键的值与顺序不变；中途模拟写入失败 → 所有文件保持原样 |
| AR-05 | 从模板中删除“主页” → 已有档案中的主页值仍在磁盘上，档案视图中列为“未定义字段”；点击删除后，键从文件中移除 |
| AR-06 | 在笔记 `项目/年度计划.md` 中写 `[[Archives/通讯录/张三/]]` → 预览中可以点击，打开张三的档案视图；张三的“被链接”中出现这篇笔记 |
| AR-07 | 把档案“张三”改名为“张三丰” → 文件夹移动；AR-06 中的双链改写为 `[[Archives/通讯录/张三丰/]]`；`noteId` 不变 |
| AR-08 | 把张三移到“同事”类型 → 文件夹移到 `Archives/同事/`；按新模板重新判定未定义字段；双链被改写 |
| AR-09 | 在张三的档案视图中“新建笔记”和“添加附件（pdf）” → 两者都出现在档案文件列表中；新笔记在笔记列表与搜索中可见；面包屑能回到档案视图 |
| AR-10 | 搜索结果、命令面板、标签页中，`Archives/通讯录/张三/index.md` 显示为“张三”而不是“index”；命令面板中档案单独分组 |
| AR-11 | 在收件箱把一条记录转为“通讯录”档案 → 生成对应的档案文件夹 |
| AR-12 | 删除档案 → 整个文件夹进入回收站，确认框显示文件数量；从回收站恢复后，链接与 `noteId` 恢复 |
| AR-13 | 在命令行 `mkdir -p Archives/书籍/三体` 后，回到应用窗口（重新聚焦）或点击“刷新” → 档案首页出现“书籍”类型（没有字段），类型视图中有“三体”，`noteId` 为 null |
| AR-18 | 有一篇笔记写了 `[[index]]` → 它不会出现在任何档案的“被链接”中；档案文件夹内部文件之间的链接也不会出现 |
| AR-19 | 在模板中添加文本字段“电话”后，手工把 index.md 改成 `电话: 0123` → 档案视图显示 `0123`，而不是 `123` |
| AR-20 | 字段改名时，如果某个档案中已经有目标键，或者某个档案的 frontmatter 无法解析 → 整体拒绝，列出这些文件，所有文件保持原样 |
| AR-14 | 删除检查：`git grep -nE 'archive-type|relatedIds|noteIds|linkNote|setRelations|changeType|Archive Types' -- ':!.agents/'` → 0 处；`plugins/archives` 不存在；左侧图标栏没有“档案” |
| AR-15 | 外部（MCP）可以调用 `archives.list`、`archives.read`、`archives.create`、`archives.update`、`archives.move`、`archives.delete`，不能调用 `archives.types.*` |
| AR-16 | 随包的 demo vault 打开后能看到“通讯录”示例，AR-06 那样的双链和反链可以正常使用 |
| AR-17 | 重写或更新相关测试后，全部 e2e 与单元测试通过（见 plan 的测试清单） |

## 8. 已作出的取舍

| 编号 | 决定 | 理由 |
| --- | --- | --- |
| AR-D1 | 判定档案只看路径，不在 frontmatter 中加 kind 标记 | 用户和 Agent 直接建文件夹就能用；文件仍是普通笔记，不会因为标记被笔记索引排除 |
| AR-D2 | 字段键名用字段名本身，不用内部 id | md 文件可读、可以手写；代价是字段改名需要批量改写同类档案（AR-04 用一次原子操作覆盖） |
| AR-D3 | 能力由 notes 插件提供，沿用 `archives.*` 名称与权限组 | 档案已经是笔记的一种；沿用名称后，外部调用方与权限配置的概念不变 |
| AR-D4 | 文件夹笔记是通用规则，而不是档案专用 | 改动集中在索引与文件树这一处；任何文件夹都能有 index.md，档案只是在它上面加了字段视图 |
| AR-D5 | 删除走笔记回收站 | 复用现有的恢复路径；文件夹里可能有附件，不能直接删除 |
