# Linux 原生受保护启动丢回包的语义诊断
身份 wta-ubuntu / t8t，Lead t3p，读 integration 当前工作树，不改业务文件、不派子代理；只写本目录 report01.md。使用 dev-debug/architecture 分析，模型 astra/high。
目标不是收窄验收，而是确定 Linux 已批准 shell 在真实 Core 创建回包丢失时怎样恢复原请求且不重复物理执行。源目标 #4/#5 spec/design，t86 原生实现中（请勿修改）；见 t86/task01.md/integration-notes.md、t4x/report13.md。SSH 暂停不在范围。
证据：Lead linux-pty-build.log、linux-pty-live.log 通过；sessions 31/31、scoped Agent/E2E tsc 通过；真实 apps/cli/test/approved-terminal.test.ts 在 :183 失败（linux-approved-live.log）。第一次 terminal.run 实际成功但返回丢失，terminal.list 暂不可用，解除故障后原 run 永久 unknown。SessionsService.launchNative 未能核验 host 则 finally broker.revoke；后续 findLaunch 仅对账不会提供尚未消费的凭据。现有 Windows private launch 与 Linux 原生路径是否语义不同需核对。
请跟踪真实执行/票据阶段、任务要求和直接调用方，判断测试是否把 host 创建误当命令执行，以及产品缺口为何。提出可实施方案，覆盖活 Engine 短断与 Engine 重启后结果，保证不把凭据持久化或写 Core、同意图不重复命令、不误报成功。优先既有状态/回执机制，禁止为过测试删断言或降成无保护路径。给 t86 可直接使用的修复建议与关键回归，必要时说明哪个测试的故障注入位置应移动并保留原边界覆盖。
只读分析，不跑重型验证，若需探针仅隔离本地。报告区分已确认与假设，完成回告 t3p；HC锁不可用则共享报告即可。
