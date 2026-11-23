# 修复 Mail 重授权恢复边界
Lead t3p，worker t144，agent-linux。task03 红灯已由 t14z 证实2 failed /7 skipped；日志 temp/final-audit/mail-recovery-red.log。按 t14s-report01.md 修复两项P3及已写E2E。
范围 Mail业务/对应单测E2E。使用现有同步作业/账号版本/取消机制：真实重授权改变邮箱路径后旧Graph作业退出，新revision刷新不合流旧任务；本次作业自身续期不能自取消。首次POST门禁若因发送关闭则记录现有 graph-send-permission 原因；UI依据当前账号能力停用不可用重试，恢复后保留原收件人资格。其他网络/权限错误不可误标，已POSTunknown不能改明确失败或自动重投。
不改S5.2口径、不新建协议框架、不改Notes/EngineClient/SSH。前端指南复用 /tmp/mwg-guide-3235787-1795365728802.md。只实施不运行测试/typecheck/E2E/构建，不派代理不发消息。报告 temp/final-audit/t144-report04.md，列改动、守卫、未运行验证。Lead串行验证。
