# 补齐既定 Mail S4.2 Graph 路径
Lead t3p；worker t10d；wta-ubuntu。共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux。
工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux；分支 impl/huhu-mail-graph-completion；基线 4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030。另一 integration 正在固定候选全量E2E，严禁改动它。
使用 dev-build/dev-tdd，先读 AGENTS、Mail change source/spec/design 与 tasks/S4.2-outlook-delta.md，批次 decisions-2026-11-21.md 第8项。必须复用现有Mail/Gmail/IMAP架构及 temp/sources/one-mail成熟实现，引用上游提交/文件/许可证。新的OAuth授权体验已延期，不新增Graph专属授权UI；已有合适Graph token的路径仍须实际支持，不能把所有Graph token拒绝后声称完成。
独审 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10b/report01.md 第3项已由Lead核实：oauth-provider.ts mailPermission和requestOAuthToken只允许Exchange，Graph Mail.ReadBasic受限正确但完整Mail.Read也wrong-resource，缺Graph生产同步、delta、正文路由。
目标：实现S4.2可执行闭环：Graph原生ID与deltaLink独立于IMAP UID；合适audience/scope才用Graph；Graph全权限与IMAP账号均能同步一封、读正文/附件并按实际路径回复（发送权限不足准确提示，不能凭读取权限发送）；分页全成功才推进cursor，下一页失败/失效/权限改变保留正确状态，切换传输不混用ID或游标；保留现有模块自有密钥、Safe独立、Outbox稳定认领和未知结果不重投合同。不得新增未经授权真实账号连接，只用回环协议夹具/合成token。默认仍Exchange IMAP/SMTP授权，不扩权限或私自加scope。若现有token注入缺入口，先核对已有配置与凭据接口，选择能被真实调用者使用且不制造孤立测试通道的最小方案，并记录设计依据。
可写 plugins/mail/**、其change evidence/tasks/S4.2-outlook-delta.md及上游账本中本项条目。如确需跨模块公共契约或根依赖/锁文件，先报告Lead具体需要，禁止私写。不得修改SSH、Agent、全局测试配置。可写对应E2E但只写不跑；前端若变更先modern guidance search/retrieve。
当前全量E2E占用重型验证资源：本任务先只写代码和测试，不启动测试/安装/build/typecheck/E2E。等Lead明确释放后最多单个相关Vitest文件。不要开启其他agent。不要扩大到所有剩余验收缺口。
提交自己的候选后报告变更、真实调用路径、未运行验证、上游依据与风险；报告写在本工作树 temp/final-audit/t10d-report01.md（共享目录超出sandbox，勿申请扩大权限），Lead收取到共享task目录。hc send t3p 回告报告路径和commit。若用户范围或已有合同不够，请给出具体冲突及最小待决点，继续可独立工作。
