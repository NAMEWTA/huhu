# #8 S1a.1 邮件目录发现返工

- 终端 `t11x`，完成写同目录 `report01.md`。唯一可写业务检出 `D:/Document/code/huhu/temp/issue-worktrees/mail-repair`，分支 `impl/huhu-issues-3-10-mail-repair`，父 `be12ca89984b760face1778499db222f98caab40`。四个 Git worktree 已满。仅 Windows；根、集成、其他分工只读，禁止远端写入或真实账号操作。
- 先读 t9k 的 S1a.1 报告和 `../t54/report05.md`。补齐有 NAMESPACE 前缀的 IMAP 账号独立 INBOX 探测。沿用 ImapFlow 2.12.1 的公有方法，核对实际 LIST、路径/分隔符及可选状态；不把缺失/不可选的真实 INBOX 合成为可选。
- 修复受信适配器在同步 AbortSignal 回调内重入重测的上下文覆盖。变更设置、发现阶段、再保存以同一快照定义、身份、凭据和世代核对；任何返回旧目录必须被丢弃。继续保有取消网络、草稿可改、保护事务、私有数据和零真实外部副作用。
- 用冻结已可重放的回环 NAMESPACE 与同步重入两个红绿夹具做回归，补固有交错而非额外 UI。复验原 15 Mail 和模块凭据路径、Mail 类型、格式及差异检查。只改 `plugins/mail`；根锁、新生产依赖、Engine 接线和打包由 Lead。必要时新检出复用报告有据的既有同锁安装和 S0.2 本机 ImapFlow 2.12.1。留准确提交与直接证据，关闭已完成测试窗格。
