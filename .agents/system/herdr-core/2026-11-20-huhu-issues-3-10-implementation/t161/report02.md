# #8 S1b.2 受管邮件附件独立复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t161`
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report02.md`
- 执行结果 — **done**

## 结论

冻结候选 `5ab72a2ba812130cbf83a7694232582abf7f762f` 的 Mail Engine 附件切片通过独立复核。Windows 定向夹具 1 个文件、3 项通过，窗格退出 0。未发现阻挡此插件切片交回的新增缺陷。实际文件选择接线和生产 `vault.exportPackage` 的快照接线仍是完整交付的门槛。 [独立复跑](evidence-task02/attachments.log) · [原实施报告](../t162/report01.md)

## 静态核对

候选的直接父提交为 `37bcc525c913afc1fa6d5180c2bff6b771fc8ae4`。差异仅含 4 个 Mail Engine 文件与 1 个测试文件，`git diff --check` 通过。原验收 Mail 29 项通过，Mail 与 Vault 合跑复测 139 项通过、1 项跳过。原 Mail 类型检查仍有父任务已记录的共享任务日期 `TS2379`，候选与父提交的该源文件无差异，本轮以运行夹具为主。 [原提交记录](../t162/evidence-task01/commit.log) · [原 Mail 测试](../t162/evidence-task01/mail-tests.log) · [原合跑复测](../t162/evidence-task01/mail-vault-recheck.log) · [类型检查日志](../t162/evidence-task01/mail-types.log)

- **规格。** `draft-attachments.ts:48` 完整校验声明长度后计算 SHA-256，按摘要保存至原 Vault 的 `.huhu/mail/attachments/`。同草稿同摘要复用首个名称和原修订，跨草稿共享字节对象。正文保存继承已提交引用。对象先落盘，草稿索引再以业务修订和 Vault 文件版本条件提交。失败可留下无引用对象供显式回收，已提交引用保持完整。
- **项目规范。** `drafts.ts:240` 把添加、移除、丢弃和正文保存放在同一个草稿队列，复用 `VaultFiles` 的写者约束与原子替换。进程内读附件先按草稿归属核实引用，再验证对象长度和摘要。回收扫描当前全部活跃草稿的持久引用，缺索引时保留对象。服务通过现有 `api.provide` 注册，依据运行期信号取消，插件卸载后等待队列排空。

## Windows 独立复跑

从冻结 Git 对象归档到一次性系统临时目录，复用本地集成检出 `3290af19c012c320bb4c7d89c2ab66baf36357ae` 的已安装依赖。两个提交的锁文件 blob 均为 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`。夹具 blob 与冻结提交匹配，工作区依赖指向临时快照。Windows x64、Node v24.21.0 下以单 worker 运行 `plugins/mail/test/draft-attachments-engine.test.ts`。真实 Engine 通过本机回环 HTTP 接受草稿保存、读取、丢弃，夹具捕获 Mail 真实注册的进程内服务，提供合成文件字节流。 [复跑脚本](verify-attachments.ps1) · [测试及退出码](evidence-task02/attachments.log)

| 验收项 | 独立复跑结果 |
| --- | --- |
| 附件流、去重和重开 | 6 字节文件按小块读入。同草稿重复添加保留名称与 revision，两个草稿共用一个摘要对象，同名异字节另存。移动、删除原文件并重开后，原 Buffer、长度与 SHA-256 均一致，宿主读取累计 3 次。 |
| CAS 和失败 | 同一 revision 下先提交的附件胜出，竞态中的附件与正文以及旧 revision 的移除均返回获胜 revision；落败的附件源读取 0 次。超限和预取消源读取 0 次。源丢失、短读、增大、复制中断、对象及草稿原子替换失败均得到夹具预期结果，旧草稿和原对象字节保全。 |
| 状态和关闭 | 管理对象缺失及同长度损坏分别返回 `missing`、`corrupt`，再次导入相同字节修复且沿用原修订。Engine 关闭取消在途源并等待读取收尾，重开读到原引用。 |
| 整 ZIP 和回收 | 夹具在同一服务的 `withSnapshot` 外层调用真实 `exportPackage`。移除、回收在导出后完成。ZIP 清单的对象长度、摘要与原始字节一致，恢复后由只读 Engine 读回导出时的草稿 revision 和完整附件。该只读 Engine 拒绝添加附件及回收。移除第一处引用保留对象，丢弃最后一处引用后只回收对应对象。失败写入留下的孤立对象可回收，索引暂时缺失时保留对象。 |

## Lead 装配边界

1. **整 ZIP 与 Mail 子集。** 冻结候选的 `packages/kernel/src/capabilities/package.ts:69` 仍直接调用 `exportPackage`。生产接线要在读取草稿及枚举文件前取得同一 Vault 写入实例的 `withSnapshot`，保持到最后一次源文件读取，并向导出器传入包装器给出的取消信号。队列属于创建服务的 Mail 实例，另一个只读 Engine 的队列无法协调仍活跃的写者。启用 `sweepUnreferenced` 前，所有可能与它并发的导出须进入同一边界。未来发件箱等区域复用对象库时，回收要纳入它们的持久引用。
2. **ZIP 范围。** 现有整库收集器把 `.huhu/` 文件纳入受管内容。夹具以 `includeAttachments: false` 仍确认 Mail 引用和字节共同出包并恢复。S6a.1 的子集筛选、缺件校验和其他 Mail 持久区域的一致性需单独接入，夹具验证的是草稿队列与既有 ZIP 库的协调。 [S6a.1 验收范围](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S6a.1-snapshot-export.md)
3. **可信文件源。** `MailAttachmentSource` 接受显示名称、确切长度和 `read(signal)`，由可信宿主对用户选中的文件或受限句柄构造。同一来源的大小与读取应对应同一已校验对象。取消选择直接结束。当前桌面 `pickOpenPath("file")` 提供选取结果，尚需把可信选取结果接到进程内服务。旧 revision、超限和预取消可能在调用 `read` 前结束，因此源应在 `read` 中延迟开启，或由宿主负责释放预先打开的句柄。读取须响应取消并及时释放，Engine 卸载会等待队列。普通草稿 RPC 的正文架构及现有受管目录权限检查按夹具通过。

## 清理与交回

夹具仅使用临时 Vault、合成文件和本机 Engine 回环。业务源码与锁文件以只读方式核对，复跑使用非注册的系统临时快照。夹具目录核对为零，已解除依赖目录联接并将归档快照移入回收站，原临时路径已验证不存在。验证窗格 `t16k` 已关闭。Lead 可关闭或复用 `t161`。 [窗格退出](evidence-task02/pane-exit.log) · [清理日志](evidence-task02/cleanup.log)
