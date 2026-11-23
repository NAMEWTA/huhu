# 修复手动保存竞态
Lead t3p worker t11n。task01红灯由Lead实际运行t11s确认：36tests中35pass，仅新增失败 Expected A Received A+B，日志temp/issue-evidence/huhu-2026-11-22/manual-save-red.log。生产代码未改。
现在允许修复 plugins/notes/src/ui/documents/DocumentSession.ts 及确有必要的同目录调用边界，保留自动保存/退出排空/草稿/flush结果语义，不能简单破坏其他调用。新增回归的期望是手动save的点击时点文本写盘，新输入dirty，下一明确保存才写；若需要与退出drain分开用现有入口小范围适配。需先按zh-modern-web-guidance search/retrieve完成客户端规则（Lead已取js指南/tmp/mwg-guide-3235787-1795365728802.md，可读但按需搜索自己的场景）。所有验证由Lead，禁止跑测试/类型/E2E/build。
可写DocumentSession及其单测、session-flush.spec.ts；不碰其他worker。补受控真实E2E回执暂停回归，并修正原shell1636流程让快捷键测试等待首个save-state已保存后再输入（如需shell.spec.ts先报告具体改动让Lead做，不能直接写）。
不要再执行hc send，不需要申请权限；只写temp/final-audit/t11n-report02.md并终端最终回复，我直接读文件。上次只是报告消息被沙箱阻止，已取消，不是业务操作需审批。不派子代理、不提交。
