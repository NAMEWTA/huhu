# #9 P0.2 模块凭据回收返工独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t4z
- task — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report02.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t4z`，清单指向 `task02.md active`。
- 执行结果 — done（复核完成，暂缓合入）

## 结论

| 审查轴 | 签收建议 |
| --- | --- |
| 规格 | **暂缓合入。** 正常首次绑定后的复制库回收、独立只读进程隔离均通过。首次写入本机回收记录中断后，重开可以保存和认证，却无法在后续清空时回收已无引用的密文与钥匙。 |
| 规范 | **暂缓签收新增记录的持久化。** 写者独占、作用域与精确 revision 校验、损坏时保守停止均符合设计。新增初始化记录缺乏可恢复的发布边界，目录存在即跳过初始化会把一次中断变成持续回收失败。 |

## 规格轴

### P1 · 首次回收记录写入中断，重绑后仍无法回收

P0.2 要求发布成功后清理无引用版本，异常退出后的暂存由同一 Vault 与插件的写者恢复。新故障发生在 `initially-unbound.json` 的首次持久化。两个子进程分别在创建作用域目录之后、写入记录之前退出 75，及只写入 JSON 开头之后退出 76。两种情况下，复制库的可移植定义字节均保持原样，初次退出也没有增加密文或钥匙。

随后原样重开复制库，按原 revision 重新绑定首项并通过合成认证，再显式清空首项，留下第二项继续显示 `needs-reconfiguration`。两种情况下 `recover()` 均返回 `false`，仍有 3 个密文和 2 把钥匙。正常候选此时应只剩源库的 2 个密文和 1 把钥匙。源实例两项均继续认证。此处确认的是本机材料留存和回收无法重试，原定义的原子提交仍成立。 [候选独立探针输出](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-probes.log)

根因在 `86f810e:packages/kernel/src/credentials/versions.ts:64–78`。目录先创建，记录随后直接用 `wx` 写最终路径。目录一旦存在，后续 `save()` 永远跳过初始化。记录缺失时没有可匹配的摘要，截断时解析报损坏。两条路径都在 `module-credentials.ts:348–365` 暂停回收。建议让首次记录通过单一完整发布点或带有明确初始化状态的恢复协议完成，并保留对既有作用域损坏的防误删保护。复核时重放两个退出点，要求重开保存、清空后无需修改相邻条目即可恢复为 2 个密文和 1 把钥匙。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/independent-probes.mjs)

### 上轮两个反例与边界

- **复制库正常流程通过。** 同一可移植 Vault ID，注入不同的本机实例 ID。两个合成实体只重绑第一项，重开后认证成功，再清空。父提交仍为 3 个密文、2 把钥匙，`recover=false`。候选立即回到 2 个密文、1 把钥匙，`recover=true`。未绑定的相邻配置保持待重配，源库两项仍可认证。 [父提交](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/parent-probes.log) · [候选](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-probes.log)
- **只读合同通过。** 写者持锁时，第二次可写打开得到 `READ_ONLY_VAULT`。独立只读进程可读定义和意图。父提交列举会读保护后端两次，取用进入保护后端一次，写者清空后得到 `missing-key`。候选列举与取用均访问后端零次，有意图的用途显示 `temporarily-unavailable`，无意图的用途显示 `unconfigured`。取用在回调之前返回 `READ_ONLY_VAULT`，写者可正常清空并回收。同进程持锁写者的挂起取用仍能固定旧版本。 [父提交](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/parent-probes.log) · [候选](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-probes.log) · [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-vitest.log)
- **意图、作用域与损坏保全通过。** 首次记录只含已有 `configured` 意图的实体与当时的 revision 摘要，暂未配置的实体未入记录。同一源 revision 的两个用途中，仅重绑密码，保留的私钥口令用途继续显示待重配，实际取用拒绝。此前未配置的实体后来建立有效绑定后，移除或损坏其快照都能暂停回收。其他实例的作用域摘要、截断记录同样使回收暂停。本机记录原样恢复后，清理只移除目标的 1 个无引用密文，仍被其他实体使用的钥匙和认证均保留。已存在的本机作用域、其后才导入的新 revision 和意外丢失的快照仍按未知引用处理。 [候选独立探针输出](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-probes.log)
- **原事务退出窗口与竞争通过。** 冻结候选 14 项凭据测试覆盖退出 71–74，分别在暂存后发布前、发布后、回收中、已创建钥匙后重开并选择预期版本。也覆盖两个同 revision 的并发提交仅一项成功、同写者挂起回调保留旧定义及旧材料、取消和发布失败时保留原配置。新增记录的 75／76 退出点由独立探针覆盖。 [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-vitest.log)

## 规范轴与装配限制

- 返工继续复用 `Vault.open` 的写者锁、`VaultFiles.write(expectedVersion)` 与每 Vault 路径／插件的队列。回收先保留在途固定版本，已存在的快照优先参与引用计算。明确初始未绑定的条目才允许按实体与 revision 摘要跳过。记录位于对应本机实例与插件的 Vault 外目录，格式和作用域校验均通过。上述首次写入故障是本次返工的规范阻碍。上轮提出的 Safe 及模块共用加解密原语整理，本差异未涉及。 [上轮报告](report01.md)
- `use()` 的 `Vault.assertWritable()` 检查句柄的只读标志。写锁由 `Vault.open()` 为可写句柄取得，`Vault.close()` 释放。宿主必须向受权模块注入真实写者，关闭前停止新调用并等待或取消在途业务回调，切 Vault 后撤下旧门面。只读 Engine 仅提供脱敏定义和意图状态。连到该 Vault 写者 Engine 的客户端仍按所属业务 handler 的授权使用已配置认证。证据为 `packages/vault/src/vault.ts:124、196–230`、`module-credentials.ts:66–69、169–185、308–344`、`apps/engine/src/boot.ts:107、426–441`。
- 冻结源码中，`ModuleCredentials` 仅在隔离测试夹具实例化。生产接入仍需已安装并验证的本机保护适配器、可信且稳定的本机 Vault 实例 ID、Vault 外应用私有根、所属插件的定义 schema 与认证目标派生、按次授权和写者生命周期。当前 SSH、Git 同步与 Agent CLI 对应路径仍使用 `secretUse`。本轮只在 Windows 测试合成 Vault 与隔离后端，适配器打包、Engine 业务接线、切库及关停的整体验收仍属后续。 [返工实现报告](../t5t/report01.md) · [原生候选前置证据](../t1b/report01.md)

## 产物与验证

- 父提交 `7174fc8d59693575cbc16227ec296acdd4c219e5`，候选 `86f810e8ba42d43acb6e300737647dca85051741`。Git 对象确认直接父子关系。用各自 SHA 归档需要的源码和夹具，新 fixture 纳入检查。两份快照独立解包，共用集成检出的锁定依赖。业务源码和原工作区改动全程只读，`git diff --check` 通过。
- Windows build 26300、Node 24.21.0、Vitest 3.2.7。独立复跑命令为 `node node_modules/vitest/vitest.mjs run packages/kernel/test/credentials.test.ts --maxWorkers 1 --testTimeout 15000`，14/14 通过，Core `t6k`。同一诊断脚本在父提交和候选分别执行，Core 为 `t6p`、`t6q`。探针的退出 0 表示断言与实测结果一致，其中包含上述已确认的回收缺陷。返工会话的全 Kernel 79/79 与静态检查为该会话的既有证据。 [候选测试输出](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/candidate-vitest.log) · [返工实现报告](../t5t/report01.md)
- 独立证据目录为 `D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg`。其中包含探针、父提交和候选的脱敏输出与版本记录。可将 `independent-probes.mjs` 拷贝到相应 Git 归档根的 `temp/`，从归档根执行 `node packages/vault/node_modules/tsx/dist/cli.mjs temp/independent-probes.mjs parent` 或将末项换为 `candidate`。测试仅使用合成资料。 [环境与版本](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t4z-p02-86f810e-j30ugg/setup.json)

## 阻碍与接续

复核任务已完成。建议暂缓合入 `86f810e`，修复首次回收记录的可恢复发布后，以新编号复核 75／76 两个新增窗口及原回归。

## Lead 验收

由 Lead 核验后追加。

Lead 接收复核与独立故障探针。凭据候选保持冻结。待检出槽位可用后，从 `86f810e` 修复 75／76 首次记录写入中断。
