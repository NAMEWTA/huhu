# 完成迟到实际写入对账
读取 temp/final-audit/t13x-report01.md，按该报告具体时序在现有 DocumentSession 内最小实施，保留原有测试。t141 已证明前两修复绿，剩正文迟到落盘红。
可写：DocumentSession.ts、ArchivesViews.tsx、对应 document-session.test.ts；必要的档案冲突入口仅在 ArchivesViews.tsx 复用现有动作/组件，先检查现有实现。不可改其他模块。前端指南沿用已读取完整指南。
要求：已发跨代写在原串行槽 await 当前代磁盘对账，不自等、不重放写。实读未变化保留新代状态和合法队列；实读变化保留当前缓冲及冲突祖先，淘汰旧基线队列，排空不得隐式覆盖，退出留草稿；未知读失败/传输结果保守保护，后续可重试；字段需准确区分预检未发与已发更新，覆盖落盘后失败。明确重载/keepMine/merge 可解锁，restoreDraft baseVersion 保护不丢。保留正常手动保存快照和字段排队语义。
补报告建议的门控回归，禁止仅为已有断言改测试；读失败、实际字段写跨代、旧 ACK 但磁盘无变化、第二次切代、冲突明确解决分别覆盖。仅写不运行任何验证，不派代理、不 hc send。完成写 temp/final-audit/t13b-report04.md，列未运行验证与接口边界。当前 HEAD 9e854b1c，其他未提交文件勿触碰。
