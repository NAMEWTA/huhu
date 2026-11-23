# 文档保存基线与队列分析
Lead t3p worker t136，agent-linux。读AGENTS/dev-debug/dev-architecture和temp/final-audit/t12v-report01.md、t12c-report01.md。
只读分析三项实际时序发现，给出一个最小一致修复方案：冲突重载/合并切换基线时使旧排队正文失效，正常保存ACK仍允许新版本顺序前进；档案字段排队不能保存触发后的正文；撤销回已保存正文正确显示saved，撤销回旧磁盘则dirty。核对load/merge/keepMine/dispose/async回执/字段写回所有调用。不要泛化成新框架，不改变手动保存本次正文/后续保留的契约。
不改业务或测试，不运行验证，不派子代理不提交不hc send。报告temp/final-audit/t136-report01.md。列具体字段/时序/最小测试，尤其哪些已有写入无法取消但可以拒绝应用迟到结果。Lead将写失败回归，实施者再按确认方案修复。
