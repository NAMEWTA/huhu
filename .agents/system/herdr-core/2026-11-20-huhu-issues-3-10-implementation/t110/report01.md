# #5 T1.2 派遣记录完整性与 Vault 恢复边界

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 执行身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`，终端 `t110`，任务 [task01.md](task01.md)
- 执行结果 — done。业务提交 `3c79467e5ea88318c48a13b78ee0702720fbcd1f`，直接父提交 `29d68b3ae136709191c9c4e515fd2506d17c843a`，分支 `impl/huhu-issues-3-10-task-recovery`。可本地 cherry-pick，工作树干净。

## 行为与兼容性

- 复用 Tasks 原子受理记录、`VaultFiles` 条件写和现有 ZIP。新记录的存储版本为 2。记录持久化稳定的 event、run、attempt 1、受理时间和请求／快照身份。本机 HMAC 覆盖参与派遣的记录字段和状态变迁。签名密钥留在 ZIP 排除的 `.huhu/runtime/<machineId>`，以当前真实存储目录的设备、文件 ID 与创建时间定位。当前 Vault ID 来自 Engine 的 Vault 门面。恢复在领取、发送、对账和任务联动前重新核验归属及受理身份。
- 同一物理存储重开沿用原凭据。已发送但任务 Markdown 尚未联动时，只在原 Vault 补写同一 run 的状态和系统评论。待核实记录仍按原快照对账，保留现有的确认后重发约束。
- ZIP 恢复保全任务、快照、收据与 run 投影。不同 ID 的历史取消请求返回 `INVALID_INPUT/foreign_vault`。同 ID 但存储凭据不可验证，以及旧版无所有者字段的收据，返回 `INVALID_INPUT/unverified_owner`。这些历史仍可查询，相同载荷重交返回原收据，异载荷仍为 `IDEMPOTENCY_MISMATCH`。活动的历史继续占用原任务，新 dispatchId 返回 `INVALID_INPUT/task_occupied`。终态取消沿用幂等返回。历史占用保留，后续显式绑定／处置由 T7.1 切换处理。
- 截断或完整性失效的记录直接查询和重交返回 `WRITE_PARTIAL`。恢复扫描逐条处理损坏，其他已受理记录仍可独立推进。新受理、占用和全量汇总仍沿用严格扫描，无法确认损坏记录的关联任务时保守返回错误。
- 范围为 Tasks Engine 和 HTTP 回归，共四个文件。CLI 与 MCP 继续按现有网关授权，三个派遣入口仍只供桌面与相应的内部调用流程。 [独立复核](../t54/report03.md) · [T1.1](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T1.1-create-task.md) · [T1.2](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T1.2-accept.md) · [T7.1](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md)

## 运行证据

冻结父提交上的两项回归均红灯。合法 JSON 的损坏凭据经 HTTP 返回成功，导入 Vault 的合成 executor 出现第二次目标调用。最终树上的三项定向回归及三项带文件快照观测的同路径探针均通过。 [红灯](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/red.log) · [绿灯](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/green.log) · [探针日志](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/evidence.log)

### ZIP 及同 Vault 重开

原 Vault 和重开均为 `vault-fv037cwwl037`。从原 Vault 导入得到 `vault-nkzvhpqsjhbr`，从无关 Vault 导入保留 ID `vault-fv037cwwl037`。真实 Engine 的 `vault.exportPackage` 和 `vault.importPackage` HTTP 完成往返。保留 ID 的副本另外物理复制了原库的运行时密钥文件，仍无法取消或执行所复制的记录。随后各副本各自创建一个独立任务，只对自己的新 event 调用 ready、dispatch 各一次。

| 历史 run（均为 attempt 1） | 原 Vault 重开 | 两个副本 | JSON SHA-256 前 12 位，导出前 → 原库重开后 | 任务 Markdown SHA-256 前 12 位，导出前 → 原库重开后 |
| --- | --- | --- | --- | --- |
| `run-mwonlfixu9cx` 待派 | ready 1 次，dispatch 1 次，原 run 进入 running | 原 event 零次 executor 调用。JSON 和 Markdown 与导出前逐字节相同 | `d5c87806dfa2 → 6be4427161ad` | `ebc3fb0da084 → 3e55c2025403` |
| `run-mwonle4t1j63` 待核实 | inspect 2 次，dispatch 0 次，仍为 unknown | 原 event 零次 executor 调用。可从派遣查询和 `tasks.runs` 读取 | `a1db7f496a0d → a1db7f496a0d` | `79b27325de77 → 79b27325de77` |
| `run-mwonlev5vkdb` 已发、Markdown 写入被中断 | executor 零次调用。原 run 补写一次进行中和系统评论 | 原 event 零次 executor 调用。历史仍可读，Markdown 保持未开始 | `5662cd97d782 → 5662cd97d782` | `b6625896b7af → 68b445b08ffc` |

换 ID 副本中三条收据的直接查询、同载荷重交分别成功，并返回原来的 pending、unknown、running。异载荷重交、换派遣键及取消分别命中 `IDEMPOTENCY_MISMATCH`、`task_occupied`、`foreign_vault`。记录和任务的双方完整 SHA-256、合成 event 清单和调用计数均在证据中。 [ZIP 调用及文件值](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/zip.json)

### 损坏和旧记录

- 四条由真实请求落盘的 unknown 记录分别被改成空 runId 与 attempt 2、另一个格式合法的 runId、仅 attempt 2、仅把状态改回 claimed。每条的直接查询及重交均为 `WRITE_PARTIAL`。损坏记录和对应 Markdown 的前后 SHA-256 逐一相同。合成 executor 只有独立任务 `run-mwonlcvnmp92` 的一次 ready 与一次 dispatch，全组 inspect 0 次。 [损坏矩阵及文件值](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/damaged.json)
- 旧版无归属 pending 收据在原目录读取和同键重交均成功，换键保持占用，取消为 `unverified_owner`，收据和 Markdown 字节相同。该收据的 ready、dispatch、inspect 均为 0，同一 Vault 的新记录可执行。 [旧版字节对照](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/evidence.log)
- 实际回环 HTTP 的 CLI 身份逐项调用三项能力均返回 `CAPABILITY_NOT_EXPOSED`。MCP HTTP 启用后，三项工具均未注册到可见列表，逐项直接调用返回错误。外部伪造规则来源、只读受理、人工／规则竞争、24 小时后重交及中断对账回归均通过。 [回归日志](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/suite.log)

## 检查与交付限制

| 检查 | 最终结果 |
| --- | --- |
| Windows Node 24.21.0 / Vitest 3.2.7，`plugins/tasks/test packages/contracts/test plugins/automations/test` | 退出 0，11 文件，149 通过，11 个现有平台条件跳过。首轮旧 Automations 的 `ClaimStore.update` 偶发 `EPERM`，最终复跑通过。 [最终筛选](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/suite.log) · [首轮日志](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/suite-first.log) |
| TypeScript | `vendor/cosmokit`、`vendor/cordis`、Contracts、Tasks、Automations、Engine 六项退出 0。 [类型结果](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/types-results.json) |
| Lint、格式、Git | 全树 oxlint、样式与各 CSS 检查、改动文件 oxfmt、`git diff --check 29d68b3 HEAD` 通过。根 lint 样例包装器调用的 pnpm 在此 Windows 环境没有跑完，直接以同配置执行两个样例，分别命中预期规则。全树格式只报冻结父提交中同字节的 `packages/vault/test/operations.test.ts`。 [全树格式](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/format-all-final.log) · [类型规则样例](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/lint-bad-any.log) · [导入规则样例](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/lint-bad-boundary.log) |
| 依赖 | 锁定缓存真实 `pnpm.exe 12.10.1` 执行 `install --frozen-lockfile --prefer-offline`，依赖链接阶段停止推进，终止该安装子终端。复用集成检出的第三方依赖，98 个工作区链接指向本检出；锁内容仅存在已核对的集成 Engine `tsx` importer 差别。交付的 `pnpm-lock.yaml` blob 与父提交同为 `e7c2876017054b1a8944cf954b2cec97981bfdc0`，`packageManager` 无差异。 [安装](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/install.log) · [依赖链接](D:/Document/code/huhu/temp/issue-baseline/t110-task-recovery/dependencies.log) |

复跑入口为证据目录下的 `run-tests.ps1`（`green` 或 `suite`）、`run-checks.ps1 types`。合成日志可从当前检出用 `make-evidence.mjs` 生成临时探针后运行 `run-tests.ps1 evidence`。测试子终端已清理，只有任务指定的 Git 工作树产生本地提交。

验收限 Windows 本机、回环 API、合成 executor、测试 Vault 和受管理 ZIP。原型体验仍待版本化确认。真实 Agent provider、生产 Space/session 绑定与回执、旧 Automations 执行所有权切换、桌面交互、其他操作系统、目录迁移及整盘回滚留待后续切片。

## Lead 验收

由 Lead 追加。
