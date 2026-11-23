# t168/task04 轮询大小写路径返工复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t168`，Lead `t3p`
- task — `task04.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t168/task04.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t168-report04.md`
- 执行结果 — `done`

## 规格审查

**[P2] 原生重订阅触发轮询时，暂扣的创建事件仍可能把已改名的旧路径写回索引。** Linux 原生监听发现包含子目录的新目录时会重订阅，成功后立即调用 `poll()`。如果同一原生批次暂扣了刚创建的 `readme.md`，且重订阅期间文件被改为 `README.md`，轮询会从新快照正确得到旧名删除、新名创建。随后配对逻辑把快照中已不存在的 `heldCreated` 旧名排在新名之前。旧名与同一路径的删除记录匹配，发出 `readme.md → readme.md`，消耗了本应与新名配对的删除记录。当前索引对旧名执行 `lstat`，大小写不敏感的查找命中新文件，已清理的旧路径因此重新出现。 [watcher.ts:83](../../packages/vault/src/watch/watcher.ts#L83) · [watcher.ts:154](../../packages/vault/src/watch/watcher.ts#L154) · [watcher.ts:187](../../packages/vault/src/watch/watcher.ts#L187) · [vault-index.ts:203](../../packages/vault/src/index/vault-index.ts#L203)

定向探针只替换原生订阅回调与解除订阅的时序，并模拟旧拼写查找。真实的 `VaultWatcher` 批处理、重订阅后自动轮询、磁盘枚举、改名和两个版本的索引都执行了。自写刷新后两版只有 `README.md`。重订阅的轮询实际发出旧名到自身的 `renamed` 和新名的 `created`。基线只保留新名，当前树、搜索和反链均有两个路径，标签计数为 2。追加一次轮询仍保留重复项。关闭大小写模拟时仍可观察到同路径的 `renamed`，当前索引只保留磁盘上的新名。缺陷由受控交叉时序复现。 [基线及上一轮探针](t168-report03.md)

可在使用轮询快照时，从配对候选中排除快照里已不存在的暂扣创建，保留真实删除记录供新名配对。我用内存中的单点变体验证了这一条件，同一探针只发出一次 `readme.md → README.md`，树、搜索、反链和标签均只对应新名。工作树业务文件保持原版本。 [watcher.ts:192](../../packages/vault/src/watch/watcher.ts#L192)

### 已通过的路径

- **纯轮询改名。** 上轮探针按原步骤重跑，首次轮询发出旧名到新名的 `renamed`，后续编辑只发出新名 `modified`。两条修改后的用例分别处理文件和父目录改名，断言新名可检索且反链及标签无重复。Lead 的红灯在两条用例的后续轮询断言失败，绿灯 29 项通过，含 8 项监听测试。 [vault-index.test.ts:103](../../packages/vault/test/vault-index.test.ts#L103) · [红灯日志](index-polling-case-red.log) · [绿灯日志](index-polling-case-check.log)
- **其余批处理入口。** 原生防抖和暂扣定时器继续调用无快照参数的 `flush()`，按事件路径实时读取。轮询把快照与既有 `pending` 一起处理，目录事件保留原有的 `lstat` 及子路径扩展。遗留定时器在队列为空时返回。已确认的差异集中在暂扣的创建项进入轮询配对时。 [watcher.ts:110](../../packages/vault/src/watch/watcher.ts#L110) · [watcher.ts:129](../../packages/vault/src/watch/watcher.ts#L129) · [watcher.ts:204](../../packages/vault/src/watch/watcher.ts#L204)

## 项目规范审查

轮询复用已有 `next`，没有新增扫描。限定差异内未发现其他项目规则违反。普通索引增量的目标路径 I/O 断言及有界读取用例继续通过。 [watcher.ts:110](../../packages/vault/src/watch/watcher.ts#L110) · [vault-index.test.ts:125](../../packages/vault/test/vault-index.test.ts#L125)

## 范围与验证

已核对 topic、manifest 的 `t168/task04.md active` 与本机终端 `t168`。工作树 `impl/huhu-acceptance-followup`，HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。本轮限定差异为 `watcher.ts`（blob `8f652791ce444e67fc87da5b0ef2f5ca358981f3`）及 `vault-index.test.ts`（blob `1e9f527877814e458e7dbeed25e39c7969dc13d6`）。调用方 `vault-index.ts` blob 仍为 t168/task03 的 `45b545b04c646c616647d62e82511a926e25e867`。两文件 `git diff --check` 通过。Linux Node 24.21.0 独立复跑 `pnpm exec vitest run packages/vault/test/vault-index.test.ts`，21 通过，0 失败，0 跳过。

## 未运行的验证

- 原生大小写不敏感卷上复现重订阅时序。本轮的交叉探针控制原生回调与文件查找，Lead 已有的 Linux 原生监听测试覆盖普通创建、修改、删除和改名。
- Electron E2E、构建、打包、进程内存或耗时基准和全仓门禁。
