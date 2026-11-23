# t176 task02 — 修正三项界面失败
Lead t3p，工作目录 integration，接续task01/report01。t174全部结束，当前固定组合已完成本轮验证，允许开始改动。
可写范围：plugins/tasks/src/engine/dispatch.ts、plugins/tasks/src/engine/index.ts、plugins/tasks/test/persistence-http.test.ts、plugins/tasks/src/ui/TaskDispatchPanel.tsx、plugins/tasks/src/ui/compact.tsx；tests/e2e/workflows/acceptance.spec.ts、tests/e2e/shell.spec.ts。不要修改其它业务文件，需扩大范围先报告。SSH不改，无子代理，不提交。
1.按报告实现持久收件后即时唤醒既有check投递链，并合并正在check期间的新唤醒。不得等待整轮dispatch再ACK，不在任务写锁内replay，不忙循环重试失败；保留幂等、关闭/取消、恢复定时器和回执持久回读顺序。先单文件回归证明定时器不触发时也能即时交付，同步检查进行中到件不得丢唤醒，重复收件只一条评论。只跑涉及的单个Vitest文件。
2. TaskRunDetails待匹配评论和阅读器加载保持可见反馈，复用已有阅读组件，避免无关阅读器重构。
3. acceptance.spec.ts能力过滤夹具用已有原生fetch包装方案，限定真实认证GET及当前Engine路径，验证原目录和过滤交付，保留打开/禁用写动作证明；Agent设置测试隔离automations默认启动探测，保持初始零探针与两次显式刷新断言。
前端按zh-modern-web-guidance读取现有指南/必要检索。E2E只写不跑；不全仓typecheck/build/lint/knip。报告未运行验证。
报告只写工作树内 temp/final-audit/t176-report02.md，不复制工作树外，也不要为此申请扩权。完成用hc send t3p回告路径；Lead收取协作目录。
