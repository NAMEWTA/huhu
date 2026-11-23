# 在途写入自动入口两项红灯
Lead t3p，worker t13b，agent-linux。t14j-report01.md 原三项关闭但两项新P2，请先仅补失败回归，不改生产。
范围 plugins/notes/test/document-session.test.ts、tests/e2e/knowledge/session-flush.spec.ts。
1 A 实际落盘但错误回执后对账 read 在途，buffer撤销到X。调用真实 notifyExternalChange 触发入口，不能load覆盖X，退出留X草稿。区别已有显式load主动放弃。
2 A回执/对账待定但buffer==旧savedText，应被 useDocumentSession 的 hasUnsaved/切Vault参与者捕获。单测覆盖待定过程snapshot及keepDraft落盘。补两个文档的切Vault UI 用例：另一普通脏文档存在时待定文档也留草稿，重开回读X。
不削弱已有65项，不重复搭设施；只写不运行不派代理不发送消息，生产保持现状。完成写 temp/final-audit/t13b-red07-ready.md。Lead另安排疑难分析统一在途写入不变量，不由你此阶段逐点patch。
