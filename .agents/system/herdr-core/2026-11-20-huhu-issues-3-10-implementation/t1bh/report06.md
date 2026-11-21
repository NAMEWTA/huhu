# 冻结候选独立复验 06

复验对象 `b3833a203a8cb54c0ab0b57a352f9601eed216c3`。以下代码行号以该 Git 对象为准。发现四项 P2，未发现 P1。首页的故障隔离与自动化卡片已有桌面证据，手动重试及其副作用尚未验完。

## P2 发现

### #8 · 子集恢复成功后，等待中的 OAuth 仍可新建同地址账号

最短复现是在空 Vault 为地址 A 发起新 Gmail OAuth，让回调保持等待。随后恢复另一个账号 ID、同地址 A 的合成 Mail 子集，再完成原 OAuth 回调。子集在地址锁内检查冲突，OAuth 发起时也检查，但 OAuth 最终在同一地址锁内直接执行按账号 ID 的写入。两个 ID 均能发布，OAuth 对后建的账号返回 `configured`。反过来先完成 OAuth，子集的地址冲突检查会拒绝恢复。 [OAuth 发起与分配 ID](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts#L200) [OAuth 回调](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts#L260) [子集发布与 OAuth 锁](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts#L161) [OAuth 提交](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts#L197) [凭据存储按实体校验](../../../../../temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts#L193)

本机探针运行冻结版账号服务、真实地址锁和邮箱定义校验，用内存替身接收凭据写入和合成 IMAP 发现。先恢复再 OAuth，实际观察到两条同地址、不同 ID 的记录，OAuth 提交仍含原会话见证。先 OAuth 再恢复，观察到 `VERSION_CONFLICT`。探针没有执行回调 HTTP 流程，发起和回调的接续由冻结调用链核对。应在新授权发布时持同一地址锁重新校验。 

### #4 · Pi 分支的活动匹配仍可把替换件定位到原 Pane

Pi 新分支只登记生成的 `huhu-…` 原生 ID，未登记实际分支 JSONL 的物理历史 ID。最短复现是让一个分支保持运行，把它的 JSONL 移走，在同一路径写入保留分支 ID 和 cwd、消息不同的文件，然后重开历史。旧行会以物理 ID 拒绝，但新行满足分支 fallback 的 ID、cwd 和扫描内唯一性，显示活动并解析到原 Pane。此时 Core 校验只能确认原 Pane 仍在运行。 [分支 ID 与会话登记](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L480) [历史匹配](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L578) [定位与终端校验](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L721)

隔离探针使用合成 Pi JSONL 和冻结匹配函数。替换后历史 ID 已变化，旧引用读取失败，替换件有不同 transcript，实际活动匹配函数仍接受替换件作为该运行分支。探针没有创建真实 Pane。 

### #4 · 上一候选的存量活动绑定失去定位和防重

最短复现是用 `7ff591a0` 恢复一条 Pi 记录，保留原 Core Pane，再用 `b3833a20` 重开 Engine 和同一 Vault。旧会话已经持久化旧算法的 `historyId`。新扫描加入物理文件身份，原文件字节未变也得到新 ID。带旧 ID 的会话只能按等值匹配，原行失去活动标记和定位，启动前防重使用同一匹配条件，也可能放行一次额外恢复。同一变化使旧版按哈希保存的固定项失效，现有 `provider:id` 回退无法识别旧哈希。 [持久绑定](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L483) [新历史 ID](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L194) [匹配与防重](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L578) [固定项读取](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L639)

隔离探针对同一未修改 JSONL 运行两版扫描，用新匹配函数读取旧运行绑定，并以真实 PinStore 保存旧哈希。结果为活动绑定不匹配，固定文件中仍有旧键但两条现行查找路径均未命中。影响限定为已保存上一候选绑定或固定项的 Vault。本次未运行升级后的真实双 Pane 流程。 

### #4 · Claude / Codex 的恢复与分支一律降为预览

最短复现是列出当前 Space 中一条原生 UUID 唯一、扫描和启动都用默认存储的 Claude 或 Codex 记录。列表的恢复和分支资格均为 false，直接走历史启动入口也会在提交 Core 前拒绝。这样封住了报告 05 的跨存储错误路由，也取消了原先可用的恢复和分支。W5.2 要求逐一核验 Claude/Codex/Pi 的原生恢复与分支，D07 要求保留现有 Claude/Codex 历史行为。当前候选仍有这项规格缺口。 [冻结资格与拒绝点](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L575) [W5.2 验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W5.2-history-restore.md) [D07](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/source.md#L580)

## 其余规格与行为证据

- **Mail 缓存。** 确认后先中断旧代，排空旧同步和持久写，再取共享快照写锁。清理前保全可核验的旧已读覆盖，清理对象为受管缓存及文本索引。定向真实 Engine 测试覆盖迟到 IMAP、重启与重建，保留账号认证和修订、草稿附件、已读覆盖与未知投递，SMTP DATA 仍为原有一次。 [清理路径](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/message-cache.ts#L467) [隔离测试](../../../../../temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts#L169)
- **Mail 子集与 OAuth 见证。** ZIP 预检在临时目录通过共用 Huhu 导入器校验，目标 Vault 零写入。提交按账号锁排序，进入共享快照写锁，再在地址锁内发布该账号定义，归档不随账号带入本机认证。出错后按实际发布的 `restoredFrom` 或移除墓碑核实，或回滚暂存路径。OAuth 见证仍与新凭据同代发布，重新授权保留 `restoredFrom`。草稿和发件记录读取入口不持快照锁，发布前暂存内容的读可见性仍是边界。既有隔离测试覆盖冲突拒绝、取消、回滚、确认写失败后重开补认、未知投递和无新增 SMTP DATA。 [预检](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-archive.ts#L65) [恢复对账与锁](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L205) [提交次序](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L306) [OAuth 见证](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts#L150)
- **首页。** `home.summary` 失败收敛在概览卡。笔记、专注和自动化摘要独立取数。自动化 manifest 同时进入 Engine 定义表和 UI 贡献校验；卡片只读规则数和可选最近运行。Canary trace 的 `fufh@61–76` 经过概览错误、专注和近期笔记可见、添加并保存「自动化摘要」、规则数和空运行断言。首个失败动作 `fufh@77` 是保存后点击概览「重试」超时。保存发布布局变更，现有事件规则会令整个 `home.` 查询失效，可能触发自动重查，让重试按钮先消失。Trace 没有请求体来证实这次重查的能力名。手动重试、重试前后布局字节与运行记录一致、以及跳转入口在该次 canary 未完成。 [首页数据依赖](../../../../../temp/issue-worktrees/integration/packages/workbench/src/home/HomeModule.tsx#L50) [插件贡献](../../../../../temp/issue-worktrees/integration/plugins/automations/src/ui/index.tsx) [保存后失效路径](../../../../../temp/issue-worktrees/integration/packages/workbench/src/engine-client/query.ts#L32) [冻结桌面用例](../../../../../temp/issue-worktrees/integration/tests/e2e/workflows/acceptance.spec.ts#L484)
- **Pi 源文件和常规定位。** 扫描和预览均在打开的文件句柄上解析，预览将同一已核验句柄交给 transcript 阅读器。物理替换改变 ID。正常追加保持物理 ID，旧启动 revision 会拒绝，刷新后仍可启动。独立探针与冻结测试覆盖这两种结果。Core 启动仍接收文件路径，最终复核与原生 CLI 打开文件之间有交接窗口。Canary 原生 Pi 用例通过，覆盖常规预览、分支、恢复和跨 Space 定位，并核对同一原 terminal ID 及原 Space 会话数。 [文件句柄](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L170) [历史测试](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/history.test.ts#L193) [原生启动](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L524) [桌面验证](../../../../../temp/issue-worktrees/integration/tests/e2e/shell.spec.ts#L1261)

## 规范与门禁范围

Mail 复用已存在的快照写锁、归档校验与凭据存储。问题在地址锁内的新建校验没有覆盖 OAuth 最终发布。首页保留插件对业务数据的所有权，布局只保存实例与配置。W5 预览复用同一文件句柄，活动匹配对新版文件、分支和旧绑定的处理仍有上述缺口。

`04bd14e4-focused.log` 定向 Vitest 为 50 通过、3 跳过，Mail 的 OAuth 两条与 outbox/cache/subset 十一条均通过。从 `04bd14e4` 到冻结对象的 `plugins/mail` Git 差异为空。`b3833a20-canary.log` 的桌面构建标识为 `b3833a2`，结果为 6 通过、2 失败。Claude/Codex 只读扫描、原生 Pi 和两个桌面 OAuth 用例通过。固定用例已观察到置顶，随后旧断言查找 `claude:old`，实际落盘为哈希；该次运行未验证其后的取消固定，且这个断言失败与前述旧哈希兼容问题各有独立证据。另一失败为首页重试超时。 [Mail 定向日志](../../../../../temp/issue-baseline/04bd14e4-focused.log#L18) [冻结 Canary](../../../../../temp/issue-baseline/b3833a20-canary.log#L390)

本次仅从 Git 对象读取候选源码，另读取既有日志和合成 Canary trace。两轮本机临时探针分别使用合成 Mail 账号与合成 Pi 历史，目录均已清理。未改代码、切换或重建集成树，未访问真实凭据或 provider。
