# #9 P0.2 初始回收证明中断恢复独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t4z
- task — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report04.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t4z`，清单指向 `task04.md active`。
- 执行结果 — done（复核完成，建议本地合入）

## 结论

| 审查轴 | 签收建议 |
| --- | --- |
| 规格 | **通过。** 退出 75／76 后重开写者可重建证明并清理无引用材料。退出 77 和发布重命名 `EBUSY` 的恢复通过。只读隔离、原实例保全和原事务退出 71–74 通过。 |
| 规范 | **通过。** 本机私有作用域与证明在同级目录一次发布。持锁写者只清理其未发布的证明和空暂存目录。已有规范作用域和无法判定的引用继续采用保守处理。 |

建议将 `7174fc8 → 86f810e → 47f854b` 作为整条 P0.2 私有内核链本地合入。裁定以链顶冻结提交 `47f854b43b1c8f66e6d5aac6423278d4eaf547b5` 为准。生产原生适配、随包验证与 SSH／Mail 业务接线另按各自切片验收。

## 规格轴

- **重放 75 和 76。** 沿用上轮独立脚本的两个注入点，在真实子进程中分别于证明写入前及仅写入 JSON 开头后退出。父提交形成规范目录，重绑、重开验证和清空后仍有 3 个密文和 2 把钥匙，`recover() = false`。候选退出时只有同级暂存路径，规范作用域尚未出现。两版退出时的可移植定义字节均保持原样，当时的 2 个密文和 1 把钥匙都属于源库。候选重试后暂存消失，证明按当前精确作用域和两条原 revision 完成发布。重新开库认证成功。清空后只剩源库的 2 个密文和 1 把钥匙，`recover() = true`。相邻条目仍待重配，源库两项均可认证。 [上轮报告](report02.md) · [父提交](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/parent-probes.log) · [候选](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-probes.log)
- **发布后退出 77 与重命名故障。** 77 在同级重命名返回后立即退出。规范作用域已有完整可读证明，暂存路径已消失，可移植定义、密文和钥匙仍处于初始状态。重开后沿用该证明，重绑并清空后回收成功。另在重命名处注入 `EBUSY`，子进程确认保存返回 `storage-failed` 并正常放锁。证明停在暂存路径，规范作用域仍未出现。下一写者重试并清空，回到 2 个密文和 1 把钥匙。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-probes.log)
- **作用域、既有材料和证明损坏。** 正常复制库的一项重绑和清空不影响源库及待重配的邻居。原本未配置的实体不进入初始证明，其后绑定的快照缺失或截断时均暂停回收。外作用域摘要及截断证明也暂停回收。对一个已有规范目录的作用域移除证明并保留一个同级暂存样例后，再保存并认证仍可取用原有有效绑定。缺失证明未重建，同级暂存保持原样，`recover() = false`。恢复原证明后回收成功。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-probes.log)
- **写者与只读。** 第二个可写打开得到 `READ_ONLY_VAULT`。独立只读子进程列举访问保护后端 0 次，具有配置意图的用途显示 `temporarily-unavailable`。调用 `use()` 访问后端 0 次，返回 `READ_ONLY_VAULT`，业务回调未运行。持锁写者可正常清空回收。同进程同 revision 并发仅一项成功，挂起的业务回调保留原定义与旧值。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-probes.log) · [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-vitest.log)
- **原事务回归。** 冻结版 17 项凭据测试通过，包含原退出 71（暂存完成、发布前）、72（配置发布后）、73（回收中）、74（钥匙创建后）。重开后选中预期版本并按引用回收，取消、发布失败和只读拒写的回归均通过。 [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-vitest.log)

## 规范轴

- 作用域路径由可信本机 Vault 实例 ID 和插件 ID 的摘要派生。初始证明暂存在同一 app-private 根下的 `<scope>.initializing`。文件排他创建、刷新并回读完整字节后，才将目录重命名到规范路径。保护后端新建钥匙、密文暂存及 Vault 配置提交均在此之后。该做法复用 Vault 导入的同级暂存发布模式。证据为 `47f854b:packages/kernel/src/credentials/versions.ts:21–31、45–94`、`module-credentials.ts:190–256`、`packages/vault/src/package/package.ts:161–175`。
- 只有规范路径尚不存在，且进入 Vault 写者队列的后续 `save()` 已通过 revision 与用途校验，才会丢弃同作用域的未发布尝试并按当前定义重建。路径检查使用 `lstat`，仅处理普通证明文件和空目录。本次独立探针确认，暂存路径上的普通文件、证明位置上的目录及 Windows junction 均使初始化停止，junction 的目标文件保全。暂存目录存在意外文件时，拥有的旧证明可被移除，意外文件及相邻作用域仍保留。移除隔离测试中的意外文件后可重试。已发布作用域的有效证明也在 77 重试中保持字节一致。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-probes.log)
- 后续生产装配须提供唯一稳定的本机 Vault 实例 ID、插件身份和可信 Vault 外应用私有根，并持有真实 Vault 写锁直到业务取用结束。已有作用域的证明缺失或损坏时应保全未知引用。该保守结果在两版均已验证。证据覆盖 Windows 进程退出，物理掉电未测。上轮提及的 Safe 与模块共用原语整理仍为维护项。 [上轮报告](report02.md) · [返工实现报告](../t79/report01.md)

## 产物与验证

- 直接父提交 `86f810e8ba42d43acb6e300737647dca85051741`，候选 `47f854b43b1c8f66e6d5aac6423278d4eaf547b5`，初版 `7174fc8d59693575cbc16227ec296acdd4c219e5`，共同基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`。检查实际 Git 对象和新增夹具。返工差异、整链差异均通过 `git diff --check`。相对本轮观察到的集成提交 `65bd6eb` 只读合并预览未发现冲突。业务和用户原有改动全程只读。
- Windows build 26300、Node 24.21.0、Vitest 3.2.7、tsx 4.23.15、Zod 4.6.7、write-file-atomic 8.0.0、proper-lockfile 4.1.2。两个 Git 归档的锁文件归一化 SHA-256 均为 `422f807cc8c10b738b68039e8759bb11b0a08ddadbe2d41aece9c146a71ad534`。复用集成检出中一致的测试依赖版本，集成锁差异仅为另一应用新增同版本 tsx 的引用。 [环境记录](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/setup.json)
- 独立运行 `node node_modules/vitest/vitest.mjs run packages/kernel/test/credentials.test.ts --maxWorkers 1 --testTimeout 15000 --reporter verbose`，17/17 通过，Core `t81`。同一独立探针分别运行父版和候选，Core `t8g`、`t8h`。t79 全 Kernel 82/82 和静态检查为原实现会话的补充证据。证据仅含合成输入和脱敏结果，目录为 `D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl`。 [归档脚本](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/prepare-archives.cjs) · [独立探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/independent-probes.mjs) · [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-47f854b-PjzaIl/candidate-vitest.log) · [t79 报告](../t79/report01.md)

## 阻碍与接续

独立复核无阻碍，建议整条 P0.2 链在本地合入。后续生产适配与业务切换保留各自的装配和验收责任。

## Lead 验收

Lead 核对了本轮 75–77、重命名重试和作用域证据，批准按序合入私有凭据链。生产宿主与实际模块取用按后续切片推进。

由 Lead 核验后追加。
