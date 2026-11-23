# Pi 硬链接同源认领修复

- 任务为 `t1fp/task03.md`，Lead 为 `t3p`。工作目录为 `/home/wta/projects/huhu`，基线为 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`。代码已冻结。
- 本轮修改 `plugins/agent-cli/src/engine/index.ts` 和 `apps/engine/test/agent-history.test.ts`。共享报告目录若只读，本报告按任务约定写入 `temp/closeout-release/t1fp-report03.md`。

## 修复

Pi 恢复认领同时保留原路径和经 Vault `filesystemIdentity` 得到的 `dev:ino`。两个硬链接因此在首个启动请求挂起时共享占用。已有恢复会话的来源也用相同文件身份比较，列表保留精确原条目的 active，别名显示 possiblyActive。文件身份读取失败时沿用原路径或旧会话的 cwd 与原生 ID 判断。原历史身份、修订和启动校验继续生效。

## 实际验证

```bash
pnpm exec vitest run apps/engine/test/agent-history.test.ts -t '历史列表与认领'
pnpm exec oxfmt --check plugins/agent-cli/src/engine/index.ts apps/engine/test/agent-history.test.ts
git diff --check -- plugins/agent-cli/src/engine/index.ts apps/engine/test/agent-history.test.ts
```

- 红灯为 1 失败、1 通过、1 未选中。通过实际 `agent.history.list` 和 `agent.history.resume` 能力入口，原实现先后允许挂起阶段和运行阶段的硬链接重复进入启动。运行中的别名也错误显示可恢复。启动回调共 5 次，预期为 3 次。见 `temp/closeout-release/t1fp-task03-red.log`。
- 绿灯为 2 通过、1 未选中。测试用真实硬链接核对两条路径的 dev 和 ino 相等，再以替身控制会话及启动时序。两个硬链接重复请求均被拦截，同 ID 的另外两个实际文件仍可并发打开，涵盖 cwd 相同及不同。Codex 跨 profile 回归同时通过。见 `temp/closeout-release/t1fp-task03-green.log`。
- 定向格式与差异检查通过。

## 未运行的验证

类型检查由 Lead 统一执行。Worker 未运行真实 Core 或原生 Pi、桌面 E2E、构建、打包、全仓类型检查或全量测试。测试命令筛掉既有 Claude 与 Codex shim 用例。

Lead 2026-11-23：已核对实现、真实硬链接红绿用例及独立探针结论，接受本轮同源保护修复。最终单次全量测试运行中，发布验收另行记录。
