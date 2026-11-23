# task06.md #6/#7 SSH 最后 6 项与外部动态/远端转发

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t2y`（执行终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task06.md`；报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report06.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-ssh-last`，HEAD `b25c6322`（集成最新，含 task05 外部主体自有对象全部 49 项）。候选父为 `b25c6322`。
- 接续依据 — `report05.md`「未完成」节与 `task05.md` 的 Lead 设计裁决（仍然有效）。

## 目标

在 task05 的外部主体自有对象模型上开放（`exposable: true`、`defaultExposed: false`，稳定意图键与领域对账同 task05）：

1. `ssh.archives.support`、`ssh.archives.run`：只作用于本主体自有、已授权主机的远端文件会话；用远端 `tar`/`zip`/`unzip` 或 SFTP 流在远端完成，不经 Engine 本机暂存；support 只读缓存或一次性远端探测（execute/high），run 绑定来源、目标、大小与覆盖确认。Windows 原生 ZIP 后端仍只供工作台。
2. `ssh.fileSessions.directory`、`prepareDirectory`、`commitDirectory`：作用于本主体自有 PTY（task05 的 shell）的目录提示符与输入持有权；commit 一次性、过期作废。
3. `ssh.hosts.import.confirm`：外部确认只能把导入的新主机写入目录，新主机**不自动获得外部授权**（授权仍在工作台的主机选择里），分组限可见现有分组；预览令牌绑定主体、源摘要与目录 revision。
4. 外部转发：动态 SOCKS5/HTTP CONNECT 代理与远端监听（-R）模式。本机监听仍只绑 127.0.0.1、Engine 分配端口；远端监听以协议回执（`tcpip-forward` 成功）确认，失败显式报错；撤销主机即停。

若某项确有无法在 Linux 回环夹具验证的部分，写清并保留实现，不以此为由保持关闭。

## 职责边界（强制）

- 只写业务代码、对应单测与 E2E spec；只跑改动涉及的单个 vitest 文件；改 ssh 源码后跑 `pnpm exec tsc --noEmit -p plugins/ssh`。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/lint/knip/format:check、启动 Playwright/Electron/xvfb、截图。E2E 只写不跑。写报告用带引号 heredoc。不要在 hc send 之外发送额外回车。
- 并行实施者 `t4c` 在写 `plugins/ssh/src/ui/**` 与 `plugins/ssh/src/shared/**`（#7 H 切片）；你不改这两处（必要的 UI 标识写入报告交 Lead）。你独占 `plugins/ssh/src/engine/**`、`plugins/ssh/huhu-plugin.json`、`plugins/ssh/test/**`、`tests/e2e/ssh/owned.spec.ts`。禁止改其他插件、Kernel dispatcher/server/MCP/contracts 调用身份、Vault 包收集器、根锁文件。回环夹具，不连真实主机。不 push，不启动子 agent。

## 产物

链式候选提交（临时索引，父 `b25c6322`），逐批追加报告，不逐批停下；完成或上下文超过 80% 时发布 `report06.md` 终稿、打印路径并停下。证据追加 `G-ssh-exposure-linux.md`。
