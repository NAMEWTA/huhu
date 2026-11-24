# 邮件原型走查与用户确认

## 入口与版本

双击 [prototype/index.html](prototype/index.html) 即可走查。完整版本由 `index.html`、`prototype.css`、`theme.css` 和 `prototype.js` 组成，目录 SHA-256 为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。

沿用 Huhu 工作台的窗口栏、56px 模块栏、标签条、面包屑及状态栏，使用当前 Claude 默认主题及 Apple、Notion、Vercel 的本地 token 子集。窄窗按账号、对话、正文逐层进入，返回时恢复选中对象和焦点。 [AppShell](../../../../../../packages/workbench/src/shell/AppShell.tsx) · [基础尺寸](../../../../../../packages/ui/src/styles/tokens.css) · [主题色](../../../../../../packages/ui/src/styles/themes.generated.css)

Huhu 检出为 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。邮箱预设和参与者信息结构对照本地 one-mail 默认分支 `d1be24d5bb83c2da7123b167f119d5abd169b0af`，Huhu 自有界面承载演示文案和样例。 [来源](source.md) · [规格](spec.md) · [设计](design.md) · [实施计划](plan.md) · [批次来源清单](../feature_2026-11-19-huhu-issues-3-10/sources.md)

## 走查场景

| 范围 | 入口与可见结果 | 取消、异常或恢复 | 源码定位 |
| --- | --- | --- | --- |
| M-01 邮箱与同步 | 从「全部账号」切换邮箱，可折叠提供商、调整账号栏宽度、键盘选择或右键操作。添加邮箱覆盖 18 个命名预设及自定义。普通邮箱测试连接和选择目录后保存。OAuth 可在弹窗演练授权和重授权。 | 可以取消授权或模拟超时、拒绝；普通邮箱须选 INBOX，禁选目录保持禁用。可模拟同步超时后刷新、删除前预览本地影响。 | `accountRows`、`beginAccount`、`showAccount`、`testAccount`、`sync` |
| M-02/03 参与者、筛选和定位 | 单账号副本按消息 ID 归并，联系人名单排除自己的邮箱及密送地址。筛选默认今天。切到工作邮箱后，搜索「蓝色封面的签署表」，回车跳到另一个邮箱的旧邮件、切为全部时间并高亮。演示控制可定位同一通知样例。 | Esc 关闭搜索并返回触发处；无结果有空态。390px 窄窗返回上级会恢复焦点。 | `visibleMessages`、`publicPeople`、`threads`、`openSearch`、`locate` |
| M-04 阅读 | 打开周晴的邮件，等正文加载后显示「本机已读」；IMAP 样例有远端确认状态。可看原文、引用、签名，切换显示模式、展开长文、返回最新，按封放行示例图片。 | 选「正文载入失败」后打开邮件，可重试。远端标读故障保留待重试；只读禁止标读更新。 | `messageBody`、`observeMessages`、`loadBody`、`markRead` |
| M-05 回复、转发 | 从多人往来选择回复全部，以来源邮箱回复，排除自身及密送地址。可新建话题或转发，用文字区分仅有名称的附件。 | 丢弃前确认；提交前移除缺字节附件，或加回同名示例附件。 | `reply`、`renderCompose`、`submitMail` |
| M-06/07 写信、草稿、投递 | 可选择发件人、去重收件人、加粗、插入链接、预览格式、扩大浮层、增删示例附件。关闭有改动的写信会保存草稿。部分接受只允许重试明确失败的收件人；结果未知显示核对入口。 | 保存失败保留编辑内容；离线可继续写，收件专用或只读限制发送。模拟重启后发件结果仍可查。 | `startCompose`、`saveDraft`、`recipients`、`attempt`、`historyPage` |
| M-08 设置、AI、备份 | 独立邮件设置可调整同步间隔。AI 默认关闭，展示所选内容和服务地址，确认后可采纳回复草稿。创建备份、预检、恢复到新的演示 Vault，邮箱显示需要重配认证。 | 模拟预检失败后重试。可模拟 AI 不可用；退出无需发送邮件。 | `scheduleSync`、`settingsPage`、`aiContent`、`actions.restore`、`actions['apply-backup']` |

## 实际走查

- 2026-11-19，Windows Edge 157.0.4341.60，Playwright Core 1.65.1，从 `file://` 打开。1440×900 走通正文载入失败、重试和标读、联系人复制、跨账号定位、回复全部排除密送，草稿失败留表单及续编附件，部分投递后只重试剩余项，结果未知的核对及重启，Mail 备份预检失败及恢复。对照 Claude 浅色和 Vercel 深色。
- 390×844 验证添加邮箱、取消并重新模拟授权、保存，另从账号进入对话及正文，逐层返回并断言焦点。两个视口均检查页面横向宽度、两份 CSS、一个脚本、浏览器错误和 HTTP 请求数。
- 补充走查收件专用账号的发信保护、QQ 预设取消 INBOX 后拒绝保存、恢复选中后保存，邮件 AI 启用及确认所选内容后生成草稿，通知定位。
- 同机复跑工具和截图在系统临时目录 `%TEMP%/huhu-t14-prototype-qa/`。命令为 `node smoke.cjs mail` 与 `node extra.cjs`，使用该目录的 Playwright Core。截图为 `mail-desktop.png`、`mail-narrow.png`。

## 用户确认和实施边界

2026-11-21 用户在批次会话确认采用八份完整原型。本页对应资源包指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`，实施按本 Change 与 Issue 的验收场景推进。

用户确认采用指纹 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65` 对应版本中的邮箱添加与连接测试、草稿保留、部分接受时按失败收件人重试、待核实投递反馈。

其他邮件设置、写信布局与窄窗操作按相应切片核对。演示使用 Outlook 的 IMAP 路径、空 Vault 恢复、固定样例日期与附件、模拟重启，以及格式标记编辑和安全预览。同地址账号的 Mail 子集冲突、Graph 独立授权和未知投递的远端核对仍需对齐。

生产验收对应规格和计划，需使用真实授权测试邮箱验证 OAuth、协议身份及远端标读、部分投递与结果未知的持久事务、附件字节、邮件 HTML 安全处理、Vault 包和恢复、桌面与 Web 宿主、统一工具入口。尚未逐一运行 18 家预设、同步间隔计时或所有主题。
