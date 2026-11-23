# 保存未知草稿重开与延迟外部通知红灯
Lead t3p，worker t13b，agent-linux。t14x85绿/types绿，t14y确认前两P2关闭，发现新增P2/P3，读取 temp/final-audit/t14y-report01.md。
本轮仅补最低必要单测/直接相关E2E，不改生产不运行验证。范围 notes document-session.test.ts、现有draft相关测试及session-flush.spec.ts。
1 真实未知写超时后X草稿已落盘，旧A写仍挂起；新会话重开读X+draftX，不得删恢复副本；旧A提交后再重开仍能恢复X。保留普通等同正文草稿清理正例，不通过全局禁清稿代替语义。
2 档案字段update成功，read已取样F但未回包；外部写B通知抵达，放F后不能永久saved F；结算后显示B或本地改动时形成正确冲突，确保不覆写缓冲。使用现有门控，不新建基础设施。
报告 temp/final-audit/t13b-red09-ready.md，精确 -t 筛选/预期失败/未运行验证，不派代理不发消息。Lead先跑红，再决定最小持久化未知标记及延后核对方案。
