# task01 停放恢复磁盘核对独审
身份Lead t3p，worker t194，共享根为本目录上级；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。对17ce3c60f38ac769ef8dd6b5b56c78e2efe21074相对4bd62e5a独立只读审查，只有两文件：plugins/notes/src/ui/documents/DocumentSessionRegistry.ts 与 test/document-session.test.ts。读取 temp/final-audit/t176-report19.md（实际Web失败与根因假设）、t176-report20.md（实现与97单测）、红绿日志。原包Web在切能力网关期间错过外部保存，返回已有笔记仍旧内容；其它包8组15项通过。
关注refs/parkedRefs、settling、恢复读盘新输入、并发acquire/release、草稿与已加载缓冲是否被误覆盖，以及真实调用方是否会走新增路径。复用现有机制，禁止无关扩展。只读业务，不能跑E2E/build/全仓类型或其他重型检查；最多单个vitest文件但已有足够证据优先阅读。不要启动agent，不提交。发现给出真实可触发路径和最小验证，区分推断风险和缺陷。
报告 temp/final-audit/t194-report01.md，记录审查blob和未验证范围。共享目录可能只读，只写本地报告即可，不请求权限升级。用hc send t3p回告若可用。
