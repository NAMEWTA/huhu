# 保存对账定向独审
Lead t3p / worker t147，目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。只读业务，不跑测试/构建、不派代理、不hc send。报告 temp/final-audit/t147-report01.md。
核对当前未提交 Notes DocumentSession.ts / ArchivesViews.tsx / 调用方四处 untilClean 改动和 document-session.test.ts，聚焦 t13b/task04 的跨代已发请求对账，不扩展无关模块。先读 t13x-report01.md、t13p-report01.md、t13b-report04.md；t145 已单文件62/62通过，t146 Notes类型检查进行中。
检查旧请求实际写/仅迟到ACK区分、字段真实提交边界、未知失败、读取与重载ABA、当前buffer保留、队列淘汰、退出草稿、明确解决冲突（包含合并祖先）以及当前实际档案UI动作。给可构造时序和代码行号的真实新问题，或明确无新增发现并列验证局限。不要重复已经红绿验证的旧问题或要求运行全量。不能把单测视为Electron验收。
客户端指南复用Lead已search/retrieve的完整 /tmp/mwg-guide-3235787-1795365728802.md，禁止再次联网查询。未提交代码均可读，其他worker仅改Mail，不碰Notes。
