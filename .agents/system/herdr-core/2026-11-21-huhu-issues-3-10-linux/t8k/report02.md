# Mail 同地址子集中断重试报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Core — `wta-ubuntu`，执行者 `t8k`，Lead `t3p`
- 任务 — [task02.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/task02.md)
- 工作树 — `agent-linux` 的 `impl/huhu-issues-3-10-desktop-web-verify`，基线 `cda0aa30`
- 执行结果 — `done`，三份 Mail 改动留在工作树，待 Lead 验收

## 复现与修复

- 构造两个不同 ID 的同地址账号，包含各自的草稿、投递、附件和已读标记。在第二个账号的标记文件写入时注入故障，实际 OperationLog 返回 `WRITE_PARTIAL`，回滚该账号已写的附件和投递，第一个账号保留。修复前，重开 Vault 并对同一 ZIP 重新预检，按原两个 ID 且不传 `keepSeparateAccountIds` 提交，实际返回 `INVALID_INPUT`，提示所选邮箱有冲突。 [回归用例](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/mail/test/outbox-engine.test.ts:495)
- 预检、提交前复查和地址锁共用同一批内账号集合。已有账号须对应包里的同一源行、匹配持久内容指纹，且本机日志确认恢复保留了该源 ID，才可作为批内账号。其他同地址账号仍触发逐项显式选择。账号 ID、草稿、投递与附件的冲突检查继续执行。恢复预检保存在会话内，重开 Vault 后使用新预检 ID，ZIP、账号选择和确认参数沿用原值。 [恢复检查](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/mail/src/engine/subset-data.ts:211)
- 修复后，重试恢复第二个原 ID，最终只有两条账号、两条原投递 ID 和各自的数据，再次提交返回相同结果。第一个账号在中断后配置的本机密码与修订均保留。恢复处理器未调用连接夹具，投递仍保留原 `result: null`。后续新增普通同地址账号时，预检指向该账号，原提交被拒绝，其密码与修订保留。 [回归用例](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/mail/test/outbox-engine.test.ts:495)
- Lead 的 Mail 定向类型检查报 `TS2554`，原因是 OAuth 测试用三参数调用五参数的 `restoreDefinition`。夹具在空源 Vault 准备一个待导出的账号，因此调用显式传入 `false` 与空的批内 ID 集合。已核对 Mail 内其余调用。 [OAuth 调用](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/mail/test/oauth-engine.test.ts:912) · [Lead 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-review-regress.log:37)

## 实际运行

- 新回归先复现部分完成后无法续跑。修复后，`pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail 同地址子集第二账号失败|Mail 子集|Mail 备份内' --maxWorkers=1` 通过 6 项，过滤掉 11 项。涵盖两项中断回归和 task01 的四项 Mail 定向回归。
- 本轮三份文件的 `oxfmt --check --threads=1` 与 `git diff --check` 通过。
- Lead 的基线日志记录 `outbox-engine.test.ts` 15/15 通过，包含真实回环 SMTP/IMAP。该结果属于本次修复之前的候选。 [Lead 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-review-regress.log:32)

## 未运行的验证

- 本轮只运行了授权的过滤用例。剩余 11 项、OAuth 测试和 Mail 定向 `tsc` 由 Lead 复验。上一轮的回环监听 `EPERM` 在本轮未重试。
- Electron/Playwright、全仓检查、构建和打包留给 Lead。

## 文件清单

- `plugins/mail/src/engine/subset-data.ts`
- `plugins/mail/test/outbox-engine.test.ts`
- `plugins/mail/test/oauth-engine.test.ts`

## Lead 收取

- 已保存为 worker `4feefb17`，集成提交 `0f24ba18`。
- Lead `t8z` 复验完整 outbox-engine 文件 17/17 通过；Mail 定向类型检查运行结果见 `temp/issue-evidence/huhu-2026-11-22/mail-partial-recheck.log`。这不是候选包或整体验收。

- Lead 后续将 worker 与集成 `8fa80d52` 合并为 `5a4de7ae`，树内容逐项 diff 为空。两处历史 E2E 冲突仅为已接受的 lint 参数/格式变更，沿用集成版本；本次 merge 不回灌集成。后续新任务以该干净树为基线。
