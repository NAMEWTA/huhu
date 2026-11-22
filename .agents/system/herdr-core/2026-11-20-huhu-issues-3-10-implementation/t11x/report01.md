# #8 S1a.1 邮件目录发现返工

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t11x
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t11x/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t11x/report01.md
- 执行身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`，`HC_TERMINAL_ID=t11x`
- 执行结果 — done

## 交付

- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/mail-repair`，分支 `impl/huhu-issues-3-10-mail-repair`。本地提交 `6d9fde656fdc108b5d355a378ab295f3d9418b26`，父提交 `be12ca89984b760face1778499db222f98caab40`，树 `5aabd5d2cbca277fe49a2a65d351af87cd6386a3`。提交包含 `plugins/mail` 内 4 个文件，Git 工作树干净。
- 有 NAMESPACE 前缀时启用 ImapFlow 2.12.1 的公开 `list()` 完整列表路径，由库补查独立 INBOX。回环实测依次发出 `LIST "INBOX." "*"` 和 `LIST "" "INBOX"`，保留原路径及分隔符。真实可选的 INBOX 自动选中，缺失、`\Noselect` 或 `\NonExistent` 均返回 `inbox-required` 并阻止保存。无前缀账号沿用单次 LIST。 [发现适配器](D:/Document/code/huhu/temp/issue-worktrees/mail-repair/plugins/mail/src/engine/imap-discovery.ts:35) · [回环断言](D:/Document/code/huhu/temp/issue-worktrees/mail-repair/plugins/mail/test/accounts.test.ts:165)
- 更新先安装设置及凭据快照，再取消旧发现。同步取消回调里的重测以 `discovery-stale` 结束，正常重测可在取消后立即发起。若回调更新或关闭草稿，已被取代的重测会在访问网络前退出。写入目录与保存都核对当前发现及其草稿快照，通过核对后使用发现时解析的定义、IMAP 身份和有效密码，晚到的旧结果被丢弃。保存继续使用 `ModuleCredentials` 的事务入口。 [草稿实现](D:/Document/code/huhu/temp/issue-worktrees/mail-repair/plugins/mail/src/engine/accounts.ts:83) · [交错回归](D:/Document/code/huhu/temp/issue-worktrees/mail-repair/plugins/mail/test/accounts.test.ts:194)

## 验证

| 验收项 | 实跑结果 | 直接证据 |
| --- | --- | --- |
| 两项冻结复现 | 在 `be12ca8` 上运行五个用例，均复现预期失败。命名空间账号只发通配 LIST，有效 INBOX 被拒绝。同步重入时新草稿错误地通过了保存。 | [本轮失败日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/red.log) · [t54 独立复核](../t54/report05.md) |
| 修复及交错 | 七个新增用例通过，含四种回环 INBOX 状态和三种同步取消交错。验证旧结果不能入库，重测后只保存当前目录，受信路径读回新凭据。 | [修复通过日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/green.log) |
| 原有 Mail 与模块凭据 | 在 Windows 用 `git archive` 提取最终提交并重跑。Mail 22 项（原 15 项与新增 7 项）及 kernel 凭据 17 项，共 39 项通过，退出码 0。涵盖真实回环取消、认证及 TLS 错误、保护事务失败后的重试、回读和凭据绑定。 | [最终提交全量日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/frozen.log) · [工作树 Mail 全量日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/mail.log) |
| 类型、格式与差异 | Cosmokit 与 Cordis 声明构建、Mail `tsc --noEmit`、`oxfmt --check plugins/mail`、`oxlint -c oxlint.json plugins/mail` 通过。对父提交至最终提交执行 `git diff --check` 通过。 | [检查日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/checks.log) |

Windows Node 24.21.0、Vitest 3.2.7、TypeScript 5.9.3。测试接线复用了当时根锁 blob 同为 `8165f3147cf5564a2d36a67959f3afed0d697f95` 的既有第三方安装，以及 S0.2 锁定的本机 ImapFlow 2.12.1。快照中的 Huhu 包解析到该提交的归档源码。用例连接仅限回环，Vault 和凭据均为合成数据。 [t9k 原始实现](../t9k/report01.md) · [快照启动脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/snapshot.ps1) · [最终验证脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/frozen-verify.ps1)

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --reporter=verbose --project '@huhu/plugin-mail' --project '@huhu/kernel' test/accounts.test.ts test/credentials.test.ts
node node_modules/typescript/bin/tsc --noEmit -p plugins/mail/tsconfig.json
node node_modules/oxfmt/bin/oxfmt --check plugins/mail
node node_modules/oxlint/bin/oxlint -c oxlint.json plugins/mail
git diff --check be12ca89984b760face1778499db222f98caab40 6d9fde656fdc108b5d355a378ab295f3d9418b26
```

## 验证环境与接续

- 工作树内的组合测试进度缓慢，单独运行时两项 kernel 用例超时。最终快照里两项分别在 292 ms 与 162 ms 通过，凭据套件全量通过。工作树内的中断留下两个 Git 忽略的合成测试目录 `temp/credentials-test-FYgg9q` 和 `temp/credentials-test-0iNvDO`。自动审批以 `blocked by policy` 拒绝递归删除，目录仍在。 [工作树超时日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/kernel.log) · [快照结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t11x-mail-repair-023cbcaf4a03/frozen.log)
- 本任务启动的测试窗格 `t123`、`t124`、`t125`、`t126`、`t128`、`t129`、`t12b`、`t12c` 均已关闭。根锁、Engine 接线和打包按任务由 Lead 接续。

## Lead 验收

由 Lead 追加。

