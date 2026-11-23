# Mail OAuth 独立审查返修验收

## 授权完成和重交

- 成功验证回调后进入 `finishing`。交换、签名核验及凭据事务确定终态。浏览器打开失败只会终结仍在等待回调的会话。请求回执在浏览器打开确认前可返回，监听器继续归属当前 Vault 会话。显式取消、过期和 Vault 卸载仍经同一生命周期收束。
- `begin` 和 `cancel` 采用 handler 幂等。将受信 caller 类别、subject 与本机 Vault 实例合成所有者摘要。调用主体来自已认证的 `CapabilityContext`，会话发起者和当前 Vault 的桌面管理员可查询和取消。
- 本机运行目录 `mail-oauth-intents.ndjson` 复用 `OperationReceipts`。先持久受理再开始监听或执行取消。记录原输入摘要、键摘要、所有者摘要及随机 UUID。发起回执的 UUID 同时作为会话 ID。当前进程重交返回实时状态，原会话在重启、重启用或回收后，同键得到 `expired`。取消同键只观察原操作，交换确认停止后从 `finishing` 变为 `cancelled`。

## Windows 验证

`plugins/mail/test/oauth-engine.test.ts` 经真实 Windows Engine、真实 ModuleCredentials、本地 issuer 与合成邮箱验证。回环 HTTP 服务令牌由现有 gateway 发行并重启回读。测试只配置本机合成 browser adapter、HTTP issuer 和 IMAP／SMTP 夹具。

| 场景 | 观察 |
| --- | --- |
| 回调先到，交换挂起时浏览器拒绝确认 | 返修前由 `finishing` 错转 `failed`。返修后保持 `finishing`，同邮箱不同键不能再发起，释放交换后配置一次，同键返回原会话 `configured` |
| 浏览器拒绝先到 | 状态 `failed/browser-unavailable`，迟到回调不被接受，交换计数未增加 |
| 上游已响应后丢掉一次 HTTP 回执 | 本地代理关闭下游连接，原发起者复用键取回同一在途会话。浏览器打开动作一次。同主体用原键提交不同邮箱得到 `IDEMPOTENCY_MISMATCH` |
| 两个真实 HTTP 服务令牌 | B 对 A 的 status、cancel 都得到 `NOT_FOUND`，请求自报 subject 不改变结果。B 可用同键发起本主体的不同会话。桌面可管理当前 Vault 两者 |
| 取消与交换竞争 | 首次取消及时报告 `finishing`，交换停止后同键报告 `cancelled`，账户未保存。同一取消键更换会话得到 `IDEMPOTENCY_MISMATCH` |
| 切换、重启、停用再启用 | 另一个 Vault 无会话且原 Vault 令牌拒绝。回原 Vault 后旧发起和取消键均返回同 ID `expired`。并发发起同键得到同一 ID 和一次浏览器打开，停启后迟到回调被拒绝，原键不会再打开浏览器 |
| 持久化检查 | 本机回执含会话 UUID，扫描未见原键、邮箱、主体 ID、服务令牌、授权码、state 或 nonce。公开账号与 Vault 文件继续通过合成 access／refresh token 明文检查 |

`plugins/mail/test/oauth-catalog.test.ts` 通过真实 Engine `/api/v1/call` 与 `/api/v1/capabilities` 验证四项静态描述。插件停用并重启后仍可查到 scope、描述和输入输出 schema，停用中可保存开放选择，恢复后服务令牌可发现并实际调用。默认对外关闭。验证使用 Mail 测试启动边界预声明导出的描述符，公共 Engine 的同一装配由 Lead 合入。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-mail' --maxWorkers=2 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit -p plugins/mail/tsconfig.json
```

本轮隔离测试还覆盖既有 Gmail 分页重连、Exchange IMAP 和 SMTP。已持久到通用 Dispatcher 缓存的旧版试运行请求缺少独立 subject，本机新版回执从首次经新 handler 受理开始生效。打包宿主、真实 OAuth 服务和公共环境隔离由另行联验覆盖。
