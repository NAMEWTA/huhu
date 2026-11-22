# #7 H9 SSH 监控，以及移除个人保险箱的旧凭据通路
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t18v
task task10.md
report t18v/report10.md

基线 4563a422，独立工作树 D:/Document/code/huhu/temp/issue-worktrees/task-cutover，分支 impl/huhu-issues-3-10-ssh-monitoring。按已确认的 #7 change/spec/H9.1-3 和 #9 P10.2。先切换 SSH 运行时剩余的 secretUse/safe:// 旧入口，使用现有 HostConfigurations 与所有者认证。兼容数据仅可靠标记需要修复，避免删除任何旧凭据和生产材料。限定可写 plugins/ssh、关联证据，若公共 Engine 测试或 manifest 需修改在报告给出精确点。下一切片实施 H9.1/H9.2 的绑定连接样本、前后台暂停、能力/缺失与重接、按连接隔离，并复用 Motty 固定源码。若时间允许推进 H9.3 的普通只读状态，复用受限的已知命令，不添加任意执行或远端测试。HTML/CSS/客户端 TS 先按仓库做 MWG search+retrieve。用当前本机 Windows 授权回环 SSH 合成测试，真实数据与非回环远端保留隔离。阶段性提交并写 report10.md。
