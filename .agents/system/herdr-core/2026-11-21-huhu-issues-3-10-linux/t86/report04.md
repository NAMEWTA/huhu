# Mail 子集恢复的批次确认与原选择续跑

- Core `wta-ubuntu`，Lead `t3p`，worker `t86`。执行 [task04.md](task04.md)，依据 [t93 独审第 1、3 项](../t93/report01.md)。
- 工作树 `impl/huhu-issues-3-10-integration`，指定基线 `5c7385b1`。最终验证时 HEAD 为 `995cf9ec`，相对基线的两个 Mail 文件无其他提交改动。工作树中的实施范围为 `plugins/mail/src/engine/subset-data.ts` 与 `plugins/mail/test/outbox-engine.test.ts`，已冻结交 Lead。

## 实现

- 在现有逐账号操作日志中记录批次摘要，依据预检主体、ZIP 字节摘要、排序后的 `accountIds` 和 `keepSeparateAccountIds`。重开用原日志和账号定义核对落盘结果，确认文件漏写也能恢复批次依据。已有未带批次摘要的记录仍能识别原恢复账号。
- 同地址预检显示当前冲突。提交只有在同一主体、同一 ZIP、原完整选择都匹配时，才允许本批已恢复账号作为同地址例外。仅选 B、换 ZIP 或换主体都须走显式冲突确认。若原批次外又出现一个同地址账号，提交仍拒绝自动恢复。
- 使用新 `previewId` 重交原双选时，已确认的 A 返回幂等结果。其余账号仍重核原预检、显式独立确认以及当前同地址目标。只创建 B，E 与 A 的本机认证和修订保持原值。复用原地址锁、快照锁、逐账号事务和回滚。 [判定与提交](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts#L212)
- 同批摘要独立于账号行指纹。v1/v2 两个现有方向的身份回归均通过。独审第 2 项涉及未发布开发候选 `36891d5f` 的旧记录迁移，本次范围以现有格式为准。

## 红绿验证

- 红灯：Node v26.11.1 运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t '只恢复 A|原双选参数'`。三条失败。相同与不同 ZIP 的 B-only 操作都错误创建 B，显式独立双选的原参数在 A 已恢复后被拒绝。
- 绿灯：`pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail 子集|Mail 备份内|Mail 同地址子集'`。9 通过，11 过滤。覆盖同 ZIP/跨 ZIP、原空库和已有 E 的续跑、确认文件漏写、完整选择与主体绑定、改变独立选择、A/E 认证、正常读标记及附件/草稿/投递回滚、v1/v2 双向行身份。 [新增回归](../../../../../temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts#L495)
- 定向 `oxfmt --check` 与 `git diff --check` 通过。

## 未运行或受阻

- 扩展过滤时，真实 Engine 的「Mail ZIP 预检拒绝覆盖，确认后恢复选中的持久数据并可重开重试」在监听 `127.0.0.1` 时被沙箱以 `EPERM` 拒绝，其他 9 条通过。留 Lead 在允许回环监听的环境复跑，包含该用例的完整单文件结果仍待验收。
- Mail 定向类型检查、Electron/Web E2E、构建和打包由 Lead 负责。本轮测试不覆盖重开工作台后自动重建原选择，API 仍接受原完整选择，通用预检显示同地址冲突。

## Lead 验收

已提交dbe58665，t99在Node24.21.0运行完整outbox-engine.test.ts：20/20通过，随后Mail定向typecheck通过。日志temp/issue-evidence/huhu-2026-11-22/mail-batch-recheck.log。当前源码回归通过，实际UI及最终包仍待验。
