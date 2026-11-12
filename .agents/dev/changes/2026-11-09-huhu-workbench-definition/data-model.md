# 数据模型与持久化

本文件是 Vault 目录结构、文件格式、身份、版本与恢复规则的唯一权威定义。接口里的 DTO 由 `packages/contracts` 中的 zod 模式实现，字段名必须与本文件一致。

## 1. 数据分类

| 类别 | 例子 | 位置 | 真相来源 | 可删除 |
| --- | --- | --- | --- | --- |
| 用户内容 | 笔记、附件 | Vault 任意目录 | 文件本身 | 否 |
| 语义内容 | Task、档案、档案类型、捕获、自动化规则、运行结果、批注 | Vault 内固定目录的 `.md` | 文件本身 | 否 |
| 配置 | 设置、插件启停、网关、Space、SSH 主机、脚本配置 | `.huhu/*.json`、`.huhu/<plugin>/` | 文件本身 | 否 |
| 秘密 | 保险箱条目值 | `.huhu/safe/sealed/` 密文 | 密文 + 用户主密码 | 否 |
| 可靠性材料 | 操作日志与备份、草稿、回收站、运行处理记录、提醒投递记录 | `.huhu/operations/`、`.huhu/drafts/`、`.huhu/trash/`、`.huhu/automations/` | 文件本身 | 否 |
| 历史 | 文件历史 shadow 仓库 | `.huhu/history/git/` | Git 对象 | 否（可在设置中显式清理） |
| 机器运行态 | Engine 端点、锁、日志、Herdr 状态、worker 输出 | `.huhu/runtime/<machineId>/` | 运行时 | 应用未运行时可删，但会丢失可恢复的会话 |
| 缓存 | 缩略图、可重建数据 | `.huhu/cache/` | 无 | 是 |
| 界面状态 | 打开的标签、面板宽度、选中项 | `.huhu/ui/state.json` | 无 | 是 |

内存索引（列表、计数、全文检索）每次启动从文件重建，不落盘。删除 `.huhu/cache/` 与 `.huhu/ui/` 不得改变任何业务数据。

## 2. Vault 目录

```text
<Vault>/
  <用户笔记与附件，任意目录>
  日记/YYYY-MM-DD · 每日笔记.md
  Tasks/<标题>--<id>.md
  Task Runs/<任务标题>--<runId>.md
  Automations/<名称>--<id>.md
  Automation Runs/<名称>--<runId>.md
  Archives/<名称>--<id>.md
  Archive Types/<名称>--<id>.md
  Inbox/<标题>--<id>.md
  Comments/<文档名>--<threadId>.md
  .agents/skills/huhu/SKILL.md
  .agents/skills/huhu/references/cli.md
  .agents/skills/huhu/references/mcp.md
  .huhu/
    vault.json              Vault 身份
    settings.json           当前 Vault 偏好（外观、编辑器、日期时间、快捷键、自动保存）
    plugins.json            插件启停、外部插件登记、能力开放偏好
    gateways.json           MCP / CLI / HTTP 服务配置（不含令牌明文）
    notes/identities.json   笔记 id ↔ 路径
    notes/favorites.json    星标笔记 id 列表
    notes/folders.json      空文件夹登记
    home/widgets.json       首页卡片与顺序
    home/focus.json         专注计时状态
    home/habits.json        习惯与当日勾选
    notifications.ndjson    站内通知（最近 1000 条）
    diagnostics/events.ndjson 事件日志（最近 5000 条）
    drafts/<noteId>.json    手动保存模式下的草稿
    trash/<trashId>/        回收站：原文件 + meta.json
    operations/<opId>.json  多文件操作日志；operations/backups/<opId>/ 备份
    agent-cli/spaces/<spaceId>.json
    agent-cli/sessions/<sessionId>.json  交互会话记录（终端 id、provider、状态、审查意见）
    agent-cli/providers.json  每台机器的 CLI 偏好（模型、effort、Fast 默认）
    agent-cli/pins.json     历史固定项
    automations/scripts.json  预配置脚本
    automations/claims/<processingKey>.json 处理记录
    automations/holds.json    恢复后暂停扫描的 Task 输入
    automations/activations/YYYY-MM.ndjson 每次激活摘要
    ssh/hosts/<hostId>.json
    ssh/known_hosts         HUHU 信任的主机密钥（OpenSSH known_hosts 格式）
    ssh/audit/YYYY-MM.ndjson
    safe/keyring.json       密钥派生参数与封装后的数据密钥
    safe/items/<itemId>.json 条目元数据（名称、类型、账户、允许模块）
    safe/sealed/<itemId>.bin 条目值密文
    safe/audit/YYYY-MM.ndjson
    sync/config.json        Git 远端与同步模式（不含凭据）
    history/git/            文件历史 shadow 仓库
    plugins/external/<id>/<version>/  外部插件包
    plugins/data/<id>/      插件私有数据
    guide/state.json        指南维护基线与 hold
    guide/backups/<ts>/     指南替换前备份
    ui/state.json           界面状态（可删）
    cache/                  可删缓存
    runtime/<machineId>/    engine.json、writer.lock、logs/、herdr/、runs/<runId>/
```

- 语义目录名固定（中文用户笔记目录不受影响）。文件名为 `<标题去除非法字符，最长 60 字>--<id>.md`；标题变化时在同一操作内重命名文件。身份只看 frontmatter 的 `huhu.id`，不看路径或标题。
- `machineId = sha256(os.hostname() + os.userInfo().username + process.platform)` 的前 12 个十六进制字符。
- 扫描与文件树忽略：`.git/`、`node_modules/`、`.huhu/`、`.agents/`（文件树中可通过“显示隐藏文件”查看 `.agents/`）、操作系统垃圾文件（`.DS_Store`、`Thumbs.db`）。单个文本文件超过 10 MiB 不进入全文索引，只显示元数据。

## 3. 身份与版本

| 概念 | 定义 | 用途 |
| --- | --- | --- |
| `vaultId` | `vault.json.id`，`vault-` + 随机 ID | 隔离多 Vault，所有查询键与事件携带 |
| 实体 id | `<前缀>-<base36 时间戳><4 位随机>`；前缀：`note`、`task`、`run`、`rule`、`arun`、`archive`、`atype`、`cap`、`cmt`、`space`、`host`、`item`、`script` | 跨重命名稳定引用 |
| `version` | 文件当前字节的 SHA-256 前 16 位 | 写入时的 `expectedVersion`；外部编辑也会改变它 |
| `inputRevision` | Task 的整数计数器，由 HUHU 在标题/正文/资源/执行目标变化及“重新打开 Agent 任务”时加 1 | 自动化去重 |
| `inputHash` | `sha256(title + body + canonical(resources) + canonical(execution))` 前 16 位 | 识别外部编辑造成的输入变化 |
| `processingKey` | `<taskId>:<inputRevision>:<inputHash>` | 同一输入只处理一次 |

普通笔记不写入 HUHU frontmatter：`note` id 记录在 `.huhu/notes/identities.json`。HUHU 内部的重命名与移动同步更新该文件；外部重命名由文件监听配对：索引为每个文件记录 `dev:ino`（复制 OK `core/src/filesystem-identity.ts` 的 `filesystemIdentity`），新增文件的 `dev:ino` 与刚消失的文件相同即视为重命名并保留原 id；文件系统不提供稳定 inode 时，退回到 2 秒窗口内“删除 + 新增且内容哈希相同”。无法唯一配对时按新文件处理，旧 id 的引用显示为失效。

## 4. 语义 Markdown 通用规则

所有语义文件以 YAML frontmatter 开头，顶层必须有：

```yaml
huhu:
  kind: task          # 见下表
  id: task-m3x8k2a1q9
  schema: 1
```

- 编解码统一在 `packages/vault/src/semantic/`：读取用 `yaml` 的 `parseDocument` 保留 CST；写入只修改变化的键（复制 OK `core/src/frontmatter/yaml-codec.ts` 的局部改写方式），未知键、注释、键顺序、正文、换行符（LF/CRLF）、BOM 原样保留。
- 每个 kind 在 `packages/contracts/src/kinds/<kind>.ts` 定义 zod 模式；`schema` 大于当前支持版本的文件只读显示并提示“由更新版本的 HUHU 创建”。
- 解析失败（坏 YAML、缺 `huhu.id`、类型不符）：文件保持原样，进入健康中心“文件问题”列表并在文件树显示警告标记；该文件不参与业务查询与自动化。
- 两个文件声明相同 `huhu.id`：两者都标记为冲突，不参与业务查询，健康中心提供“为其中一个生成新 id”的修复动作。
- 用户可以在任何编辑器中修改这些文件；Engine 通过文件监听重新解析。外部修改只被视为内容变化，不能伪造运行记录或投递回执。

### kind 一览

| kind | 目录 | 所属插件 | 正文含义 |
| --- | --- | --- | --- |
| `task` | `Tasks/` | tasks | 任务需求（Markdown） |
| `task-run` | `Task Runs/` | automations | Agent 处理结果与问答 |
| `automation-rule` | `Automations/` | automations | 规则说明；`agent_prompt` 动作的提示词 |
| `automation-run` | `Automation Runs/` | automations | 非扫描动作的结果 |
| `archive-type` | `Archive Types/` | archives | 用途说明 |
| `archive` | `Archives/` | archives | 简介 |
| `capture` | `Inbox/` | inbox | 捕获原文 |
| `comment` | `Comments/` | notes | 批注线程消息 |

## 5. 各 kind 字段

### task

```yaml
huhu: { kind: task, id: task-..., schema: 1 }
title: 整理研究摘要            # 必填，1–200 字
completed: false             # 唯一完成事实
completedAt: null            # completed 变为 true 时写入 ISO 时间；变回 false 时清空
due: 2026-11-12              # DateOnly（YYYY-MM-DD）或 null
project: HUHU                # 可选项目标签（自由文本）
execution:
  kind: agent                # manual | agent
  spaceId: space-...         # agent 必填（允许保存缺失，扫描时跳过并说明原因）
  provider: codex            # agent 必填：claude | codex（以检测到的 provider id 为准）
  model: gpt-5.5             # 可选
  effort: medium             # 可选，取值来自 provider 模型能力
  fast: false                # 可选，仅 provider/model 支持时有效
resources:
  - kind: folder             # file | folder | root
    path: Research           # Vault 相对 POSIX 路径；root 时为 "."
    id: null                 # file 指向笔记时填 note id
reminders:
  - id: rem-...
    channel: in_app          # 首版唯一可用渠道
    at: 2026-11-12T09:00:00+08:00
    enabled: true
    deliveredAt: null
inputRevision: 1
createdAt: 2026-11-10T07:15:31Z
updatedAt: 2026-11-10T07:15:31Z
```

不允许出现优先级、进度状态、派发时间等字段；运行状态只在 `task-run`。

### task-run

```yaml
huhu: { kind: task-run, id: run-..., schema: 1 }
taskId: task-...
ruleId: rule-...
processingKey: task-...:1:9f2c...
attempt: 1
state: succeeded             # queued | running | waiting_input | succeeded | failed | cancelled | unknown
provider: codex
model: gpt-5.5
spaceId: space-...
cwd: /home/me/projects/research   # 冻结的 Space 根
machineId: 3fa9c1d2e0b4
nativeSessionId: 0199c...    # provider 返回的会话 id
startedAt: ...
finishedAt: ...
exitCode: 0
questions:
  - id: q-1
    text: 是否覆盖已有摘要文件？
    options: [覆盖, 另存]
    answer: null
    answeredAt: null
```

正文：`## 结果` 下为 Agent 最终消息（来自 AA `worker/contract.ts` 的 `readMessage`），`## 通知` 下为回执中的 notice。正文由 automations 写入，用户可编辑但编辑不影响状态。

### automation-rule

```yaml
huhu: { kind: automation-rule, id: rule-..., schema: 1 }
title: 定时检查 Agent 任务
enabled: true
builtin: true                # 内置默认规则：可暂停、改时间，不可删除
trigger:
  preset: every5             # 与 Orca 预设对应；custom 时由 cron 决定
  cron: "*/5 * * * *"
  zone: Asia/Taipei
missedRunGraceMinutes: 30    # 应用关闭期间错过的激活，仅在宽限内补一次最近一次
action:
  kind: scan_agent_tasks     # scan_agent_tasks | agent_prompt | script | notify
  maxConcurrent: 1           # 仅 scan：同时运行的 Agent 处理数，1–4
  # agent_prompt: spaceId, provider, model?, effort?, fast?（提示词在正文）
  # script: scriptId, args: [字符串]
  # notify: channel: in_app, text
createdAt: ...
updatedAt: ...
```

新建规则默认 `enabled: false`。

### automation-run

非扫描动作每次实际执行产生一份：`ruleId`、`actionKind`、`trigger`（schedule | manual）、`scheduledFor`、`state`（同 task-run）、`startedAt`、`finishedAt`、`exitCode`、`nativeSessionId`（agent_prompt）。正文为输出摘要（脚本输出保留最后 200 行）。

### archive-type 与 archive

```yaml
# archive-type
huhu: { kind: archive-type, id: atype-..., schema: 1 }
name: 项目
icon: folder                 # lucide 图标名
fields:
  - { id: owner, label: 负责人, type: text }      # text | date | url | number
  - { id: target, label: 目标日期, type: date }
---
# archive
huhu: { kind: archive, id: archive-..., schema: 1 }
name: HUHU · 全能工作台
type: atype-...
fields: { owner: 我, target: 2026-11-20 }
relatedIds: [archive-...]    # 无向关系：两端文件同时写入
noteIds: [note-...]
updatedAt: ...
```

类型删除或字段删除后，档案中多余的字段值保留在 `fields` 中，界面显示为“未定义字段”。

### capture

```yaml
huhu: { kind: capture, id: cap-..., schema: 1 }
title: 让 MCP 能力和插件状态保持一致
source: quick            # quick | note-excerpt | agent-cli | import | cli | mcp | http | plugin:<id>
status: pending          # pending | processed | dismissed
createdAt: ...
processedAt: null
result: null             # { kind: task|note|archive, id }
```

### comment

```yaml
huhu: { kind: comment, id: cmt-..., schema: 1 }
documentId: note-...
documentPath: 01 · 工作台/属于自己的全能工作台.md
target: body             # body | file | property
property: null           # target=property 时的键路径
anchor: { exact: 一套能力, prefix: 32 字, suffix: 32 字, start: 120, end: 124, sourceVersion: 9f2c... }
state: anchored          # anchored | orphaned
resolved: false
createdAt: ...
updatedAt: ...
```

正文是消息列表，每条以 `### <ISO 时间> · <作者>` 开头。锚点重定位算法复制 OK `server/src/comments/anchor.ts` 与 `core/src/comments/passage-match.ts`：先按 `start/end` 校验 `exact`，再在全文按 prefix/suffix 唯一匹配；不唯一或找不到时置 `orphaned`，不猜测位置。

## 6. `.huhu/` 配置文件要点

| 文件 | 关键字段 |
| --- | --- |
| `vault.json` | `kind: "huhu-vault"`、`id`、`name`、`description`、`formatVersion: 1`、`createdAt` |
| `settings.json` | `appearance{theme: pearl\|suliworld\|soft, mode: light\|dark\|system, fontSize: 12–18, compact, motion: system\|standard\|reduced, navWidth}`、`editor{fontSize, lineHeight, autosave, lineNumbers, spellcheck, readableWidth}`、`dateTime{zone, weekStartsOn}`、`shortcuts{}` |
| `plugins.json` | `builtin{<id>: {enabled}}`、`external[{id, version, path, enabled, grantedPermissions, installedAt}]`、`capabilityExposure{<capability>: boolean}` |
| `gateways.json` | `mcp{enabled, transport: stdio\|http, port}`、`http{enabled, port, tokenHash}`；令牌原文只在创建时显示一次 |
| `agent-cli/spaces/<id>.json` | `id`、`name`、`root`（绝对 canonical 路径）、`machineId`、`createdAt`、`revision` |
| `ssh/hosts/<id>.json` | `id`、`name`、`host`、`port`、`user`、`auth{kind: key\|password\|agent, secretRef}`、`jumpHostIds[]`、`tags[]`、`connectTimeoutSec` |
| `automations/scripts.json` | `[{id, title, program, args[], cwd, envRefs{NAME: safe://itemId}, timeoutSec}]` |
| `automations/claims/<key>.json` | `processingKey`、`taskId`、`runId`、`state`、`claimedAt`、`machineId`、`workerPid`、`supervisorPid` |
| `safe/keyring.json` | `kdf{name: scrypt, N: 131072, r: 8, p: 1, salt}`、`wrappedKey`、`keyCheck`、`createdAt`、`autoLockMinutes`、`lockOnLeave` |
| `sync/config.json` | `remote`、`branch`、`mode: off\|follow\|full`、`pullIntervalSec`、`pushIntervalSec`、`include[]`、`exclude[]` |

所有 JSON 写入经 `packages/vault` 的原子写；读取失败时备份原文件为 `<name>.corrupt-<ts>` 并按默认值启动，同时写入事件日志。

## 7. 写入、操作日志与恢复

### 单文件写

`writeFile(path, bytes, { expectedVersion })`：比对当前 `version` → 不一致返回 `VERSION_CONFLICT`（附当前版本与内容）→ write-file-atomic 写入 → 在 OK `disk-receipts.ts` 方式的回执表中记录 `(path, version)` 以便监听器识别自写回声 → 发出 `vault.fileChanged` 事件。

### 多文件操作

用于：重命名/移动目录、Task 标题改名、档案关系双写、捕获转换、回收站移入/恢复、历史恢复、指南替换。

1. 写 `operations/<opId>.json`：`{opId, kind, state: "prepared", steps: [{action: write|rename|delete, path, from?, beforeVersion, afterVersion}], createdAt}`；被覆盖或删除的文件先复制到 `operations/backups/<opId>/`。
2. 逐步执行，每步完成后更新日志中该步 `done: true`。
3. 全部完成 → `state: "committed"`；30 天后清理日志与备份。
4. 启动时发现 `prepared`：已完成步骤按备份回滚，回滚成功置 `rolled_back`；任何一步回滚时发现文件已被第三方改动（版本既不是 before 也不是 after），停止并置 `needs_attention`，健康中心列出涉及文件与备份位置，由用户选择“保留当前”或“恢复备份”。

不承诺跨文件原子性；承诺可解释、可恢复、不静默覆盖。

### 外部副作用

启动 Agent、执行脚本、SSH Exec、Git push 前先持久化记录（claim 或运行 MD 的 `queued`），再执行；结果未知时置 `unknown`，只允许“对账”或用户明确的“标记失败并重试”，不自动重放。

## 8. 草稿、回收站与删除

- 自动保存开启：编辑后 800 ms 去抖提交正文。关闭：编辑内容每 2 秒写入 `drafts/<noteId>.json`（`{baseVersion, source, savedAt}`），保存成功后删除草稿。重新打开文档时若存在草稿，显示“恢复草稿 / 丢弃草稿”。
- 移入回收站：文件移到 `trash/<trashId>/`，`meta.json` 记录 `originalPath`、`noteId`、`deletedAt`；相关批注一并移动。恢复时原路径已存在同名文件，要求输入新文件名，不覆盖。
- 永久删除：删除回收站条目及其批注；指向它的双链保留为未解析链接。档案删除为确认后的硬删除，同一操作中清理其他档案的 `relatedIds`。

## 9. 数据包与导入

- 受管数据包（设置 → 数据与存储 → 导出）：zip（fflate），根目录含 `huhu-package.json`（`{format: "huhu-package", version: 1, vaultId, vaultName, createdAt, files: [{path, sha256, size}]}`）与所有 Markdown 文件、`.huhu/` 中的配置与 `safe/` 密文（不含 `runtime/`、`cache/`、`ui/`、`history/`）。附件按用户在导出对话框中的勾选决定是否包含（默认包含，显示总大小）。
- 导入数据包：用户选择空目录作为新 Vault 根 → 校验清单与每个文件哈希 → 拒绝绝对路径、`..`、重复路径、符号链接、单文件超过 200 MiB 或总解压大小超过 4 GiB → 解压 → 以新 Vault 打开（保留原 `vaultId`；目标目录已含同 id 的 Vault 时生成新 id）。
- 打开已有文件夹：没有 `.huhu/vault.json` 时创建它，不修改任何已有文件。

## 10. 内存索引

`packages/vault/src/index/` 维护：路径树、各 kind 实体表、笔记标签与双链（解析 `[[目标]]`、`[[目标|别名]]`、`[[目标#标题]]`，代码块与行内代码中的文本不解析）、反向链接、SQLite FTS5 全文索引（标题、正文、标签、路径）。文件监听事件按 250 ms 批处理增量更新；“重建索引”能力清空后全量重建，可取消，取消后保持旧索引。
