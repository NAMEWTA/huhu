# task10 — Core 到浏览器终端吞吐定位与局部修复
Lead t3p；worker t176；工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。
继续 dev-debug/dev-benchmark，SSH 暂停。t182 真跑固定 da645 应用，20秒后独立 Core terminal.read 已有 tail 和 shell prompt，但 WS deadline 前仅847308字节，21秒978380字节161帧；DOM节点没替换。证据 temp/final-audit/flood-stages-artifacts-da645ee8 与 flood-stages-da645ee8.log。你的 task09 已完成。
先读取并核对本地 /home/wta/projects/huhu/temp/sources/herdr-core 版本及 viewer/outbox/frame协议，结合 packages/herdr-client/src/client.ts 与 plugins/agent-cli/src/engine/terminal-bridge.ts 找到真实瓶颈，不能先假设 FOCUS/credit。可写范围 packages/herdr-client/src、对应单个 test、plugins/agent-cli/src/engine/terminal-bridge.ts及其对应测试；禁止修改 perf.spec.ts（Lead接插件诊断），SSH、Core上游、包锁及其他代码。先给局部证据再最小修复；缺明确根因写诊断建议，不乱改。只跑相关单个Vitest，禁止 E2E、build、全仓门禁。测试隔离Core /bin/sh，不访问真实历史。不得新建agent/worktree。
报告 temp/final-audit/t176-report10.md，列证据/变更/实际验证/未运行验证。完成 hc send t3p 报告路径。
