# #5 T1.2 本机派遣和 ZIP 恢复独立复核

- 终端 `t120`，任务 [task01.md](task01.md)
- 执行结果 `done`
- 冻结候选 `3c79467e5ea88318c48a13b78ee0702720fbcd1f`，直接父提交 `29d68b3ae136709191c9c4e515fd2506d17c843a`，树 `396c97a2ad5a82e136bddf483bb6ba3b73549f3f`
- 环境为 Windows 11 Pro 10.0.26300、NTFS、Node 24.21.0、Vitest 3.2.7。通过独立 Git 归档运行真实 Engine 回环 HTTP，使用合成 Vault 和 executor。业务检出、分支和远端均以只读方式使用。测试未启动 Agent，未读取真实历史，未访问外部服务。

## 本地合入建议

**建议将候选作为 T1.2 后端增量本地合入。** 此前发现的两项失效均有对应的复测证据。损坏 run 身份会被拒绝，保留或更换 Vault ID 的 ZIP 副本均将旧派遣作为历史保存，旧事件调用和任务联动次数均为零。生产 provider 输入接收与 ACK、T7.1 显式历史处置及旧 Automations 执行所有权切换仍需组合验收。 [t54 原复核](../t54/report03.md) · [t110 实现报告](../t110/report01.md) · [T1.2](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T1.2-accept.md) · [T7.1](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md)

## 规格轴

冻结候选的 Engine HTTP 原生回归 **19 项通过**。使用桌面调用验证人工和规则竞争、同键超过 24 小时重交、原始快照和轮次、中断后对账、Windows 只读选项、CLI/MCP 拒绝及旧版历史占用。#5 来源使用项目现存的 Issue 快照。 [冻结回归](../../../../../temp/issue-baseline/t120-task-recovery/regression.log) · [Issue #5 快照](../../../../dev/changes/2026-11-19-issue-5-task-automation/source.md)

| 场景 | 观察 |
| --- | --- |
| 原 Vault 重开 | 冻结用例复跑通过。原 pending 的 `ready` 和 `dispatch` 各 1 次，沿用原 event/run/attempt 1。unknown 只对账，原派遣 JSON 和任务 Markdown 相同。已发但尚未联动的记录保留原 JSON，只补一次任务状态和系统评论。 [本轮回归](../../../../../temp/issue-baseline/t120-task-recovery/regression.log) · [逐项调用与字节证据](../../../../../temp/issue-baseline/t110-task-recovery/zip.json) |
| 换 ID 与保留 ID 的 ZIP 副本 | 使用真实 `vault.exportPackage` / `vault.importPackage`。保留 ID 的副本额外复制了原密钥文件，旧事件调用仍为 0。两副本各自的新事件只调用一次 `ready` 和一次 `dispatch`。旧 JSON 和 Markdown 逐字节相同。同键同载荷取原凭据，异载荷为 `IDEMPOTENCY_MISMATCH`，换键为 `task_occupied`，取消分别为 `foreign_vault`、`unverified_owner`。 [本轮回归](../../../../../temp/issue-baseline/t120-task-recovery/regression.log) · [逐项调用与字节证据](../../../../../temp/issue-baseline/t110-task-recovery/zip.json) |
| ZIP 目录与坏包 | 另行解开真实 HTTP 导出的 ZIP，派遣 JSON 与任务 Markdown 字节匹配，条目中没有 `.huhu/runtime/` 或 `.key`。截断 ZIP 经 HTTP 导入返回 `INVALID_INPUT`，目标仍空。见 `T120_ZIP`。 [探针日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) |
| 真正以只读模式打开 Engine | 写者持有 `writer.lock` 和 `writer.pid` 时，第二个写者启动返回 `READ_ONLY_VAULT`。另一个以 `boot({readOnly:true})` 启动的 Engine 可查原 pending、同载荷取同一收据，取消和新键受理均返回 `READ_ONLY_VAULT`。executor 三类调用均为 0，JSON 和 Markdown SHA-256 一致，写者锁仍在。见 `T120_READ_ONLY`。 [探针日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) |
| 同目录丢失密钥 | Vault ID 和目录身份相同。旧 pending 可查询、同键重交，取消返回 `unverified_owner`，同任务新键返回 `task_occupied`。另一个任务首次受理建立新密钥，只有新事件调用 `ready/dispatch` 各 1 次，`inspect` 为 0。旧事件的 JSON 和 Markdown SHA-256 一致。见 `T120_KEY_MISSING`。 [探针日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) |
| 同目录密钥损坏与恢复 | 截短到 8 字节时，查询、重交、取消及新受理返回 `WRITE_PARTIAL`，三类调用均为 0，旧记录和任务字节一致。另一组在接受新事件前原样归还暂失的密钥，原 run/attempt/hash 恢复，`ready/dispatch` 各 1 次，任务进入进行中且有一条系统评论。见 `T120_KEY_TRUNCATED`、`T120_KEY_RETURNED`。 [探针日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) |
| NTFS 同卷目录改名 | 关闭 Engine 后改名，`dev/ino/birthtimeNs` 和 Vault ID 相同。重开后同一 run/attempt 1 调用 `ready/dispatch` 各 1 次，`inspect` 为 0，任务进到进行中并写出一条系统评论。见 `T120_RENAME`。 [探针日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) |
| 旧记录、非法修改及相邻占用 | schema 1 历史可读、保留占用，取消为 `unverified_owner`。本轮另改动已签名记录的状态原因，单条查询和严格扫描下的新受理为 `WRITE_PARTIAL`。相邻已受理事件仍仅调用 `ready/dispatch` 各 1 次并写入任务状态和一条评论。损坏记录、对应 Markdown 和临时旁文件各自的前后 SHA-256 一致。最终文件为截断 JSON 的情形也已在冻结回归验证。见 `T120_NEIGHBOR`。 [探针日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) · [旧记录字节证据](../../../../../temp/issue-baseline/t110-task-recovery/evidence.log) |

## 规范轴与后续验收

- **写者锁和条件写。** 复用 Vault 的 `proper-lockfile` 写者锁、PID 归属及只读模式。冻结版本的 `VaultFiles` 在同一目的路径内把版本检查和原子替换排在一条队列内。并发首次建密钥使用 `expectedVersion: null`，竞争者遇到 `NAME_CONFLICT` 会重读已落盘的密钥。派遣记录仍按 taskId/dispatchId 串行或做字节版本条件写。 [Vault 写锁](../../../../../temp/issue-baseline/t120-task-recovery/tree/packages/vault/src/vault.ts#L196) · [条件写](../../../../../temp/issue-baseline/t120-task-recovery/tree/packages/vault/src/write.ts#L52) · [密钥创建](../../../../../temp/issue-baseline/t120-task-recovery/tree/plugins/tasks/src/engine/dispatch-store.ts#L192)
- **完整性与可重试。** schema 2 校验 event/task/run/attempt、输入、快照和 claim 一致性，使用 `vaultId`、`storageId` 对应的本机密钥校验规范化记录的 HMAC-SHA-256。密钥文件名取自实际 `.huhu` 存储目录的 `dev/ino/birthtimeNs`。领取、发送、对账及 Markdown 联动各自核对当前记录。发送中断或结果不明时以同一个 event/run/attempt/hash 对账，明确 `not_sent` 才回到可发送状态，`unknown` 持有任务占用。HMAC 校验当前记录内容及归属，整盘回滚需另外验收时序保证。 [归属与校验](../../../../../temp/issue-baseline/t120-task-recovery/tree/plugins/tasks/src/engine/dispatch-store.ts#L100) · [发送与对账](../../../../../temp/issue-baseline/t120-task-recovery/tree/plugins/tasks/src/engine/dispatch.ts#L211) · [ZIP 排除规则](../../../../../temp/issue-baseline/t120-task-recovery/tree/packages/vault/src/package/package.ts#L24)
- **生产诊断。** 单条记录格式或签名故障在查询和严格扫描中返回 `WRITE_PARTIAL`。自动恢复扫描把这类故障交给可选的 `onError` 并继续下一个记录。生产 Engine 目前只传通知和时区，启动时跳过的故障还缺少可见诊断。组合验收时应核对用户能否定位待处置的记录。 [恢复扫描](../../../../../temp/issue-baseline/t120-task-recovery/tree/plugins/tasks/src/engine/dispatch.ts#L161) · [生产装配](../../../../../temp/issue-baseline/t120-task-recovery/tree/apps/engine/src/boot.ts#L154)
- **ACK 和历史处置。** 生产 Engine 尚未装配 `dispatchExecutor`。日志中的 `accepted` 是夹具结果，生产接收确认与 Tasks 持久消费 ACK 需分别按 W6.0/T3.3 验证。无归属、跨 Vault 和旧版活跃记录保留占用。当前只提供查询、同键幂等重交和有归属的取消，历史的显式绑定或解除由后续切换决定。桌面原型体验、生产 ACK、真实规则切换、整盘回滚和非 NTFS 存储超出本轮证据。 [执行合同](../../../../../temp/issue-baseline/t120-task-recovery/tree/plugins/tasks/src/engine/dispatch.ts#L29) · [W6.0](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.0-receipt-contract.md) · [T3.3](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T3.3-deliver.md)

## 命令与日志

从仓库根运行以下准备命令。原归档的 SHA-256 为 `ecfd967a78c29a74281ed58d5a82e623a09f26b31b3b329463e1fa36f422d46f`。首次 Windows `tar.exe` 解包遇到中文文件名和软链接错误，实际测试使用 Python 提取的 `tree`。该目录跳过与 Engine 无关的 `.claude/skills` 软链接，业务源码和锁文件来自冻结树。第三方依赖复用本地集成检出，98 个工作区链接指向冻结树。依赖脚本核对了锁文件的已知 Engine `tsx` importer 差异。 [解包日志](../../../../../temp/issue-baseline/t120-task-recovery/extract.log) · [依赖链接日志](../../../../../temp/issue-baseline/t120-task-recovery/dependencies.log)

```powershell
git archive --format=tar -o temp/issue-baseline/t120-task-recovery/candidate.tar 3c79467e5ea88318c48a13b78ee0702720fbcd1f
python temp/issue-baseline/t120-task-recovery/extract-frozen.py temp/issue-baseline/t120-task-recovery/candidate.tar temp/issue-baseline/t120-task-recovery/tree
node temp/issue-baseline/t110-task-recovery/link-deps.mjs temp/issue-baseline/t120-task-recovery/tree temp/issue-worktrees/integration
git diff --check 29d68b3ae136709191c9c4e515fd2506d17c843a 3c79467e5ea88318c48a13b78ee0702720fbcd1f
& ./temp/issue-baseline/t120-task-recovery/run-probes.ps1
```

其余两组在归档 `tree` 中运行，各自用验证目录下的独立 `TEMP/TMP`。

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test/persistence-http.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 packages/vault/test/package.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 packages/vault/test/package.test.ts -t '^(?!.*[.]partial).*'
```

- Engine HTTP 19 项通过，冻结差异的 `git diff --check` 退出 0。 [回归日志](../../../../../temp/issue-baseline/t120-task-recovery/regression.log)
- 补充探针 **7 项通过**，现有 19 项已由独立原生回归覆盖。补测首轮有 4 项失败和 1 个未处理错误，涉及超时、测试清理与重开重叠，以及轮询期限内状态尚未推进。扩大探针等待与清理时限、降低轮询频率后全数通过，业务代码无改动。 [首轮日志](../../../../../temp/issue-baseline/t120-task-recovery/probes-first.log) · [通过日志](../../../../../temp/issue-baseline/t120-task-recovery/probes.log) · [探针源码](../../../../../temp/issue-baseline/t120-task-recovery/probe-cases.ts) · [运行脚本](../../../../../temp/issue-baseline/t120-task-recovery/run-probes.ps1)
- Vault 包首轮 12 通过、2 失败。一项在清理钩子超时，另一项在 Windows 创建软链接的测试前置步骤返回 `EPERM`。筛除软链接用例后的复跑为 **13 通过、1 跳过**，包含首轮清理超时的用例。 [首轮日志](../../../../../temp/issue-baseline/t120-task-recovery/package.log) · [复跑日志](../../../../../temp/issue-baseline/t120-task-recovery/package-rerun.log)
