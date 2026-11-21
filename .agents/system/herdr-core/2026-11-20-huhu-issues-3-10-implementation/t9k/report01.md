# #8 S1a.1 邮箱定义、目录发现和模块凭据写入

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t9k
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t9k
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t9k/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t9k/report01.md
- 执行结果 — done

## 结论

在 `D:/Document/code/huhu/temp/issue-worktrees/mail` 的 `impl/huhu-issues-3-10-mail` 本地提交 `be12ca89984b760face1778499db222f98caab40`。父提交是冻结基线 `5beba4c1c8028988a9c7440584fbcd4c71b2b4fb`。提交内 13 个文件均位于 `plugins/mail`，工作树干净。

受信进程内入口 `@huhu/plugin-mail/engine` 的 `openMailAccounts` 公开账号草稿的 `begin`、`update`、`testConnection`、`selectFolders`、`save`、`close`，以及 Vault 级的 `list` 和 `recover`。格式 1 保留用户覆盖的 IMAP、SMTP 设置及选中目录。稳定的 `accountId` 对应凭据服务的 `entityId`，`revision` 由 `ModuleCredentials` 发行。密码用途 `account-password` 绑定邮箱地址、认证方法、IMAP 主机/端口/安全模式，以及启用后的 SMTP 主机/端口/安全模式。新增使用 `expectedRevision: null`，定义与受保护凭据由同一次写入发布。

每次更新设置都会使已有目录和在途响应失效。修改 IMAP 认证目标后，调用方需显式重传草稿密码，避免把旧密码隐式用于新目标。INBOX 自动选中且必须保留。服务端 `\\Noselect` 和 `\\NonExistent` 节点可以显示但不可选择。网络和保护错误保留草稿，成功提交关闭草稿并清除内存中保存的密码引用。SMTP 仅保存配置。Gmail 和 Outlook 的 OAuth 预设提供说明和授权入口语义，密码发现遇到 OAuth 会返回 `oauth-required`，授权与令牌持久化由 S3/S4 接续。

通过配置的 GitHub Issues 来源只读取得 `NAMEWTA/huhu#8`，对象 `I_kwDOVmq61M8AAAABf4025w`，无评论。逐项对照 §3.1、§3.2、M-01、#8 spec/design/S1a.1/S0.2 与本机 OneMail `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的预设、账号表单及提示。当前预设保留 Issue 中的 Outlook `smtp.office365.com:587`。微软给个人 Outlook.com 的 SMTP 文档列 `smtp-mail.outlook.com:587`，因此在预设说明中保留官方链接与手动覆盖入口。OneMail 的 README 声明 AGPL-3.0-only，本提交只依据行为和事实配置重新实现，未引入上游源码、翻译或素材。 [Issue #8](https://github.com/NAMEWTA/huhu/issues/8) · [OneMail 固定来源](https://github.com/zhihui-hu/one-mail/tree/d1be24d5bb83c2da7123b167f119d5abd169b0af) · [Outlook.com 设置](https://support.microsoft.com/en-us/outlook/pop-imap-and-smtp-settings-for-outlook-com) · [Exchange Online 设置](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/pop3-and-imap4/pop3-and-imap4) · [Google 应用密码](https://support.google.com/accounts/answer/185833)

## 验证

在 Windows x64 26300.9974、Node 24.21.0、TypeScript 5.9.3、Vitest 3.2.7 对上述完整 SHA 执行。Core `t10r` 退出 0，Mail 15 项与 kernel 凭据 17 项均通过，Mail 类型检查通过。`oxfmt`、`oxlint`、`git diff 5beba4c..HEAD --check` 通过。

| 验收项 | 实际观察 | 可复现证据 |
| --- | --- | --- |
| 提供商与覆盖 | 18 个命名预设及自定义逐项核对主机、端口、认证、安全模式、提示和链接。`111.com` 和 `email.cn` 的覆盖通过。命名预设的手改 IMAP/SMTP 端口、SMTP 关闭和自定义 SMTP 启用均读回原值。启用的 SMTP 目标换端口后，`ModuleCredentials.use` 拒绝取用原绑定。 | `plugins/mail/test/accounts.test.ts` |
| ImapFlow 发现与选择 | S0.2 适配夹具只监听 `127.0.0.1` 临时端口。一次发现实得 `LOGIN → CAPABILITY → NAMESPACE → LIST`，返回 INBOX、不可选容器和可选子目录。阻止选择容器或移除 INBOX，保存后重开保留两个所选目录。取消停滞的 LIST 后服务端见到断开。 | `plugins/mail/test/fixtures/imap.ts`、`plugins/mail/test/accounts.test.ts` |
| 在途结果隔离 | 地址、密码和端口分别修改后，旧请求均被取消。注入仍返回结果的旧适配器后，草稿返回 `discovery-stale`，第二次发现的目录保持有效，每个场景实际两次发现。修改目标而省略密码时，网络调用次数为零。 | `plugins/mail/test/accounts.test.ts` |
| 错误与事务 | 回环验证认证拒绝、LIST 拒绝、传输断开、缺少 STARTTLS 以及自签证书拒绝。缺少 STARTTLS 时无 LOGIN，自签证书时无 IMAP 会话。使用真实 `ModuleCredentials` 和 #9 `TestProtection` 注入锁定与 Vault 发布失败，定义列表为空且无遗留保护键或暂存版本。恢复后同一草稿重试成功，只产生一个账号。重开隔离 Vault 后回读同一个 ID、revision 和认证状态，受信 `use` 取回合成密码，普通列表和可移植 JSON 无密码。 | `plugins/mail/test/accounts.test.ts`、`packages/kernel/test/credentials.test.ts` |
| S0.2 原样重放 | Core `t10h` 在原锁定目录执行 `node probe.mjs` 退出 0。IMAP 的 UID 42 和 UIDVALIDITY 123 可读，取消另一条 FETCH 后连接归零。原夹具同时验证回环 HTTP 和模拟 SMTP ACK 丢失，回环 SMTP 仅收到一次合成 DATA，子进程读回 `unknown`。 | `D:/Document/code/huhu/temp/issue-baseline/mail-protocol/probe.mjs` 和该目录 `package-lock.json` |

精确提交测试命令。仓库冷启动时先按原有根 `typecheck` 流程构建 vendor 声明。此工作树先使用原锁安装，再把 Mail 的工作区依赖接到此工作树、把 ImapFlow 接到 S0.2 已锁定安装。该本地接线位于忽略目录 `node_modules`。

```powershell
git rev-parse HEAD
node node_modules/vitest/vitest.mjs run --project @huhu/plugin-mail --project @huhu/kernel test/accounts.test.ts test/credentials.test.ts
node node_modules/typescript/bin/tsc --noEmit -p plugins/mail/tsconfig.json
git status --short --branch
```

## 依赖和接续

- `plugins/mail/package.json` 为 `@huhu/plugin-mail@0.0.1-rc.4`，导出 `./engine` 和 `./manifest`。`plugins/mail/huhu-plugin.json` 声明内置 `mail`，`vault-open` 激活，贡献列表为空。运行依赖为 `@huhu/kernel: workspace:*`、`zod: ^4.6.7`（实际 4.6.7）、`imapflow: 2.12.1`。测试依赖 `@huhu/vault: workspace:*` 并复用 kernel 的合成保护夹具。
- ImapFlow 锁定包许可证为 MIT，Node 要求 `>=20`，S0.2 的 `package-lock.json` 完整性为 `sha512-mM0FAU13CU1DMZG9ylow3GgyU+rs0UvWcoZuLpYXWNq3tie0MGNqE/aJqOnNb25kJgeNVtU/spfJ0I0qCYxbpQ==`。锁定包的直接依赖为 `@zone-eu/mailsplit 5.4.31`（MIT 或 EUPL-1.1+），`encoding-japanese 2.5.0`、`iconv-lite 0.7.3`、`libbase64 1.4.1`、`libmime 5.6.5`、`libqp 3.0.2`、`pino 10.3.1`、`socks 2.8.10`（MIT）。本切片无需把 S0.2 探针的 Nodemailer 和 MailParser 加入生产依赖。 [ImapFlow API](https://imapflow.com/docs/api/imapflow-client/)
- Lead 接线时，在根 pnpm 锁新增 `plugins/mail` importer 与 ImapFlow 2.12.1 的包及快照闭包。Engine 在 `apps/engine/package.json` 声明 Mail workspace 依赖，并在 `apps/engine/src/boot.ts` 的内置插件装配处接入 `./manifest` 与 `./engine`。由 Engine 注入当前 Vault、Vault 外的应用私有根、宿主本机实例 ID 及保护适配器，写入者重开可调用 `recover()`。Electron 安装包需验证 Mail workspace TS 与 ImapFlow 运行依赖可解析。可移植账号定义位于 `.huhu/module-credentials/`，本机保护材料位于注入的 Vault 外目录。Vault 包收集与 Renderer 由 Lead 接续。
- 本次完成 S1a.1 的私有领域与传输路径。原型仍待用户确认。组合版本集成时仍需验证实际桌面入口、Engine 装配、安装包、本机 OS 保护适配器，以及后续切片的 OAuth 和发件。此次使用隔离 Vault、合成凭据与回环传输，无真实邮箱、原生历史、公网发信或远端写入。


复现和验证窗格均已关闭。本次产生的隔离 Vault、回环进程和临时数据已清理。

## Lead 验收

