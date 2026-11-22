# task15 · #7 H11.2 已授权 SSH 作业、输出游标与取消

基线任务14 HEAD be7a8b8e，原 task-cutover 隔离工作树，可从该提交创建独立实现分支。只写 SSH 领域、SSH 定向测试与证据，Engine/Gateway 由 Lead。先读 H11.2/H11.3、#7 §12 A13 A16 与 #6 G5c。复用任务14 主体/路由/指纹与实际 SSH 会话、现有 Exec 通道及资源所有者。优先交一条单独授权、默认关闭、可实证的 Exec 作业链，返回稳定 jobId、明确生命周期、有界 UTF-8 字节输出与 cursor 跳过标记、真正退出理由和按原 job 取消。

保持 host / attempt / session / job 的独立标识及原来路由身份。新启动必须有当前启用授权且核对所指主机、路由版本和真实连接，不借用短命信任探针作为执行连接。不接受跨主体、错 Vault、过期版本或任意现有 Workbench 运行 ID。按真实 task 的重试语义记录同意图，本机底层接收超时显示待核实，不能自动重复执行。关闭观察不取消作业。只读目录和读取都不得拨号或通过状态偷带凭据，输出保留量有界，退出后恰当回收连接。按确切规格做出最多受支持范围，未完成的 Shell/SFTP 继续列实证。

Windows 使用已有回环隔离假 SSH 和合成输出，不用真实主机、凭据、ubuntu26 或远端 Git 写。如有 Windows 合成凭据资源，清理引用属于本任务测试的对象。至少核对同 jobId 重交、按字节段（含多字节中文）、并发、失败或撤权／错主体、取消与零重复。能走实际 CLI/MCP 同一入口时执行并分列证据。提交后写 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report15.md；更新所需装配。
