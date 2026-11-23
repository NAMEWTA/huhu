# 任务报告 · #6 Notes、Archives、Inbox 和 Agent Guide

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t27
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t27/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t27/report01.md
- 执行结果 — done

## 结论

33 项领域工具已可逐项开放，原有 26 项可选工具一并对齐默认关闭。隔离 Vault 中的真实 CLI 和 HTTP MCP 验收覆盖全部 33 项。25 个写入项并发、丢弃应答、撤权和重启后的对账均已验证。C05 恢复后的 HTTP MCP 会话取得原 operationId，领域效果保持一次。Inbox 转换的真实源和目标保留原文，新增持久回执及目标幂等账本使用安全引用。

## 产物与改动

- 候选提交 — `d85d21b59228f27858a2f5884fedf6585428dacf`。
- 验收基线已包含 C05，父为 `a98b3079543c612a3abea69b22575bd8ab1c3897`。分支 `impl/huhu-issues-3-10-g6-notes`，工作树 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`。
- 证据写入候选树的 `.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G-notes-inbox-guide-exposure-linux.md`。工作树 `.agents` 挂载只读，业务代码和测试通过临时索引核对到候选。
- Notes 与 Archives 共享一个 Vault 写队列。Inbox 按源 id 串行化状态修改及转换，目标创建复用原领域接口。源文件在目标已受理后出现冲突时保留待核实结果。Guide 多文件覆盖通过现有 OperationLog 成组发布，覆盖前备份原始字节。
- Lead 后续授权的 Engine 测试接线单列。`engine.test.ts` AR-15 验证档案类型默认拒绝而可选开放，`external-plugins.test.ts` 将冻结描述符的两处 spy 移到 InboxService.capture 与 NotesService.save，保留原上下文与持久步骤断言。
- Lead 后续授权的 Tasks 投影单列。`tasks.create` 对受信、非扩展委托的 `plugin:inbox` 返回任务 ID，工作台和直接外部结果仍为完整 Task DTO。转换测试用真实 Tasks、Archive 和 Note 目标验证原文及回执。

### 逐 ID 最终状态

以下 33 行的 `exposable/defaultExposed` 均为 `true/false`。无「闭」裁决。每行均由 `33 capabilities default off, explicitly enabled, revoked and reconciled after restart` 在真实 CLI 和 HTTP MCP 下执行。表中注明主要对象守卫及测试回读，补充错误对象用例见验证段。

| 能力 ID | scope/risk | 意图 | 校验与试验结果 |
| --- | --- | --- | --- |
| `archives.types.list` | read/normal | 无 | 只读取本库类型、版本、受影响档案及索引已有引用，检查返回的真实反链 |
| `archives.types.save` | write/normal | 持久 | 类型来源、字段、修改版本及受影响路径，同键仍一份类型，回执仅引用 |
| `archives.types.delete` | write/high | 持久 | 预检档案与引用，确认及版本一致后入回收站，原路径消失 |
| `archives.addFile` | write/normal | 持久 | 当前档案版本、合法文件名、有界 Base64 及输入摘要，附件字节一致 |
| `notes.templates.list` | read/normal | 无 | 只列 Vault 内合规模板，排除保护路径、无效目标及链接 |
| `notes.templates.import` | write/normal | 持久 | 来源字节版本与真实目的目录，一份模板且字节一致 |
| `notes.textEncoding` | read/normal | 无 | 可读普通资源、原字节版本、支持的扩展及容量 |
| `notes.previewEncoding` | read/high | 无 | 按原版本有界解码，回读 `café` |
| `notes.convertEncoding` | write/high | 持久 | 原字节版本、合法编码、受管路径和链接守卫，替换一次并刷新 |
| `notes.attach` | write/normal | 持久 | 绑定所属文件与版本、由其路径推导附件目录，检查容量和字节 |
| `notes.trash` | write/high | 持久 | 当前路径、版本及已分配的笔记 ID，回执保持原 trashId |
| `notes.restore` | write/high | 持久 | trashId、原路径、目标名和占用状态，保留原对象并更新批注路径 |
| `notes.deletePermanent` | write/high | 持久 | 显式原条目确认、对象路径检查、清对应原文档批注及事件 |
| `notes.hidden.get` | read/normal | 无 | 本库偏好和内容版本 |
| `notes.hidden.set` | write/normal | 持久 | 版本和合法可读路径，回执只带新版本 |
| `notes.setFavorite` | write/normal | 持久 | 当前笔记版本及身份，重复结果一致，收藏列表回读 |
| `notes.openDaily` | write/normal | 持久 | 外部显式日期，工作台继续用 Vault 设定时区解释今天，同日路径一致 |
| `folders.create` | write/normal | 持久 | 父路径、目录名、名称冲突和保护根，实际创建一个目录 |
| `notes.draft.get` | read/high | 无 | 按可信主体与原笔记身份，独立 MCP 会话返回 null |
| `notes.draft.save` | write/normal | 持久 | 原笔记版本与当前草稿版本，安全确认，正文仅在草稿存储 |
| `notes.draft.discard` | write/high | 持久 | 当前草稿版本，本人草稿移除而原笔记保留 |
| `inbox.update` | write/normal | 持久 | id 与源版本，回读修改后的原文，回执只保存安全引用 |
| `inbox.convert` | write/normal | 持久 | 源 pending 版本、目标类型及字段，源关联和唯一目标可回读 |
| `inbox.dismiss` | write/normal | 持久 | pending → dismissed，绑定原项的当前版本 |
| `inbox.restore` | write/normal | 持久 | dismissed → pending，绑定版本并保留正文 |
| `inbox.undo` | write/high | 持久 | processed 版本一致才撤关联，后续改过的目标仍在 |
| `inbox.delete` | write/high | 持久 | 原 id、版本及确认，仅把原项送入回收站 |
| `guide.view` | read/high | 无 | GUIDE_PATHS 内状态、字节版本和内容，禁止链接越界 |
| `guide.check` | write/normal | 持久 | 确实写 needsCheck，回读标记清除 |
| `guide.preserve` | write/normal | 持久 | 绑定目标路径及字节版本，保留用户内容 |
| `guide.restoreBuiltin` | write/high | 持久 | 校验版本后保留原字节备份并覆盖，同一 backupId |
| `guide.backups.list` | read/normal | 无 | 合法本库 backupId 和允许的指南文件 |
| `guide.backups.restore` | write/high | 持久 | 有效备份和目标版本，原字节恢复及结果安全投影 |

### Lead 声明与绑定清单

- Notes owner 使用 `notes.notesCapabilityDescriptors`。新增行见上表，原有可选项为 `notes.list`、`notes.read`、`notes.create`、`notes.save`、`notes.rename`、`notes.move`、`notes.duplicate`、`notes.backlinks`、`notes.folders`、`notes.tags`、`comments.list`、`comments.create`、`comments.reply`、`comments.resolve`、`comments.reopen`、`comments.relocate`、`comments.delete`、`archives.list`、`archives.read`、`archives.create`、`archives.update`、`archives.move`、`archives.delete`。Notes manifest 已补上模板和编码五项。
- Inbox owner 使用 `Object.values(inbox.inboxCapabilityDescriptors)`，新增行与 `inbox.list`、`inbox.capture` 共 8 项。Agent Guide 使用 `Object.values(agentGuide.guideCapabilityDescriptors)`，新增行与 `guide.status` 共 7 项。各领域 apply 按同源对象绑定。
- 候选内 `apps/engine/src/boot.ts` 仅有三条静态声明的接线。59 项的运行时和静态默认均为 false。测试停用、目录保留与重新启用。
- `home.notes.recent` 位于 Lead 范围。该 handler 的下游闭包需在 `notes.list` 和每次 `notes.read` 的 `dispatcher.call` 传原 caller、requestId、signal、subject。两次委托均复核现行权限。列表拒绝即停止，任一正文拒绝时省略对应正文片段。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 33 项 CLI、HTTP MCP 默认关、打开、发现及撤销 | 66 行均执行。记录策略 revision，每行同名拒绝、允许、再次拒绝。期末核对静态和运行时共 59 项默认关 | `plugins/notes/test/domain-exposure.engine.test.ts`，CLI 和 MCP 的逐项矩阵 |
| 同键并发、丢应答、重启与未知 | 25 个写入项每端回读原 operationId；并发丢弃一份传输结果后再提交；撤权后连历史回执也拒绝；原 HTTP 句柄重启后 404，C05 恢复逻辑主体后可对账。回放前后文件哈希与业务事件一致。异参受理冲突，`guide.check` 只有空对象输入 | 同上；C05 回归仍由全量的 `packages/kernel/test/mcp-recovery.test.ts` 验收 accepted-only 的 unknown |
| 只读、副作用和停用目录 | 8 个只读项在每端单独选择后执行，重启后复测；领域哈希和事件无增量，Herdr ensure 为零，观测到的 fetch 仅回环 Engine。排除了独立后台 Versioning 影子仓库及网关运行副作用。停用目录保留声明、选择，重新启用恢复调用 | 同上，另见 `disabled domain plugins retain static declarations and existing choices` |
| 对象、源版本、受管路径及 D09 | 受管目录和嵌套链接拒绝，验证错误对象、过期版本和明确确认。草稿只归原会话和笔记身份，移动保留，旧路径的新笔记查不到。验证 Inbox 原文、转换唯一、撤销保留后来更新的产物，以及 Notes、Archives、Inbox 事件 | 同上，`guarded object paths and stale external versions remain untouched` 等 |
| 安全投影及 Guide 行为 | 两个账本没有新转换的任务正文、档案正文或原字段值。直接任务创建返回兼容 DTO。分别验 Guide 清标记、保留、保存原始备份、覆盖及恢复 | 同上，`inbox conversion retains source and target bodies without writing them to conversion receipts`、`plugins/agent-guide/test/guide.test.ts` |
| typecheck、lint、format:check、knip | 四项退出 0 | `/tmp/huhu-t27-domains.jO1YsW/gates-final.status` 和对应日志 |
| 定向 Vitest，1 worker | 9 个文件、183 项通过 | `/tmp/huhu-t27-domains.jO1YsW/targeted-final.log` |
| 全量共享锁，2 workers | 157 个测试文件、1790 项通过，8 个文件、19 项跳过，退出 0 | `/tmp/huhu-t27-domains.jO1YsW/full.log` 和 `full.status` |

使用 Node 24.21.0、pnpm 12.10.1 和独立 XDG_RUNTIME_DIR。运行 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`，同时将 Vitest forks/threads 都限制为 2。

## 阻碍与接续

无交付阻碍。原报告停在 C05 的依赖已由 Lead 合入并完成领域重启验收。测试覆盖 Linux 的 CLI、HTTP MCP 与 Engine 事件。外部草稿按可信主体及稳定笔记 ID 存放，尚无已分配 ID 的旧文件以路径和文件系统身份作绑定。现有外部捕获仍返回标题，供快速剪藏扩展示例使用，省去正文和磁盘路径。

## Lead 验收

由 Lead 核对候选与组合版本后追加。

Lead 验收（2026-11-22）：通过。候选 `d85d21b5` 快进到 `impl/huhu-issues-3-10-g6-notes`，合入集成（tasks.create 冲突合并 Agent 守卫与 plugin:inbox 投影），合入后 27 文件 365/365。home.notes.recent 委托传递由 Lead 接。终端 t27 关闭。
