# 同包受保护规则验收补齐
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux；Lead t3p，worker t10p，机器wta-ubuntu。工作树agent-linux基线4ae7e7e4，已有未提交diff勿还原。
只可改 tests/e2e/workflows/automation-linux-environment.spec.ts、tests/e2e/workflows/web-share.spec.ts（仅抽取openSharedApp启动helper，其他断言不改）、新增tests/e2e/helpers/candidate-desktop.ts。不得改脚本/业务/其他worker文件/提交/暂存。
目标依据t10b第4缺口：把现有Linux桌面sh批准与CLI/MCP配置执行/脱敏/撤销/原意图去重场景增加显式候选AppImage模式，实际Core和CLI均来自candidatePackage固定hash包；同包Safe锁定期间模块变量照常可用（使用隔离Safe合成密码初始化再lock并断言state），不得换成source程序或直接dispatcher冒充外部。
优先抽取Lead已写web-share.spec.ts openSharedApp的候选启动至helper，保留其私有HOME/XDG/Vault、confirmCandidate附件和失败/正常清理；返回env便于CLI子进程使用相同隔离HOME/XDG。Web初开和重开调用helper，源码模式仍复用openApp。自动化仅HUHU_RULE_PACKAGE_ACCEPTANCE=1启用包模式，其他运行不变。候选CLI使用resources/bin/huhu实际包装入口或已有packaged.spec方案，不能注入source HUHU_CLI_TEST_BUNDLE。helper路径尽量短避免107字节Unix socket限制。复用candidate-package.ts而非重复解包逻辑。
Safe参照既有packaged/packaged.spec与agents/linux-environment.spec的真实能力初始化/锁定做法，保留原三态/未开启入口覆盖分工，不新造产品能力。扩展此用例即可，无需新增重复全套。
禁止运行任何测试/类型检查/安装/构建/E2E，t109全量仍运行；只写代码与静态阅读。禁止子代理。测试工具改动不用客户端指南；若触及产品前端先停交Lead。
报告temp/final-audit/t10p-report01.md，含具体包入口/命令/env隔离、未运行验证、wrapper需加规则mode(1项)的建议。勿hc send/申请权限，Lead主动收取。
