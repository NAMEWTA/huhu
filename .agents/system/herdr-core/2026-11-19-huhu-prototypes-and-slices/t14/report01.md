# 任务报告 · 邮件与保险箱原型

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- terminal_address — t14
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t14/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t14/report01.md
- 执行模型 — GPT-6.2-sol，推理强度 xhigh
- 执行结果 — done

## 结论

完成 #8 邮件与 #9 保险箱的离线可交互 HTML。两份原型从本机 Edge 直接打开，已分别走通桌面及窄窗的正常、异常、恢复和重置流程。两份确认记录均为待确认。

## 产物与改动

| Change | 原型与确认记录 | 原型目录 SHA-256 |
| --- | --- | --- |
| #8 邮件 | [打开原型](../../../../dev/changes/2026-11-19-issue-8-mail-module/prototype/index.html) · [走查记录](../../../../dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md) | `f619b7c1d47b831215b4592f92a8c00d94d02b465d90d717e02d7538be4f79be` |
| #9 保险箱 | [打开原型](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/prototype/index.html) · [走查记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/prototype-review.md) | `d06235e74ab296d72d5fe8e0009c38d417a9ec2a0af796facf4b9347aaeca42e` |

每份原型包含 HTML、交互 JS、样式及 Huhu 主题 token 子集四个文件。业务产物只写入上述两个 change。工作区基线 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`，产物在本地工作树。核对批次来源清单和 `temp/sources` 的 HEAD 与 `origin/HEAD`，one-mail 为 `d1be24d5bb83`，Motty 为 `2daa9db582e1`，ORCA 为 `8bc232f5ed8b`。原型复用 Huhu 工作台和现有 Safe 交互的设计来源，参考上游预设、对话聚合及模块边界。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 原型独立打开 | Edge 157.0.4341.60、Playwright Core 1.65.1，以 `file://` 加载。在 1440×900 和 390×844 校验两份样式和一份脚本正常加载、无页面错误、HTTP 请求数为零、无横向溢出。 | 系统临时目录 `%TEMP%/huhu-t14-prototype-qa/smoke.cjs`，执行 `node smoke.cjs` |
| 邮件桌面 | 模拟正文失败后重试并显示本机已读，跨账号搜索后定位旧邮件，回复全部排除密送；关闭写信时草稿失败保留原文，重试后从草稿续编并保留附件；部分投递仅重试明确未投递项，结果未知只可核对，重启后可查询；备份预检失败后可恢复。 | `smoke.cjs mail`、`mail-desktop.png`、邮件走查记录 |
| 邮件窄窗与补充 | 添加邮箱时取消并重走 OAuth。账号、对话、正文返回恢复焦点。补验普通 IMAP 必选 INBOX、收件专用限制发送、AI 确认所选内容后生成草稿及通知定位。 | `smoke.cjs mail`、`mail-narrow.png`、`extra.cjs` |
| 保险箱桌面 | 错密码后解锁，键盘显隐、切账号遮罩、复制失败后成功。检索排除密码，标签多选取交集。保存失败留表单、重试后保留原密码，版本冲突可重读，取消可返回，锁定清除编辑和密码。新建双账号、同名标签复用、清洁安装和重置均通过。 | `smoke.cjs safe`、`safe-desktop.png`、保险箱走查记录 |
| 保险箱窄窗与补充 | 长标题、长网址及 12 个账号可达，返回恢复条目焦点。Safe 锁定及停用时 Git 仍能模拟使用，替换目标后要求重配。补验表单内新增标签、改主密码后用旧备份密码恢复、最后一个账号的删除取消和恢复后模块重新配置。 | `smoke.cjs safe`、`safe-narrow.png`、`extra.cjs` |
| 文件与版本 | 两份 JS 通过 `node --check`。使用技能指纹脚本生成两个目录 SHA-256，以 `--expect` 复核并与确认记录核对。 | 两份 `prototype-review.md` |

Modern Web Guidance 已执行 search 与 retrieve。确认与编辑使用有名称的原生 `dialog.showModal()`，错误在操作发生后通过活区呈现。按窄窗布局收起非当前栏，采用动态视口高度。复制动作等待 Clipboard API 结果后提供明确的成功或失败反馈。

## 阻碍与接续

原型交付无阻碍。邮件采用 Outlook IMAP、空的新 Vault 恢复、预置附件和内存重启。已有同地址账号的子集恢复、Graph 单独授权和未知投递的远端核对有待产品决定。保险箱演示使用账号选择器、模拟模块设置和内存备份。两份原型均待用户确认。

真实 SMTP/IMAP/OAuth、加密与持久备份、系统钥匙串、真实模块认证、Electron 与 Web 宿主、统一能力及全部预设和主题组合仍需在实施阶段验收。补充运行脚本和截图为本机临时证据。

## Lead 验收

待 Lead 验收。

- Lead 验收通过。核对 #8、#9 的离线 HTML、确认记录与资源指纹。实际邮件、系统钥匙串等验收留在实施任务。
