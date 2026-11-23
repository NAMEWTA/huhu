# 原生历史真实来源 E2E
身份 t1dd/task03.md，Lead t3p，共享根/目录同前。task02 Lead types及build已通过，Engine live1/1也通过。现在仅修改 task-journey C01 E2E及必要测试helper，将手写rollout改成实际固定Codex产生并关闭的持久来源。
复用现有Responsesfixture、你已通过的codex-resume-protocol-probe方法和产品交互入口。优先以Huhu交互会话产生A/B、退出后从任务编辑器选B派遣；若TUI无法低成本可靠驱动，可通过真实app-server创建来源并明确这仅验证真实provider来源，保留普通交互入口待Lead验。不得手写伪rollout冒充provider生成。来源A/B与任务恢复问答模型请求分别记账，断言A不变/B同实体新增turn、原cwd/线程一致、无需先手动打开历史。禁止改生产扩大范围，E2E只写不跑。写 report03.md，备用temp/closeout-release/t1dd-report03.md。暂不重新build，Lead后续跑。
