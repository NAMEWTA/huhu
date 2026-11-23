# task01.md #7 H5.3 会话录制回放

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t4x/task01.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report01.md`
- Lead — `t3p`，终稿发布后回告路径
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-recording-playback`，基线 `690e90978b6a012cead9f6bdd47ed93f13b65550`

## 目标和依据

按 #7 `tasks/H5.3-terminal-history.md` 实现显式停止后的会话录制播放。用户选中一份录制后可按捕获顺序与时间定位、播放和暂停，切换录制后保留各自内容边界。验证多字节字符、停止点、另一会话不串读。保留已有会话筛选、搜索、高亮和链接。兼容当前已写入的纯文本录制，无法恢复时间时仍可读原内容。回放仅显示捕获的已有输出，不写入真实终端，也不执行控制字符或 HTML。新时间记录与已有字节/磁盘保留限制相容。

先读确认的 #7 原型与 `prototype-review.md` 的日志覆盖，以及 Huhu 的 `TerminalRecordings`。复用项目现有 UI 组件和服务，参考 `/home/wta/projects/huhu/temp/sources/motty` v0.4.12 的日志与事件时间实现。涉及前端先完成 `zh-modern-web-guidance` 的 search 和 retrieve。报告引用实际使用的指南与上游文件、提交、许可证和改动。上游/NOTICE 共享台账由 Lead 写入。

## 读写范围与验证

- 可写 `plugins/ssh/src/{engine/terminal-recordings.ts,shared/recordings.ts,ui/TerminalRecordings.tsx,ui/ssh.css}`、一个直接相关的 SSH Vitest 文件、`tests/e2e/ssh/remaining.spec.ts` 的本切片用例。共享描述符登记、Engine/Renderer 装配、Vault 包、根锁文件与其它业务一律只读。
- 在工作树留下源码和测试 diff，不提交到共享 Git。报告给出已改文件、对应验收场景和实际测试结果。只运行一个直接相关的 Vitest 文件，Node 24.21.0，pnpm 12.10.1。E2E 只写不跑，列出文件与用例名。全量测试、构建、打包、全仓门禁和截图由 Lead 收尾。使用回环夹具和非敏感样例，不接真实主机、真实凭据、Vault 或 Agent 历史。
- 不派发子 agent、不写远端。按 Core 协作协议核对实际终端、topic、manifest 和同号报告。写终稿和同目录临时稿，保留协作文件中其他人的内容。

## Lead 验收

由 Lead 复核后填写。
