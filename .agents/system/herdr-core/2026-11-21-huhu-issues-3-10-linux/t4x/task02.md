# task02.md #7 H3.2 跳板路由批量关联与启停

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t4x/task02.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report02.md`
- Lead — `t3p`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-batch-routes`，基线 `4198354dbd12ece0e4a65cf84209c45100d0c5c6`

## 目标和依据

按 #7 `tasks/H3.2-route-editor.md`、source R01/R02/R06、已确认原型，实现独立路由页的显式多选、批量关联（跳过已有或覆盖）和启停。复用现有主机目录、单条路由和跳板图解析。保留精确选择范围、版本核对、每项目结果及刷新，旧连接路径不变。当前图上的无效选择标明原因。对改动后的完整图校验，不允许未知、废弃配置、目标自指或环。任一生效条目的版本/图验证失败时没有配置写入。关联材料不读取或写入明文凭据，不改变 endpoint 或认证绑定。用同一个原子 portable 定义文件一次提交整批；复用 `ModuleCredentials` 的队列、revision CAS、本机 snapshot/ref、pin 与清理机制；不要用串行逐主机提交模拟原子性。保留已有调用语义、Safe 锁定和本机认证状态。

共享调用约定由 Lead 管理。请新增 `plugins/ssh/src/engine/route-edits.ts` 导出 `EditHostRoutes` 与 `HostRouteEditResult` schema，输入采用 `{ targets: {hostId, expectedRevision}[], change: { action:"associate", jumpHostId, ifExists:"skip"|"replace" } | { action:"setEnabled", enabled:boolean } }`，结果 `{ updated: string[], skipped: string[] }`。两个动作中的变更前提、重复目标、有界大小和所有目标版本均明确校验。入口 method 为 `HostConfigurations.editRoutes(input,signal)`，UI 调工作台 capability `ssh.routes.edit`。Lead 在采纳结果后负责描述符、Engine bind、事件、插件清单及工作台授权，禁止在本任务改这些登记文件。外部调用、全局代理和预览新协议不属于本片。

## 读写与验证

- 可写 `plugins/ssh/src/engine/{route-edits,host-configurations}.ts`、`plugins/ssh/src/ui/RoutePanel.tsx`、该批量操作对应的一个定向 Vitest 文件和一个现有 SSH E2E spec 的本切片。若缺少现成原子元数据操作，可在 `packages/kernel/src/credentials/module-credentials.ts` 增加仅改定义且核对派生目标等价的窄操作。你是该文件本片唯一写入者；核心的持久化格式和现有 API 行为保持。必要时尝试复用现有准备和发布路径。报告清楚说明任何有碍原子性或保留凭据的问题。
- 先按 `dev-build`，前端改动遵守 `zh-modern-web-guidance` search 和 retrieve，优先 Huhu 与 `temp/sources/motty`。报告实际参考且复用的上游文件、版本与许可证。台账由 Lead 维护。
- 源码与测试 diff 留在分支，Lead 复核后提交。不写远端、不派发其他 agent、不跑构建、E2E 或全仓门禁。Worker 最多运行一个直接相关 Vitest 文件，可重复该文件验证修复；Node 24.21.0，pnpm 12.10.1。E2E 只写，报告列出用例与未运行的验证。使用隔离 Vault、合成主机和回环夹具。
- 核对 Core 当前身份、topic 和 manifest。按 Core 协议发布同号报告，恢复或收件失败说明事实。不要重做上一轮录制回放或修改其他工作树。

## Lead 验收

由 Lead 复核填写。
