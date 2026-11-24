# S5.1／S5.2 IMAP 刷新、恢复与定位

核对了本地 one-mail 固定提交 `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 `src-tauri/src/mail/sync/imap.rs` 和 `src-tauri/src/background.rs`。沿用最近 200 封初扫窗口、FLAGS 对账、周期轮询、IDLE 唤醒和退避语义。Huhu 继续使用自己的 ImapFlow、Vault 缓存、账号凭据和工作台定位，未引入上游代码。

- 每页最多请求 25 封摘要。增量以已提交 UID 查找下一批，每轮最多 200 封，新正文逐封受 2 MiB 上限及整轮约 18 MiB 原文字节预算约束。缓存最多 200 封及 24 MiB 的 Base64 正文。重复轮次复核 FLAGS，正文尺寸未变化时复用已缓存字节。UIDVALIDITY 变化先提交空的新代并失效旧目录查询，其他目录缓存和游标独立。
- 同账号的目录刷新排队，同目录在途调用共用一个作业。取消一个等待者保留其他调用。最后一个等待者退出、移除账号、停用 Mail 或关闭 Vault 时取消底层连接。用户设置保存在 `.huhu/mail/sync-settings.json`，默认 15 分钟，`0` 关闭后台。支持 IDLE 的收件箱在完成对账后监听，最多两个连接，其他目录和掉线后的连接保留定时轮询。定时刷新失败从 5 秒开始退避。
- 初扫和换代补扫不发历史通知。新未读 INBOX 邮件缓存提交后交付通知，通知标题不含主题、地址或正文。通知 ID 绑定当前 Vault 位置和本地消息 ID。以相同 ID 重试未确认的投递，由工作台存储幂等。解析通知时重新校验当前账号、目录和 UID 代，再走搜索使用的 `mail.conversations.findMessage`。已撤销的目标提示不可用。

## 复验

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-mail' --maxWorkers=2 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit -p plugins/mail/tsconfig.json
```

`sync-engine.test.ts` 使用 Windows 临时 Vault、真实 Engine Dispatcher、合成 IMAP 账号与回环协议连接。通知阶段通过 Mail 的宿主参数接入真实 `NotificationStore`，时钟可控，协议及凭据路径照常执行。另有 Mail 路由用例覆盖同一 Vault ID 换 Engine 端点时丢弃迟到请求。

- 205 封首扫执行 8 次摘要分页和 200 次正文 PEEK，搜索可读到窗口首封 UID 6，首扫通知为零。重复刷新复核 FLAGS，正文 PEEK 仍为 200 次。
- 乱序增量 27 封，在第二封抓取时断线，已提交的 UID 205 保留。5 秒退避后恢复至 UID 232。仅新未读 UID 206 和 232 发送通知，两条都定位至正确账号、INBOX 和 UID 代。UID 233 的通知确认丢失后以同一 ID 补投，实际通知总数仍为 3 条。
- 三次并行调用共享一次 IMAP 选箱，一个等待者取消，其余成功。实际 IDLE 收到 EXISTS 后排下一次刷新，IDLE 连接断开后保持普通周期。换 UIDVALIDITY 后在新代正文返回前即可观察旧消息和通知目标已撤出；关闭并切换 Vault 后，旧 IMAP 作业没有重开。
- Mail 全项目 9 个文件、46 项通过。保护了普通原文、联系人公开投影、移除账号、转发源校验和 SMTP 既有回归。TypeScript、格式及 lint 通过。

## 工作台联验

Engine 将稳定 ID 交给站内 `NotificationStore`。桌面铃铛与健康中心把通知 ID 和当前 Engine 作用域交给 Mail，由 Mail 核对账号、目录和原邮件后定位。

Windows Electron 构建上运行 `pnpm exec playwright test tests/e2e/workflows/mail.spec.ts --workers 1`，四项通过。通过桌面 API 添加本机回环 IMAP 邮箱。首封消息初扫后没有通知，新到 UID 2 后额外刷新一次，铃铛仍只有一条通知。按 Enter 打开时弹层关闭，原信正文显示、定位高亮且读区取得焦点，通知成为已读。Engine 单测另覆盖端点变化和旧 UID 代失效。Google、Microsoft 的真实 OAuth 由各自切片取证。
