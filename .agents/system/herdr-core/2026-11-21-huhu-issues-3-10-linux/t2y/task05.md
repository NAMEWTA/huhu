# task05.md #6/#7 SSH 剩余 56 项：外部主体自有对象模型

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t2y`（执行终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task05.md`；报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/report05.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-ssh-owned`，HEAD `00d644d3`（集成最新，含 task02–04 全部 23 项及 Lead 修正）。候选父为 `00d644d3`。
- 接续依据 — `report04.md`「Task04 终稿」56 项关闭表与 Lead 验收段。

## 为什么不能保持关闭

#6 原文：“全部可以开放”须取消“SSH 永远不可开放”；“高危是分类与提示，不能继续成为永久拒绝的理由”；验收第 3 条“SSH 已保存主机可直接连接…连接、命令、交互终端、SFTP、必要的待处理交互都有工具合同”。#7 设置与 MCP 行要求终端/文件工具与后台任务进入统一目录。report04 的关闭理由几乎都是“工作台持有的对象未委托给外部主体”，这是缺一层所有权模型，不是产品裁决。

## Lead 设计裁决（按此实现，不重新讨论）

1. **外部主体自有对象。** 外部调用（`ctx.subject` 为逻辑会话主体）新建的连接、shell/PTY、exec 作业、文件会话、SFTP 传输、搜索、转发运行、工作区运行、监控订阅，都记录 `ownerSubject`（以及 Vault 实例、主机/路由修订、连接代）。外部调用只能列出和操作自己拥有的对象；工作台创建的对象对外部不可见、不可控，除非以后另行设计委托（本轮不做）。工作台可看到并关闭所有对象（含外部所建，标明来源）。
2. **每次调用都重验当前主机授权**（task02 的 `toolResourceIds`/主机授权，含跳板）。撤销主机后，该主体在该主机上的对象的后续调用、流读取、作业回读一律拒绝，并尽快释放（关闭 PTY、停止转发、取消传输）。
3. **交互终端的工具合同**：`ssh.shells.open` 返回 shellId；新增或改造为 `write`（输入字节，有界）、`read`（基于游标的输出增量，有界、可等待短时长）、`resize`、`close`；不依赖桌面 WS。同类做法用于 exec 输出。
4. **文件**：去掉 Engine 本机任意路径。`ssh.sftp.upload/download` 改为内容字节（有界，base64）或引用调用方的受限句柄；需要大文件时沿用 `ssh.transfers.*` 远端↔远端或分块读写，不接受 Engine localPath。`ssh.fileSessions.localList` 外部变体保持关闭并写明（Engine 本机目录不属于外部主体），这是唯一允许的关闭类别：**Engine 本机文件系统访问**。
5. **网络代理/转发**：外部可启动转发，但监听只绑定回环、端口由 Engine 分配或在允许范围内，记录 owner，撤销即停。
6. **待处理交互**：hostKey.decide、键盘交互认证、传输冲突 decide 只对本主体自己的 attempt/作业有效。`ssh.knownHosts.forget` 作为 admin/high 可选开放：仅限授权主机的精确指纹。
7. **监控**：`ssh.monitor.tools.read` 等主动执行远端命令的项标 execute/high，可选开放；外部订阅为本主体独立订阅，不续租工作台分栏。
8. **全部 `exposable: true`、`defaultExposed: false`**，scope/risk 按 t19 计划列；持久写/执行项要求稳定意图键，领域对账沿用 task03 的 `host-intents.ts` 与 `OperationReceipts`。回执中不得持久化输出正文、凭据或文件内容。
9. 工作台现有行为不变（桌面 WS 终端、文件面板等）；外部所建对象在工作台可见并可关闭。

## 职责边界（AGENTS.md「实施者职责边界」，强制）

- 只写业务代码、对应单测与 E2E spec；只跑改动涉及的单个 vitest 文件，不调高并发。每次改完 ssh 源码后跑 `pnpm exec tsc --noEmit -p plugins/ssh`（单包类型检查允许，前一轮有类型错误漏到集成）。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/lint/knip/format:check、启动 Playwright/Electron/xvfb、截图。E2E 只写不跑。写报告用带引号 heredoc。
- 可写范围：`plugins/ssh/**`、对应测试、`tests/e2e/ssh/**`；`apps/engine/src/boot.ts` 仅最少装配行（单列）；SSH 工作台 UI 中“外部所建对象”标识与关闭（先执行 zh-modern-web-guidance search/retrieve）。禁止改 Kernel dispatcher/server/MCP/contracts 调用身份、其他插件、Vault 包收集器、根锁文件。回环 SSH 夹具，不连真实主机、不用真实凭据。不 push，不启动子 agent。

## 验收（spec 与单测须覆盖）

CLI 与 HTTP MCP 各一遍：默认关→开→撤；主体 A 打开的 shell/传输/转发对主体 B 不可见；撤主机后旧 shell 写入与 read 被拒且 PTY 关闭；同意图重交不重复执行；C05 恢复后只读回执、写入 unknown 不重放；Engine localPath 输入一律拒绝；输出与回执不含秘密。

## 产物

链式候选提交（临时索引，父 `00d644d3`），每组一批，报告逐批追加 SHA 与逐 ID 更新，不逐批停下；全部完成或上下文超过 80% 时发布 `report05.md` 终稿、打印路径并停下。证据追加 `G-ssh-exposure-linux.md`。
