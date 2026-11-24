# P8.3 · Safe 整代 Git 候选

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t1m`（恢复后的执行终端为 `t1z`）
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1m/report01.md`
- 执行结果 — done

## 结论

在 Safe 写队列内捕获当前包装 keyring、清单和引用密文，用原始字节写入临时 Git 索引，提交前用实际树与 blob 核对路径和字节。预览按整组选择，部分排除会给出整组跳过或拒绝原因。自动推送核对目标提交和该目标分支尚未拥有的祖先，拒绝随旧提交传送白名单外的资料。不同 Safe 整代的分歧保留两侧提交与密文，重开后仍可见冲突，逐文件解决被拒绝。

## 产物与改动

- 候选提交 — `ff0cf900b561fd44434575b6f8839d08e5483963`，单父为 `f7901b0a6b86910f52d74efac8ec1f438b387a9d`。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`。已用临时索引核对源码和测试与候选一致。真实分支和暂存区未推进。沙箱将工作树的 `.agents/` 挂为只读，证据按 topic 约定直接纳入候选树。
- 证据 — `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/verification/P8.3-safe-git-linux.md`。可用 `git show ff0cf90b:.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/verification/P8.3-safe-git-linux.md` 查看。
- 范围 — `plugins/safe` 的快照接口与 `plugins/versioning` 的同步、冲突、测试。源端只调整临时索引候选，保留未引用旧密文、审计和旧元数据的本机原件及历史。真实索引只对齐原先未手工暂存的受影响路径。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Safe 写入与 Git 快照一致，实际树无本机资料 | 暂停标签写入，自动同步等待发布。用本机 bare 仓的 `git ls-tree -rz` 和 `git cat-file blob` 核对成员和字节，扫描合成个人字段，核对受管规则定义进入、旧元数据、审计、缓存、ASKPASS、执行环境和机器钥匙排除。既有暂存副本和工作区副本分别保留。 | `plugins/versioning/test/safe-sync.test.ts` |
| 排除、保留历史及冲突 | 局部排除不产生残缺代。清理新树后旧提交及源文件仍可读，未公开旧资料阻止推送。两份 Safe 的同路径密文出现分歧时两侧字节、对象和工作区保留。重开冲突后拒绝逐文件解决。完整快进可解锁读回，缺引用的快进保持本地 HEAD 和密文。 | `plugins/versioning/test/safe-sync.test.ts` |
| 相关 Vitest | `pnpm exec vitest run --maxWorkers=1 plugins/versioning/test plugins/safe/test`，12 个文件、111 个用例通过，含 5 个新增 Git 场景。改用现有测试信号后再跑这 5 个用例，全部通过。 | `/tmp/huhu-p83-check.wtgmQ1/vitest-final.log` |
| 仓库门禁 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check` 通过。类型检查持有主机全量测试锁，以避免与全量作业叠加。 | `/tmp/huhu-p83-check.wtgmQ1/exit-final.tsv` 及同目录的对应日志 |

验证使用隔离 Vault、本机 bare Git 仓及回环认证夹具。未运行全量 E2E。

## 阻碍与接续

本候选已完成工作树内的实施和验证。Lead 在 `apps/engine/src/boot.ts` 的 Versioning 注册中用下面的 options，沿用已有 `safe` 与 `versioning` 导入。测试用 `VaultSync` 最小装配验证了同一 `VaultFiles` 及队列。集成后再走真实 `sync.preview` 和 `sync.run` 能力入口。

```ts
apply: (ctx, api) =>
  void versioning.apply(ctx, api, {
    safeSnapshots: safe.safeGitSnapshots(api.vault.files),
    ...(moduleCredentialHost && { credentialHost: { ...moduleCredentialHost, vault } }),
  }),
```

计划任务及手动 `sync.run` 共用快照检查。当前对 Safe 组不同的分歧分支统一保留双方并报告冲突，含只有一侧修改 Safe 的分歧。整组选边提交留待后续。成功快进会按远端树更新已跟踪的 Safe 路径，替换掉的已跟踪密文仍可从旧提交找回，未跟踪的本机旧原件保留。快进检查需要本机 Git 支持 `check-attr --source`。锁定时检查外层结构与引用关系，解包认证由 Safe 解锁负责。

已有远端历史、手工 `git.stage`、`git.commit`、外部 Git 和回滚均未纳入这次自动同步约束。独立进程写入和其他平台未验证。

## Lead 验收
