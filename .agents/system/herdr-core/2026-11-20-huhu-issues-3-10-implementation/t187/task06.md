# 复验批准终端规则的四个修复和生产 CLI

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t187`
- 只读组合候选 `3f479b899d67000d26ba95f0f069a39aa86569df` 为准。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report06.md`

复核 report04 的四项改动，重点核对 9198c349 和 3f479b89 实际差异以及 Windows 边界，检查 815d9917 的生产 CLI 文件输入、出错回显和测试覆盖。优先核实其他调用方的兼容、批准撤回、待核对退出、旧配置恢复与清理义务不丢。正在使用 task-cutover 的 t18v 后续只写 SSH，此评估可以只读固定 Git 对象和已有证据；额外测试隔离。不写业务文件、其他机器或额外工作树。报告每项签收或确切可复查的问题。
