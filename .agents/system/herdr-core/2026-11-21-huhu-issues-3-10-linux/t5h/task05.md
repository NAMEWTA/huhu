# #7 R04/R05 执行位置及中继方案

共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t5h。读取本任务，写 t5h/report05.md。代码只读，固定候选 f80be2f2，集成工作树 /home/wta/projects/huhu/temp/issue-worktrees/integration；不触碰工作树的在途 H4.3 内容。

按 dev-architecture 对照原 Issue R04/R05、H3.3、Motty 固定源及 Huhu outbound-proxy、routes、manager 的实际调用，给出最小 reuse 路径。分别厘清本机 ProxyCommand 和已经验证 SSH hop 的 ViaShell 运行位置、参数展开与 shell 解析、真实流的握手边界、取消/超时/清理、导入不执行、显式设备审批以及外部入口 fail closed。保留现有多跳权限、共享路由选择、原连接绑定、凭据与审计边界。提供分工、需要锁住的关键合同及仅用回环的可执行验收命令建议，代码由后续 Lead/实施者工作。仅报告，不运行构建、套件、E2E 或远端写入，不访问个人凭据和真实跳点。发布报告后告知 Lead。
