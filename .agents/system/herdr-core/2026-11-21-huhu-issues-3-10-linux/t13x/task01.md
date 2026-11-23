# 迟到真实写入的最小对账设计
Lead t3p worker t13x，agent-linux。只读，不修改业务、不跑验证、不派子代理、不hc send。
读 temp/final-audit/t136-report01.md、t13b-report01.md、t13p-report01.md。聚焦 t13p 第一项：旧请求被新基线作废，但请求随后仍按旧有效内容版本真正落盘；只丢ACK会让当前buffer/lastSaved仍同X，磁盘A，untilClean/退出错报干净。为当前实现提出最小连贯修复，不搭新框架、不自动重放旧写或覆写用户当前正文。
具体解释：何时以当前代读真实磁盘；读的并发代数/版本检查；如何保留当前buffer并让hasUnsaved、conflict、显式保存、排空与退出草稿一致；同时覆盖字段已发写入、旧成功或未知失败，不破坏旧成功ACK仅晚于新外部版本时当前状态。是否应以新读数推进比较基线，哪些排队操作需作废；已发请求不能撤销边界明确。setText在inflight时不能提前显示saved也请考虑。其余档案Engine缺失文件版本问题由实现者修。
t13b/task02 正在只写红灯测试，未改生产。本报告控制在可实施的具体建议与必要回归，避免完整重写已有50项契约。报告 temp/final-audit/t13x-report01.md。