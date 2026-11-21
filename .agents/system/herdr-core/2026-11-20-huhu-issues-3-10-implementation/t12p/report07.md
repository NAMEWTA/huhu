# #8 S1b.1 · 离线草稿的 Engine 合同

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task07.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task07.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report07.md`
- 执行结果 — `done`

## 候选与合同

候选 `37bcc525c913afc1fa6d5180c2bff6b771fc8ae4`，直接父提交 `8dc4a5f29f0923abb54d2e3ca7a8728f96329acb`，分支 `impl/huhu-issues-3-10-mail-drafts`。改动位于 Mail 后端、插件清单、Engine 夹具及对应任务文档，提交后工作树干净。 [提交核对](./evidence-task07/commit.log)

- 受信桌面和 Web 工作台使用 `mail.drafts.list/get/save/discard`。调用者为每次新建编辑固定一个 UUID v4。保存输入为 `{ draftId, expectedRevision, draft }`，首次 `expectedRevision` 为 `null`，更新及显式丢弃使用当前修订。保存回执带新修订。过期调用返回 `VERSION_CONFLICT` 及 `currentVersion`，可按原 ID 重读结果。列表返回摘要，单封读取返回完整草稿。
- 按 To、Cc、Bcc 顺序以去空白、忽略大小写的邮箱地址去重，保留首次出现的栏位和顺序。原样保留主题、Tiptap/ProseMirror 文档 JSON 和链接属性。新选择的账号须有可发配置。草稿可在未选择账号时保存，认证待修复时可离线继续编辑。
- 草稿保存在原 Vault 的 `.huhu/mail/drafts.json`。业务修订与 Vault 文件版本都参与检查，复用原子替换。显式丢弃后只保留身份和修订元数据，避免迟到保存复活草稿。草稿写入由此 CAS 保证副作用只发生一次，草稿正文与密送人没有进入通用幂等日志。

## 实测证据

Windows x64 查阅了现有 Mail 账号 CAS、Vault 原子写、新 ZIP、Huhu 富文本模型和本地 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`。测试从真实 Windows Engine 及工作台 Dispatcher 运行，账号发现用合成目录。 [环境与参考](./evidence-task07/environment.log)

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 基线 | 起点的桌面保存调用失败。实现入口后，同一草稿跨 Engine 重开。 | [红灯](./evidence-task07/red.log)、[初次绿灯](./evidence-task07/first-green.log) |
| 离线与账号 | 两个可发合成账号可切换并分别重开，收件专用及不存在的账号被拒。核对 To/Cc/Bcc、主题、加粗、链接及原账号。通过桌面 HTTP 与 Web 工作台 Dispatcher，外部 CLI 和 MCP 调用被拒。回环邮件传输连接数为 0。 | [Mail 实测](./evidence-task07/mail-tests-final.log) |
| 只读、失败和并发 | 只读读取成功，保存和丢弃返回 `READ_ONLY_VAULT`。注入一次 Windows 原子替换失败，原草稿字节、修订和目录保持；同修订并发两次保存恰好一条成功，不同草稿并发均保存。显式丢弃后旧修订和迟到创建均不能恢复内容。 | [Mail 实测](./evidence-task07/mail-tests-final.log) |
| ZIP 与清理 | 新格式整 Vault ZIP 恢复了两封草稿和账号引用。恢复的账号要求重新配置认证，原生凭据读取返回 `unbound`，解包文件无合成密码与本机保护数据。恢复后可继续编辑，源库草稿不受影响。临时 Engine、回环监听、目录和合成原生密钥均清理，无新增验证窗格或 worktree。 | [Mail 实测](./evidence-task07/mail-tests-final.log)、[早期夹具密钥清理](./evidence-task07/cleanup-early.log) |
| 回归与静态检查 | Mail 4 个文件、26 项测试通过。全仓 lint、Mail lint、格式及 Git 差异检查均通过。Mail 类型检查只报共享任务日期契约 `packages/contracts/src/kinds/task.ts:71` 的 `TS2379`，同依赖下的起点编译复现同一错误。 | [测试](./evidence-task07/mail-tests-final.log)、[全仓 lint](./evidence-task07/root-lint.log)、[范围 lint](./evidence-task07/mail-lint-final.log)、[格式](./evidence-task07/format-final.log)、[类型](./evidence-task07/mail-types-final.log)、[起点类型](./evidence-task07/baseline-types.log) |

规格复核覆盖以上 Engine 行为。项目边界复核确认沿用共享 Vault、权限和 ZIP 接口。原型待确认，界面上的失败提示、取消丢弃和退出留在界面切片。当前能力以 Mail 插件现有清单及运行时注册接入，中央静态能力描述、后续附件和发件箱共用的持久事务及包快照由 Lead 统一整合。本次 ZIP 验证取已提交的草稿快照。
