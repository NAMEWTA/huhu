# Codex 与 Pi 历史匹配返工复核

- 任务为 t1g0/task02.md，Lead 为 t3p。共享根为 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release。工作目录为 /home/wta/projects/huhu。
- 审查对象为基线 cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2 上的 index.ts 和 agent-history.test.ts 工作树版本。审查完成，报告位于 /home/wta/projects/huhu/temp/closeout-release/t1g0-report02.md。执行结果为 done。

## 结论

Codex 跨 profile 误判和 Pi 独立文件并发的原始复现均已关闭。Codex 原来源 active 优先，常规 Pi 同路径保护保留。Pi 仍有一项同源保护缺口。两个硬链接共享实际文件，却能各自获得恢复认领。

## 规格复核

- Codex 的列表与认领调用同一个来源匹配。UUID 一样但所选 rollout 路径不同，列表继续显示可恢复和可 fork，可恢复筛选保留该行。相同来源处于 launching 时显示 possiblyActive，唯一精确 running 命中时 active 优先，另一个恢复请求得到 INVALID_INPUT，启动回调总次数仍为 1。 [引擎匹配](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:585) · [列表状态](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:839) · [能力入口测试](/home/wta/projects/huhu/apps/engine/test/agent-history.test.ts:287)
- Pi 按文件路径持有待启动认领。对实际不同的文件，首个请求仍挂起且会话记录随后可见时，同 native ID 的异 cwd 和同 cwd 两个来源均可启动。同一路径在会话记录落盘前已经拒绝不同请求。会话记录带历史文件时也按路径比较，缺该字段的既有会话回退至 cwd 和 native ID。 [认领与占用](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:728) · [能力入口测试](/home/wta/projects/huhu/apps/engine/test/agent-history.test.ts:327)

### P3 Pi 同一文件的两个硬链接可以分别恢复

Pi 扫描把规范化路径纳入 historyId，同一 inode 的两个硬链接都会列出且通过选定文件校验。新认领键使用路径，已有会话的来源比较也只比较路径。用户从两个条目分别恢复时，第二个请求可以在第一个启动挂起期间进入启动方法，或在第一个会话已登记为运行中后被判为可用。Pi 恢复以所选路径调用 --session，两个请求因此会打开同一份 JSONL。修复前，相同 native ID 和 cwd 会阻止该组合。建议以实际文件身份处理这个同源边界，同时保留不同 inode 的会话并发。 [扫描身份与去重](/home/wta/projects/huhu/plugins/agent-cli/src/engine/history/scanner.ts:373) · [Pi 会话参数](/home/wta/projects/huhu/plugins/agent-cli/src/engine/launch.ts:192) · [Pi 路径比较](/home/wta/projects/huhu/plugins/agent-cli/src/engine/index.ts:595)

Node 探针在临时目录创建 Pi 标头 JSONL，再用 linkSync 创建第二个名称，确认两者 dev 和 ino 相等。执行实际 scanHistory、isPiHistoryFile、claimHistory 和 historyBusy，挂起第一个回调并重放第二次恢复。结果为扫描条目 2，两项选择校验均通过，同路径回值 busy，硬链接在原请求挂起时进入启动回调，登记原会话为 running 后对硬链接的占用判断仍为 false。该探针验证 Huhu 允许两个请求进入启动，使用回调替代真实 Pi，未观察原生写入结果。

## 验证与边界

- 已读实施者红绿日志。红灯中 Codex 行被标为 possiblyActive，Pi 第二个来源被拒。独立重跑 pnpm exec vitest run apps/engine/test/agent-history.test.ts -t '历史列表与认领'，2 项通过，1 项既有 shim 用例未选中。测试通过实际引擎能力入口，以替身控制会话当前状态和启动。定向 git diff --check 通过。 [红灯](/home/wta/projects/huhu/temp/closeout-release/t1fp-task02-red.log) · [绿灯](/home/wta/projects/huhu/temp/closeout-release/t1fp-task02-green.log)
- 两个匹配和认领分支均按任务范围完成复核，未另发现项目规范违规。未改业务代码或测试文件。未运行真实 Core、原生 CLI、桌面 E2E、构建、打包、全仓类型检查或全量测试。

## Lead 验收
