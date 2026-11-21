# #8 S3.1/S4.1 Google 与 Microsoft 邮箱授权
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t17c
task task15.md
report t17c/report15.md

基线 4f301953，独立工作树 D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle，分支 impl/huhu-issues-3-10-mail-oauth。所有原型已确认，直接按 #8 spec/design 与 tasks/S3.1-google-consent.md、S4.1-microsoft-consent.md，复用 Huhu module credentials、已存在的可信浏览器宿主和 one-mail 固定源码，实际使用最新官方 Google/Microsoft 资料。HTML/CSS/客户端 TS 先按 AGENTS 做 MWG search+retrieve。可写仅 plugins/mail 及 #8 验收证据，不改公共 Engine/Renderer 安装与锁文件。用于装配的最小接口、配置、默认未配置状态和权限反馈留在报告，由 Lead 实现公共入口；Lead 正在接前次报告的通知。

Windows 测试仅隔离 Vault、回环测试发行方、合成账号/凭据，不申请注册客户端、不向真实邮箱发消息，不访问任何远端测试机。用可操作入口验证 state/PKCE、请求绑定 Vault/账号及重放、取消和迟到回调、地址匹配、持久化 token 轮换与并发刷新、微软 IMAP 与 Graph 实际权限区分。优先完成配置真实客户端时可运行的默认 IMAP 及 SMTP 认证。额外 Graph consent 未单独确认，按 S4.1 走已有可用范围及真实限制说明。禁止以合成默认替代正式配置。若依赖安装受限，沿用真实工作树已有依赖，记录用例和适用边界。阶段提交后写 report15 并反馈。
