# #8 S1b.2 Mail 草稿受管附件 Engine 阶段

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t162`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t162/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t162/report01.md`
- 执行结果 — `done`

## 实现

本地提交 `5ab72a2ba812130cbf83a7694232582abf7f762f`，直接父提交 `37bcc525c913afc1fa6d5180c2bff6b771fc8ae4`。分支 `impl/huhu-issues-3-10-mail-drafts`，工作树 `safe-personal`。提交仅含 Mail Engine 和其 Windows 测试，工作树干净。 [提交与范围](./evidence-task01/commit.log)

- 桌面现有 `pickOpenPath("file")` 返回选取路径，Notes 附件导入使用已取字节与 `VaultFiles`。所核对的 one-mail 版本以源文件路径保存草稿附件。Mail 沿用 Huhu 的 Vault 原子写机制，插件私有入口消费可信宿主提供的显示文件名、确切长度和可取消的字节源。 [环境和上游版本](./evidence-task01/environment.log)
- 完整读取并校验长度后计算 SHA-256。对象保存在 `.huhu/mail/attachments/<digest>`，正文和附件引用保存在 `.huhu/mail/drafts.json`。同草稿再次加入同摘要保留首个名称和原 revision，跨草稿可共享同一对象。正文保存复用已有引用，添加、移除、丢弃与正文保存共用草稿修订队列。旧草稿按原格式读入。
- `mail.drafts.get` 与 `save` 在有附件时返回 `ready`、`missing`、`corrupt` 或 `unreadable`。进程内读回按草稿归属和摘要验证字节。复制或对象写失败会保留旧引用，草稿替换失败可能留下已校验但未引用的对象。显式回收核对全部草稿持久引用，草稿索引缺失时保留对象。
- 按 Notes 的 25 MiB 单文件上限做本切片默认值，另设每草稿 50 MiB 与 100 项上限。文件实际长度超出声明或提前结束时给出独立错误。Vault 关闭时取消并等待附件队列清理。

## Windows 验证

Windows x64、Node v24.21.0。测试使用真实 Engine `boot()` 和工作台 HTTP Dispatcher，记录真实 Mail 注册时发布的生产服务以代替尚待装配的可信宿主。测试创建独立临时 Vault 和合成二进制文件，关闭全部 Engine 并验证测试目录已删除。 [环境](./evidence-task01/environment.log) · [复跑输出](./evidence-task01/mail-vault-recheck.log)

| 验收项 | 实际结果 |
| --- | --- |
| 来源独立、去重和准确读回 | 6 字节合成文件经 3 次宿主源读取产生两个跨草稿引用和一个受管对象。同名异内容另存。移走和删除源文件后重开，用原始 Buffer、长度和完整摘要核对读回，累计源读取仍为 3 次。 |
| ZIP 与共享引用 | 原有 `exportPackage` 在 `withSnapshot` 内导出，当次包含草稿文件和摘要吻合的对象；原有 `importPackage` 恢复到新目录后，以只读 Engine 取回原始字节。导出期间排队的移除和回收在导出结束后执行。移除第一个引用保留对象，丢弃第二个草稿后只回收失去引用的对象。 |
| 并发与入口 | 同一 revision 的正文和附件竞争只提交一次，迟到者收到获胜 revision。过期附件操作打开源 0 次。普通 RPC 拒绝伪造附件引用、任意路径以及受保护对象的读取。 |
| 失败与恢复 | 超限和取消前打开源 0 次。另验源缺失、复制中断、长度不足和增长、对象和草稿各自的原子替换故障、受管对象缺失、同长度损坏和同摘要重新导入修复。失败前后的旧草稿和已提交字节逐字节一致。草稿提交失败后的无引用对象可回收。Engine 关闭取消在途读取，重开后原引用完整。 |

Mail 29 项通过。Mail 与 Vault 合跑复测 139 项通过、1 项跳过。首次默认并发合跑有一项 Vault 空目录监听超时，以 `--maxWorkers=2` 重跑后通过。全仓 lint、Mail lint、格式和 Git 差异校验通过。Mail 类型检查仍报告父任务已记录的 `packages/contracts/src/kinds/task.ts:71` `TS2379`，本提交未涉及该文件。 [Mail](./evidence-task01/mail-tests.log) · [首次合跑](./evidence-task01/mail-vault-tests.log) · [合跑复测](./evidence-task01/mail-vault-recheck.log) · [全仓 lint](./evidence-task01/root-lint.log) · [提交前检查](./evidence-task01/diff-lint-format.log) · [类型检查](./evidence-task01/mail-types.log) · [父任务基线](../t12p/evidence-task07/baseline-types.log)

## Lead 装配

1. Engine 用 `getService<MailDraftAttachments>(MAIL_DRAFT_ATTACHMENTS_SERVICE)` 获取当前可写 Vault 的插件服务。在可信工作台确认选取后，由受信进程打开已校验文件或消费受限句柄，将显示名称、确切长度和 `read(signal)` 交给 `addAttachment`。源需要响应取消并释放句柄。取消文件选择时直接结束。新草稿先用 `mail.drafts.save` 获得 revision。移除及预览按当前 `draftId` 和摘要定位。
2. 整库及 Mail 子集导出应从文件枚举到最后一次读取都走可写 Engine 上的同一 `withSnapshot`。目前原 `vault.exportPackage` 仍需要 Lead 接线，测试通过显式包裹验证了协调路径。完成导出接线前，仅在确认无并行导出时调用 `sweepUnreferenced`。发件箱或其他持久区域复用此对象库时，须先将其引用纳入回收判断。
3. 原型确认、原生文件选择界面和共享文件流接线留在后续阶段。此次取证覆盖生产插件服务与真实 ZIP 实现。验证窗格 `t165`–`t168` 已回收，`t162` 的验收与关闭由 Lead 接续。

## Lead 验收

