# t15y/task02 独立复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t15y`，Lead `t3p`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t15y/task02.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t15y-report02.md`
- 执行结果 — `done`

## 结论

终端返工修正了历史搜索框角色和上轮丢弃慢样本的问题。采样循环仍可能在终端结束前停止且通过。Notes 补上了规范路径的保存通知，干净会话刷新、脏会话保留输入、拒绝过期写入以及回执前的自身通知均有单测证据。保存回执之后迟到的自身通知仍可能让下一笔未保存输入出现虚假冲突。

## 规格审查

1. **[P2] Notes 保存者会把迟到的自身通知误判为新的外部冲突。** [engine/index.ts:568](../../plugins/notes/src/engine/index.ts#L568) 发布的通知会广播给所有事件客户端，包括保存者。保存回执经 HTTP 返回，事件经 WebSocket 异步到达，两者到达顺序独立，断线补发也能让事件迟到。[DocumentSession.ts:781](../../plugins/notes/src/ui/documents/DocumentSession.ts#L781) 只在 `activeFileWrite` 存在时延后对账。若磁盘已保存 A，客户端已收到回执并结束这笔写入，用户继续输入 B 后才收到 A 的事件，[DocumentSession.ts:793](../../plugins/notes/src/ui/documents/DocumentSession.ts#L793) 直接把 B 的状态设为冲突，界面显示冲突提示，甚至提供放弃重载。只读 Node 探针对实际 `DocumentSession` 注入两个时序。通知在回执前时，保存成功，B 保持 `dirty`，复读确认磁盘仍是 A。通知在回执后时，同样保存成功，磁盘仍是 A、版本与会话基线相同，已有 B 却进入 `conflict`，且无额外读盘。当前 `clean.save()` 回归使用同步 EventBus 订阅，只覆盖第一种顺序。建议在脏会话上确认磁盘仍不同于最近确认的版本和正文后再报冲突，沿用现有基线代数、读序列和活跃写入守卫，或端到端关联事件和写入回执。回归应控制 HTTP 回执先交付，再输入 B，最后交付对应 WebSocket 事件，同时保留另一会话真写入时的冲突用例。[HTTP 回执与事件流](../../packages/workbench/src/engine-client/client.ts#L53) · [事件广播](../../packages/kernel/src/server/ws-workbench.ts#L26) · [冲突界面](../../plugins/notes/src/ui/NoteDocument.tsx#L248)
2. **[P2] 终端用例可能在洪流仍运行时停止施加输入，然后只以快的前半段通过。** [perf.spec.ts:295](../../tests/e2e/perf.spec.ts#L295) 达到 400 次或 20 秒就退出输入循环。即使退出时 `done` 为 false，[perf.spec.ts:299](../../tests/e2e/perf.spec.ts#L299) 仍会独立等待尾标，随后对先前样本计算 p95。若前段已有足量的快样本，收尾变慢的阶段可以完全没有输入，严格模式也会通过。上限沿用基线，返工移除了每轮 `delay: 10`，400 次上限可更早耗尽。建议让输入持续到观测到尾标，并在安全上限先到时明确判定覆盖不足。若要求计入渲染线程派发输入前的等待，应把计时起点放在输入发起时刻。当前两帧量度从键盘处理器内开始。[性能契约](../../.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/quality.md#L44)
3. **[P3] 字节数确认的是 `tee` 的管道副本，尾标未校验其 TTY 写入结果。** [perf.spec.ts:261](../../tests/e2e/perf.spec.ts#L261) 取 `wc -c` 后无条件输出尾标。本机真实 POSIX PTY 执行了当前命令，收到洪流和 `FLOOD-DONE-42-10485760`，PTY 换行转换与尾标后的流总长为 11,102,628 字节。另以 `/dev/full` 代替 TTY 写入目标做负对照，`tee` 因写失败退出 1，但 `wc` 仍返回 10485760、退出 0。完全没有洪流时现有起点和至少 10 条样本约束仍会报失败。若部分写出后失败，字节尾标单独无法排除过绿。建议同时验证 TTY 分支写入成功和字节数，注意上游 `yes` 被 `head` 截断时正常收到 SIGPIPE。若要证明 10 MiB 到达渲染器，应另核对接收端的数据量。本轮未观察到真实终端写入失败。

## 已核对的修正

- 终端使用已有 `searchbox` 角色和名称，在发 Enter 之前等待可见，按键过滤到该输入。交替 a 和 Backspace 避免触及 256 字符上限。开始与结束由终端 DOM 的输出内容标记，触发 Enter 的按键不入样。按键开始时即创建记录，结束后继续等待两帧回调。本轮从 spec 取出浏览器探针用受控帧时序执行。结束前的 250 ms 样本保持待完成，结束后的按键排除，最后得到 11 条和 p95 250 ms。上一轮的慢样本误裁已解决。至少 10 条和严格模式下 100 ms 保持原阈值。[perf.spec.ts:258](../../tests/e2e/perf.spec.ts#L258)
- Notes 等待条件写和索引刷新成功后才发路径通知，保留原事件和保存回执。watcher 原已按本 Engine 写入的版本回执过滤回声。现在事件路径用 `normalizeRelPath`，与索引路径及按路径精确查找的会话一致。用例从 `./shared.md` 和 `./shared.html` 保存，由规范路径会话接收。正常的晚到写入回执由会话串行队列核对。另一脏会话收到真实写入时保留缓冲。版本冲突拒绝时没有额外通知，磁盘保持成功写入的正文。[NotesService.save](../../plugins/notes/src/engine/service.ts#L579) · [NotesModule 订阅](../../plugins/notes/src/ui/NotesModule.tsx#L67) · [回归测试](../../plugins/notes/test/document-events.engine.test.ts#L23)
- 旧包复检越过候选身份检查后，等待 Web 保存已落盘，桌面仍展示旧正文。原始红灯两项缺少路径通知。标准化版本的已有定向日志 85 项通过，补入实际订阅者 `clean.save()` 后的最新日志 2 项通过。这些日志覆盖了真实 Engine 事件和进程内订阅，实际 WebSocket 交付顺序仍需 UI 复验。[旧包失败](candidate-profile-recheck-05a.log#L110) · [原始红灯](document-events-red.log) · [规范路径](document-events-normalized.log) · [自身通知补测](document-own-event-check.log)
- 规范轴在指定差异内未发现其他明确项目规则违反。没有扩大到 Vault 返工。

## 范围与验证

核对 topic、manifest 的 `t15y/task02.md active`、本机终端 `t15y`。integration 分支 `impl/huhu-acceptance-followup`，HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。审查以下工作树文件。新用例仍为未跟踪文件。

| 文件 | Git blob（前 12 位） |
| --- | --- |
| `tests/e2e/perf.spec.ts` | `0398bbf052ae` |
| `plugins/notes/src/engine/index.ts` | `ecc9faba7ab6` |
| `plugins/notes/test/document-events.engine.test.ts` | `f8512894d3e5` |

已检查指定跟踪文件的 `git diff --check`。执行两个 Node 内存探针和一个本机 PTY 命令探针，未启动应用。仅写本报告，Lead 主动收取。

## 未运行的验证

- 本轮未重复运行 Vitest。引用 Lead 保存的定向红绿日志。
- 未运行 Electron 或 Playwright。待在修订候选上串行核对终端 10 MiB 输出响应、Web 保存后桌面刷新与反向刷新，并覆盖两种自身通知交付顺序。
- 未执行构建、打包、全量测试、全仓类型检查、lint、knip 或视觉取证。
