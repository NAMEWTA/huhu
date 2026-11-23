# t168/task01 VaultIndex 独立审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t168`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t168/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t168-report01.md`
- 执行结果 — `done`

## 规格审查

**[P2] 在大小写不敏感的卷上，仅修改文件名大小写会留下旧索引。** 产品的笔记改名流程在磁盘完成改名后，将旧路径和新路径一并传给 `refreshPaths`。基线 `05a748b6` 的 `vault-index.ts:207` 用目录快照中的文件名做精确匹配，旧名不存在时清除路径树、正文索引和笔记元数据。当前实现对旧名执行 `lstat` 时，卷会解析到已经改名的文件，`updatePath` 随后把旧名和新名分别索引。用户可看到两个搜索结果和反链来源，同一标签也会计两次。文件内容和磁盘上的新名称正确，只检查磁盘和笔记 ID 的既有改名用例不会捕获这个问题。建议在合入跨平台版本前保留改名源的删除语义，并对路径树、正文检索及反链至少验证一项旧路径清理结果。普通增量可以继续按单路径读取。 [vault-index.ts:212](../../packages/vault/src/index/vault-index.ts#L212) · [vault-index.ts:238](../../packages/vault/src/index/vault-index.ts#L238) · [NotesService.moveEntry](../../plugins/notes/src/engine/service.ts#L499) · [既有改名用例](../../plugins/notes/test/service.test.ts#L395)

用 Node 24 在真实临时 Vault 上对照执行了基线和当前 `VaultIndex`。探针对改名后的 `readme.md` 定向转发 `lstatSync`、`openSync`、`statSync` 和 `readFileSync` 到 `README.md`，模拟大小写不敏感的文件查找，保留真实的磁盘改名、目录枚举、索引和轮询逻辑。目录里只有 `README.md`。基线的树、搜索和反链均只有新名，标签计数为 1。当前三处均出现两个路径，标签计数为 2。随后执行两次真实 `VaultWatcher.poll()`，只上报新名的 `created`，旧条目仍在。同一探针取消转发，在本机大小写敏感的 ext4 上两个版本均正确清理旧名。大小写不敏感卷的证据来自定向模拟，Windows 和 macOS 原生卷及原生监听器未实跑。 [watcher.ts:110](../../packages/vault/src/watch/watcher.ts#L110) · [watcher.ts:142](../../packages/vault/src/watch/watcher.ts#L142)

### 前两轮发现复核

- **批量文件操作。** 同目录 24 个任务全部可检索。测试记录目标路径 `lstatSync`、`openSync`、`fstatSync` 各 24 次，目录枚举和路径 `statSync` 均为 0 次。跨多层目录的用例只查询四个目标文件，补齐祖先并保留原有深层笔记。增量过程不再构建或持有多份递归目录快照，关闭 t15y 关于叠加快照的 P3。 [vault-index.ts:212](../../packages/vault/src/index/vault-index.ts#L212) · [vault-index.test.ts:39](../../packages/vault/test/vault-index.test.ts#L39) · [vault-index.test.ts:70](../../packages/vault/test/vault-index.test.ts#L70)
- **大小限制和旧内容。** 对每条事件重新获取路径大小，正文打开后再次检查文件描述符。读取缓冲和单次索引尝试的总读取量最多为 10 MiB 加 1 字节，额外字节用于察觉增长。超限只保留文件名搜索，并删除旧正文、标签和反链。测试分别覆盖跨批超限后缩小、同批第二个文件提前增长、开始读取时增长三个时序。最后一项实际只请求 19 字节，没有索引截断正文。关闭 t15y 关于目录快照缓存扩大整读窗口的 P2。该上限适用于索引器正文的读取，解析和搜索索引另外占用内存。监听器的既有自写回声判定另有整文件读取。 [vault-index.ts:12](../../packages/vault/src/index/vault-index.ts#L12) · [vault-index.ts:149](../../packages/vault/src/index/vault-index.ts#L149) · [vault-index.test.ts:102](../../packages/vault/test/vault-index.test.ts#L102) · [vault-index.test.ts:155](../../packages/vault/test/vault-index.test.ts#L155) · [watcher.ts:216](../../packages/vault/src/watch/watcher.ts#L216)
- **其他增量语义。** 混合批次验证普通修改、跨目录重命名源清理、删除、普通隐藏草稿保留、内部文件和系统文件忽略、标签与反链更新。文件链接和断链不会作为普通文件加入，自写刷新会清除被链接替换的旧条目。全库构建和启动对账沿用目录快照，重建期间记录的变更在换入新索引后刷新。 [vault-index.ts:127](../../packages/vault/src/index/vault-index.ts#L127) · [vault-index.ts:180](../../packages/vault/src/index/vault-index.ts#L180) · [vault-index.test.ts:174](../../packages/vault/test/vault-index.test.ts#L174) · [vault-index.test.ts:207](../../packages/vault/test/vault-index.test.ts#L207) · [vault-index.test.ts:337](../../packages/vault/test/vault-index.test.ts#L337)

## 项目规范审查

在两份差异内未发现明确的工程规范违规。增量和自写刷新共用单路径更新及清理，正文读取沿用 Vault 已有的描述符检查和 `finally` 关闭模式。文件名拼写的回归属于行为偏差。 [vault-index.ts:12](../../packages/vault/src/index/vault-index.ts#L12) · [read-asset.ts:11](../../packages/vault/src/read-asset.ts#L11)

## 范围与验证

已核对 topic、manifest 的 `t168/task01.md active` 和本机 `HC_TERMINAL_ID=t168`。范围为 `impl/huhu-acceptance-followup` 的 HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085` 之上指定两文件的未提交差异。源码 blob 为 `52cace75e68f111abc30ef56eb76387f6b969da4`，测试 blob 为 `daf0537d1b7fda5ebccd97624a86684fb0b47037`，与 t163 记载一致。业务文件未修改。 [t163 实施报告](t163-report01.md) · [t15y 前轮审查](t15y-report01.md)

Linux，Node 24.21.0，pnpm 12.10.1。独立复跑 `pnpm exec vitest run packages/vault/test/vault-index.test.ts`，19 通过，0 失败，0 跳过。两文件 `git diff --check` 通过。定向改名探针使用临时目录。

## 未运行的验证

- Electron/Playwright E2E，包括千行任务滚动和之后的 `app.close()`。本次的文件操作计数和索引结果无法确定退出超时是否解决。 [perf.spec.ts:183](../../tests/e2e/perf.spec.ts#L183)
- 大小写不敏感卷和原生监听器实测、进程 RSS 或延迟基准、构建、打包、安装包检查和全仓门禁。
