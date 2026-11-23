# Mail 两项恢复缺口关闭复核
Lead t3p，worker t152，agent-linux，sol/xhigh。只读dev-review两轴，不写业务代码、不运行验证、不派代理不发消息。
输入 temp/final-audit/t14s-report01.md 两项P3、t144-report04.md；修前t14z两红，修后t151 OAuth9+Outbox20共29绿；当前事件id窄化类型错误由t144修正中，除此之外生产交回。
范围 Mail task04 实际 diff（message-cache账号路径取消与作业合流、accounts首次POST门禁、outbox原因、MailOutbox/调用者当前发信能力）及新E2E。检查原两P3关闭和本次直接副作用，保留自身续期正例、unknown不重投、恢复后原收件人重试资格。不扩展为无界全模块重审；真实缺陷需触发/用户影响/源码证据。
事件订阅由kernel/context插件作用域管理，Lead已确认，不误报未退订。S5.2待用户语义决定，非本轮擅改。SSH暂停。报告 temp/final-audit/t152-report01.md，分别记录原项结论、真实新发现、规范轴和未运行E2E。新包未构建，不签GUI。
