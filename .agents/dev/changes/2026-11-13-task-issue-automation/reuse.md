# 复用核对记录

> 复用顺序见 `CLAUDE.md` 与 Issue §10：① Huhu 现有 → ② `temp/sources` → ③ 现有依赖 → ④ GitHub 开源 → ⑤ 小范围适配 → ⑥ 自行开发。
>
> 状态说明：
> - **已核对**：本次读过源码，有证据。
> - **仅摘要**：通过网页摘要了解，没有读原始文件。
> - **不可获取**：无法读取。不可获取不等于“没有可复用的实现”。
>
> S0 于 2026-11-13 完成，事实明细见 [s0-findings.md](s0-findings.md)。实际复制源码时，同步更新 `docs/upstream/ledger.md` 与第三方声明（保留来源、提交和许可）。参考源码只读。

## 缺口结论

| 编号 | 缺口（spec 位置） | 已检查 | 结论与复用方式 | 不直接复用的原因 |
| --- | --- | --- | --- | --- |
| R-T01 | 任务 schema 2（§2） | ① `contracts/kinds/task.ts`、`dto/task.ts`、`SemanticRepository`（已核对） | ⑤ 修改现有契约；在 task 的 schema 上做严格版本校验 | — |
| R-T02 | 保留 frontmatter 未知键（§2.2） | ① `vault/semantic/frontmatter.ts` 的 `patchFrontmatter`（已核对） | ① 直接复用 | — |
| R-T03 | 区段解析与代码围栏（§3.2） | ① `vault/index/links.ts:8-10` 的 `stripCode`、`notes/shared/links-rewrite.ts:24-32` 的 `codeRanges`（已核对）；② open-knowledge `packages/core/src/markdown/fence-regions.ts:49`（已核对）；③ 引擎侧没有 Markdown 解析依赖（已核对） | ⑤ 把两份同源正则收敛为 `packages/vault` 的共享 `codeRanges()`，按 fence-regions 的写法补齐边界；标签识别在此基础上按行进行 | 引入 remark 或 `@lezer/markdown` 到引擎侧只是为了识别围栏，依赖成本过高 |
| R-T04 | `[[双链]]` 引用、`@` 补全、`Tasks/` 纳入改写（§3.4） | ① `editor/wikilink.ts`、`MarkdownPreview.tsx:52-62`、`notes/engine/service.ts:188-270`、`links-rewrite.ts`、`scoreText`（已从 `@huhu/workbench` 导出）、`vault.tree`（已核对）；atomic `wiki-links.ts` 的 `suggest` 只有类型声明，没有实现（已核对） | ③ 引入 `@codemirror/autocomplete` 实现补全源；⑤ 扩大改写范围，并支持文件夹前缀改写；⑤ `resolveWikiLink` 与打开文件夹 | atomic 没有可用的补全实现 |
| R-T05 | 整份任务快照、提示词头、权限参数（§3.5） | ① `worker.ts:20-66`、`agent-cli/engine/prefs.ts:4-8`（已核对）；② agent-autoloop `plugins/claude/agent.ts`（`--add-dir`、权限映射、禁用 worktree 工具，已核对）；本机 `claude --help`、`codex exec --help`（已核对） | ⑤ 新增 `ProviderPref.permission`；改写 `headlessCommand`；借鉴 agent-autoloop 的 `--disallowedTools EnterWorktree,ExitWorktree` | agent-autoloop 是 hub 中心化架构，整体搬运会引入 hub 层 |
| R-T06 | 任务文件内评论（§3.3、§5） | ① `SemanticRepository.patch`（已核对）；② open-knowledge comments（`thread-store.ts`、`comment-service.ts`；评论存在 `.meta.json`，不在 md 中，已核对）、`file-lock.ts` 的 `withFileLock`（已核对） | ⑤ 由 tasks 在自己的文件内做区段条件写；评论 UI 沿用 notes 的评论样式 | open-knowledge 没有“往 md 文件内追加区块”的写入 API；CommentsService 的存储是独立文件 |
| R-T07 | 三类自动化、预览、派发互斥（§6） | ① scheduler、claims、worker、supervised、`retryRun`、reconcile、`runs.answer`、`automations.preview` / `classify`（已核对）；② agent-autoloop `kernel/decide.ts:305-335`（`claimNext` 的分组上限与 lane 互斥）、`:323`（同一 token 重投时返回原 run）、`:450-453`（`last_result` 防重复，已核对） | ① 保留调度、claim、监督、对账、预览；⑤ 新增引擎全局派发互斥，借鉴 lane 互斥的思路，但以文件 claim 的形式实现 | 不引入 agent-autoloop 的 SQLite 事件溯源和长轮询 hub |
| R-T08 | 终端命令动作（§6.4） | ① `agent-cli/sessions.ts:62-75,154-194`、Herdr `terminal.run`（接受 argv、env、cwd）、`scripts.ts`（已核对）；② orca 的终端层（只看了目录，没有深读） | ⑤ 扩展 `agent.sessions.launch`（加入 shell、command、envRefs）；把脱敏逻辑提取为 `redactSecrets` | orca 是整套 PTY 层，huhu 已经由 Herdr 托管终端 |
| R-T09 | 提醒发布任务（§6.5） | ① `notifications.create`、`tasks.create` 的幂等键（已核对） | ① 直接复用 | — |
| R-T10 | Herdr blocked 状态（§7） | ① `sessions.ts:229-251`、`herdr-client` 的 `onEvent`（已核对）；② herdr-core 0.1.19 `released.openrpc.json`、`status.rs`、`wait.rs`、`schema/README.md:125-140`（已核对）；herdr-app（没有 claude/codex 集成，已核对）；orca `agent-hooks/README.md`（hooks 回报，已核对） | ⑤ 用 `events.subscribe` 加专用连接实现 watcher，重连时用 `terminal.list` 对账；orca 的 hooks 方案留作后续增强 | 本期只读取 OSC 7501，不托管 hooks |
| R-T11 | 内部许可与外部暴露分离（§8.2） | ① `dispatcher.ts:115-124`、`permissions.ts`、`plugin-manager.ts:48`、`plugins/external.ts:156,194`、`context.ts:71-108`（已核对）；② deepseek-harness `docs/cordis-primer.md`、`docs/api-gateway.md:9,13`（`@Remote({resources})` 按资源判定，已核对）；openhanako `PLUGINS.md`、`hub/event-bus.ts`（仅摘要：manifest 中 `capabilities`/`sensitiveCapabilities` 的声明；总线本身不做授权） | ⑤ 扩展权限表与 `isGrantable`；委托链 `onBehalfOf` 借鉴 deepseek 的“在调用时检查被代理方”思路 | 不引入 Cordis 的完整框架或 openhanako 的总线（后者没有授权检查） |
| R-T12 | 三列看板与标签筛选（§2.4、§4.4） | ① `TaskViews.tsx`（原生 HTML5 拖放）、`TasksModule.tsx:45` 过滤（已核对）；Backlog.md（仅摘要） | ⑤ 扩展现有看板 | Backlog.md 只作产品参考 |
| R-T13 | 输出脱敏（§5.3、§6.4） | ① `scripts.ts:93-98`，是 `runScript` 内的闭包（已核对） | ⑤ 提取为共享函数 `redactSecrets` | — |

## 登记的例外（spec §8.1）

| 例外 | 理由 | 约束 |
| --- | --- | --- |
| notes 改写 `Tasks/` 中的双链 | 改名联动复用 notes 现有的 `links-rewrite`，不在 tasks 里另写一套 | 只改 `<task>`、`<comments>` 区段内的 `[[…]]`；条件写；不增加 `inputRevision` |
| versioning 恢复任务文件 | 恢复是 versioning 的职责 | 保留当前的 `status`、`completedAt`、`origin`、`<comments>`；拒绝恢复 schema 1 |
| versioning 通过进程内服务调用 `automations.holdRestoredInput` | 保持同步调用，避免改成异步能力调用后与扫描之间出现竞态窗口 | 只用于 hold，不扩展用途 |

## 记录的风险（本期不处理）

- `vault/write.ts:53-61` 在 expectedVersion 校验和写入之间没有锁，只有进程级的 `writer.lock`。本 change 的条件写都在同一个 Engine 进程内串行执行，所以暂不处理。如果以后出现多进程写入，再参照 open-knowledge 的 `withFileLock`。
- agent-autoloop 的结果回写有幂等 token，huhu 的 `completeTaskRun` 没有。本 change 的评论写入已经按评论 id 保证幂等，task-run 自身不需要另加 token。

## 明确不引入

并行事件总线、通用工作流引擎、分布式队列、第二套调度器、第二套终端运行时、第二套审批或问答后端、泛化评论平台、整套 Harness、openhanako 总线、agent-autoloop 的 hub 层（Issue §10）。
