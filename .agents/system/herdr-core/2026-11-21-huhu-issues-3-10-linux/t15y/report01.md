# t15y/task01 独立审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t15y`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t15y/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t15y-report01.md`
- 执行结果 — `done`

## 结论

Mail 时间筛选修正与实际控件匹配。终端性能用例仍会因角色不匹配卡在定位，且裁样本的办法可能丢弃洪流期间发出的慢输入。Vault 的同目录批量扫描收益有单测证据，批内缓存扩大了外部写入绕过正文大小限制的时间窗口，也增加了跨多层目录的临时内存占用。

## 规格审查

1. **[P1] 终端历史搜索框的角色错误，性能用例到不了断言。** [perf.spec.ts:278](../../tests/e2e/perf.spec.ts#L278) 改对了可访问名称，但 [HistoryPanel.tsx:162](../../plugins/agent-cli/src/ui/history/HistoryPanel.tsx#L162) 渲染的是无 `list` 的 `<input type="search">`，对应 `searchbox`。现有 [shell.spec.ts:1406](../../tests/e2e/shell.spec.ts#L1406) 已用相同名称和 `searchbox` 操作它。旧日志 `targeted-failed-05a748b6.log:272–286` 记录的是旧名称导致的等待超时。当前 `textbox` 同样匹配不到该控件。将角色改为 `searchbox`，在发送启动洪流的 Enter 前确认控件可用，避免把定位耗时计入洪流窗口。

2. **[P2] 用已完成样本数裁剪会漏掉洪流期间的慢输入。** [perf.spec.ts:265](../../tests/e2e/perf.spec.ts#L265) 在第二帧回调才追加耗时，[perf.spec.ts:273](../../tests/e2e/perf.spec.ts#L273) 的轮询在看见结束文本时保存数组长度，[perf.spec.ts:291](../../tests/e2e/perf.spec.ts#L291) 用该长度截断。按键发生于结束前、第二帧发生于轮询之后时，慢样本会被裁掉。用当前探针原样模拟 10 个 20 ms 样本和 1 个结束前发出、结束后完成的 250 ms 样本，实际保留 10 条、p95 为 20 ms；按键时间属于洪流的 11 条样本 p95 应为 250 ms。这样即使严格启用 100 ms 断言也会误过。反过来，结束文本已可见而轮询未执行时，后续按键可能被计入；循环先撞到时间或次数上限时，结束文本断言也可能领先轮询，导致 `doneAt` 尚未设置而失败。现有监听还计入启动用的 Enter，也未确认输出已开始。按搜索框的按键发生时刻与实际输出的起止边界判定归属，等待归属窗口内的帧回调完成后再计算 p95，保留至少 10 条及 100 ms 阈值。[性能契约](../../.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/quality.md#L44)

3. **[P2] 同目录后续文本可能使用过期大小，扩大超过 10 MiB 文件被整读的窗口。** [vault-index.ts:189](../../packages/vault/src/index/vault-index.ts#L189) 在首条事件保存整目录元数据，后续事件用缓存的 `size` 更新树条目。[vault-index.ts:131](../../packages/vault/src/index/vault-index.ts#L131) 据此决定是否调用 `readFileSync`。若外部同步在首份快照之后、后续笔记处理之前把笔记从 10 MiB 以内替换成更大文件，新代码仍会整读并解析。基线在轮到该笔记时重新扫描，在替换已完成的这个时序下会跳过正文。基线自身也存在该笔记 stat 与读取之间的竞态。补丁把窗口扩展到了前面同目录事件的处理时间。后续 watcher 事件可以刷新树元数据，但无法撤回已经发起的整读；当前证据为代码推导，未测得实际 RSS 或退出影响。建议以正文读取时的大小约束保护该入口，同时保留批内批量扫描收益。[既有大小行为用例](../../packages/vault/test/vault-index.test.ts#L162)

4. **[P3] 跨父子目录的大批次同时保留重叠的递归快照。** [vault-index.ts:178](../../packages/vault/src/index/vault-index.ts#L178) 将所有已访问父目录的快照留到批次返回，且 [snapshot.ts:37](../../packages/vault/src/watch/snapshot.ts#L37) 会递归填入全部后代文件。若 30 层祖先目录各有一个本批变动文件，最深目录还有 10,000 个未变动文件，光这些未变动文件就会被约 30 份快照同时持有，共约 30 万条记录。基线逐事件释放对前一份快照的引用。这个差异是可推导的临时活跃数据量，未测得具体 RSS，单目录收益用例也不覆盖该形态。若保留目录级缓存，可只保留该目录本批要用的直接文件信息，并沿用当前忽略和普通文件判定。

## 已核对的行为与项目规范

- **Mail 定位。** [mail.spec.ts:190](../../tests/e2e/workflows/mail.spec.ts#L190) 的精确 `combobox` 名称与四份固定候选的失败快照一致，每份 `error-context.md:99–100` 都显示 `combobox "时间"` 和 `option "全部时间"`。四份 trace 都停在旧 `getByLabel`。控件是原生单选 `select`，`全部时间` 对应 `value="all"`，补丁保留 `selectOption("all")` 和随后的邮件内容断言。四项 Graph 业务断言仍需在候选上实跑。[MailModule.tsx:788](../../plugins/mail/src/ui/MailModule.tsx#L788)
- **Vault 批内语义。** [watcher.ts:211](../../packages/vault/src/watch/watcher.ts#L211) 向 [boot.ts:599](../../apps/engine/src/boot.ts#L599) 交付批次，索引同步处理，批内没有 JS 事件循环让出点。稳定文件系统下，原有的删除和重命名源清理顺序、忽略过滤、目录树和逐路径内容索引仍成立。每批新建本地 Map，重建期间的 `dirty` 记录和 `refreshPaths` 的逐路径刷新仍沿原入口。外部写入可以在同步处理期间改变磁盘，后续刷新依赖有效的新事件。要排查的风险集中在上述窗口和临时保留量。
- **Vault 回归有效性。** [vault-index.test.ts:27](../../packages/vault/test/vault-index.test.ts#L27) 的计数包装调用真实 fs，初始构建、夹具写入和检索均在计数区间之外，同时核对 24 个任务可检索和最终文件数。第二项覆盖稳定夹具内的混合批、嵌套目录、忽略规则、反链和下批重新读取。引用 t15v 已有结果，修复前 48 次目录读和 648 次 stat，修复后 2 次和 27 次，单测文件 14 项通过。计数证明同步文件操作减少，千行任务滚动后 `app.close()` 的根因仍未知。[t15v 报告](t15v-report01.md)
- **规范轴。** 在四份差异内未发现另外的明确项目规则违反。100 ms、至少 10 条、`atMost` 的严格模式条件仍与基线一致。当前终端夹具仍沿用 `yes | head` 后无条件输出结束标记的设计，标记只表明终端显示到尾部。实际 10 MiB 输出、按键是否覆盖整个输出区间及实际 p95 均待实测。

## 范围与验证

核对了 topic 的 Lead 与工作树记录、manifest 中 `t15y/task01.md active`、本机终端 `t15y`。审查对象为 integration 分支 `impl/huhu-acceptance-followup`、HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085` 的四个未提交差异。按以下 Git blob 固定本次所见版本，同工作树其余文件未纳入审查。

| 文件 | Git blob（前 12 位） |
| --- | --- |
| `packages/vault/src/index/vault-index.ts` | `bca1aea4bb26` |
| `packages/vault/test/vault-index.test.ts` | `4bf190be91c8` |
| `tests/e2e/perf.spec.ts` | `04b03577f7e6` |
| `tests/e2e/workflows/mail.spec.ts` | `885ae424b400` |

- `git diff --check 05a748b6 -- <上述四文件>` 通过。读取 `../agent-linux/temp/final-audit/targeted-mail-05a748b6.log`、`targeted-failed-05a748b6.log` 及对应已有文本 trace。
- 用 Node VM 执行从当前 spec 取出的采样回调，由可控的按键、帧、DOM 标记和轮询顺序验证两种边界。保留 10 条并丢掉 250 ms 的慢样本，另一组保留了在 DOM 已显示结束标记之后发出的样本。此探针验证数组裁剪语义，没启动应用。
- 审查产物为本报告，代码未编辑。无审查阻碍，Lead 主动收取。

## 未运行的验证

- 本轮未重复运行 VaultIndex 单测，未测多目录批次的 RSS 和外部进程并发写入。
- 未执行 Electron/Playwright E2E。待复核 `tests/e2e/perf.spec.ts` 的 10 MiB 输出、千行滚动和退出，以及 `tests/e2e/workflows/mail.spec.ts` 四项共用 Graph 工作台设置的用例。
- 未执行构建、打包、全量测试、全仓类型检查、lint、knip、视觉取证。
