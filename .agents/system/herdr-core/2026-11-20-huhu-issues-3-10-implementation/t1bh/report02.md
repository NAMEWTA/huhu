# G3.3 首个持久意图独立审查

**`65b6a083` 暂不宜按完整的主体与 Vault 隔离签收。** 最重要的问题是 CLI 对复制 Vault 的连接可能落到源 Vault。日志末尾缺换行和声明外输出也能让已报告的成功失去可用回执。Lead 留存的 `78e180b7` 包内 Codex Default 求答正例成立。

审查对象为 `65b6a083543166dfbedc991ff9f607b1f084d5af`，基线为 `78e180b7aa6fc450505b332d7f446e07cc405b07`。只核对本提交、相关调用者及现有证据。开始时集成 HEAD 为 `7170a7b5`，审查期间出现后续 Mail、Agent、文档及 CLI 变化。本报告的代码位置按固定对象。定向用例在本轮后续 CLI 文件改动前运行。 [任务](task02.md) · [G3.3 验收](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G3.3-intent-outcomes.md:11>) · [设计](<D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/design.md:42>)

## 规格发现

### P1 · 复制 Vault 后，CLI 和 stdio 可能路由到仍在运行的源 Vault

`OperationReceipts` 的所有者包含 Vault ID、物理目录身份及创建时间。本地探针以相同逻辑 ID 和同一账本，核对不同 Windows 目录身份查询得到 `NOT_FOUND`。这个判断发生在实际接收请求的 Engine。CLI 和 stdio 共用的既有 `connect` 只检查目标目录中 `engine.json` 记录的 PID 是否存活，随即采用该文件的本机端口和对应令牌，缺少对目标物理目录和实际 Engine 的绑定校验。如果文件系统副本包含源 Vault 的活动 `engine.json`，在源 Engine 仍运行时从副本查询或重交，可以把请求送进源 Vault。由此既可能读回源操作，也可能在源 Vault 创建用户原本指向副本的任务。代码证据，未复制活动凭据或运行该路径。复验应覆盖源 Engine 保持运行、同 ID 的物理副本包含旧描述文件，验证 CLI 查询、提交和 stdio 启动只能归属实际选中的 Vault，原 Vault 的任务计数无变动。 [连接与 PID 检查](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/src/connect.ts:17>) · [选择实际端点](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/src/connect.ts:46>) · [描述文件](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:510>) · [账本物理身份](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:407>)

### P2 · 缺最终换行的恢复记录接受下一次提交，随后使回执失联

构造合成账本，只让末行完整 JSON 缺少最终 LF。构造器逐行 parse，将该记录视为正常。随后另一个操作的受理和完成都能落盘并在内存查到。第一次 append 把两个 JSON 对象直接拼在同一行。再开启账本时，该行解析失败，原操作和新操作均查不到，新提交也进入损坏门禁。已通过实际 `OperationReceipts` 本机探针复现。另观察损坏门禁在每次新 claim 前都生成不同的 `operationId`，错误中报告该值，但从未受理的 ID 均无法查询。复验覆盖完整 JSON 缺 LF、真正残缺 JSON、追加失败、受理后与完成后各自的重启。下一笔 handler 开始前要有可重读的记录边界，已证实的旧回执保持可查，拒绝受理时的 ID 和实际受理事实一致。 [读取与损坏标记](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/operation-receipts.ts:23>) · [追加与受理](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/operation-receipts.ts:45>) · [先受理后调用](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:93>)

### P2 · 通过 Zod 的投影与实际保存、返回的结果可以不同

`durable` 检查 `def.output.safeParse(executed.data).success` 后仍把原始 `executed.data` 作为 `completed` 写盘。普通 `z.object` 允许解析带额外字段的值，并从解析结果剔除字段，导出的 output schema 则声明 `additionalProperties: false`。独立探针以真实 Dispatcher 注册合成能力，handler 返回声明的 `id` 和额外标记，确认额外标记被保存且出现在回执，MCP 声明会拒绝该结果。当前 `tasks.create` 的 `toDto` 路径正常通过现有样例，未观察到它泄露凭据。这个缺口会影响复用该持久意图路径的能力。复验应带额外字段及可转换字段，核对写盘、首次响应、重交、查询、MCP schema 都使用同一已验证投影，或者统一进入 `invalid-output`。 [验证与写盘](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:103>) · [输出 schema 导出](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/contracts/src/capability.ts:74>) · [MCP 投影](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/mcp.ts:77>) · [当前 Task DTO](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/service.ts:117>)

### P2 · 旧 HTTP 幂等信封仍按角色共享结果

明确使用 `intentKey` 的路径按独立服务令牌主体分区。若公开的 `tasks.create` 使用兼容的 `idempotencyKey` 而省略 `intentKey`，Dispatcher 继续按 `caller` 做查询、并发合并及记录。两枚已获准的 HTTP 令牌都属于 `http` 角色。同旧键同输入会得到另一枚令牌的结果，同键不同输入也会相互冲突。普通 CLI/MCP 的旧模式自动生成随机键，风险集中在自行保存并提交稳定旧键的 API 客户端。既有共享缓存行为经兼容入口保留，代码证据。复验应以两个实际签发的合成服务令牌，对同一 Vault 的新旧信封分别检查隔离，覆盖同令牌经 HTTP API 和 MCP HTTP 的复用，以及撤权后重交、按键查询和资源读取。 [主体发行和重载](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/gateway-tokens.ts:20>) · [HTTP 透传主体](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/capability-http.ts:36>) · [兼容幂等分支](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:138>) · [旧缓存键](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/idempotency.ts:53>)

## 规范与运行边界

### P3 · 发现公布持久意图时未核对 Engine 是否挂载账本

当 Engine 只读打开或目录缺稳定文件身份时，装配不提供 `operations`。HTTP 发现只依据静态 `idempotency` 旗标，MCP 据此前缀公布 intent metadata 和资源模板。在原能力仍通过开放策略的情况下，提交带键请求会返回「未启用通用持久意图」，回执查询为空。代码证据。复验要以缺账本的运行条件核对 `tools/list`、资源模板和实际响应一致，并明确同一物理 Vault 的只读查询支持范围。 [Engine 挂载条件](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:407>) · [发现](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/capability-http.ts:21>) · [MCP 模板](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/mcp.ts:100>) · [执行条件](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:93>)

## 已核对的证据与边界

- **信任入口。** API 与 MCP HTTP 都在回环 server 上查受信 Host、Origin、转发头和 bearer，主体不取自请求文本。HTTP 服务使用持久令牌 ID，旧令牌撤销后认证入口拒绝。CLI 和默认 MCP 令牌各占一个稳定主体槽，同一 Vault 内 stdio 和 HTTP MCP 用同一 MCP 令牌时复用回执，CLI 与该 MCP 槽分开。状态端点与 MCP 资源均回到 `readOperation`，按 owner、当前能力启用状态和开放策略复核。MCP 资源内容是完整的 `CapabilityResult` JSON，调用错误仍有 code 与 details。 [入口规则](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/ingress.ts:13>) · [HTTP MCP](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/http-app.ts:96>) · [本地令牌槽](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:456>) · [查询复验](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:78>)
- **预写与未知。** 新受理行使用 `flush: true` 成功后才进入 handler。同 owner 同 key 同输入摘要命中同一操作，并发期间共用 promise。重启后只有 `accepted` 的记录在读回时标 `unknown`，执行次数为零。已运行且返回坏类型的夹具落 `invalid-output`，重交保留原 ID，磁盘没有该坏值。Tasks 当前未把 operation ID 或预留 task ID 交给领域层。在 Task 文件已保存而完成回执丢失时只能长期保留 `unknown`，没有随现有任务推进到完成的查证路径。首片安全下限是保留原句柄及不再执行，完整对账要能证明该 Task 属于原意图。 [账本 flush](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/operation-receipts.ts:45>) · [重启与坏输出夹具](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/test/dispatcher.test.ts:120>) · [Tasks 接入](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/index.ts:374>)
- **37 项既有证据。** 核到 `g33-final-focused.log` 五个项目类型检查完成，Dispatcher 21 项、CLI 16 项全部通过；较早日志也记录 37 项。新增 CLI 用例使用真实 Engine 和 CLI 解析路径，加内存传输调用 stdio 适配器、真实回环 MCP HTTP。同一个 MCP 令牌在两种传输得到相同结构化结果，stdio 适配器另验证了资源读回，CLI 的操作有独立 ID。用例验证同键异参及 CLI 重启回读。真实服务令牌的发行和撤销、运行中 Vault 副本及 MCP HTTP 的 `resources/read` 尚未纳入该用例。独立重跑只选定该 CLI 用例与两项新增 Dispatcher 用例，均通过。 [Lead 最后一轮](<D:/Document/code/huhu/temp/issue-baseline/g33-final-focused.log>) · [CLI 用例](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/test/cli.test.ts:54>)
- **`78e180b7` 包内 Codex 正例。** 从候选包 `win-unpacked/HUHU.exe` 启动的日志自报冻结提交 `78e180b7aa6f`，模式 `default`。重算 NSIS 安装器 `b23b5b0bf0b8d9a55fd224eb808b9b08f739702753403af8a198b7ded2463afc`，随包 helper `b8ce0ff75370d0a12512a36e9b02cc0ece5812bd7f427505e900c7e26d8bbae8`，helper 与该 Git 对象逐字节相同。日志所用 Codex exe 重算为 `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7`。同一 task/run/session 的 `native_deferred` 问题经历 `pending`、重交暂为 `unknown`、随后 `accepted`。回环 Responses 在原 `call_t19m` 收到一次 `Blue`，任务上只有一条回答和一条 delivered 结果，最后人工将原任务改为 completed。此记录补足 `report01` 当时等待的冻结组合包正例，覆盖实际随包程序加本机合成模型输入，安装器与 helper 仅做独立指纹核验。 [提问与回答 ACK](<D:/Document/code/huhu/temp/issue-baseline/78e180b7-native-retry.log:6>) · [实得结果](<D:/Document/code/huhu/temp/issue-baseline/78e180b7-native-retry.log:9>) · [安装器原记录](<D:/Document/code/huhu/temp/issue-baseline/78e180b7-windows-installer-sha.log>)

## 本轮验证

- `node node_modules/vitest/vitest.mjs run packages/kernel/test/dispatcher.test.ts apps/cli/test/cli.test.ts --no-cache --pool forks --maxWorkers 1 --no-file-parallelism -t '受权 CLI 和两种 MCP 复用持久意图|已受理的持久意图重启|副作用后的坏输出'` · 3 通过，34 由过滤跳过。
- 用仓内 `tsx` 在 Windows 临时目录运行实际账本与 Dispatcher 的小型探针，分别复现末行拼接丢回执，核对合成输出投影及物理目录、主体隔离。`git diff --check 65b6a083^ 65b6a083` 通过。
- 本轮保留四项优先复验门槛，分别是跨物理目录连接、断写后回执稳定、结果投影一致、实际服务令牌隔离。测试仅用本机合成夹具，包内 Codex 为读取 Lead 实际日志。唯一交付写入为本文件。
