# t163/task01 VaultIndex 返工

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t163`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t163/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t163-report01.md`
- 执行结果 — `done`

## 结论

增量处理轮到每条事件时，直接读取目标文件的元数据。24 个任务文件全部可检索，实际记录 0 次目录枚举和 24 次目标路径元数据查询。跨层目录用例也只查询四条事件路径，树补齐对应祖先。批内和批间增长超过 10 MiB 的文件都跳过正文，保留文件名检索。受控并发用例覆盖了打开文件后、读取前增长的情况。

## 产物与改动

已核对 topic、manifest 的 `t163/task01.md active` 和本机 `HC_TERMINAL_ID=t163`。工作树为 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，分支为 `impl/huhu-acceptance-followup`，基线为 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。两个 Vault 文件的返工保留在工作树。

- `applyChanges` 与 `refreshPaths` 共用单路径更新。一次 `lstatSync` 同时拿到大小、修改时间和普通文件判定。`infoOf` 内部使用跟随文件符号链接的 `statSync`，直接复用它还需要一次文件类型检查。增量入口沿用 `isIgnored`，按原顺序清理删除路径和重命名源，按原规则补齐祖先目录。全库建立和对账继续使用现有快照。 [vault-index.ts:190](../../packages/vault/src/index/vault-index.ts#L190)
- 正文读取沿用 Vault 附件读取的文件描述符模式，打开后核对文件类型和尺寸。正文缓冲按该尺寸分配并多留一个字节识别增长，最多读取 10 MiB 加 1 字节。超过限制时，全文索引只保留文件名对应的元数据，并清除旧正文关联的标签和反链。若读取检测到增长且仍在限额内，交由下一次刷新重新索引。 [vault-index.ts:12](../../packages/vault/src/index/vault-index.ts#L12)
- 测试通过真实文件系统操作记录调用路径，并用有序的读盘钩子控制批内增长和正文读取竞态。混合增量用例继续核对查找、忽略规则、重命名、删除、标签与反链。 [vault-index.test.ts:39](../../packages/vault/test/vault-index.test.ts#L39)

工作树文件 Git blob 为 `52cace75e68f111abc30ef56eb76387f6b969da4`（源码）和 `daf0537d1b7fda5ebccd97624a86684fb0b47037`（测试）。

## 验证

Linux，Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7。仅执行指定 Vitest 文件，最终一轮 19 通过，0 失败，0 跳过。两文件的 `git diff --check` 通过。

```sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec vitest run packages/vault/test/vault-index.test.ts
```

| 验收项 | 实际结果 |
| --- | --- |
| 同目录批量新增 24 个任务 | `readdirSync` 0 次，`statSync` 0 次，`lstatSync` 24 次，`openSync` 和 `fstatSync` 各 24 次。24 个任务均可按 kind 和正文检索，树中共有 27 个文件。 |
| 根路径、嵌套目录和不同分支的同批事件 | `readdirSync` 和 `statSync` 都为 0，`lstatSync` 查询这四条事件路径各一次。四个新增文件和原有深层笔记均可检索，目录层级匹配。 |
| 批间先增长到超限、下一批缩小 | 超限批打开正文 0 次，树大小更新，文件名可检索，旧正文、标签和反链被清除。缩小批重新索引正文、标签和反链。 |
| 同批处理第一个文件时，第二个文件增长超限 | 只打开第一个文件，第二个文件的树条目记录 10 MiB 加 1 字节，文件名命中，正文词不命中。 |
| 打开后开始读取正文时增长超限 | 已知大小 18 字节，实际只发起一次 19 字节读取。保留文件名，正文词不命中。 |
| 普通文件、文件符号链接和断链 | Linux 夹具实际建立链接。新增链接与断链无索引条目，自写刷新移除已被链接替换的旧条目。该用例没有枚举目录或打开目标。 |

t15v 对相同 24 任务夹具曾记录基线 48 次目录枚举、648 次路径 `statSync`，按目录缓存补丁为 2 次、27 次。本次计数记录 Node API 调用，计数区间排除夹具写入和初次构建。当前增量路径不再保留递归快照。

## 阻碍与接续

无实施阻碍。读取期间发生变化的路径仍由后续有效的文件事件刷新树元数据。主会话可依据本报告核对工作区和定向证据。

## 未运行的验证

- Electron/Playwright E2E，含 `tests/e2e/perf.spec.ts` 的千行滚动及应用退出。文件操作计数只覆盖增量索引，退出超时的因果和最终结果仍待实测。
- 重型 benchmark、RSS 峰值、构建、打包、安装包检查、全量测试、全仓类型检查、lint、knip、视觉取证。

Lead验收：已核对实际两文件差异与19项单文件报告，实施任务完成；独审与应用退出/性能复测另外推进，未计为最终验收通过。
