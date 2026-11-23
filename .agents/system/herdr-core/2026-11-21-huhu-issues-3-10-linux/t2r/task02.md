# task02.md Mail 候选在可回环环境下跑通双入口矩阵

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t2r`（执行终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/report02.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-mail`，HEAD `2b3fe70a`（集成：已合入你的候选 `f3e764e8`，加上 Versioning/Safe 组与 Lead 的两处修正）。

## 背景

你之前的终端被以默认沙箱恢复，没有回环与子进程权限。现在已用标准参数（`workspace-write` + network_access）恢复，回环监听可用。Lead 在集成上跑 `plugins/mail/test`：14 个文件通过；`tool-exposure.test.ts` 的 CLI 与 HTTP MCP 两项失败。Lead 已修两处（`2b3fe70a`）：`approval-required` 改为 `details.reason` 顶层（`ai-settings.ts:512`），`sentBody` 期望含段落转换的结尾换行。目前停在 `tool-exposure.test.ts:570`：重启后 `mail.accounts.list` 返回的账号对象与期望 `{ accountId, revision }` 不匹配（结构包含 authState/definition，需核对 revision 是否变化或外部投影是否应去掉 definition）。

## 要求

1. 让 `plugins/mail/test/tool-exposure.test.ts` 两个入口真实跑通；判断每个失败是测试期望错还是实现缺陷，实现缺陷要修。外部 `mail.accounts.list` 是否应返回 `definition`/文件夹等内部结构，按 t19「## mail」行内对象校验与安全投影裁决。
2. 跑你在 task01 新增的 Playwright 批准交互用例（`env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 XDG_RUNTIME_DIR=$(mktemp -d /tmp/hc-xdg.XXXXXX) xvfb-run -a pnpm exec playwright test <你的 spec> --reporter=line`，需先 `pnpm build`）。
3. 只跑 Mail 涉及的 vitest 文件（AGENTS.md「测试与内存约束」：不跑全量，根 `vitest.config.ts` 已限 `maxWorkers: 3`），以及 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`。
4. 候选提交（临时索引，父 `2b3fe70a`），报告 `report02.md`，格式与发布方式同前，发布后打印路径并停下。
