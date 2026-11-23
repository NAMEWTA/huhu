# 修复档案旧版本重建与在途保存撤销状态
Lead 已运行 t140 两文件，3 failed /69 passed，新增三条均红。日志 temp/final-audit/save-late-red.log。
本轮只修独审后两项：ArchivesService.update 对提供 expectedVersion 的已消失 index.md 必须拒绝，保留未提供版本的首次创建语义；DocumentSession.setText 在已有写入回执未到时撤销回旧已保存内容仍可明确保存，空闲撤销仍显示 saved。
第一项迟到实际写入对账暂不要修改，由 t13x 只读分析中，待 Lead 下一任务。允许修改上述两个生产文件及对应两个测试文件；保留既有测试，不跑验证、不 hc send、不派代理。任务完成写 temp/final-audit/t13b-report03.md。前端指南复用此前完整读取的 JS 指南。当前 HEAD 4beb7eae。
