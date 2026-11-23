# 返回 shell 调用名 P2 收尾复核

- Core 与任务 — `wta-ubuntu`，Lead `t3p`，执行者 `t9b`，清单指针 `t9b/task04.md`。 [任务](task04.md) · [清单](../manifest.tsv)
- 执行结果 — `done`。仅复核目标 `cce683a02b56ac101cba6ca5483a48381d62e874` 相对父提交 `9234a89ffeaa5e66a441f9ee9247c97edd592030` 的六文件差异和指定证据。

## 规格轴

**[原 P2](report03.md#linux-provider) 关闭。** 当所选 shell 的原路径为 `sh` 且链接到 Bash 时，Engine 保留规范 Bash 映像及原链接，使用原路径作为返回 shell 的 `argv[0]`。Go 要求 `argv[0]` 与 `Source` 完全一致，直接路径则须等于 `Image.Path`，第二参数仍是 `-i`。原链接必须继续解析到核对过的规范映像，执行仍使用封存映像的 FD。Go 回归接受匹配别名，并拒绝把同一计划的 `argv[0]` 改回规范映像路径。 [参数构造](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/linux-interactive-program.ts#L266) · [参数校验](../../../../../temp/issue-worktrees/integration/native/agent-pty/protocol_linux.go#L79) · [链接与映像核验](../../../../../temp/issue-worktrees/integration/native/agent-pty/protocol_linux.go#L148) · [Go 回归](../../../../../temp/issue-worktrees/integration/native/agent-pty/installation_linux_test.go#L160)

## 证据

- **t9r 红灯。** 新断言期望 `argv[0]` 是 `/bin/sh`，父版本行为是 `/usr/bin/dash`。日志同时显示规范映像路径仍为 `/usr/bin/dash`。 [红灯日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/shell-name-red.log:20)
- **t9s 绿灯。** 同一 TypeScript 定向用例 1 项通过，6 项由过滤跳过。Go 模块核验、测试和 Linux amd64 helper 构建通过，真实 PTY 6/6。新增 `shell-alias` 使用临时 `sh` 链接运行 Bash，在 Agent 退出后从原 PTY 运行 `shopt -oq posix`。探针要求出现实际输出的成功标记，再确认同一 host 最终退出 23。 [t9s 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/shell-name-check.log:5) · [POSIX 与退出断言](../../../../../temp/issue-worktrees/integration/native/agent-pty/tests/verify-linux.py#L247)
- **t9t 回归。** Volta Codex、Volta Pi、直接 npm Pi、原生 Claude 共 4 项通过，3 项由过滤跳过。每种的 version 和 interactive 都有真实 host 退出 23 的记录，共 8 次。 [t9t 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/provider-shell-alias-check.log:5)

## 规范轴

固定差异通过 `git diff --check 9234a89f cce683a0`。协议说明与实现一致，沿用现有 `Source` 绑定和规范映像身份校验。定向 TypeScript 用例有一处可移植性限制。它固定要求 `source: "/bin/sh"`。若某个 Linux 环境的 `/bin/sh` 本身就是规范路径，正确计划会省略 `source`，该断言会误报。Go 和真实 PTY 的别名场景显式创建链接。此为测试断言的代码观察。 [协议说明](../../../../../temp/issue-worktrees/integration/native/agent-pty/PROTOCOL.md#L59) · [TypeScript 断言](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/linux-interactive-program.test.ts#L110)

## 未运行的验证

本轮独立复核使用指定日志及固定代码，未重复运行真实 provider、PTY、GUI、构建或最终包验证。

## Lead收取
P2关闭；测试可移植性提醒已修复66a9245d，显式创建临时sh链接。
