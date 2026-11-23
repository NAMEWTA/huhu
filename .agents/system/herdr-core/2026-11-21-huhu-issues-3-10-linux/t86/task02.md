# 修复原生启动丢回包后的原尝试恢复
身份 wta-ubuntu / t86，Lead t3p，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration；收到正式 hc send 后开始。原 task01 候选 d0f50bbb 已保存，报告保留；先读 t8t/report01.md（独立分析已由 Lead 接收）、本任务及最新代码。使用 dev-build/dev-debug，疑难结论以真实代码和探针为准。

目标：保留 apps/cli/test/approved-terminal.test.ts:183 短断恢复后的 succeeded 断言，原 run/session/request/attempt 身份稳定，外层只建一次、内层实际执行一次，不保存秘密、不凭 host 存在误判业务成功。

采用 t8t 建议方向：
- SessionsService 持有原 broker 的有限生命周期，初次 unknown 返回后同一原尝试可继续只读快照核验，在原超时窗口内只向同代唯一 live 原 host 交付。无并发双交付，无重新 terminal.run。后台操作受当前 Vault/插件生命周期和取消约束。
- Automations 提供进程内一次性领取回调和非秘密计划，不保留 Object.fromEntries(values) 副本或旧 Map 超出 lease。真正交付时重验原 owner、工具开放、grant、规则/Space/目标、配置修订与名字，在 store.use 的该次 lease 内 await broker 提交。等待期间不能持规则队列锁；撤权/轮换先发生则不执行。
- 接通运行取消与后台结束：runAbort 不提前丢失，不让定时 reconcile 永久跳过；明确完成后触发 settle/原记录结算，取消/关闭后无迟到复活。
- 新 receipt 阶段明确等待宿主与开始写私有帧；写前先原子保存交付边界及绑定。旧 pending/已开始交付但无 RUNNING 都保持 unknown，不推断没执行。已证明未交付且 Engine 结束或过期时，保留原 attempt 的未启动结果，不用清空 attempt 的 confirmNotCreated。按身份回收外层且保留清理待办。已 started 则按原绑定对账退出结果。
- 保留一般原生遮蔽约定；外部规则输出契约为 ***，可在私有 masker 按批准规则选择替换文本，不能全局替换用户输出中的字面 [REDACTED]。

允许写 plugins/agent-cli/**（除 engine/index.ts）、native/agent-pty/**、plugins/automations/src/engine/{service,terminal-environment}.ts、plugins/automations/test/service.test.ts、apps/cli/test/approved-terminal.test.ts 和对应新增/已有 Linux E2E。Lead 已/将合入 t8k 撤销修复，此后这些 Automations 文件由你独占；保留它们。禁止改 Mail、其他前端/工作流、根锁、共享公开 contracts、桌面/Engine装配和 SSH。私有 agentProtectedTerminal 包装 engine/index.ts 仍 Lead 单写，需要调整先报告。

保留原 CLI 故障注入，增加隔离命令计数：解除故障前0，恢复和同意图重交/重开后1；分开证明已 started 后丢返回可恢复、消费后没持久 RUNNING 必须 unknown。对关键阶段写帧前/后、消费后/started后重启、到期/取消、撤权/轮换、空/多匹配/代次变化补低成本定向回归，不用改 expected 规避故障。

Worker 只跑单个相关 Vitest 文件；Core/socket EPERM 直接交 Lead，不反复试；不 Go构建/E2E/全仓检查/打包/推送/子代理。按需定向格式化。完成原子发布 report02.md，明确当前已测/未测、生命周期和证据；hc send t3p 回告，锁失败留共享报告。此任务是实际功能修复，不能只改测试或把成功降为 unknown。
