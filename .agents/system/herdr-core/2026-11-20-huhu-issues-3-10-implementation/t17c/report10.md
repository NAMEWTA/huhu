# t17c · Mail 公开阅读修复与 S2.2 缓存搜索

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task10.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task10.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report10.md`
- 执行结果 — `done`

## 一 · t187/report05.md 的两项 Mail P2

提交 `2a627f54e8ed0d2aa5c9d1a124e3441829b3a38f`，父提交 `d941065be459584a9a3767673b28de1f56c5b2d5`。 [独立审查](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report05.md) · [定向运行证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.1-public-reader.md)

| 审查发现 | 实现与实测 |
| --- | --- |
| 公开联系人读取缓存 EML 的 Bcc | 联系人阅读器调用 `mail.conversations.loadBody` 获取公开 MIME 投影。实际 Edge 打开含 Bcc 的 IMAP Sent 原件，公开正文可读，原文按钮、原文请求和 Bcc 均未出现。在单账号点击「阅读目录最新邮件」仍可查看缓存 EML，探针验证合成 Bcc 头可在该普通原文入口读到。 |
| 账号或目录退出后旧正文仍显示 | Engine 在正文解析前后复核原账号、选中目录的公开可见性及原缓存来源。Edge 打开 Sent 正文后撤出该目录，正文和来源条目消失，同组另一账号仍可浏览。另用两个窗口验证账号移除，其中一窗已经读到正文，另一窗的真实 Engine 正文响应被代理扣住。移除后两窗关闭读区，新的公开读取返回需刷新，释放旧响应也没有重新打开正文。 |

该提交单独跑通 `workbench-renderer` 和 `conversations-engine` 共 2 项。目录撤出通过既有本机凭据定义保存入口完成，两窗口的账号移除走真实预览及删除能力。

## 二 · Mail S2.2 搜索、筛选及定位

提交 `2524d695dd01027fe149ed98a38d891549bd6ba4`，父提交 `2a627f54e8ed0d2aa5c9d1a124e3441829b3a38f`。 [接线、各项验收及截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.2-search-locate.md)

| 验收项 | 实测结果 |
| --- | --- |
| 从 A 的今天找到 B 的旧邮件 | 初始为「今天」。Edge 搜十封 B 的旧信，分页为 8、2，结果带账号及匹配高亮。上下键移动后回车，切到 B 和全部时间，显示目标正文并居中高亮。窄屏返回焦点落在目标消息行。 |
| 防抖、迟到页和 Esc | 连续改词只提交最后一词，按 250ms 防抖。拦住真实 Engine 的第二页，改词后释放旧页，探针确认旧响应没有进入新查询。Esc 关闭并恢复搜索按钮焦点。Workbench 命令打开同一搜索，搜索框内再次 Ctrl+K 未叠开命令面板。 |
| 时间范围及缓存提示 | Edge 复核全部、今天、昨天和近三天，空缓存与无匹配各有提示。Engine 使用台北和洛杉矶时间边界检查自然日分组。 |
| 公开范围和原来源 | Engine 覆盖公开参与者及发件人显示名、HTML 可见正文及摘要、同 UID/Message-ID 的不同账号、隐去目录和 Bcc。定位复核账号、目录、UIDVALIDITY、UID 和本地消息 ID，旧代或错账号无有效目标。正文沿用公开投影。 |
| 网络副作用 | 定向 Engine 查询与定位没有增加 IMAP 命令，SMTP 连接、认证和 DATA 均为 0。Edge 定位已读旧信的查询窗口里 IMAP 命令、远端标读调用和 SMTP DATA 均无增量。 |

检索覆盖此 Vault 已同步的可见缓存和公开本机已发。正文查询使用可重建、有限容量的本机文本投影。旧格式缓存可读取，缺少邮件日期时沿用已有缓存记录时间。历史全量扫描和旧信远端对账归同步后续切片。S5.2 的通知可复用 `MailLocationTarget` 与 `mail.conversations.findMessage`。组合工作台可通过 `createMailContributions` 传入打开 Mail 的回调，从其他模块发起搜索，实际组合装配归 Lead。

## 验证与交接

- Windows x64 固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7 和 Edge 157.0.4341.60。最终 Mail 8 个测试文件、43 项通过，含实际 Workbench 命令、两项 P2 及现有 Mail 回归。Mail TypeScript、Oxfmt、Oxlint、Stylelint、五项项目 CSS 检查和 Git 差异检查通过。
- 确认原型与 `7d17ffa6` 的资源一致，指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。本地 one-mail 固定提交为 `d1be24d5bb83c2da7123b167f119d5abd169b0af`，README 标注 AGPL-3.0-only。S2.2 证据登记了 `conversations.rs`、`use-conversations.ts` 和 `global-search-dialog.tsx` 的精确参考位置。
- 客户端实施前完成 Modern Web Guidance `search` 和 `retrieve`。将 `dialog` 用于复用原生模态关闭和焦点行为，`ime-safe-enter-submit` 用于输入法确认时保留查询，`accessibility` 用于定位、返回及结果状态播报。
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`，工作树干净。提交限 `plugins/mail` 与 #8 证据。根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。验证在本机 CLI 和无头 Edge 完成，探针自行关闭浏览器、Engine 和回环服务，本轮未创建测试 pane。
- 公共 Vault ZIP、根锁、组合装配与组合验收由 Lead 接续。

## Lead 验收
