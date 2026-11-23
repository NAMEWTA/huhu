# 明确放弃草稿的记录身份与读取失败
Lead t3p，worker t13b；工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。当前实现已由Lead保存推送 ce3a3b7b，待验收，不回滚。
读取 temp/final-audit/t152-report03.md，仅关闭剩余两条：当前缓冲明确放弃不得删除另一工作台后来留下的新草稿；实际草稿读取异常不得当不存在而假成功。复用既有 expectedDraftVersion/version 和 Engine 写入队列，不引入新日志或基础设施。需要记住与缓冲关联的草稿身份，在实际删除时条件核验，不能只对刚读取的最新草稿盲删；读取后替换也须保护。无草稿正常情形仍可重载；普通现有调用向后兼容。
先补最小本地回归复现（同路径两个会话替换、读后删除前替换、实际Engine读取错误），然后修复。允许在 flock /tmp/huhu-heavy.lock 下每次只运行自己改动的单个 vitest 文件/筛选并保存红绿日志。禁止E2E/typecheck/build/全仓门禁。
可写 Notes DocumentSession、draft能力Engine index.ts及其既有单测；必要直接调用方/E2E仅写不运行。不要改Mail/SSH/其他未涉及行为，不开子agent，不提交。报告 temp/final-audit/t13b-report12.md，说明身份/并发/错误语义及验证。
