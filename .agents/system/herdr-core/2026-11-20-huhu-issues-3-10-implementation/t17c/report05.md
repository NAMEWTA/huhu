# t17c · #8 S1b.2 桌面草稿附件

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task05.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task05.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report05.md`
- 执行结果 — `done`

## 结论

Mail 侧已实现保存草稿后选择附件、显示受管状态、移除和退出后重开。合成宿主通过实际 Engine 附件服务导入隔离测试文件，真实写信组件通过桌面授权移除引用。现有 preload 仅能返回选取路径，原生桌面选择和私有流由 Lead 按已提交的强类型宿主契约接入。 [验证证据、重跑方式与接线约定](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1b.2-desktop-attachments.md)

## 产物与改动

- 独立工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`。分支 `impl/huhu-issues-3-10-mail-confirmed-ui`，本地提交 `46b9047ae67e2a1f1abe9f0549e3f7144a512cc2`，父提交 `6a75ccd7fd88c8c6149887c3c3a0640cd6ebfb68`，提交后工作树干净。
- Mail 对已保存的 `draftId` 及当前 revision 调用宿主。保存失败不打开选择窗口。附件区显示名称、字节数和已保存、字节缺失、损坏或无法读取状态。相同 SHA-256 保留原名称和引用，缺失对象可由相同字节重新绑定。附件操作的反馈显示在附件区。
- `@huhu/plugin-mail/desktop-attachments` 导出 `DesktopDraftAttachmentHost`。选择请求包含 operationId、vaultId、draftId、expectedRevision。取消绑定原操作。渲染端只收到修订和元数据。退出或卸载时撤销选择，旧响应不能覆盖新编辑器。
- `mail.drafts.removeAttachment` 复用 `MailDraftAttachments` 的修订检查。成功提交引用后通过同一快照边界回收，保留其他草稿和发件箱仍引用的对象。仅桌面且可写 Vault 可调用，工具入口无法开放该能力。
- 改动限 `plugins/mail` 与 Mail 验收证据。共享 preload、Engine 主入口、共享 Renderer 与根锁保持基线。根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。无新增依赖。原型四项资源与 `7d17ffa6` 一致，确认指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。

## 验证

Windows 固定 pnpm 12.10.1，Node 24.21.0，Vitest 3.2.7，Edge 157.0.4341.60。使用合成邮箱和文件、临时 Vault 以及本机回环 IMAP／SMTP。

| 检查 | 观察 |
| --- | --- |
| Mail 回归 | 7 文件、38 项通过，包含浏览器实际组件、真实 Engine HTTP 与隔离合成宿主联验。 |
| 保存前置与取消 | 注入首次保存请求失败，正文保留且宿主调用为 0。保存后取消选择，附件导入和源文件打开都为 0，无附件记录与对象，焦点返回添加按钮。 |
| 去重、超限与错误 | 两个不同名称但同字节的文件只保留一个引用和第一次的名称，重复不推进草稿修订。超出 25 MiB 时不开源文件。移走源后再次选择会报文件不存在，正文及原修订保持。Engine 另验复制中断和落盘失败。 |
| 重开、移除和回收 | 原文件移走后重开同一草稿，实际受管字节及 SHA-256 一致。暂移除受管对象时显示缺失，使用同字节修复。移除最后一个引用后确认对象回收。Windows Engine 重启及 ZIP 恢复后仍能读原附件，导出与移除遵循同一串行边界。 |
| 退出和迟到回调 | 挂起一次选择，触发窗口退出参与者，收到对应取消。重开同一草稿后释放迟到结果，无新增引用、字节、错误提示或修订。附件路径的 SMTP DATA 增量为 0。 |
| 授权与静态 | Web、CLI、只读 Vault、过期修订与附加绝对路径输入均被拒绝。Mail TypeScript、Oxlint、Stylelint、Oxfmt、项目 CSS 检查及 Git 差异检查通过。 |

[390px 续编截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1-workbench/mail-attachments-390.png)

## 来源与指南

核对本地 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的写信附件选择、列表与移除，来源许可为 AGPL-3.0-only。Mail 实现复用 Huhu 原有写信组件、被管附件、条件写、对象回收及整包快照。

实施前执行 Modern Web Guidance search 和 retrieve。`forms` 用于附件操作的显式按钮语义，`accessibility` 用于取消和移除后的焦点、界面内状态提示与错误反馈。长文件名沿现有 Mail 表单规则换行，保留全名。

## 阻碍与接续

- Mail 侧交付无阻碍。Lead 需把 `window.huhuHost.mailDraftAttachments` 接到可信主 frame 下的原生单文件选择与当前 Vault 的 Engine 私有传输。取消、frame 销毁、窗口关闭和 Engine 实例切换都需撤销在途操作，源路径和文件字节留在宿主侧。
- 真实原生对话框、preload 到 Engine 的私有流及组合安装包尚未验收。在 Lead 接线前，未提供该宿主的现有桌面构建会显示暂不支持选择附件。Web 大文件和转发留各自切片。

## Lead 验收

Lead 合并 2ea0bda8 并接入 cbf98559。通过应用的真实 preload、Main、utilityProcess 和 Mail 能力复跑两项桌面用例，系统选择结果为合成夹具。
