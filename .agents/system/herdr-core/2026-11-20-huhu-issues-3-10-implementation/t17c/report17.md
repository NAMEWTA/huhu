# t17c · #8 Mail OAuth 独立审查返修

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task17.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task17.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report17.md`
- 执行结果 — `done`

## 提交

分支 `impl/huhu-issues-3-10-mail-oauth-review`，检出 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，父基线 `7170a7b55b8d26a9b6f73700cef0167965ceb393`。提交范围为 Mail 插件和 #8 验收证据。工作树干净，根锁文件 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。

| 提交 | 交付 |
| --- | --- |
| `cfd76b9c4586102d777505d15edccd644bec96fc` | 有效回调接收后的 `finishing` 由交换和凭据事务确定终态。浏览器 ACK 失败只会结束仍在等待回调的会话 |
| `1fd570c75f02612ce26164946e826f3926fd1d4a` | 受信主体的查询和取消隔离，保留当前 Vault 桌面管理员权限。发起和取消使用 handler 幂等，由本机请求回执返回实时或过期状态 |
| `d7f1cff235893b5d1d3df6ca5511c419fd40ec62` | 四项 OAuth 静态 descriptors、Mail manifest、Engine 导出，以及停用、重启、再启用的目录回归 |

## Windows 验收

| 审查项 | 观察结果 |
| --- | --- |
| 浏览器 ACK 与回调竞争 | 基线定向回归实际从 `finishing` 错转为 `failed`。返修后先接受有效回调，再让浏览器 ACK 拒绝且交换仍暂停，保持 `finishing`，同邮箱新请求受阻。释放交换后实际交换及邮箱记录各一次，原键重交仍为已配置的原会话。浏览器先拒绝时得到 `browser-unavailable`，迟到回调不会交换 |
| 不同服务令牌与桌面 | 两个真实回环 HTTP 令牌 A、B 使用同键建立各自的会话。B 对 A 的 status 和 cancel 均得到 `NOT_FOUND`，请求自报 subject 无效。桌面能查看两者和取消其中一条 |
| 回执丢失、取消与换代 | 代理在真实 API 已回包后断开下游，重交得到原状态并总共只打开一次浏览器。原键变更输入得到 `IDEMPOTENCY_MISMATCH`。取消在挂起交换时先返回 `finishing`，停止后同键返回 `cancelled`。切到另一个 Vault 时旧会话不可见且旧令牌拒绝。重开原 Vault、或在原 Engine 停启 Mail，原键返回相同 ID 加 `expired`，浏览器调用数不增加。并发同键也只启动一次 |
| 功能目录 | 带 scope、描述、schema 和风险的四项能力默认关闭。停用后仍在 `includeInactive` 目录，可保存开放选择。停用重启后保留选择，服务令牌仍发现不到。恢复后发现并调用成功 |
| 私有材料和既有路径 | 本机 `mail-oauth-intents.ndjson` 记录摘要和 UUID。检查未见原键、邮箱、受信主体 ID、服务令牌、授权码、state 或 nonce。既有 Google／Microsoft OAuth、Gmail 分页与恢复、Outlook Exchange IMAP 和合成 SMTP 均通过 |

Windows Node `v24.21.0`。Mail 全量 11 个文件、49 项通过。Mail TypeScript、改动文件格式和 lint、提交差异检查通过。仅使用隔离 Windows Vault、合成授权、回环 HTTP、IMAP 和 SMTP。 [可复验步骤](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S3-S4-oauth-session-review.md)

## Lead 装配

在 `apps/engine/src/boot.ts` 的现有 Mail 静态声明中追加这一组，位置在 Vault 打开和插件激活之前。四项动态 handler 用同一 descriptor 绑定，正式 Engine 启动需配套此声明。当前测试启动夹具只补该声明，目录、授权、HTTP 与插件启停均走真实 Engine。

```ts
registry.declareDescriptors("mail", [
  mail.mailAccountsListDescriptor,
  mail.mailRefreshDescriptor,
  mail.mailLatestMessageDescriptor,
  mail.mailMessageSourceDescriptor,
  ...Object.values(mail.mailOAuthCapabilityDescriptors),
]);
```

只读比较集成提交 `95b7352c2ad220d54f57670d1fddf2025dde4986` 与本切片，无重叠文件或文本冲突。公共 Engine、Main、共享 caller 和环境隔离由 Lead 装配并联验。新版防重从原键首次经新版 handler 受理开始。旧通用回执缺少可核验的 HTTP token 主体，新版没有迁移该试运行数据。打包桌面启动与在线授权未在本切片运行。
