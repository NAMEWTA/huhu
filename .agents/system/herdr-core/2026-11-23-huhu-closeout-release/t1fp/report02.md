# 原生历史列表与并发认领修复

- 任务为 `t1fp/task02.md`，Lead 为 `t3p`。工作目录为 `/home/wta/projects/huhu`，基线为 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`。代码改动在共享工作树，已冻结待 Lead 验收。
- 本轮生产改动位于 `plugins/agent-cli/src/engine/index.ts`，回归测试位于 `apps/engine/test/agent-history.test.ts`。

## 修复

1. Codex 历史列表与启动认领共用来源占用判断。不同 profile 的同 UUID 以 rollout 路径区分。原历史存在唯一、精确匹配的运行中会话时继续显示 active，正在启动的原来源显示 possiblyActive。无关 profile 的记录不影响恢复、分支和可恢复筛选。
2. Pi 按所选文件登记启动中的认领。已登记文件的会话也按文件识别占用。两个具有同一头部 ID 的文件可以并发启动，包括 cwd 相同的情况。同一文件在启动回执落盘前仍拒绝另一请求。缺少历史文件的旧会话沿用 cwd 和原生 ID 判断。

## 实际验证

同一命令在修复前复现两项失败，修复后 2 项通过，既有 shim 用例由筛选排除。两项测试调用实际历史能力入口，读写临时历史文件，以替身控制会话列表和启动时序。

```bash
pnpm exec vitest run apps/engine/test/agent-history.test.ts -t '历史列表与认领'
pnpm exec oxfmt --check plugins/agent-cli/src/engine/index.ts apps/engine/test/agent-history.test.ts
git diff --check -- plugins/agent-cli/src/engine/index.ts apps/engine/test/agent-history.test.ts
```

- Codex 红灯在不同 profile 的同 UUID 行上得到 `possiblyActive=true`，恢复和分支均不可用。绿灯验证恢复和分支可用、可恢复筛选保留该行、后端实际接受选择、原会话的 active 优先，以及同源仍拒绝再次启动。
- Pi 红灯中，第一个 launch 保持进行中，异 cwd 的第二个来源被拒绝。绿灯在首个 launch 仍挂起时接受另外两个文件，涵盖异 cwd 与同 cwd，并在会话记录出现前拒绝同一文件的重入。
- 格式与差异检查通过。红绿日志分别为 `temp/closeout-release/t1fp-task02-red.log` 和 `temp/closeout-release/t1fp-task02-green.log`。

## 未运行的验证

Worker 未运行全仓类型检查、真实 Core 或 Codex、浏览器、桌面 E2E、构建、打包、lint 或全量测试。Lead 统一运行类型检查。既有兼容回归可用 `pnpm exec vitest run apps/engine/test/agent-history.test.ts -t 'Claude 与具名 Codex shim'` 验证。
