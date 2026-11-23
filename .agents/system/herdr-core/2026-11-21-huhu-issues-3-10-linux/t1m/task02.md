# task02.md P8.3 返工：真实装配下的单侧 Safe 分歧

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t1m`（执行终端 `t1z`）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/report02.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支已由 Lead 快进到你的候选 `ff0cf900`。

## 问题

Lead 按你报告的接线把 `safeSnapshots: safe.safeGitSnapshots(api.vault.files)` 接进 `apps/engine/src/boot.ts` 的 Versioning 注册后，`plugins/versioning/test/remote-auth.engine.test.ts` 的「同一 HTTPS 目标修复认证只恢复一次原定同步，Safe 解锁与过期提交没有新增请求」稳定失败（`expect.poll(... pausedReason).toBeNull()` 20s 超时）。用例：远端已分歧（`seedDivergedRemote`，远端无 Safe），本地 `safe.setup` 后上锁，再修复认证，期望自动恢复同步、合并成功回到 idle 并推送。你的报告写明“对 Safe 组不同的分歧分支统一保留双方并报告冲突，含只有一侧修改 Safe 的分歧”——这正是回归：用户只在一侧建立或修改 Safe、另一侧没动 Safe 时，普通分歧同步永远卡在冲突。

## 要求

1. 在你的工作树里同样把上述 options 接进 `apps/engine/src/boot.ts`（只改 Versioning 注册那一处；Lead 合并时以同一写法保留）。
2. 对分歧分支按合并基准判断 Safe 组：只有一侧相对合并基准改变了 Safe 整代（含新建），就整代采用该侧（不逐行拼接）；两侧都改且整代不同才保留双方并报冲突。保留你已有的整代校验、白名单、引用完整性与锁定时外层检查。
3. 让上述 engine 用例通过；补一个单侧 Safe 分歧（本地新建 Safe、远端改普通文件）合并成功并推送、实际树字节核对的用例；保留“两侧不同整代 → 冲突”用例。
4. 跑 `plugins/versioning/test`、`plugins/safe/test`（`--maxWorkers=1`）与 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`。全量测试一律 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`，本任务不强制全量。
5. 候选提交仍用临时索引方式，父为 `ff0cf900`。报告按同一格式写 `report02.md`，发布后打印路径并停下。
