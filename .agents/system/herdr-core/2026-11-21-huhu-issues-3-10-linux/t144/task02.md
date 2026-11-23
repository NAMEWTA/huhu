# 修复 Mail 已复现三项 P2 与界面刷新 P3
Lead t3p，worker t144。工作目录 agent-linux。从 task01 单执行者接续，原尚未完成的 P3 E2E 一并在本任务完成，不重复派发。task01 报告已保存并注明 E2E 仍在编写。
Lead t14d 已证明 tombstone 裁剪漏补位与 verification 预算重启重复；修正只读配置前置断言后，t14f 已证明发送授权撤销后仍有1次 /sendMail POST，not-delivered断言失败。日志 temp/final-audit/mail-boundaries-red.log、mail-send-boundary-red.log。
请按 t142-report01.md 的三项 P2 一项 P3 完成最小生产修复，保留原正常行为与红灯断言。可写 plugins/mail/src/engine/graph-mail.ts、graph-send.ts、message-cache.ts、accounts.ts、outbox.ts，以及必要的 MailModule.tsx、已负责的 OAuth test/Graph fixture/mail E2E。若需其他文件先报告理由不要越界。
要求：缓存补位按有效邮件计数且删除证据不能裁剪后被当有效；核实阶段有可持久续跑进度，预算及重启不重查已完成部分，取消/错误不发布不完整终态；MIME 构建后第一次 POST 前按当前账号修订/发信授权再核对，未发则持久 not-delivered，已POST丢ACK仍unknown不重投；自身OAuth降权事件不可让手动刷新静默取消，真实切换/关闭仍取消。S5.2通知产品口径仍待答复，本任务不擅改。
复用现有实现和指南，不造新框架；禁止重型验证/任何验证，由Lead执行；不派代理不发消息。完成写 temp/final-audit/t144-report02.md，列改动、对应测试、未运行验证及尚未处理问题。
