# #8 S1a.3 切换邮箱与原账号认证修复

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17c`
- 独立工区 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 分支 — `impl/huhu-issues-3-10-mail-confirmed-ui`
- 基线 — `94dc30a5854375c26d23a3339f20decca980e407`
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report03.md`

按 S1a.3、spec 和已确认原型接上同一 Mail 工作台。复用当前多邮箱的消息定位、配置 revision、模块拥有的受保护认证和 IMAP 测试。两个合成邮箱切换后，显式选择原账号测试新认证，再以原账号 ID 和当前 revision 更新。失败、版本冲突、取消或晚响应不能覆盖原绑定、切到其他账号、复活旧 UI。能独立完整验收时推进本任务中的分组与窄窗返回。验证用项目已有隔离 Engine 和回环服务，固定 pnpm Windows。先做 Modern Web Guidance search/retrieve。仅改 plugins/mail、Mail 专用测试和相应证据。Lead 已注册组合邮件外壳并添加可选 ModuleProps.registerLeaveGuard，保持你当前分支原先签名，避免改共享注册、根锁。报告按文件协议提交，列明阻塞与剩余。

若 S1a.3 已交付且已有 S1a.4 可复用的版本化删除合同，先核对是否能完整保存可能已接受的投递证据，再决定是否在本任务推进明确验收的小切片。禁止使用任何真实邮箱、网络账号和用户 Vault。
