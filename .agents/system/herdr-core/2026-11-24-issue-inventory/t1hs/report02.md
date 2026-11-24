# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report02.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{025-f01,043-f02,044-f03}.md`
- 执行结果 — done（worker 交回）

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `6a321df6`，交付 HEAD `4cdf922c`。三个提交各自带 `Refs: #13`。`git diff 6a321df6..HEAD --check` 通过，工作树干净，已移除本次定向测试终端。下列测试结果见本回执，无额外附件。

### F01 — `fd87498f`

- 改动文件 `packages/vault/src/commit-queue.ts`、`packages/vault/src/operations.ts`、`packages/vault/src/trash.ts`、`packages/vault/src/write.ts`、`packages/vault/test/operations.test.ts`。
- 普通写与多路径操作共用提交队列，一次按排序后的规范路径预留，目录覆盖后代路径，并将 Vault 内实路径与大小写等价键纳入协调。多步保留进入队列时的版本，并逐步比较实际状态。普通条件替换完成暂存后，在发布前重新核对版本。同步回收站、转换和手动恢复遇已预留路径时拒绝冲突操作。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/operations.test.ts`，本票提交前 36 项通过。覆盖写/写、写/删、写/改名、排队期间外改、目录后代、重复步骤及大小写切换。
- Lead 执行 `tests/e2e/workflows/vault-commit.spec.ts` 中「F01 桌面保存与独立 Web 改名竞争同一旧版本，只提交一个结果」。Spec 累积于 F03 提交。

### F02 — `a3bc1d44`

- 改动文件 `packages/vault/src/operations.ts`、`packages/vault/src/write.ts`、`packages/vault/src/paths.ts`、`packages/vault/src/watch/snapshot.ts`、`packages/vault/src/package/package.ts`、`packages/vault/test/operations.test.ts`、`packages/vault/test/fixtures/crash-op.mjs`。
- 日志记录步骤准备、受理与确认。发布后确认前通过暂存条目、原条目和落盘条目的文件身份核实实际状态。替换和删除保留原条目，恢复只在归属可证时无覆盖地还原。未知场景保留记录与字节并标 `needs_attention`，重启或重交原 opId 继续保留现场。历史日志缺少归属证据时保留旧备份。暂存前缀作为 Vault 内保留路径从普通列表、观察与包收集排除。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/operations.test.ts`，47 项通过。包含子进程在发布后及确认后退出，外部同文、删除、占名、多次恢复，以及目录移动后的暂存清理。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/watcher.test.ts`，9 项通过。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/service.test.ts`，45 项通过，包含移动、回收恢复及大小写步骤失败后恢复。
- 暂停点用进程退出验证。已有 `tests/e2e/workflows/write-and-restore.spec.ts` 的「写作与恢复：批注、版本、恢复，重开后一致」可补正常产品旅程。

### F03 — `4cdf922c`

- 改动文件 `packages/vault/src/semantic/repository.ts`、`packages/vault/test/repository.test.ts`、`tests/e2e/workflows/vault-commit.spec.ts`。
- 一般改名以此前读取的版本约束源删除、独占创建目标。仅改大小写时复用两跳无覆盖移动，再按原版本替换内容。冲突回执保留目标路径，源版本冲突在可靠回滚后返回 `VERSION_CONFLICT`。每次改名与删除使用独立操作 ID。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/repository.test.ts`，21 项通过。包含坏 YAML、缺 ID、错误 kind、排队期间同字节目标、源外改及大小写改名。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/service.test.ts`，15 项通过。
- Lead 执行 `tests/e2e/workflows/vault-commit.spec.ts` 中「F03 桌面与独立 Web 改名均保留异常目标，清除冲突后保留原任务身份」，以及上列 F01 用例。

### 累积回归与未运行项

- 在最终 HEAD 执行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/write-boundaries.test.ts`，C12base 2 项通过，桌面/Web 附件提交身份和 HTTP 恢复合同仍成立。
- Lead 类型检查 `@huhu/vault`。相关消费者为 `@huhu/engine`、`@huhu/plugin-notes` 和 `@huhu/plugin-tasks`。新增代码按 ES2023 API 实现。
- 待 Lead 运行 Playwright E2E 与类型检查。构建、打包、全量测试、全仓 lint、knip 和截图取证均未运行。大小写不敏感冲突由 Linux 单测模拟，未运行独立不区分大小写卷或 Windows/macOS 实机。崩溃场景覆盖进程退出，未做断电验证。

## 阻碍与接续

无实施阻碍。待 Lead 验收和回写。条件检查与发布在同一 Engine 提交边界，外部进程绕开队列管理时由发布前版本核对及恢复阶段的条目归属保护处理。

## Lead 验收

- Lead 2026-11-24：已审查，4 包类型检查通过，E2E 3/3 通过，合入 main fbb43702。清单转 task03。
