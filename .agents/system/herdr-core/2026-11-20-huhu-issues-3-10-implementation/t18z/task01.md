# #5 E07 与 #6 G5b.2 外部可调用的终端规则边界

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18z`
- 当前工作目录 integration（只读，Lead 仍提交及跑测试）
- 本任务只写报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18z/report01.md`

以 #5 source.md 第 467/598 行、T6.3b 和 #6 G5b.2、spec/design 为当前需求，以旧 archive security.md 和当前 Dispatcher 作为现有实现约束。独立梳理 E07 所需可授权的 CLI/MCP 操作、条件事务、回包丢失幂等和启停生命周期。尤其确认哪些能力可用已有管理员对具体规则版本的批准及 #6 显式暴露实现，哪些不应开放任意命令、进程能力或明文读取。分析复用点（现有 gateway、module credential 定义、PowerShell launcher broker、scheduler run 事实、规则版本、Python/Claude runner 禁用边界），提出一个最小、可按现有 Purpose 正实测的设计及所需观测。只读项目文件，不修改工作树或跑会改输出的构建，不发送远端，不委派。最后指出哪些为现有验收、哪些仍属推断。
