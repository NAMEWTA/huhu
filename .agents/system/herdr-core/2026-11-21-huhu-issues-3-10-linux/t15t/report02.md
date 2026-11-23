# t15t/task02 VaultIndex 大小写改名修复

已核对 Lead `t3p`、manifest 中的 `t15t/task02.md active` 和本机 `HC_TERMINAL_ID=t15t`。工作树为 `integration`，分支 `impl/huhu-acceptance-followup`，HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。以 t163 的两份工作区文件为输入，初始 Git blob 与 t168 审查一致。修改仅涉及 `packages/vault/src/index/vault-index.ts` 和 `packages/vault/test/vault-index.test.ts`。

## 原因与修复

Notes 改名后把新旧文件路径一并交给 `refreshPaths`。大小写不敏感的卷可用旧拼写成功 `lstat` 和打开已改名的文件。t163 的直接路径读取把这个结果视为旧索引项仍存在。只核对最后一个文件名在父目录改名时也不够，因为以旧拼写访问父目录仍可列出新目录中的同名文件。 [t168 审查](t168-report01.md) · [Notes 改名入口](../../plugins/notes/src/engine/service.ts#L499)

- 自写刷新使用每批一次的浅目录名缓存，逐层按精确字符串核对完整相对路径。文件名缺失时清掉旧树、全文、标签和反链。已有目录前缀确认缺失时，清除旧子树的索引项，重建中同步记入 `dirty`。目录读错时仅清理当前请求路径。 [刷新与路径检查](../../packages/vault/src/index/vault-index.ts#L241)
- 监听增量继续每条事件取一次文件 `lstat`，保留显式删除及 rename 源清理。两条路径共用同一个元数据和正文更新入口。批量监听用例仍确认 24 个新增任务对应 0 次目录枚举、0 次 `statSync`，且 `lstatSync`、`openSync`、`fstatSync` 各 24 次。保留 t163 的符号链接排除、10 MiB 正文限额及使用额外 1 字节检测增长。 [监听增量](../../packages/vault/src/index/vault-index.ts#L196) · [读取计数](../../packages/vault/test/vault-index.test.ts#L97)
- 两个回归夹具实际改名并使用真实目录枚举，仅针对旧拼写转发查找模拟大小写不敏感。覆盖 `notes/readme.md` 改为 `notes/README.md`，以及 `docs` 改为 `DOCS` 后两个深层文件。检查旧路径树消失、全文和反链只返回新路径、标签计数无重复、只有新路径打开正文。文件改名读取根目录及 `notes` 各一次，父目录改名读取根目录、`DOCS` 和 `DOCS/deep` 各一次。 [改名回归](../../packages/vault/test/vault-index.test.ts#L40)

最终源码 blob `45b545b04c646c616647d62e82511a926e25e867`，测试 blob `ae8228548c6ccab80a6087b9537a79b63bc8afcf`。两文件的格式化和 `git diff --check` 已完成。

## 验证

Linux，Node 24.21.0，pnpm 12.10.1。仅运行指定文件 `pnpm exec vitest run packages/vault/test/vault-index.test.ts`。

- 红灯 2 失败、19 通过。两处均因旧索引仍出现而失败。 [红灯日志](t15t-vault-case-red.log)
- 绿灯 21 通过。 [绿灯日志](t15t-vault-case-green.log)

## 未运行的验证

真实 Windows/macOS 大小写不敏感卷和原生监听器，Electron/Playwright E2E，构建、打包及全仓检查。大小写不敏感的查找证据来自 Linux 定向模拟。每批目录项核对的行为和文件操作计数由单文件回归覆盖。未改任务范围外的业务文件，未提交或推送。
