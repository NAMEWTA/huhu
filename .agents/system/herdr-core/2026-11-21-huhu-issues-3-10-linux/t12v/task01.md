# 保存快照独审
Lead t3p worker t12v agent-linux，只读业务、不跑验证不派子代理不提交不hc send。读AGENTS/dev-review与temp/final-audit/t12c-report01.md、t124-report01.md。
审查最新DocumentSession.ts 保存触发快照、自动保存、档案字段队列重基、失败/冲突后重试与退出草稿、untilClean所有调用方；特别多次触发各自正文、版本前进、新输入dirty不丢不虚报。检验新增单测和session-flush/shell E2E实际能覆盖时序。t12t document-session38/38通过，但尚未真实E2E。
不要改代码，只写temp/final-audit/t12v-report01.md。高优先级真实缺陷列具体时序与代码，不为推测凑发现。未运行验证明确列出。
