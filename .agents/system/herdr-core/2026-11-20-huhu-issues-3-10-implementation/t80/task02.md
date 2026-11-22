# #4 W6.1 持久派遣与 Agent 输入归属

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t80
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t80
- 当前任务 — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t80/report02.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/receipt，分支 impl/huhu-issues-3-10-receipt，冻结父 `db0a562fd7c15a031509e7ac1477228de5e4bfd3`。

按 dev-build/dev-verify 核对 W6.1 与 W6.0、W1.2、#5 T1.2 冻结 `6b43fce` 的 TaskDispatchExecutor。实现 Agent CLI 私有目标、请求身份及输入持久归属底层，至少支持有真实证据的目标，能力不完全时在清单明确原因。针对同 dispatchId 重传、异内容、两任务与人工竞争、跨 Vault、地址/代次变化，对真实锁定 Core 和合成 provider 验证。区分 Agent 已受理、Core 已写入及 provider 证据，命令行退出、屏幕启发式或丢回包不能当业务成功。先在现有代码和本地 ORCA/Core 查复用，使用受信插件调用边界，真实 CLI 数据仅合成临时环境。若生产执行器必须依赖未提供的 provider 特性，报告测试覆盖、缺口和后续接线。

可写 Agent CLI 私有 engine、test、manifest。公共 contracts、全局注册、Engine/Renderer、Vault 包收集、根锁由 Lead 持有。该辅助工作树已有 pnpm 工具生成的锁差异，先将补丁留存到隔离证据目录，确认无其他差异后恢复本工作树的冻结锁，勿动原根或集成根。只在 Windows，禁止远端写入、增开 worktree、自行派遣、真实 Agent 历史和请求。精确候选、实测日志及关闭已完成命令 pane。
# W1.2 复核补充

继续前请读 `../t54/report04.md`。真实 Core 独立复核确认，会话 JSON 截断后同一请求启动第二个进程（P1），并发现缺生命周期状态可绑定，以及原 junction 丢失使同字面已发送请求失去对账入口。先修 W1.2 去重和异常证据，保留可核实的原意图和解析事实。仅在能证明旧请求已经消费或无需重发时推进 W6.1 new 分支。按可拆独立提交证据分别报告，真实 Core 不支持的 provider ACK 保持待核实。
