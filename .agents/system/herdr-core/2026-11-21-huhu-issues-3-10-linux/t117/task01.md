# Graph 第二轮独审收口
Lead t3p / worker t117，agent-linux基线4ae7e7e4，readonly。读AGENTS/dev-review，../t10w/report01.md、../t10x/report01.md和任务，静态复核 plugins/mail 当前差异是否关闭上轮4P2/1P3。特别核对Inbox reconciliation是否真的补回201后删最新、同ID矛盾目录移回；有界分页失败不推进cursor；取消在actualbeforeCommit前同步abort；降权retry只明确token拒绝、不重试网络unknown；403文案不误判。防止全量Inbox覆盖当前delta的目录/已读仍造成新bug。不要为了审查制造额外产品范围。
只写temp/final-audit/t117-report01.md，不改生产/测试，不执行测试/tsc/E2E/build/GUI/安装，不派子代理，不提交。Lead串行验证。完成终端回复无需hc send。
