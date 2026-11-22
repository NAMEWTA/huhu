# t17c · #8 M-05 转发和新话题

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task08.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task08.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report08.md`
- 执行结果 — `done`

## 结论

Mail 阅读区和右键菜单可从当前邮件发起转发或新话题。转发使用空白收件人和可编辑引文，首次保存将有实际字节的可携带附件提交为受管草稿附件。仅名称的条目显示未携带字节，可补选同名文件或明确跳过。新话题只预填去重后的公开参与者，可切换发件账号，主题和正文独立。 [运行证据、截图与复跑方式](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.6-forward.md)

## 产物与边界

- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`。本地提交 `b1aafd92c5649e7d314dcbcb42ee5776fe3a51a2`，父提交 `4e6daf0829fd41867df5db11bde329598f84f978`，工作树干净。改动限 `plugins/mail` 与 Mail 验收证据，根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。确认原型与 `7d17ffa6` 资源一致，指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。
- 新设内部能力 `mail.messages.prepareForward` 和 `mail.messages.prepareNewTopic`。复用本地邮件账号、目录和消息 ID 校验。转发进一步核对正文及首次保存所据的完整 RFC822 摘要，因此同 UID 的内容替换也会让旧预览失效。编辑沿用 MailComposer 的可编辑纯文本摘录，长度限制为 24,000 字符和 300 行。
- 附件沿用现有有界 MIME、摘要存储、草稿 CAS 与 outbox 冻结。空载荷、内联资源和外部附件指针只显示为未携带，渲染端选择补充文件仍走现有桌面宿主。实际字节由源缓存或用户选择的本机文件进入当前草稿。超过既有 2 MiB 原信缓存边界的邮件继续沿用原阅读限制。
- 仅回复模式使用 `In-Reply-To` 与 `References`。新话题的公开 From、To、Cc 排除 Vault 自身地址和重复地址，未进入公开字段的 Reply-To 地址不会单独成为参与者，历史 Bcc 也不进入两种草稿。

## 验证

使用 Windows 固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7 和 Edge 157.0.4341.60。范围为临时 Vault、合成账号及本机回环 IMAP、SMTP。

| 检查 | 观察 |
| --- | --- |
| 转发入口和草稿 | Edge 键盘打开后焦点进入收件人，关闭后返回原按钮。收件人、抄送、密送为空。修改引文后故意中止首次保存，正文留在当前编辑器。重试并重开，正文及已保存附件仍在。取消补选零附件导入，跳过仅名称的附件后可发送。 |
| 新话题 | Edge 验证收件人初始焦点、公开参与者去重、初始空主题和正文、可切换第二个发件账号。主题按 Enter 仍留在编辑器。UI 路径 SMTP DATA 增量与页面外部请求均为 0。 |
| 原信和字节 | 真实 Engine 拒绝跨账号借用相同 UID 的原信身份，也拒绝同 UID 内容更新前生成的转发草稿。重启后读回原草稿修订、原信身份、合成二进制附件及待补选条目。 |
| 实际 SMTP | 捕获 3 次投递。转发只含真实原附件和新收件人。新话题以第二个账号投递且没有继承附件。仅名称的另一封转发在补选同名文件后只发送补选字节。三次均未携带原 `In-Reply-To`、`References`、`Reply-To`、历史 Bcc、内联资源或外部指针的字节。 |
| 回归与静态 | Mail 7 文件 42 项通过，含 Edge 实际组件。Mail TypeScript、Oxfmt、Oxlint 与 Git 差异检查通过。 |

## 来源与指南

本地 one-mail 固定为 `d1be24d5bb83c2da7123b167f119d5abd169b0af`，README 声明 AGPL-3.0-only。参考 `conversation-pane.tsx` 的新话题收件人、`mail-composer/index.tsx` 的原附件展示、`commands/data/compose.rs` 的转发入口。实际实现以 Huhu 自有编辑器、原信解析、受管对象与 outbox 为基础。

实施前完成 Modern Web Guidance search 和 retrieve。`accessibility` 用于派生编辑器的初始焦点、退出恢复与条目移除后安置焦点，`forms` 用于独立操作按钮和明确发送动作。输入法按键仍由原编辑器处理。

## 接续

本切片无阻碍。共享上游台账、组合安装包及发行验收由 Lead 接续。此轮证据为 Windows 临时 Vault、真实 Engine、Edge 实际 Mail 组件与本机回环协议。

## Lead 验收

