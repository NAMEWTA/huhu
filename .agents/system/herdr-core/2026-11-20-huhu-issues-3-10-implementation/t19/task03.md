# task03.md #4 W6.0 消费 ID 的 UTF-8 往返

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t19
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t19`
- 当前任务 — task03.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task03.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report03.md
- Lead 收件 — 回告终稿绝对路径，由外部 Lead 收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/receipt

## 目标与验收

以实际候选 9a8225f10937661882efbb4ce3067dd82cf53d7c 继续。独立复审 t20/report02.md 再现孤立 UTF-16 代理码元被 UTF-8 编码成替代字符，导致同一评论重交失去去重。补齐运行时及导出的消费记录 Schema，支持合法 Unicode 字符；如果选择稳定的 ASCII ID 语法，则先验证既有生产 ID 与已接受样例的约束。保全 v1 指纹和原生问题 Schema。增加真实字节写入/回读后重交的回归。

## 读写与交付

仅改 packages/contracts 下 W6.0 Schema 和回执夹具/测试。按 dev-build/dev-verify 保存候选提交、实际命令和 UTF-8 对照。

读取项目当前规格、计划、原型确认记录及直接调用方。保护原工作区、真实 Vault 和 Agent 历史。用隔离测试数据与正常入口验证。禁止远端写入与自行派遣。使用 Core 文件协议核对 topic、active 指针和准确报告位置，报告非覆盖发布后回告绝对路径。
