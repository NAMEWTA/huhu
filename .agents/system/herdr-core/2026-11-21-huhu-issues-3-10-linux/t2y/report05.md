# Task05 终稿

任务身份为 t2y/task05.md，执行终端 t47，Lead t3p。实施分支为 impl/huhu-issues-3-10-ssh-owned，候选父为 00d644d3。达到任务所定上下文收尾线，本轮部分交付。

Task04 的 56 个关闭项中有 49 个改为默认关闭、可选择开放。新增 7 个可选工具，包括 PTY 读写及调整大小、作业列表、监控订阅与面板列表、键盘交互响应。工作台可见各已实现外部对象的来源并可关闭。候选分支未推送，工作树分支指针未移动。证据随候选更新 G-ssh-exposure-linux.md。

## 候选链
- `f694bd71` Scope external SSH connections and terminals to their owners
- `7255ad6d` Bind external SFTP operations to owned file sessions
- `2d54d475` Isolate queued SSH transfers and their conflict decisions by owner
- `edadaa19` Bind external fixed-target forwards to owned loopback listeners
- `da2cdc15` Expose owner-scoped SSH job admission and exact host-key management
- `d733711d` Authorize owned SSH file search and versioned edits
- `22508ce8` Bind SSH monitoring authentication and workspace runs to their owners
# task05 执行记录

- 任务地址 t2y/task05.md，执行终端 t47，回报 t3p。分支 impl/huhu-issues-3-10-ssh-owned，基线 00d644d3。
- 第一批候选 f694bd71。原 SSH 工作树指针未移动，代码与候选一致。G-ssh-exposure-linux.md 的证据追加在候选树。

| 能力 | 第一批状态 |
| --- | --- |
| `ssh.connect` | 持续拥有原连接，支持稳定意图，不重复拨号。 |
| `ssh.disconnect` | 所有者按连接代关闭；工作台可关闭外部连接。 |
| `ssh.connections.status` | 只向外部返回本主体当前有权的状态；工作台带来源显示外部连接。 |
| `ssh.hostKey.decide` | 原主体、原跳点、原待答修订和精确指纹，仅本次信任。 |
| `ssh.shells.open` | 可选 execute/high，绑定原连接和意图键。 |
| `ssh.shells.list` | 可选 read/normal，按所有者、连接代和当前授权过滤。 |
| `ssh.shells.close` | 可选 execute/high，外部按自有 shellId；工作台可关闭。 |
| `ssh.shells.read` | 新增可选 read/normal，有界 UTF-8 字节游标，最多等待 5 秒。 |
| `ssh.shells.write` | 新增可选 execute/high，最多 16 KiB，保护存储 HMAC 绑定输入。 |
| `ssh.shells.resize` | 新增可选 execute/normal，绑定自有 PTY。 |
| `ssh.jobs.prepare`、`ssh.jobs.start`、`ssh.jobs.get`、`ssh.jobs.output.read`、`ssh.jobs.cancel`、`ssh.exec.cancel` | 现有作业主动执行撤权清理，原作业在重新授权和 C05 恢复后仍不可访问；增加短等待。 |

Node 24.21.0 下 `pnpm exec tsc --noEmit -p plugins/ssh`、`public-resources.engine.test.ts` 定向 8 项、`domain-exposure.engine.test.ts` 2 项通过。新增 E2E spec `tests/e2e/ssh/owned.spec.ts` 的 CLI / HTTP MCP 两项按职责边界未运行。

## 第二批

候选 7255ad6d，父 f694bd71。SSH 单包类型检查、CLI / MCP 字节传输定向 2 项、目录 2 项、原有 SFTP 11 项通过。E2E 文件追加字节往返、本机路径拒绝、跨主体和撤权场景，未运行。

| 能力 | 第二批状态 |
| --- | --- |
| `ssh.fileSessions.open` | 可选 execute/high，绑定活动连接代和稳定意图。 |
| `ssh.fileSessions.list` | 可选 read/normal，仅原主体当前授权，工作台标记来源。 |
| `ssh.fileSessions.close` | 可选 execute/high，限制原主体；工作台可关闭。 |
| `ssh.fileSessions.properties` | 可选 read/normal，读取当前自有会话元数据。 |
| `ssh.fileSessions.document.open` | 可选 read/high，复用既有文档版本与大小限制。 |
| `ssh.fileSessions.localList` | 仅工作台，外部 Engine 本机目录继续关闭。 |
| `ssh.sftp.list` | 可选 read/normal，自有会话目录。 |
| `ssh.sftp.read` | 可选 read/high，有界远端 UTF-8 文本。 |
| `ssh.sftp.write` | 可选 write/high，自有远端会话；稳定意图，覆盖要求原目标修订。 |
| `ssh.sftp.upload` | 可选 execute/high，最多 256 KiB 的内联 base64，拒绝 Engine 本机路径。 |
| `ssh.sftp.download` | 可选 execute/high，按字节偏移分页，拒绝 Engine 本机路径。 |
| `ssh.sftp.cancel` | 可选 execute/high，仅原会话和指定传输 ID。 |
| `ssh.sftp.mkdir` | 可选 write/normal，需要自有会话和稳定意图。 |
| `ssh.sftp.rename` | 可选 write/high，需要原修订，覆盖另核对目标修订。 |
| `ssh.sftp.delete` | 可选 write/high，需要原修订，仅文件或空目录。 |

## 第三至第六批

| 候选 | 能力与实证 |
| --- | --- |
| 2d54d475 | `ssh.transfers.start/startBatch/list/decide/cancel/pause/resume/retry/recheck/origin/clearHistory` 默认关闭，使用自有远端文件会话和独立队列；冲突核对原修订，撤权取消。队列定向 2 项、原传输发布 4 项通过。 |
| edadaa19 | `ssh.forwarding.runs.start/resume/stop` 默认关闭，固定目标规则由工作台保存，监听由 Engine 分配 127.0.0.1 端口；`ssh.forwarding.runs.list` 对外按主体过滤。转发定向 4 项通过。动态代理和远端监听模式未开放。 |
| da2cdc15 | `ssh.exec.run` 复用自有已准备作业，`ssh.jobs.list` 增加列表/工作台取消，`ssh.knownHosts.forget` 限当前授权及精确指纹。Exec 和指纹定向 4 项通过。 |

第六批候选 d733711d0c0462d03381012eec7b799f567128ce。开放 `ssh.fileSessions.search/cancelSearch/document.save/changeProperties/createEntry/moveEntry`，按连接代及原修订验权。文件 CLI / HTTP MCP 定向 2 项通过。

## 第七批

外部监控订阅和面板独立采样，进程或容器的固定查询以意图键对账，结果只在内存短期保留。用户只能回答本主体原尝试、跳点和修订的键盘交互挑战。外部工作区以本主体连接创建分栏、按原代次重连并能另存模板，保存的模板登录命令不随外部工作区启动。工作台可查看来源并关闭。修改工作区、监控和主机配置时按当前原绑定再校验。

## 未完成

- ssh.archives.support 和 ssh.archives.run 等待把现有依赖 Windows 原生 ZIP 后端和本地暂存的流程接入受限的远端文件会话，并验证实际归档。
- ssh.fileSessions.directory、ssh.fileSessions.prepareDirectory、ssh.fileSessions.commitDirectory 等待将原 Shell 的目录提示符、修订及输入持有权接入自有 PTY。
- ssh.hosts.import.confirm 等待补充导入预览确认与新主机、分组及授权范围的发布合同。
- ssh.fileSessions.localList 按任务裁决保留工作台专用。
- 外部转发目前支持固定目标的本机回环规则。动态代理及实际回环绑定不可由现有协议回执确认的远端监听仍未开放。

## 最终验证

- Node 24.21.0 与 pnpm 12.10.1。SSH 单包 `pnpm exec tsc --noEmit -p plugins/ssh` 通过。
- `plugins/ssh/test/public-resources.engine.test.ts` 40 项通过，记录在 /tmp/huhu-t47-task05-public-resources.log。包含 CLI、HTTP MCP、当前授权撤销、旧 PTY 关闭、双主体隔离、稳定意图、C05 恢复和不重放。
- `plugins/ssh/test/domain-exposure.engine.test.ts` 2 项通过。 `plugins/ssh/test/monitor.engine.test.ts` 3 项通过。另在相应批次运行 SFTP 11 项和传输发布 4 项，均通过。
- `tests/e2e/ssh/owned.spec.ts` 新增 CLI 与 HTTP MCP 两项，覆盖默认关、开、撤、工作台关 PTY、主体隔离、转发及传输、本机路径拒绝和稳定意图。 `tests/e2e/ssh/settings.spec.ts` 更新闭合项断言。按职责分工未运行 E2E、全量测试、构建和打包。

## 原关闭项逐 ID

| 能力 | 当前状态 |
| --- | --- |
| `ssh.monitor.tools.read` | 可选，默认关闭 |
| `ssh.monitor.session.open` | 可选，默认关闭 |
| `ssh.monitor.session.get` | 可选，默认关闭 |
| `ssh.monitor.session.change` | 可选，默认关闭 |
| `ssh.monitor.panels.change` | 可选，默认关闭 |
| `ssh.forwarding.runs.start` | 可选，默认关闭 |
| `ssh.forwarding.runs.resume` | 可选，默认关闭 |
| `ssh.forwarding.runs.stop` | 可选，默认关闭 |
| `ssh.archives.support` | 待完成 |
| `ssh.archives.run` | 待完成 |
| `ssh.transfers.start` | 可选，默认关闭 |
| `ssh.transfers.startBatch` | 可选，默认关闭 |
| `ssh.transfers.list` | 可选，默认关闭 |
| `ssh.transfers.decide` | 可选，默认关闭 |
| `ssh.transfers.cancel` | 可选，默认关闭 |
| `ssh.transfers.pause` | 可选，默认关闭 |
| `ssh.transfers.resume` | 可选，默认关闭 |
| `ssh.transfers.retry` | 可选，默认关闭 |
| `ssh.transfers.recheck` | 可选，默认关闭 |
| `ssh.transfers.origin` | 可选，默认关闭 |
| `ssh.transfers.clearHistory` | 可选，默认关闭 |
| `ssh.workspace.runs.list` | 可选，默认关闭 |
| `ssh.workspace.runs.start` | 可选，默认关闭 |
| `ssh.workspace.runs.reconnect` | 可选，默认关闭 |
| `ssh.workspace.runs.close` | 可选，默认关闭 |
| `ssh.workspace.runs.saveTemplate` | 可选，默认关闭 |
| `ssh.knownHosts.forget` | 可选，默认关闭 |
| `ssh.exec.run` | 可选，默认关闭 |
| `ssh.fileSessions.open` | 可选，默认关闭 |
| `ssh.fileSessions.list` | 可选，默认关闭 |
| `ssh.fileSessions.close` | 可选，默认关闭 |
| `ssh.fileSessions.localList` | 工作台专用 |
| `ssh.fileSessions.search` | 可选，默认关闭 |
| `ssh.fileSessions.cancelSearch` | 可选，默认关闭 |
| `ssh.fileSessions.directory` | 待完成 |
| `ssh.fileSessions.prepareDirectory` | 待完成 |
| `ssh.fileSessions.commitDirectory` | 待完成 |
| `ssh.fileSessions.document.open` | 可选，默认关闭 |
| `ssh.fileSessions.document.save` | 可选，默认关闭 |
| `ssh.fileSessions.properties` | 可选，默认关闭 |
| `ssh.fileSessions.changeProperties` | 可选，默认关闭 |
| `ssh.fileSessions.createEntry` | 可选，默认关闭 |
| `ssh.fileSessions.moveEntry` | 可选，默认关闭 |
| `ssh.sftp.list` | 可选，默认关闭 |
| `ssh.sftp.read` | 可选，默认关闭 |
| `ssh.sftp.write` | 可选，默认关闭 |
| `ssh.sftp.upload` | 可选，默认关闭 |
| `ssh.sftp.download` | 可选，默认关闭 |
| `ssh.sftp.cancel` | 可选，默认关闭 |
| `ssh.sftp.mkdir` | 可选，默认关闭 |
| `ssh.sftp.rename` | 可选，默认关闭 |
| `ssh.sftp.delete` | 可选，默认关闭 |
| `ssh.shells.open` | 可选，默认关闭 |
| `ssh.shells.list` | 可选，默认关闭 |
| `ssh.shells.close` | 可选，默认关闭 |
| `ssh.hosts.import.confirm` | 待完成 |

Lead 验收（2026-11-22）：49/56 开放部分通过，链尾 `22508ce8` 合入集成 `b25c6322`（ssh/engine tsc、oxlint、oxfmt 通过；定向 vitest 与 E2E 见后续）。`ssh.fileSessions.localList` 按裁决保持工作台专用（Engine 本机文件系统）。其余 6 项（archives.support/run、fileSessions.directory/prepareDirectory/commitDirectory、hosts.import.confirm）与外部动态代理/远端监听转发转 task06。
  Lead 补跑（集成 `bed4beed`）：manifest 缺 7 个新工具名（capability-catalog 失败）由 Lead 补齐；owned.spec 把完整 shell 记录传入严格输入（INVALID_INPUT）且未选中终端主机，Lead 修正。vitest ssh+catalog+tool-access 16 文件 121/121；`pnpm build`；tests/e2e/ssh 全部 17/17（含 owned CLI 与 HTTP MCP）。
