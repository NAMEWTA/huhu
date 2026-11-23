# Mail 子集恢复批次定向独立复核

- Core 与任务 — `wta-ubuntu`，Lead `t3p`，执行者 `t9b`。共享根为 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，清单当前指针为 `t9b/task01.md`。 [任务](task01.md) · [清单](../manifest.tsv)
- 执行结果 — `done`。报告为同目录 `report01.md`。基准 `995cf9ec717b5cf02a6f147324f3f38fa73c3525`，目标 `dbe58665570cbc4f52c8a4958e2a3f915d27ea40`。测试时 Mail 工作树与固定目标一致，业务文件和测试保持原样。

## 规格轴

**原第 1 项关闭。** 先恢复 A，随后从同 ZIP 或另一份含同一 A 的 ZIP 只选同地址 B。新预检显示 A 已恢复、B 与 A 冲突，B 未显式确认时提交返回 `INVALID_INPUT`，显式确认后才以独立 ID 创建 B。批次摘要使用预检主体、ZIP 原始字节的摘要、排序后的完整 `accountIds` 与 `keepSeparateAccountIds`。即使行指纹跨 ZIP 相同，已恢复账号只有在日志批次摘要与提交一致时才进入地址豁免集合。定向测试还覆盖了部分成功后换主体、换 ZIP、缩小选择，以及后来新增同地址账号时拒绝自动续跑。 [原第 1 项](../t93/report01.md#规格轴) · [批次摘要与提交](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L475) · [豁免判定](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L225) · [定向用例](../../../../../temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts#L495) · [换主体与选择用例](../../../../../temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts#L669)

**原第 3 项的能力入口关闭。** 目标 Vault 已有同地址 E，提交 `accountIds=[A,B]`、`keepSeparateAccountIds=[A,B]`。B 的投递记录写入失败后，A 已提交。重开并取得新预检 ID 后，只确认 A 而遗漏 B 得到 `INVALID_INPUT`。原完整参数交换排列后仍返回原 A 的目标，补建一个独立 B。测试核实 E 和 A 的密码与修订原值、B 的投递归属、仅 B 发出创建事件，未发起邮箱连接。空 Vault 用例还验证确认标记漏写时，重开可通过日志和账号定义恢复批次依据。 [原第 3 项](../t93/report01.md#规格轴) · [提交复查](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L475) · [重开核认日志](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L363) · [双选与认证断言](../../../../../temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts#L527)

**P2 · 工作台重开后无法用原选择续跑，待恢复账号会改用新 ID。** 具体输入是初始空 Vault、一份含同地址 A 和 B 的 v1 ZIP，B 带一个无可移植定位的本地已读标记。首次在工作台选 A+B 并提交，令 B 写入失败而 A 已提交，再重开工作台并读取同一 ZIP。这应能继续原选择，保留 B 的原 ID 和已读标记。目标提交的重开预检将 A 标为 `restored`、B 标为 `conflict`。工作台禁选已恢复的 A，重开时选项为空，勾选 B 将发送 `accountIds=[B]`、`keepSeparateAccountIds=[B]`。这一提交创建随机 ID，并舍弃无法重绑的本地标记。基准预检把这种已恢复的 A 排除后让 B 为 `ready`，工作台补 B 时保留原 ID。目标提交的能力入口仍接受原 A+B 参数，且定向用例已核实它会恢复 B 的原 ID、标记和记录。界面后果由预检断言、工作台提交代码及恢复写入代码核实，桌面和 Web 界面本轮未实跑。 [S6b.1 验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S6b.1-subset-restore.md#L19) · [预检与原参数恢复断言](../../../../../temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts#L687) · [工作台构造提交](../../../../../temp/issue-worktrees/integration/plugins/mail/src/ui/MailSubsetSettings.tsx#L77) · [工作台选项](../../../../../temp/issue-worktrees/integration/plugins/mail/src/ui/MailSubsetSettings.tsx#L177) · [目标 ID](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L505) · [本地标记写入](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L290)

## 规范轴

固定差异内未发现独立的项目规范违规。改动复用逐账号 `OperationLog`、账号删除锁、Mail 快照锁、地址锁和凭据写入边界。恢复按目标 ID 且要求空修订创建，既有账号认证受保护。 [项目规范](../../../../../temp/issue-worktrees/integration/AGENTS.md) · [提交及回滚](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L508) · [地址锁与认证写入](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts#L167)

## 验证

- 独立运行 Node 24.21.0 下的 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail 子集只恢复 A|Mail 子集显式独立恢复第二账号|Mail 同地址子集第二账号' --maxWorkers=1`，5 项通过，15 项因过滤跳过。固定差异通过 `git diff --check dbe58665^ dbe58665`。
- Lead 已验证同候选单文件 20/20 与 Mail 模块定向类型检查。日志显示测试计数和 `tsc` 调用，类型检查成功由 Lead 验收记录确认。 [Lead 测试日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-batch-recheck.log:33) · [Lead 验收](../t86/report04.md#lead-验收)

## 未运行的验证

桌面和 Web 的实际工作台恢复、外部 CLI/MCP/HTTP 的中断后续跑、E2E、构建、打包和全仓门禁均未运行。未发布旧开发候选的恢复日志迁移在本任务范围外。

## Lead收取
两项后端问题关闭；工作台原批次选择P2接受，交t86/task06修复。审查已验收，不代表Mail最终验收。
