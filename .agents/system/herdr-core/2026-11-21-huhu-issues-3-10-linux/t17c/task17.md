# task17 最终验收缺口盘点（只读）
Lead t3p，worker t17c，cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
当前b8f6c427同包九组八通过15项，web一项旧正文失败，t176/task20在修。只读核对 program.md、七项未暂停Issue source/spec/plan及各evidence、linux-final-acceptance.md、temp/final-audit/final-package-results.json 和对应日志/原始JSON。按目标区分真正仍缺的具体实现/调用方验证/外部资源需求/产品待决；不要重做原型，不把SSH纳入，不执行任何测试或联网操作，不编辑业务/规格。优先确认修好该Web失败后，还须哪些最少且充分的检查才能声称七项和组合验收完成，以及哪些确实需要用户/设备/真实账号。不能把未确认的推断当实现缺陷；对每个缺口给权威规格位置和已有证据边界，复用有效先前证据，不因不同SHA自动要求全重跑。需要检查全量门禁时核对已运行和变化范围，不要求再跑全量E2E。
报告 temp/final-audit/t17c-report17.md。不要启动代理。hc发信权限不够只写本地报告，不申请升级。
