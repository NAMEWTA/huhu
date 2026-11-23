# Graph协议返工独审
Lead t3p / worker t10w task01，agent-linux基线4ae，共享根本文件上两级。读AGENTS、dev-review、t10n/report01、t10q/report01与原任务。只读plugins/mail/**当前差异与新文件，核对三P1/三P2是否实际修复，重点opaque凭据可信资源绑定、Exchange默认路径及失败保留原账号、同Inbox链接/不透明tokenquery、分页与MIME待取有界续跑不丢合法窗口邮件、beforeCommit真正跨代/取消屏障、刷新权限事件与Outbox未知结果不重发。判断实现边界是否符合原规格，不靠用例描述推通过；检查新增测试确实触发相应时序。需要协议事实查官方文档。只报告真实问题，区分代码缺陷与必须实跑才能知道的风险。
禁止运行任何验证/安装/build/GUI/测试/类型检查，不修改业务、不提交、不派子代理。源文档Lead补了ledger/THIRD_PARTY_NOTICES/plugins/mail/UPSTREAM无需重复要求。报告temp/final-audit/t10w-report01.md。不要运行hc send（worker沙箱会要求写会话锁），直接终端最终告知报告路径，Lead主动收取；写报告若权限阻塞直接输出正文，不提权。
