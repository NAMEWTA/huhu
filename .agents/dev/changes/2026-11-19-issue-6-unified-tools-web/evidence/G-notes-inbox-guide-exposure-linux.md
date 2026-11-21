# #6 Notes、Archives、Inbox 和 Agent Guide 外部开放

候选基于 `a98b3079543c612a3abea69b22575bd8ab1c3897`。本组按 t19「notes」「inbox」「agent-guide」开放 33 项，原有同域可选工具 26 项。59 项共用领域静态描述、运行时绑定和用户开放策略。新库 59 项的 `defaultExposed` 及初始选择均为 false。三节没有裁决「闭」的 ID。工作台已有调用形状继续有效，外部写入追加对象校验和安全结果引用。

## Linux 双入口验收

`plugins/notes/test/domain-exposure.engine.test.ts` 的 `33 capabilities default off, explicitly enabled, revoked and reconciled after restart` 在隔离的两个 Vault 分别走真实 CLI 和独立 Gateway 令牌的 HTTP MCP。

- 对 33 项分别验证管理目录、发现、默认直接拒绝、单项打开后的实际调用、再次关闭、原工具名和意图重试被拒，以及可观察效果与作用域。比较每次更新的策略 revision，停用插件用例核对静态目录、撤活动 handler、保留选择以及重新启用。
- 25 个写入项要求稳定意图。对每项并发发送两次，丢弃一个应答，再提交原键。当前授权时原 operationId 和结果不变，撤权后回执读取和重试均拒绝。恢复授权后重启，CLI 使用原主体及键，HTTP MCP 用 C05 恢复同一个逻辑会话。原句柄 404，恢复后两端均取得原回执，领域文件哈希和事件计数不再增加。支持不同有效输入的写入项另验同键异参冲突，`guide.check` 的有效输入只有空对象。
- 8 个只读项在单独开放时验证有意义结果、业务文件和事件不变，重启后再逐项开放复测。后一次运行检查 Herdr Core ensure 为零，观察到的 fetch 全是本地测试 Engine 请求。快照覆盖领域业务文件、草稿、Guide 备份、索引相关文件和操作日志，排除独立运行的网关、缓存和 Versioning 后台历史。
- `guarded object paths and stale external versions remain untouched` 覆盖源路径、目的路径、嵌套符号链接、保护目录、错误对象、失效版本和确认字段。外部草稿另验同令牌不同 MCP 会话、原笔记移动及同路径新建。
- `inbox conversion retains source and target bodies without writing them to conversion receipts` 复核 Tasks 和 Archives 转换。不同意图并发同一源版本只有一个目标，另一项得到版本冲突。真实目标保留原文，源保留关联，通用持久意图和旧目标幂等账本均找不到测试正文和字段值。Notes 转换及其撤销先写入关联，再回读原收件项和后续改过的目标。事件总线回读 Notes、Archives、Inbox 的刷新事件。Guide 验清标记、原字节备份、恢复内置和从备份覆盖。
- G3.4 的既有示例仍可使用捕获得到的标题。外部捕获省去正文及磁盘路径，本组新增 Inbox 写入口的持久结果同时省去标题。受信 `plugin:inbox` 的 `tasks.create` 返回任务 ID，现有工作台和直接外部调用仍返回完整 Task DTO。

## Lead 装配

- `notes.notesCapabilityDescriptors` 包含 `notes.*`、`comments.*`、`folders.create`、`archives.*` 共 44 项。Notes 和 Archives handler 使用同一对象 bind。Notes manifest 补列 `notes.templates.{list,import}`、`notes.{textEncoding,previewEncoding,convertEncoding}`。
- `Object.values(inbox.inboxCapabilityDescriptors)` 包含 `inbox.*` 8 项，均由 Inbox apply bind。 `Object.values(agentGuide.guideCapabilityDescriptors)` 包含 `guide.*` 7 项，均由 Guide apply bind。
- 候选在 `apps/engine/src/boot.ts` 用以上三行声明替换原 `notes.read` 单项声明。原插件生命周期入口可直接复用。
- `home.notes.recent` 的委托闭包在 boot 内对 `notes.list` 及每次 `notes.read` 原样传递上游 caller、subject、signal、requestId。每项由 Dispatcher 按当前策略复权。列表读取被拒时停止，单条正文读取被拒时排除对应正文片段。

## 验证命令

Node 24.21.0、pnpm 12.10.1，测试使用独立 `XDG_RUNTIME_DIR`。 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。单 worker 定向 Vitest 9 个文件、183 项通过。全量通过 157 个文件、1790 项，跳过 8 个文件、19 项，退出 0。全量命令为 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`，同时用 `VITEST_MAX_FORKS=2` 和 `VITEST_MAX_THREADS=2` 限制 worker。日志在 `/tmp/huhu-t27-domains.jO1YsW/`。
