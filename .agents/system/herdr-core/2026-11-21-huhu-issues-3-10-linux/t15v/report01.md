# t15v/task01 VaultIndex 批量快照

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t15v`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t15v/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t15v-report01.md`
- 执行结果 — `done`

## 结论

同目录批量创建 24 个任务文件时，`VaultIndex.applyChanges` 内的目录读取由 48 次降为 2 次，文件状态读取由 648 次降为 27 次。修复前 24 个任务已可检索，两条操作计数断言失败。修复后同一文件的 14 项测试全部通过。

`VaultWatcher` 会把一批变更交给 Engine，Engine 同步调用 `index.applyChanges(changes)`（`packages/vault/src/watch/watcher.ts:211`、`apps/engine/src/boot.ts:599–605`）。基线为每条非删除事件重新递归扫描其父目录。`takeSnapshot(dir, false)` 对每个可见目录调用一次 `readdirSync`，对其每个普通文件调用一次 `statSync`，见 `packages/vault/src/watch/snapshot.ts:24–50`。夹具的 Tasks 有 1 个可见子目录，合计 27 个可见文件，其中 24 个为本批新增。旧实现递归扫描 24 次，新实现扫描一次，两轮均索引了相同的 24 个任务。

## 具体差异

工作树 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，分支 `impl/huhu-acceptance-followup`，基线 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。本任务的变更保留在工作树。

- `packages/vault/src/index/vault-index.ts:172–205`（+8/−1）在 `applyChanges` 内按父目录保留首次调用 `takeSnapshot(dir, false)` 得到的 Map。同目录后续事件取同一快照，下一批重新读盘。沿用事件顺序与逐路径的树、笔记和搜索更新。删除分支及忽略过滤保持原有执行位置。
- `packages/vault/test/vault-index.test.ts:1–97`（+80/−2）为现有测试文件增加两项回归。第一项经真实文件系统计数并核对任务搜索和文件总数。第二项覆盖同批修改、跨目录重命名、删除、补全嵌套目录、普通点文件、忽略内部目录和系统隐文件、标签与反链，以及下一批重新读取文件大小和正文。
- 可用 `git diff -- packages/vault/src/index/vault-index.ts packages/vault/test/vault-index.test.ts` 查补丁。核对时另有同工作树其他执行者的 E2E 差异，本报告只覆盖上述两文件。

## 验证

同一用例在相同本地环境运行。Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7，Linux。命令在 integration 工作树执行：

```sh
PATH="$HOME/.volta/tools/image/node/24.21.0/bin:$PATH" pnpm exec vitest run packages/vault/test/vault-index.test.ts
```

| 阶段 | 目录读取 | 文件状态读取 | Vitest |
| --- | ---: | ---: | --- |
| 基线，最终断言一轮 | 48 | 648 | 13 过，1 败。仅新增的计数回归中两条断言失败，均得到预期的基线计数。 |
| 修复后，同样断言一轮 | 2 | 27 | 14 过。搜索、树、元数据和混合增量用例均通过。 |

计数用 `vi.fn` 包装真实的 Node 文件操作，每次计数前清空记录，紧贴 `applyChanges` 保存结果，夹具写入、初次 build 和后续检索均在计数区间外。基线另有一次用上界断言的预跑，也观察到 48 和 648。源码及测试差异通过 `git diff --check`。

## 成本边界与剩余缺口

对某父目录，令本批有 N 条经过过滤且需要文件信息的事件，该目录子树内有 D 个可见目录和 F 个可见文件。原先读取目录 N×D 次、读取文件状态 N×F 次，修改后分别为 D 和 F。同一批不同父目录各自读取，父子路径的快照仍可能覆盖重叠的子树。快照数据在同步调用结束前保留，批内后续同目录事件使用第一次读到的文件元数据。测试使用稳定夹具，未测外部进程边写边索引或多目录大批量的内存峰值。计数只涵盖 `applyChanges` 内两种 Node API 调用，索引正文和 SQLite 更新仍逐文件执行。由此无法换算端到端耗时、磁盘物理读次数或实际 E2E 的批分布。

只读输入 `../agent-linux/temp/final-audit/t15s-report01.md` 记录了千行滚动断言返回后 `app.close()` 超时。当前证据证明索引中存在可避免的同步工作，仍缺少故障轮的索引批大小和 liveness/退出时序，无法确定索引与退出超时的因果。Lead 可在后续候选串行复测 `tests/e2e/perf.spec.ts` 中“任务列表 1,000 行滚动：没有超过 50 ms 的长任务”，保留原滚动断言，记录索引批耗时以及 `app.close()` 和退出各阶段时点。

## 未运行的验证

- Electron/Playwright E2E，包括千行滚动及应用退出。
- 重型 benchmark、构建、打包、安装包检查、全量测试、全仓类型检查、lint、knip、视觉取证。

## Lead 核对
已核对两个文件diff和计数定义，接受局部实现产物；下一步独立审查与原E2E复验，尚不视为退出问题已解决。
