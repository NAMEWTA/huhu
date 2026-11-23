# 修复独审 Mail 恢复与 Linux 批准撤销缺口
身份：wta-ubuntu / t8k，Lead t3p；共享根本文件上两级。工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，当前 dcde4772，原 t4x 已结束不再写。
使用 dev-build/dev-debug，涉及 UI 先执行 zh-modern-web-guidance search/retrieve。只改 plugins/mail/**、plugins/automations/** 及对应新 E2E，禁止 scheduler.test.ts、task-journey.spec.ts、Agent/native/Engine/公共 contracts/根锁文件。不要子代理，不提交/推送。SSH 暂停不在范围。
读取 t8g/report01.md 的四个已复现发现，按 source/spec 修复：
1. 有效导出可包含不同 ID 的同地址账号，空 Vault 可完整恢复，目标已有账号时保持逐项明确选择、默认不覆盖；不能取消真实 ID/草稿/投递/附件冲突检测。
2. 已读标记的已验证来源定位在恢复后立即再次导出仍存在，不依赖同步填缓存；只复用现有标记存储/包结构，不另造基础设施。
3. 同一源 ID 与相同持久内容的定位字段有无不应重复创建独立账号；保持实际内容改变和不匹配身份的拒绝/冲突语义。兼容本次有效 v1/v2 新格式，不做旧库迁移。
4. Linux sh 暂时不可核对时桌面仍能取得既有批准并撤销，新的批准和外部启动继续拒绝；沿用当前对话框，不询问已定原型。避免把外部可读批准扩大到桌面专属数据。
给每项补具体回归用例，先看到失败再修复；单次只跑一个受影响 Vitest 文件。禁止 Go/打包/E2E/全仓 types/lint/knip/build。遇沙箱 socket 失败立即留给 Lead，不重复尝试，不为沙箱改产品。可以定向格式化改动文件，修正审查列出的六处格式（mail message-cache/subset-data/outbox-engine；automations approved-linux-shell/TerminalApproval/TerminalEnvironment）。
不要修改 reviewer 报告。完成原子发布 report01.md，记录实际用例、未运行验证、文件清单；hc send t3p 回告，HC锁拒绝则写报告即可。
