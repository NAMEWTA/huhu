# t168/task05 两项 P2 返工关闭复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t168`，Lead `t3p`
- task — `task05.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t168/task05.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t168-report05.md`
- 执行结果 — `done`

## 两项 P2 关闭核对

**Vault 暂扣创建交叉时序通过。** 轮询按实际目录拼写处理路径，构建候选池时过滤掉本轮快照已不存在的暂扣创建。已消失的旧名无法再消耗自己的删除记录，新名可以和旧名配对。轮询清空已处理的暂扣队列，后续定时器在空队列时返回。无快照参数的原生批处理沿用此前的候选逻辑。 [watcher.ts:129](../../packages/vault/src/watch/watcher.ts#L129) · [watcher.ts:187](../../packages/vault/src/watch/watcher.ts#L187)

独立复跑 task04 的重订阅探针，控制原生回调和解除订阅的时序，保留真实磁盘改名、索引和自动轮询，模拟大小写不敏感的旧拼写查找。桥接阶段实际只发出一条 `readme.md → README.md` 的 `renamed`。经过 250 ms 暂扣定时器并再次轮询后，批次仍只有一条。树、全文、反链均只有新名，标签计数为 1。新增单测从实际注册的回调喂入创建事件，推进暂扣定时器并验证不重发。Lead 日志从 1 失败、8 通过转为两个文件 30 通过。 [task04 探针](t168-report04.md) · [watcher.test.ts:74](../../packages/vault/test/watcher.test.ts#L74) · [红灯](held-create-poll-red.log) · [绿灯](held-create-poll-check.log)

**Agent 删除最后一条未知意见后可接管。** `deleteComment` 先将删除落盘。删除的是状态未知的意见时，同步让仲裁器检查当前恢复连接，以及该会话是否还有未知意见。若仍在执行审核借用，释放时还原原视图并做同一检查。桥继续用现有 `control-free` 消息，渲染端收到后撤回旧证明并发起重连。 [sessions.ts:1607](../../plugins/agent-cli/src/engine/sessions.ts#L1607) · [input-ownership.ts:22](../../plugins/agent-cli/src/engine/input-ownership.ts#L22) · [input-ownership.ts:48](../../plugins/agent-cli/src/engine/input-ownership.ts#L48) · [terminal-bridge.ts:27](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L27) · [TerminalView.tsx:118](../../packages/ui/src/components/TerminalView.tsx#L118)

独立复跑 task02 的真实会话服务、持久记录、仲裁和终端桥探针，用替身控制 Core 收据及 WebSocket。删除未知意见后，连接的模式序列为 `observe → control-free`，删除未发起送信 RPC。旧证明依旧不能提交新意见。探针模拟前端重连，取得新的正常证明，键盘写入和新意见送达各验证一次。新增单测验证两条未知意见中删第一条不通知、删最后一条只通知一次，以及重连后只发新意见。聚焦日志为 12 通过、46 过滤。 [task02 探针](t168-report02.md) · [sessions.test.ts:796](../../plugins/agent-cli/test/sessions.test.ts#L796) · [t15t 报告](t15t-report03.md) · [绿灯](t15t-review-recovery-green.log)

## 直接发现的测试回归

**[P3] 新增监听用例在临时目录经过符号链接时会误失败。** 监听实际订阅 `realpathSync(root)`，用例向这个订阅的回调注入了使用未经解析的 `root` 生成的路径。若临时目录带符号链接，事件计算出的相对路径以 `..` 开头，被监听器按库外路径过滤。暂扣队列从未收到旧名，轮询自然只报告 `README.md` 的 `created`，用例却期望 `renamed`。本机 Linux 普通临时目录下单文件 9 项全过。把 `TMPDIR` 指向测试专用的目录符号链接，单跑新增用例，实际在第 86 行报出 `created`。可用 `realpathSync(root)` 或已捕获的订阅实参构造注入路径。此问题影响测试夹具，两个业务反例均已在定向探针上关闭。 [watcher.ts:62](../../packages/vault/src/watch/watcher.ts#L62) · [watcher.test.ts:78](../../packages/vault/test/watcher.test.ts#L78)

## 范围与未验证

已核对 topic、manifest 的 `t168/task05.md active` 与本机终端 `t168`。工作树 `impl/huhu-acceptance-followup`，HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。限定差异 `git diff --check` 通过。只读业务文件，未复核 Notes。

| 文件 | 已复核 Git blob |
| --- | --- |
| `packages/vault/src/watch/watcher.ts` | `b6ad15dd6d3bbaf77ee04159507d3e12f176b44b` |
| `packages/vault/test/watcher.test.ts` | `caa808380d68da8169ca8328e6c64a5215b6196c` |
| `plugins/agent-cli/src/engine/input-ownership.ts` | `da2c7f29161d0c8379504caf5ce2f1f1056b9980` |
| `plugins/agent-cli/src/engine/sessions.ts` | `6801cfcd1f10648c9e427a40ccb83b0ccdff5eaa` |
| `plugins/agent-cli/test/sessions.test.ts` | `4457feaedeaea0bd1fbec5ca32232da97cd5a9bb` |

未运行原生大小写不敏感卷上的重订阅、真实 Herdr Core/WebSocket 的 UI 重连、Electron E2E、构建、打包与全仓门禁。
