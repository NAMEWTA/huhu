# task26 Graph 已确认新信待通知
Lead t3p；worker t176；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
Task25冻结，Lead已启动真实Core全文件绿灯。回到Mail三文件独占：plugins/mail/src/engine/graph-mail.ts、message-cache.ts、plugins/mail/test/oauth-engine.test.ts。
读取 temp/final-audit/t194-task12-final.md 及其反例脚本（若未写就按报告）。关闭两项：列表先到的较早新信保留正文时首次delta确认漏报；首次delta因满窗淘汰后再可定位的新信被observed压掉。旧信移回仍不重复通知，用户规则不变。复用已有pendingNotices等状态，区分已观察身份与尚未消费通知事实，勿新增泛化基础设施。必须跨重启保留，首扫/已读/移出/已通知语义不回退。
先扩展原单文件真实Engine回归并通知Lead红灯，生产先不动；Lead确认后实施。单文件测试允许，若loopback EPERM交Lead，不提高权限。禁止E2E/build/全仓检查/git/新agent。
报告 temp/final-audit/t176-task26-final.md；明确冻结hash和未运行验证。task25两文件勿再改。
