# Pi 硬链接同源保护独立复核

- 任务为 t1g0/task03.md，Lead 为 t3p，工作目录为 /home/wta/projects/huhu。采用 cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2 上的共享工作树，审查 index.ts 与 agent-history.test.ts 中的 Pi 硬链接改动。
- 执行结果为 done。报告位于 /home/wta/projects/huhu/temp/closeout-release/t1g0-report03.md。

## 结论

上轮 P3 可关闭。本轮范围内未发现阻断。可读文件身份时，Pi 硬链接在原请求待启动和已有运行会话两个阶段均受到同源保护。同 native ID 的不同文件可并发打开，身份暂时不可读取时原路径仍受保护。

- 待启动认领同时登记路径与 Vault 的 dev:ino。检查和登记之间没有异步间隔，启动完成后释放两个键。运行中的会话比较原路径或双方当前可读的文件身份。列表优先把原选择标为 active，并把硬链接条目标为 possiblyActive。旧会话无文件引用时沿用 cwd 与 native ID 判断。 [匹配](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:585) · [认领](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:730) · [列表](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:860)
- 核对实施者红绿日志及实际能力测试。测试用真实硬链接确认两个路径的 dev 和 ino 相同，通过 agent.history.list 和 agent.history.resume 复现问题。红灯阶段两个重复请求都进入启动，总调用 5 次。绿灯报告 2 项通过、1 项未选中。Pi 用例保留 3 次有效启动，覆盖异 cwd 和同 cwd 的独立文件，并分别检查待启动及运行中拒绝硬链接重复恢复。会话状态与启动回调使用替身。 [测试](/home/wta/projects/huhu/apps/engine/test/agent-history.test.ts:327) · [红灯](/home/wta/projects/huhu/temp/closeout-release/t1fp-task03-red.log) · [绿灯](/home/wta/projects/huhu/temp/closeout-release/t1fp-task03-green.log)
- 独立 Node 探针从当前源码载入认领、占用和 Vault 文件身份函数，使用临时真实硬链接和一份独立文件。结果为待启动 hard link 返回 busy，独立文件回调执行一次，运行中的 hard link 判忙，独立文件判为可用。将 lstat 替换为 EACCES 后，首次能读取身份与首次无法读取身份两种情况下的同路径重复请求均被拒绝，恢复身份读取后同路径仍保持占用。已有运行记录与缺少文件字段的旧会话同路径保护通过。定向 git diff --check 亦通过。

## 验证边界

业务代码与测试文件只读。本 worker 未启动 Vitest，以免与 Lead 的单次全量测试重叠。未运行真实 Pi、Core、桌面 E2E、构建、打包和全仓类型检查。

## Lead 验收

Lead 2026-11-23：已核对实现、真实硬链接红绿用例及独立探针结论，接受本轮同源保护修复。最终单次全量测试运行中，发布验收另行记录。
