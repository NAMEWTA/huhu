# Mail 子集恢复独立复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Core — `wta-ubuntu`，执行者 `t93`，Lead `t3p`
- 任务 — [task01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t93/task01.md)
- 报告 — [report01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t93/report01.md)
- 执行结果 — `done`，Lead 已收取
- 固定范围 — `6891d5f9..c1b5cd39` 与 `c1b5cd39..0f24ba18` 的 Mail 差异及其调用方，以下代码行号对应 `0f24ba18`。工作树中的 Mail 源码和测试与固定提交一致。交付物为本报告。

## 结论

空 Vault 可按各自原 ID 恢复两个同地址账号，已映射的本地已读定位能在重开后立即再导出。本版写入的恢复记录可跨 v1/v2 识别，空 Vault 的第二账号写入失败后也可按原选择续跑。当前候选有两项待修，涉及已有同地址账号的确认，以及显式保留为独立账号的多选续跑。Lead 已交 t86 复现和修复。

规格以 #8 的持久数据契约、S6b.1 的中断及防重复要求、同地址冲突定案为准，并对照前一轮审查和两份修复报告。 [Issue 8 规格](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md:40) · [S6b.1 验收](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S6b.1-subset-restore.md:19) · [同地址定案](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md:15) · [原审查](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8g/report01.md) · [修复一](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/report01.md) · [修复二](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/report02.md)

## 规格轴

- **第 1 项 · P2 · 不同备份或不同选择可沿用批内豁免，跳过已有同地址账号的显式确认。** 先在空 Vault 用只含 A 的 ZIP 恢复 A，随后预检含相同 A 行和同地址 B 的 ZIP。第二份 ZIP 从未提交，B 仍会显示 `ready`，只勾 B 就能按原 ID 创建。也可在同一 ZIP 初次只选 A，再另行只选 B。原因是 `confirmed` 只记录行指纹和最终目标 ID，`inspect` 遍历整包，把匹配且保留原 ID 的 A 放入 `restoredInBatch`。提交才按 `accountIds` 筛选行，地址锁内仍使用整包得出的豁免集合。原 A 的认证仍安全，缺口是 B 少了显示双方并显式保留的步骤。将豁免限定为同一份备份的原提交选择，重开时用持久提交依据核实。代码路径已核实。 [豁免集合](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:211) · [提交筛选](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:479) · [日志记录](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:499) · [地址锁复查](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts:168)

- **第 3 项 · P2 · 已有同地址账号时，两个显式独立恢复项中途失败，重开后原确认参数被拒。** Vault 先有同地址 E，预检 A、B 后以 `accountIds=[A,B]` 和 `keepSeparateAccountIds=[A,B]` 提交。在 B 写投递记录时注入故障，可使 A 已提交、B 返回 `WRITE_PARTIAL`。重开后预检 A 为 `restored`，B 仍须显式选择。以新预检 ID 原样重交原选择，入口在进入事务前因 A 没有 `canKeepSeparate` 返回 `INVALID_INPUT`，内层允许跳过 `restored` 的逻辑无法生效。工作台重新勾选仍待恢复的 B 可以继续，直接调用者须调整原参数。可让已经确认恢复的行作为幂等结果，并对其余行继续执行原显式确认和冲突目标核对。代码路径已核实。 [预检标志](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:235) · [入口检查](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:468) · [内层复查](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:483) · [工作台调用](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/ui/MailSubsetSettings.tsx:77)

## 旧开发候选迁移观察

**原第 2 项 · 旧开发候选的 v2 恢复记录。** 可解析的集成基线为 `c1b5cd39^`（`6891d5f96706bcc5d71fdd37ce16ee63c3d15e1f`），与 `f19affac` 的 `subset-data.ts` 相同。该候选把带定位的完整行哈希写入日志和账号定义。若先由该候选向 Vault 写入独立恢复记录，再由 `0f24ba18` 用仅省略定位的 v1 包重试，新预检缺少旧哈希对应的定位输入，可能另建独立账号。此为基于代码的开发候选升级场景，无真实旧 Vault 或已发布版本证据。Issue #8 的规格说明产品尚未发布，Lead 将此迁移观察留作记录。本轮 v1/v2 幂等性按当前版本首次写入和重试验收，两种顺序的回归均通过。 [原审查所用 Mail 候选](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8g/report01.md) · [兼容指纹查询](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:214) · [当前版双向用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:613) · [Issue 8 规格](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md:40)

## 已核实的修复

- **空 Vault 的同地址账号。** 同包不同源 ID 均为 `ready`，提交保留两个原 ID。第二账号在地址锁下能识别第一账号的本次写入。普通既有同地址账号及故障后另行建立的同地址账号仍呈现冲突、要求显式勾选。 [双账号回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:443) · [新增既有目标回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:568)
- **已读定位立即再导出。** 已验证定位随标记写入同一恢复事务。导出以当前账号定义、目录和已读 ID 核对保存的定位。定向用例在重开与首次同步之间重导出，实际取得 v2 包和新目标 ID 对应的已读定位。 [读标记事务](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:287) · [导出校验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:176) · [再导出断言](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:780)
- **本版 v1/v2 身份稳定。** 仅变更定位时，两种恢复顺序均回到同一独立目标。提示读取目标持久化的标记，v1 初次恢复缺失的标记仍如实提示。修改持久标记会重新触发冲突判断。 [指纹](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:68) · [持久标记核对](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:102) · [双向用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:613)
- **空 Vault 中断续跑。** 第二账号标记写入故障时回滚第二账号已暂存的附件、草稿和投递。重开后第一账号为 `restored`，第二账号为 `ready`。对新预检 ID 传原两个账号 ID，可完成第二账号。回归断言投递仍是两条原操作 ID 和原 `result: null`，连接夹具零调用，第一账号中途配置的本机密码与修订可读。 [故障与回滚断言](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:540) · [续跑及认证断言](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:585)

## 规范轴

- 外部能力继续由 Dispatcher 依工具开放及权限处理。Mail 预检和提交按 caller/subject 绑定，外部幂等收据按主体和参数处理。提交仍需 `confirm: true`，检查 Vault 可写性并复核预检项。当前两项缺口出在通过授权后的业务判断。 [Dispatcher](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:353) · [Mail 主体](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/tool-access.ts:14) · [外部幂等](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/tool-intents.ts:17) · [提交入口](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:455)
- 继续使用排序后的源 ID 删除锁、Mail 快照锁及地址锁。凭据按目标 ID 和 `expectedRevision: null` 发布，新账号清除本机认证槽。写文件使用每账号 OperationLog，发布账号前失败会尝试回滚，异常无法确认时阻断后续提交。重开会结合定义指纹核认未落确认记录的已提交事务。投递写回沿用原操作 ID、状态与冲突检查。当前范围未发现独立的项目规范违反。 [保存与地址锁](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts:167) · [提交顺序](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:489) · [删除锁](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:521) · [投递写回](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:281) · [OperationLog](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/vault/src/operations.ts:73)

## 验证与待验收

- 独立运行 Node 24.21.0 下的 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail 同地址子集第二账号失败|Mail 子集|Mail 备份内' --maxWorkers=1`，6 项通过，11 项由过滤跳过。固定 Mail 差异的 `git diff --check` 通过。两项待修与迁移观察均基于代码路径，现有过滤用例未覆盖这些触发条件。
- Lead 对 `0f24ba18` 的单文件验证 17/17，通过 Mail 定向 `tsc`。测试计数可从日志单独核实，类型通过由 Lead 定案记录确认。四文件 lint 日志记录零警告零错误，日志正文只显示文件数量。 [单文件及类型日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-partial-recheck.log:20) · [Lead 定案](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-huhu-issues-3-10/program.md:21) · [lint 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-revoke-diff.log:1)
- 待验收项包括固定候选的实际 Desktop/Web 恢复界面、外部 CLI/MCP/HTTP 实跑及安装包恢复。本轮独立运行限上面的过滤测试和差异检查。E2E、打包、全仓检查与类型检查留待 Lead。

## 回告

`HC_TERMINAL_ID=t93` 与共享清单一致。`hc get t3p --json` 返回 Core 锁文件系统只读，退出码 5。Lead 可从共享路径直接收取本报告。
