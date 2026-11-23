# Graph 状态与通知收口
Lead t3p，worker t11f，实际工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，HEAD4ae7e7e4。接续已有diff，不重置、不提交、不动SSH。使用dev-build/dev-debug，读AGENTS，t117/report01.md及前序t10x报告，按真实Graph契约修复P2/P3，避免新增产品范围。
可写仅 plugins/mail/src/engine/graph-mail.ts、message-cache.ts、必要的graph缓存schema文件和 plugins/mail/test/oauth-engine.test.ts、test/fixtures/graph.ts。其他人不碰这些。保留已有Graph/Exchange授权及全部场景。
目标：对账不能覆盖本轮无歧义delta更新；重复普通更新不能仅靠分页顺序决定状态，按服务契约核实而非盲定true优先；消除提前缓存新信漏通知且初扫/历史补位不误通知。补明确最小回归，不用降低断言掩盖。
Lead刚修复oauth-engine事件联合收窄(op in payload)与receive-only测试顺序，t11b Mail类型通过，t11d该文件3/3通过。此为当前起点。
只写代码和测试，不运行任何测试、类型、build、E2E、安装、网络真实账号，不派子代理。报告 temp/final-audit/t11f-report01.md 说明解决规则、变更、未运行验证与风险。完成终端回复即可，不用hc send。
