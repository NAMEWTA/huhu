# #8 独立审查返修 · OAuth 生命周期、授权主体与目录
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t17c
task task17.md
report t17c/report17.md

按 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bh/report01.md 的四项 Mail P2。以稍后派发时记录的已集成提交为基线，只动你的 agent-lifecycle worktree 中 plugins/mail 和 #8 验收证据；公共 Engine 引擎预声明和 Main 唯一写入者仍为 Lead。现有 OAuth 轮询、Gmail history、Exchange IMAP、独立说明源均需保留。

1. 保证已经接收有效回调的 finishing 以实际交换和凭据提交为权威，浏览器 ACK 丢失、失败不会把 finishing 覆盖成失败，也不能再次开始同一邮箱。模拟延迟和拒绝两种入口次序，复查一次保存。
2. 使用新 CapabilityContext 的受信 subject 与 idempotencyKey 隔离不同 HTTP 服务令牌，保留当前 Vault 的桌面管理员接续；ID 为相同 subject 而非 self-reported。为 begin/cancel 选择 handler 幂等，自管原意图。可复用新导出的 OperationReceipts 在当前 Vault 的本机 runtime 保存请求摘要与不含凭据的会话 ID。原 key 固定返回现态，无新浏览器；重启或换代后同 key 能观察明确过期结果，不能重开浏览器。取消在 finishing 时重交返回实际状态。测试多令牌真实回环 HTTP、丢 ACK 重交、切换和一次浏览器启动。
3. 统一定义四项 mail OAuth 静态 descriptors，补 manifest 与 Engine 可导入的导出。向 report 给出 Lead 装配片段。停用和已启用路径要能按真实目录验证。  
仅 Windows 回环/合成登录及测试数据。界面变更先执行 MWG，尽量把本次返修限制在后端。若某个细节不能可靠保证，保持明确未验证状态。分步提交和 report17.md。

派发基线 7170a7b55b8d26a9b6f73700cef0167965ceb393 · impl/huhu-issues-3-10-mail-oauth-review。
