# P8.3 · 真实装配下的单侧 Safe 分歧返工

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t1m`（执行终端 `t1z`）
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/report02.md`
- 执行结果 — done

## 结论

真实 Engine 接入 Safe 快照后，旧逻辑仅凭两个分支的 Safe 树不同就建立冲突会话。复现中，认证修复已触发自动同步，但普通远端变更与本地新建的 Safe 被误判为双方 Safe 冲突。修复后按共同合并基准比较 Safe 路径、模式和对象 ID。只有一侧改变 Safe 时，采用该侧完整整代。两侧产生不同整代时，保留双方并报告持久冲突。普通文件冲突仍可单独解决。

## 产物与改动

- 候选提交 — `65f00e7668d05b0c6d9e5b4e6d7ceea0049c0016`，单父为 `ff0cf900b561fd44434575b6f8839d08e5483963`。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`。源码和测试与候选一致，证据按 topic 约定用临时索引直接装入候选树。
- Engine 的改动限于 `apps/engine/src/boot.ts` 的 Versioning 注册。使用 `safe.safeGitSnapshots(api.vault.files)`，同时按原条件注入 `credentialHost`。Lead 合并时保留该注册写法。
- 单侧分歧以 Git 预计算的合并树生成双亲提交，应用前验证整个 Safe 树与选定父提交一致。结合同一 Safe 写队列、引用校验、工作区覆盖检查和 HEAD 比较更新。已有推送白名单仍检查实际出站对象。
- 项目证据 — `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/verification/P8.3-safe-git-linux.md`。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 真实 HTTPS 认证恢复 | 修复前接线后，同一 Engine 用例等待 20 秒仍为 `conflict`。修复后回到 `idle`，完成一次 fetch 和一次 push，原用例原样通过。 | `plugins/versioning/test/remote-auth.engine.test.ts`，`/tmp/huhu-p83-rework.h6S75K/red.log`、`green.log` |
| 单侧变更与实际 Git 字节 | 本地新建并锁定 Safe，远端改普通文件。双亲提交推送后，用 `git ls-tree` 与 `git cat-file` 核对路径和实际 blob。反方向也验证了远端单侧更新 Safe，解决普通文本冲突后完整采用远端代，并实际解锁状态下读回标签。 | `plugins/versioning/test/safe-sync.test.ts` |
| 双侧不同整代仍保留 | 两侧同路径产生不同密文，检验远端和本地提交、blob 和工作区保留。重开后逐文件解决仍被拒绝。 | `plugins/versioning/test/safe-sync.test.ts` |
| 定向套件与仓库门禁 | `pnpm exec vitest run --maxWorkers=1 plugins/versioning/test plugins/safe/test` 通过，113 个用例。`pnpm typecheck`、`pnpm lint` 和 `pnpm format:check` 通过。 | `/tmp/huhu-p83-rework.h6S75K` 对应日志与 `exits.tsv` |

使用 Linux 临时 Vault、本机 bare Git 和回环 HTTPS。全量测试和 E2E 未运行。

## 阻碍与接续

无阻碍。Safe 不同且无共同基准，或多重合并基准的 Safe 树不一致时，保守地保留两侧。已存在的本地 Safe 原件继续受覆盖及整代删除检查约束。双边 Safe 冲突的交互式整组选边留待后续。

## Lead 验收

Lead 验收（2026-11-22）：report01 候选 `ff0cf900` 在真实 boot 装配下 remote-auth.engine 回归失败，退回 task02；task02 候选 `65f00e76` 通过，快进到 `impl/huhu-issues-3-10-safe-git` 并合入集成 `2c7994d3`；合入后 versioning+safe 113/113 通过。
