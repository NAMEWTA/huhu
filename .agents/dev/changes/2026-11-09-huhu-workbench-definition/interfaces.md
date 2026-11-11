# 接口与协议

本文件是能力调用、错误码、事件、HTTP/WS 路由、MCP/CLI 映射、Preload 接口、Herdr 适配与 Agent provider 适配的唯一权威定义。所有模式在 `packages/contracts` 中以 zod 实现，能力清单由注册表自动导出，不手工维护第二份列表。

## 1. 能力调用

### 请求与结果

```ts
// packages/contracts/src/capability.ts
type CapabilityRequest = {
  capability: string            // 例：'tasks.setCompleted'
  input: unknown                // 由该能力的 zod 输入模式校验
  idempotencyKey?: string       // 写入与执行类能力必须提供（UUID）
  requestId: string             // 调用方生成，用于日志关联
}
type CapabilityResult<T> =
  | { ok: true; data: T; opId?: string }
  | { ok: false; error: HuhuError }
type HuhuError = {
  code: ErrorCode               // §3
  message: string               // 面向用户的中文说明
  retryable: boolean
  details?: Record<string, unknown>  // 例如 VERSION_CONFLICT 附 currentVersion
  recovery?: { action: string; label: string }[]  // 界面可直接渲染的恢复动作
}
```

### 能力定义

```ts
// packages/kernel/src/capabilities/define.ts
defineCapability({
  name: 'tasks.setCompleted',
  plugin: 'tasks',
  scope: 'write',               // read | write | execute | admin
  input: SetCompletedInput,     // zod
  output: TaskDto,
  exposable: true,              // false = 只允许桌面调用（例如保险箱明文）
  defaultExposed: false,        // 外部入口（MCP/CLI/HTTP）的默认开放状态
  handler: async (ctx, input) => { ... },
})
```

### Dispatcher 管线（`packages/kernel/src/dispatcher.ts`）

1. 解析调用者身份：`desktop`（Renderer 令牌）、`cli`、`mcp`、`http`、`plugin:<id>`。身份来自所用令牌，请求体内的身份字段一律忽略。
2. 查找能力；不存在 → `CAPABILITY_NOT_FOUND`。
3. 所属插件未启用 → `PLUGIN_DISABLED`。
4. 授权：`desktop` 允许全部；外部入口要求 `exposable && 已开放`（`plugins.json.capabilityExposure` 或默认值）；`plugin:<id>` 要求能力在其已授予权限内。否则 `CAPABILITY_NOT_EXPOSED` / `PERMISSION_DENIED`。
5. zod 校验输入 → `INVALID_INPUT`（`details.issues` 列出字段）。
6. 幂等：写入/执行类按 `(caller, capability, idempotencyKey)` 在 24 小时窗口内返回首次结果；同 key 不同输入 → `IDEMPOTENCY_MISMATCH`。记录存在内存 + `.huhu/runtime/<machineId>/idempotency.ndjson`。
7. 执行 handler；抛出的 `HuhuError` 原样返回，其他异常转为 `INTERNAL` 并记录日志。
8. 审计：外部入口调用写入网关调用记录（最近 500 条，`.huhu/runtime/<machineId>/gateway-audit.ndjson`），字段为时间、入口、能力、结果码、耗时，不含输入值。

## 2. 能力目录

Scope：R 读、W 写、X 执行外部动作、A 管理。“外”列为外部入口默认开放状态：● 默认开放；○ 可开放默认关闭；— 永不对外。

| 插件 | 能力 | Scope | 外 | 说明 |
| --- | --- | --- | --- | --- |
| kernel | `vault.info` | R | ● | Vault 身份、名称、各类计数 |
| kernel | `vault.tree` | R | ● | 文件树（路径、类型、大小、mtime） |
| kernel | `vault.search` | R | ● | 全文检索（Orama），可按 kind 过滤 |
| kernel | `vault.readFile` | R | ○ | 读取 Vault 内文本文件（受路径守卫） |
| kernel | `vault.reindex` | A | — | 重建内存索引，可取消 |
| kernel | `vault.exportPackage` / `vault.importPackage` | A | — | 数据包（data-model §9） |
| kernel | `settings.get` / `settings.update` | R/W | — | 当前 Vault 偏好 |
| kernel | `plugins.list` | R | ● | 插件、状态、贡献、权限 |
| kernel | `plugins.setEnabled` / `plugins.install` / `plugins.uninstall` / `plugins.grant` / `plugins.wipeData` | A | — | 插件管理 |
| kernel | `capabilities.list` | R | ● | 能力清单与开放状态 |
| kernel | `gateway.get` / `gateway.update` / `gateway.audit` | A | — | 网关配置与调用记录 |
| notes | `notes.list` / `notes.read` | R | ● | 列表（筛选：全部/星标/日记/标签/回收站）；读取正文与版本 |
| notes | `notes.create` | W | ○ | 新建（模板：blank/meeting/project/daily） |
| notes | `notes.save` | W | ○ | 提交完整源码，需 `expectedVersion` |
| notes | `notes.rename` / `notes.move` / `notes.duplicate` | W | ○ | 同步更新路径双链 |
| notes | `notes.trash` / `notes.restore` / `notes.deletePermanent` | W | — | 回收站 |
| notes | `notes.setFavorite` / `notes.updateProperties` / `notes.backlinks` / `notes.openDaily` | W/R | — | 星标、frontmatter 属性、反链、打开或创建当日日记 |
| notes | `notes.draft.save` / `notes.draft.discard` | W | — | 手动保存模式草稿 |
| notes | `folders.create` / `folders.rename` / `folders.move` / `folders.delete` | W | — | 目录操作 |
| notes | `comments.list` / `comments.create` / `comments.reply` / `comments.resolve` / `comments.reopen` / `comments.relocate` / `comments.delete` | R/W | — | 批注 |
| tasks | `tasks.list` / `tasks.read` | R | ● | 分类：all/today/tomorrow/week/ended；`completed` 过滤；关键词 |
| tasks | `tasks.create` / `tasks.update` / `tasks.duplicate` / `tasks.delete` | W | ○ | 任务 CRUD |
| tasks | `tasks.setCompleted` | W | ○ | 勾选/取消；任何执行方式都允许 |
| tasks | `tasks.runs` | R | ● | 该任务的运行记录引用 |
| automations | `automations.list` / `automations.read` | R | ● | 规则 |
| automations | `automations.create` / `automations.update` / `automations.delete` / `automations.setEnabled` | W | ○ | 内置规则不可删除 |
| automations | `automations.preview` | R | ○ | 只读预览：候选、跳过原因、下次激活时间 |
| automations | `automations.runNow` | X | ○ | 立即激活一次 |
| automations | `automations.activations` / `automations.runs.read` | R | ● | 激活记录与运行结果 |
| automations | `automations.runs.answer` / `automations.runs.cancel` / `automations.runs.reconcile` / `automations.runs.retry` | X | — | 回答问题续接、取消、对账、明确重试 |
| automations | `automations.scripts.list` / `automations.scripts.save` / `automations.scripts.delete` | R/A | — | 预配置脚本 |
| archives | `archives.list` / `archives.read` | R | ● | 按类型、关键词 |
| archives | `archives.create` / `archives.update` / `archives.delete` / `archives.changeType` / `archives.setRelations` / `archives.linkNote` / `archives.unlinkNote` | W | ○ | 档案 |
| archives | `archives.types.list` / `archives.types.save` / `archives.types.delete` | R/W | — | 类型；删除有档案的类型需 `migrateTo` |
| inbox | `inbox.list` | R | ● | 待处理/已整理/已归档，来源筛选 |
| inbox | `inbox.capture` | W | ● | 快速捕获（外部默认开放，便于剪藏） |
| inbox | `inbox.update` / `inbox.convert` / `inbox.dismiss` / `inbox.restore` / `inbox.undo` / `inbox.delete` | W | — | 整理 |
| agent-cli | `agent.spaces.list` / `agent.spaces.save` / `agent.spaces.delete` | R/W | — | Space |
| agent-cli | `agent.providers.detect` | R | — | 当前机器 CLI 检测、版本、模型能力 |
| agent-cli | `agent.sessions.launch` / `agent.sessions.list` / `agent.sessions.interrupt` / `agent.sessions.kill` / `agent.sessions.rename` | X/R | — | 交互会话（Herdr） |
| agent-cli | `agent.history.list` / `agent.history.read` / `agent.history.resume` / `agent.history.pin` | R/X | — | cwd 历史 |
| agent-cli | `agent.review.diff` / `agent.review.send` | R/X | — | 变更审查 |
| ssh | `ssh.hosts.list` / `ssh.hosts.save` / `ssh.hosts.delete` | R/W | — | 主机配置 |
| ssh | `ssh.connect` / `ssh.disconnect` / `ssh.hostKey.decide` | X | — | 连接与主机密钥决定 |
| ssh | `ssh.shells.open` / `ssh.shells.close` / `ssh.exec.run` / `ssh.exec.cancel` | X | — | Shell 与 Exec |
| ssh | `ssh.sftp.list` / `ssh.sftp.read` / `ssh.sftp.write` / `ssh.sftp.mkdir` / `ssh.sftp.rename` / `ssh.sftp.delete` | X | — | 远程文件 |
| ssh | `ssh.audit.list` | R | — | 审计 |
| safe | `safe.status` / `safe.setup` / `safe.unlock` / `safe.lock` / `safe.changePassword` / `safe.settings.update` | A | — | 保险箱状态与锁定 |
| safe | `safe.items.list` / `safe.items.save` / `safe.items.delete` | R/W | — | 元数据与写入新值 |
| safe | `safe.items.reveal` | A | — | 解锁状态下返回明文给桌面；记录审计 |
| safe | `safe.audit.list` | R | — | 访问记录 |
| versioning | `history.timeline` / `history.read` / `history.checkpoint` / `history.restore` | R/W | ● / — | 文件历史；时间线默认对外只读开放 |
| versioning | `git.status` / `git.log` / `git.diff` / `git.stage` / `git.unstage` / `git.commit` | R/W | ●(读) | Vault 真实 Git 仓库 |
| versioning | `sync.get` / `sync.update` / `sync.preview` / `sync.run` / `sync.status` | R/W/X | — | 远端同步 |
| versioning | `conflicts.list` / `conflicts.read` / `conflicts.resolve` | R/W | — | 冲突 |
| health | `health.run` / `health.cancel` / `health.results` / `health.events` / `health.exportDiagnostics` | R/A | — | 诊断 |
| kernel | `notifications.list` / `notifications.markRead` / `notifications.delete` / `notifications.clearRead` | R/W | — | 站内通知（属于 kernel，health 停用时仍可用） |
| agent-guide | `guide.status` / `guide.inspect` / `guide.repair` / `guide.restoreBuiltin` / `guide.restoreBackup` | R/A | ●(status) | 指南维护 |
| workbench | `home.summary` / `home.widgets.update` / `home.focus.update` / `home.habits.update` | R/W | ●(summary) | 首页 |

MCP 额外暴露（mcp 插件）：资源 `huhu://vault/summary`、`huhu://notes/recent`；资源模板 `huhu://notes/{id}`（展开后仍经 `notes.read` 授权）；提示词 `daily-review`、`knowledge-synthesis`（只生成提示文本与允许引用的资料，不调用模型）。

## 3. 错误码

| code | retryable | 含义与界面处理 |
| --- | --- | --- |
| `INVALID_INPUT` | 否 | 字段错误，表单就近显示 |
| `NOT_FOUND` | 否 | 对象已不存在，关闭详情并提示 |
| `VERSION_CONFLICT` | 否 | 文件已被修改；`details.currentVersion`，界面进入冲突处理 |
| `NAME_CONFLICT` | 否 | 目标路径已存在 |
| `PATH_OUTSIDE_VAULT` | 否 | 路径越界、符号链接逃逸 |
| `READ_ONLY_VAULT` | 否 | 只读打开或无写权限 |
| `PLUGIN_DISABLED` | 否 | 附“前往插件中心”恢复动作 |
| `CAPABILITY_NOT_FOUND` / `CAPABILITY_NOT_EXPOSED` / `PERMISSION_DENIED` | 否 | 外部入口授权失败 |
| `IDEMPOTENCY_MISMATCH` | 否 | 同 key 不同输入 |
| `ENGINE_CLOSING` | 是 | Vault 正在关闭 |
| `SAFE_LOCKED` | 否 | 附“解锁保险箱”动作 |
| `SAFE_BAD_PASSWORD` | 否 | 主密码错误；连续 5 次后 30 秒冷却 |
| `SECRET_REF_INVALID` | 否 | 引用的保险箱条目不存在或不允许本模块使用 |
| `PROVIDER_NOT_FOUND` / `PROVIDER_UNAUTHENTICATED` | 否 | CLI 未安装或未登录 |
| `SPACE_INVALID` | 否 | Space 目录不存在、不可访问或配置已变化 |
| `HERDR_UNAVAILABLE` | 是 | Core 未启动或连接失败 |
| `RUN_UNKNOWN` | 否 | 外部结果未知，需对账 |
| `SSH_HOST_KEY_MISMATCH` | 否 | 主机密钥与记录不符，拒绝连接 |
| `SSH_AUTH_FAILED` / `SSH_TIMEOUT` / `SSH_DISCONNECTED` | 是/是/是 | 连接失败 |
| `GIT_NOT_REPOSITORY` / `GIT_AUTH_FAILED` / `GIT_CONFLICT` / `GIT_OFFLINE` | 否/否/否/是 | 版本与同步 |
| `WRITE_PARTIAL` | 否 | 多文件操作部分完成，附操作 id 与恢复动作 |
| `INTERNAL` | 是 | 未预期错误，附日志关联 id |

## 4. 权限（外部插件与令牌）

权限是能力名前缀的集合：`notes.read`（= `notes.list`、`notes.read`、`notes.backlinks`）、`notes.write`、`tasks.read`、`tasks.write`、`archives.read`、`archives.write`、`inbox.write`、`vault.read`、`automations.read`、`history.read`。`execute` 与 `admin` 类能力不能授予外部插件。权限到能力的映射表在 `packages/kernel/src/permissions.ts`，插件中心“权限与依赖”页从同一表渲染。

## 5. 事件

Engine 在提交成功后发布事件；Renderer 通过 `GET /ws/events` 订阅，用于让 React Query 失效与刷新界面。事件结构：`{ id, vaultId, type, at, payload }`，按连接内递增 `seq` 发送；断线重连带 `lastSeq`，Engine 保留最近 1000 条用于补发，超出则发送 `resync` 让客户端全量刷新。

| type | payload |
| --- | --- |
| `vault.fileChanged` | `{ path, kind?, id?, change: created\|modified\|deleted\|renamed, from? }` |
| `entity.changed` | `{ kind, id, op: created\|updated\|deleted }` |
| `plugin.stateChanged` | `{ id, state: active\|disabled\|failed, error? }` |
| `safe.unlocked` | `{}`（保险箱解锁成功；依赖保险箱凭据而暂停的功能据此恢复） |
| `task.completedChanged` | `{ taskId, completed }` |
| `task.inputChanged` | `{ taskId, inputRevision, inputHash }` |
| `automation.activated` | `{ ruleId, activationId, trigger }` |
| `run.stateChanged` | `{ runId, kind: task-run\|automation-run, state }` |
| `reminder.due` | `{ taskId, reminderId, title }` |
| `notification.created` | `{ id, title, module }` |
| `agent.sessionChanged` | `{ sessionId, state }` |
| `ssh.connectionChanged` | `{ hostId, state }` |
| `ssh.hostKeyPrompt` | `{ attemptId, hostId, hop, fingerprint, keyType, reason: first\|changed }` |
| `sync.statusChanged` | `{ status, ahead, behind, conflicts, pausedReason? }` |
| `engine.closing` | `{}` |

终端输出、Agent 输出不作为事件发布，也不会产生 Task 完成事件。

## 6. 传输

### HTTP / WebSocket（Engine，`127.0.0.1:<随机端口>`）

| 路由 | 用途 |
| --- | --- |
| `POST /api/v1/call` | `CapabilityRequest` → `CapabilityResult` |
| `GET /api/v1/capabilities` | 当前调用者可见的能力及模式（JSON Schema，由 zod 导出） |
| `GET /api/v1/asset?path=<Vault 相对路径>&t=<令牌>` | 只读返回 Vault 内文件字节（图片、PDF 预览），经路径守卫；响应带正确 MIME 与 `Content-Security-Policy: sandbox`；仅 Renderer 令牌可用 |
| `GET /ws/events` | 事件流 |
| `GET /ws/terminal/:sessionId?mode=attach\|observe` | 终端双向字节流（Engine 转接 Herdr framed attach；SSH shell 同一路由，`sessionId` 前缀 `ssh-`） |
| `POST /mcp` | MCP Streamable HTTP（仅当 `gateways.json.mcp.transport = http` 且开启） |
| `GET /healthz` | 存活检查（无需令牌，只返回 `ok`） |

认证与来源（复制 OK `server/src/ingress-policy.ts` 的规则形状）：所有路由（`/healthz` 除外）需 `Authorization: Bearer <token>`，WebSocket 用 `Sec-WebSocket-Protocol` 携带令牌；有 `Origin` 头时必须等于 Renderer 的自定义协议源 `huhu-app://workbench`，否则 403；拒绝带 `X-Forwarded-*` 的请求；请求体上限 8 MiB；单连接并发调用上限 32。

令牌种类：Renderer 令牌（每次 Engine 启动生成，经 Main→Preload 交给 Renderer，只存内存）；CLI 令牌（端点描述文件中，与 Renderer 令牌不同，身份为 `cli`）；HTTP 服务令牌（用户在能力网关创建，只保存哈希，身份 `http`）；插件令牌（每个外部插件启动时生成，身份 `plugin:<id>`）。

### Preload `window.huhuHost`

```ts
interface HuhuHost {
  engine(): Promise<{ baseUrl: string; token: string; vaultId: string }>
  pickDirectory(opts: { title: string; mustBeEmpty?: boolean }): Promise<string | null>
  pickFile(opts: { title: string; extensions: string[] }): Promise<string | null>
  saveFile(opts: { title: string; defaultName: string }): Promise<string | null>
  openVault(path: string): Promise<void>        // 在当前窗口切换 Vault
  openVaultInNewWindow(path: string): Promise<void>
  closeVault(): Promise<void>
  openExternal(url: string): Promise<void>       // 仅 http/https，且不含用户名密码
  revealInFolder(vaultRelativePath: string): Promise<void>
  copyText(text: string, opts?: { clearAfterMs?: number }): Promise<void> // 保险箱复制用；到期仅在剪贴板仍为该值时清除
  appInfo(): Promise<{ version: string; platform: string; arch: string }>
  onEngineState(cb: (s: 'starting' | 'ready' | 'stopped' | 'crashed') => void): () => void
}
```

Main 校验每次 IPC 的 `senderFrame.url` 以 `huhu-app://workbench/` 开头。

### CLI（`apps/cli`，命令名 `huhu`）

| 命令 | 行为 |
| --- | --- |
| `huhu --help` / `--version` / `--skill` | 不需要 Vault 与 Engine；`--skill` 输出内置指南正文 |
| `huhu engine --vault <path>` | 以无界面模式运行 Engine |
| `huhu call <capability> --input-json '<json>' [--vault <path>]` | 通用调用；默认 Vault 为当前目录向上查找含 `.huhu/vault.json` 的目录 |
| `huhu vault info`、`huhu notes list`、`huhu tasks list [--category today] [--completed false]`、`huhu tasks create --title <t> [--due <date>]`、`huhu tasks complete <id>`、`huhu inbox capture --title <t> [--body <text>]`、`huhu plugins list`、`huhu capabilities list`、`huhu guide status`、`huhu git log` | 便捷命令，内部都转为 `call` |
| `huhu mcp` | stdio MCP 服务器：把 MCP 请求转为对 Engine 的 `call`；stdout 只输出协议帧，日志写 stderr |

输出：默认人类可读；`--json` 输出 `CapabilityResult` JSON 到 stdout。退出码：0 成功；1 业务错误（`ok:false`）；2 参数错误；3 无法连接或启动 Engine。

找不到运行中的 Engine 时，CLI 以子进程启动 `huhu engine --vault <path>`，等待端点描述出现（最多 15 秒），命令结束后若无其他客户端在 60 秒内连接则该 Engine 自行退出。

## 7. Herdr Core 适配（`packages/herdr-client`）

- 类型：`scripts/gen-herdr-types.mjs` 从固定版本的 `hc.openrpc.json` 生成 TS 类型（json-schema-to-typescript），产物提交在 `packages/herdr-client/src/generated/`。
- 连接：Unix socket / Windows 命名管道；建立后发送 `hello {framed: true}`；帧编码 `[channel u32 LE][kind u8][len u32 LE][payload]`（herdr-core `schema/README.md`）。
- 实例隔离：Engine 以环境变量启动 `hc server`：`HC_SESSION=huhu`、`XDG_STATE_HOME=<Vault>/.huhu/runtime/<machineId>/herdr/state`、`XDG_CONFIG_HOME=<Vault>/.huhu/runtime/<machineId>/herdr/config`、`HC_SOCKET=<短路径>`（Unix：`$XDG_RUNTIME_DIR` 或 `os.tmpdir()` 下 `huhu-<vaultId 前 8 位>-<machineId 前 4 位>.sock`；Windows：`\\.\pipe\huhu-<同上>`）。
- 使用的方法：`terminal.run`（argv、cwd、env、labels、name、size）、`terminal.list`（按 labels 过滤）、`terminal.get`、`terminal.attach`（framed，DATA/CREDIT/RESIZE/CLOSE）、`terminal.interrupt`、`terminal.kill`、`terminal.label`、`terminal.rm`、`events.subscribe`、`server.status`。
- 标签约定：`huhu.vault=<vaultId>`、`huhu.space=<spaceId>`、`huhu.session=<sessionId>`、`huhu.launch=<requestId>`。启动响应丢失时用 `terminal.list({labels:{'huhu.launch': requestId}})` 查回唯一终端，不重新 run。
- 背压：Engine 转发到 WebSocket 时按 Core 的 CREDIT 机制回报已消费字节；单个 WebSocket 发送缓冲超过 4 MiB 时暂停回报 CREDIT。

## 8. Agent provider 适配（`plugins/agent-cli/src/engine/providers/`）

```ts
interface AgentProvider {
  id: 'claude' | 'claude-agent-teams' | 'codex' | 'pi'
  displayName: string
  detectCommands: string[]                  // 来自 Orca tui-agent-config.ts
  probeVersion(exe: string): Promise<string | null>   // Orca agent-cli-version-probe.ts
  models(): ModelOption[]                   // { id, label, efforts: string[], fast: boolean }
  interactiveArgv(o: { exe; model?; effort?; fast?; prompt?; resumeSessionId? }): string[]
  headless?: {                              // 仅 claude、codex：复制 AA plugins/<id>/agent.ts
    command(turn: Turn): string[]
    read(stdout: string, code: number, stderr: string): Reading
  }
  historyScanner: string                    // Orca ai-vault 扫描器中对应的 agent 解析器 id
}
```

“新终端”不是 provider：它以 Space 根为 cwd 调用 `terminal.run` 且不传 argv（Core 使用该机器默认 shell）。
