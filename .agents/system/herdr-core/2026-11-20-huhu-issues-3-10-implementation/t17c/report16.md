# t17c · #8 S3.2 Gmail history 与 S4.2 Outlook Exchange IMAP

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task16.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task16.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report16.md`
- 执行结果 — `done`

## 提交

工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-mail-api-sync`。任务指定基线 `4563a422ed8bb11f4160485271a82082b6a0161c`。

| 切片 | 提交 |
| --- | --- |
| S3.2 Gmail history、重连、传输状态及本地协议回归 | `4c491cc091a1c3b9b73fb4b552330af3c8ec7329` |
| S4.2 Outlook Exchange IMAP 权限、断线恢复和回复证据 | `119d19c82cbac77964ab32b7446b3331e50f0807` |

提交后工作树干净，差异限 Mail 插件和 #8 验收证据。根锁文件 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。

## S3.2 Gmail

Gmail OAuth 账号使用现有受保护的 `https://mail.google.com/` 凭据。API 只同步已选 Inbox。初扫先以 profile 核对真实邮箱并固定 history 锚点，原生字符串 ID 和游标保留在该 Vault、账号及传输中。一次条件写共同提交缓存、游标和待交付通知。已选的其他 IMAP 目录继续用 IMAP。首次、补扫和传输切换静默。Gmail 标读保留本机覆盖并返回 `remoteSynced: false`。工作台显示已提交路径、范围和重扫或回退原因。 [Google 同步指引](https://developers.google.com/workspace/gmail/api/guides/sync) · [Gmail history 参考](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) · [Gmail API scope](https://developers.google.com/workspace/gmail/api/auth/scopes)

| 场景 | Windows 结果 |
| --- | --- |
| 错账号及初扫 | 错 profile 地址只发 1 次 profile 请求，正文和 IMAP 请求为零。205 封的正常 Inbox 读取 8 个列表页、200 次 RAW。两个同数字前缀的原生 ID 分别读到各自正文，首扫通知为零 |
| 第二页 503、关闭并重开 | 故障轮发送 2 次 history、0 次正文请求。重开后从原字符串游标重试两页，共 4 次 minimal、1 次 RAW。已知垃圾没有请求，范围外候选只有标签核对。被删和被归档的两条定位无法读回，原本地标读保留 |
| 通知与回复 | 新未读信在提交后生成 1 条脱敏通知，丢确认并重开后用同 ID 重交，最终仍为 1 条。可定位正确的 Gmail 原生 ID。回复经原 Gmail 账号发到本机 SMTP，保留线程头，排除 Bcc |
| 游标失效或超出预算 | history 404 后重扫受影响 Inbox，3 次 RAW。长 history 验证翻至 20 页时有界重扫，也为 3 次 RAW。均无新增通知 |
| API 权限失败与重连 | 403 后实际走 IMAP，显示权限不足或 API 未启用，旧 Gmail 定位暂不可打开。重启并恢复 API 时只请求 1 次旧 Gmail history 游标，已读覆盖和活跃 Gmail 正文恢复 |

首扫最多 8 页，每页 25 个 ID，每组最多 5 个正文 GET。单封 2 MiB，原文总预算约 18 MiB，每条路径最多 200 项和 24 MiB Base64 原文字符。history 另受最多 20 页、400 个候选变化约束。Gmail 和 IMAP 的缓存及游标保存在同一可重建记录内，按传输决定对外可见项。核对了固定 one-mail 提交 `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 Gmail、IMAP 回退和 Graph 同步入口。 [S3.2 验收证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S3.2-gmail-history.md)

## S4.2 Outlook

合成 issuer 的 `Mail.ReadBasic`、Graph `Mail.Read` 和缺失 Exchange scope 分别得到基本权限受限、资源不匹配和缺少权限，IMAP 目录访问为零。仅 Exchange IMAP scope 时实际读到 UID 42 的正文且没有 SMTP DATA。追加 Exchange SMTP scope 后保留原账户 ID。 [Exchange OAuth scopes](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth) · [Graph 基本权限](https://learn.microsoft.com/en-us/graph/permissions-reference#mailreadbasic)

同 Vault 开着 Gmail API 时，Outlook 的 UID 43 正文传输断开后保留 UID 42，重试后按 UIDVALIDITY 99 读取 UID 43；实际 `STORE` 并复核 FLAGS 后返回 `remoteSynced: true`。回复用 Outlook 账号发给原发件人。断线、重试、标读和回复阶段共 3 次 IMAP XOAUTH2、11 次 FETCH、0 次 HTTP、1 次本机 SMTP DATA，Gmail 原生定位未改变。 [S4.2 验收证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S4.2-outlook-imap.md)

## Windows 复验及接续

- Windows Node `v24.21.0`，Mail Vitest 10 个文件、48 项通过。Mail TypeScript、改动 TypeScript 的 oxfmt／oxlint 和提交差异的 `git diff --check` 均通过。中间一次并行测试在首个 OAuth 夹具回调未配置时失败，增加终态诊断后两次 Mail 全量复跑通过。
- 本机 `pnpm.cmd` 固定版本入口无法启动，实际用工作树已安装的 Node 工具入口跑测试。版本探测写入的临时锁变化已恢复，并按 blob 核对。按 Modern Web Guidance 先进行 `accessibility` search 和 retrieve，客户端用稳定的 `role="status"` 呈现实际同步路径及恢复原因。
- Lead 沿用 task15 的 `createMailOAuth` 装配。Gmail API 要在 Google OAuth 客户端所在项目启用，默认请求路径从现有 Engine 的凭据装配取得。实际打包 Workbench、在线 Google 账号与 Microsoft 租户留给 S9。此轮运行仅访问本地 issuer 和协议夹具，未使用真实登录、账号或外部测试主机。
- Graph 全权限、正文、delta 和分页回退依赖已批准且真实持有 Graph 权限的独立凭据。本轮验收覆盖 Exchange 默认路径和 Graph 权限拒绝，保留 Graph 专属 consent 为待办。


## OAuth 独立审查后的集成复核

- Gmail history 和 Outlook 回归提交 `4c491cc0`、`119d19c8` 对 `plugins/mail/src/engine/oauth-sessions.ts` 的差异为空，提交范围也未包含共享 caller identity 文件。同步生产代码复用现有账号绑定和受保护 token，`oauth-provider.ts` 只增加 Gmail API 端点。
- 在任务工作树内只读比较提交对象。共同基线 `4563a422ed8bb11f4160485271a82082b6a0161c`、集成 `78e180b7aa6fc450505b332d7f446e07cc405b07`、本切片 `119d19c82cbac77964ab32b7446b3331e50f0807`。两侧提交无重叠文件，`git merge-tree` 未报告文本冲突。该结果覆盖已提交的集成快照。
- 仍需在 Lead 的 OAuth 会话和共享身份修复合入后重跑 Mail 用例。当前回环 OAuth 测试以 dispatcher 的 `desktop` 和 `web:other` 驱动发起与隔离场景，也承载 Gmail history 和 Exchange 回归。如果 Lead 同时调整 `plugins/mail/test/oauth-engine.test.ts`，合入时需要保留两侧的断言并适配测试身份。该文件在已核对的集成快照中没有重叠。
