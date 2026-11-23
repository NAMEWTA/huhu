# task04：Graph 旧邮件移回收件箱不重复新信通知
Lead t3p；integration HEAD 5ea79f71。用户本轮明确选择：旧邮件从其他文件夹移回收件箱不再次通知，只更新收件箱。其他真实新邮件的通知、首扫不通知、持久游标和重开防重仍保留。
先读 .agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S5.2-new-mail-notice.md、spec.md 与现有 graph-mail.ts/message-cache.ts/oauth-engine.test.ts。复用现有arrivalWatermark/awaitingDelta及持久缓存机制，先证明失败；不得静默采用会吞合法新信的粗暴时间门槛，若现有身份/证据不足及时说明具体契约取舍。
写范围 plugins/mail/src/engine/graph-mail.ts、message-cache.ts、plugins/mail/test/oauth-engine.test.ts；需要其他文件先说明。只跑单个vitest文件及定向静态；不E2E/build/包/全仓/git写/启动agent。报告工作树 temp/final-audit/t197-task04-final.md，含红绿、真实路径、仍缺项。无需HC发送。
用户同时明确：没有其他平台、第二设备或线上测试账号，这些交给用户后续测试，不作为本轮交付阻塞。不要扩张授权到真实邮箱。
