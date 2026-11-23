# 统一实际写入的未结算状态
Lead t3p，worker t13b，agent-linux。t14r 已实际复现 task07 两项：2 failed /65 skipped。读取 temp/final-audit/t14m-report01.md，按其中最小统一方案实施，不再按各入口独立补丁。
可写：原 Notes 九文件及 TextFileView.tsx；packages/workbench/src/engine-client/client.ts 和对应 engine-client.test.ts 的响应体失败 outcome 标记。共享 EngineClient 此任务由你唯一写入。不得改其他 worker Mail 文件。
用活动写记录覆盖 notes.save / archives.update 从实际提交至 ACK 和必要对账结束；统一 hasUnsaved 与自动读取前/接纳前保护，显式确认 load 不得死锁。保留旧65项、手动快照、字段重基、明确失败重试、跨代对账及草稿回执。
按分析补字段活动窗口及真实 EngineClient 截断响应/显式 unknown/普通 INTERNAL 三类边界测试。EngineClient 本地响应解码失败用现有 details.outcome=unknown，不放宽类型/不新增协议；会话识别已有服务端 unknown。
前端指南沿用已完整读取的 /tmp/mwg-guide-3235787-1795365728802.md。只写代码/单测/E2E，不运行验证，不新派代理，不发送消息。报告 temp/final-audit/t13b-report08.md，列文件、语义及未运行项。Lead 串行定向验证。
