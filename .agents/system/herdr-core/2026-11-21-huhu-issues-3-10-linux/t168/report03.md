# t168/task03 Vault 大小写改名返工复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t168`，Lead `t3p`
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t168/task03.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t168-report03.md`
- 执行结果 — `done`

## 规格审查

**[P2] 自写刷新已清除旧名，后续轮询仍会在编辑时重新索引旧名。** 大小写不敏感的卷上，将 `readme.md` 改为 `README.md`，自写刷新立即清除旧名。轮询的目录快照也只列出了新名，但 `flush()` 会再用旧拼写读取磁盘。该查找成功后，监听器保留旧路径的快照记录。之后编辑 `README.md`，轮询把旧名和新名都作为 `modified` 上报。当前 `applyChanges` 只做 `lstat`，两次查找都命中同一个文件，旧路径再度进入树、正文和反链。基线用目录中的精确文件名匹配，面对同样的两条事件只保留新名。这是本批优化相对基线的回归。建议让轮询处理其已经枚举出的精确路径集合，或对待重新加入的旧拼写做定向校验，普通监听增量可继续只读取事件目标。 [watcher.ts:110](../../packages/vault/src/watch/watcher.ts#L110) · [watcher.ts:142](../../packages/vault/src/watch/watcher.ts#L142) · [vault-index.ts:203](../../packages/vault/src/index/vault-index.ts#L203) · [Engine 监听接线](../../apps/engine/src/boot.ts#L596)

用临时 Vault 和真实的 `VaultWatcher` 强制轮询，将实际发出的批次交给基线与当前 `VaultIndex`。在真实磁盘改名和枚举之外，仅让旧拼写的 `lstatSync`、`statSync`、`openSync` 和 `readFileSync` 查到新文件，模拟大小写不敏感查找。自写刷新后两版均只有 `README.md`。首次轮询上报新名的 `created`。对新名写入更长的正文后，再轮询上报两个 `modified`。磁盘和基线均只有新名，当前树、正文搜索及反链都出现两个路径，标签计数从 1 变成 2，再次轮询后仍然如此。关闭模拟时，本机 ext4 上轮询发出正确的 `renamed`，后续只修改新名，两版均保留一个路径。现有两条改名回归用例在直接调用 `refreshPaths` 后即完成断言，未覆盖后续轮询和编辑。 [改名用例](../../packages/vault/test/vault-index.test.ts#L40) · [t168 首轮审查](t168-report01.md)

### 已复核的行为

- **自写改名后的即时索引。** 自写刷新逐段按目录项实际拼写检查路径，清除旧文件和已确认缺失目录下的树、正文、标签及反链。两个新增用例模拟旧路径仍可查找，独立验证文件改名及父目录改名后只打开新路径的正文。批内同一目录只做一次浅枚举。 [vault-index.ts:241](../../packages/vault/src/index/vault-index.ts#L241) · [vault-index.test.ts:68](../../packages/vault/test/vault-index.test.ts#L68)
- **普通监听增量。** 24 个同目录任务全部可检索，目录枚举和路径 `statSync` 均为 0 次，目标路径 `lstatSync`、`openSync`、`fstatSync` 各 24 次。多层目录用例仍只查四条事件路径。正常删除和显式改名仍走同一个旧项清理入口。 [vault-index.ts:195](../../packages/vault/src/index/vault-index.ts#L195) · [vault-index.test.ts:97](../../packages/vault/test/vault-index.test.ts#L97)
- **有界正文读取。** 文件描述符读取算法与 t163 相同，缓冲和单次尝试的总读取量上限为 10 MiB 加 1 字节。测试继续覆盖跨批超限后缩小、同批其他文件提前增长、开始读取时增长。最后一项只请求 19 字节，正文未进入检索。 [vault-index.ts:12](../../packages/vault/src/index/vault-index.ts#L12) · [vault-index.test.ts:160](../../packages/vault/test/vault-index.test.ts#L160) · [vault-index.test.ts:213](../../packages/vault/test/vault-index.test.ts#L213)

## 项目规范审查

在限定的两份差异内未发现另外的明确规则违规。自写与监听增量复用同一个元数据更新和有界正文读取入口。 [vault-index.ts:215](../../packages/vault/src/index/vault-index.ts#L215)

## 范围和验证

已核对 topic、manifest 的 `t168/task03.md active` 与本机终端 `t168`。审查基线为 `impl/huhu-acceptance-followup` 的 HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。源码 blob 为 `45b545b04c646c616647d62e82511a926e25e867`，测试 blob 为 `ae8228548c6ccab80a6087b9537a79b63bc8afcf`，与返工报告一致。两文件 `git diff --check` 通过。Linux Node 24.21.0 上独立复跑 `pnpm exec vitest run packages/vault/test/vault-index.test.ts`，21 通过，0 失败，0 跳过。 [t15t 返工报告](t15t-report02.md)

## 未运行的验证

- Windows、macOS 的原生大小写不敏感卷与原生监听实测。本次问题由真实轮询逻辑配合定向文件查找模拟复现。
- Electron E2E、千行任务滚动后应用退出、进程内存或耗时基准、构建、打包和全仓门禁。
