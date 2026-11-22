# #4 停用及重启期间隔离两代 Agent CLI

- 终端 `t12d`，写同目录 `report01.md`。唯一可写业务检出 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-agent-lifecycle`，父 `4fe97901d7952709f1371432bb0327ef0bdaf958`。四个 Git worktree 已满。仅 Windows、锁定 Core 0.1.19 和合成 provider、Vault。集成、原根、其他分工及远端只读。禁止实际 provider 登录、真实历史或发给外部服务。
- 先读 `../t4z/report08.md` 两个 P1、该目录 `evidence-task08` 探针，以及 `../t80/report02.md`。真实 Dispatcher + Core 正常重启旧启动请求能覆盖新绑定；受控延迟使已停用的旧 W6.1 handler 仍发送一条正文。按实际 PluginManager 生命周期和 ScopedPlugin 约定复用现有取消信号与单写者边界。
- W1.2 对同一可写 Vault 的多代服务，持久请求、attempt 领取和 Core 发起/返回都必须在有效作用域或相同持久身份下核验。停用再启用的旧 handler 不能继续写 attempt 或覆盖已核实绑定。已越过 Core send 边界的请求保留原意图，重开仅对账。普通同键并发、丢回包、缺失记录/Junction、可证明未发送的继续发起与原有用户动作需保留。优先解耦 W1.2 修复：若能建立同一工作树内的独立候选 commit 或补丁组，让 Lead 在不启用 W6.1 前复验。
- W6.1 停用时撤回等待中的发送权并停止 reopen；明确区分尚未发、已写但未知和 provider 受理。复验切换过程中重传与并发任务/人工/评审，停用前未发送为零，之前发出的原操作无重复。不要扩大到 Tasks 装配、生产 provider 私有历史、桌面或界面。请为两个问题分别做真实 Core 红绿验证，确认旧范围完成后真实 Pod/child 清理，并保存冻结测试的日志和各提交 SHA。
- 可写 `plugins/agent-cli` 和本任务报告。共享 contracts、Engine、上游锁与插件全局权限由 Lead 持有。完成后关闭本次测试窗格。
