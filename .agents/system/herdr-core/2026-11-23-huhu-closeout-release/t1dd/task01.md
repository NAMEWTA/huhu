# 原生历史任务派遣实施
身份：共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release，Lead t3p，terminal t1dd，task01.md，report01.md。工作目录 /home/wta/projects/huhu，共享 main。读取 topic、manifest、AGENTS.md 及 dev-build。不得派子代理。按最新 AGENTS 不继承 fast 或权限绕过参数。

依据 t1d7/report01.md 和 #4 W6.1 / #5 C01 原始规格，补齐用户从任务编辑器直接选择已退出 Codex 持久历史 B、保存任务、派遣到 B 原 thread/rollout 的一个新 turn、问答与结果路径。按报告优先复用当前受控 helper、签名凭据、来源身份、Tasks 状态机和原意图对账。不要用手动打开历史再 existing 绕过目标，也不要静默 fork/new 或向同 provider A 误投。

可写：plugins/agent-cli、plugins/tasks（index.ts t1d8 已释放）、plugins/automations 必要派遣入口、packages/contracts 必要 schema、相关 apps/engine 适配与测试、tests/e2e/workflows/task-journey.spec.ts 或新的专用 history dispatch spec。不得修改 Mail/Web/Dashboard/版本/锁文件/SSH。要跨边界先告知 Lead。不提交、不 push、不改公共 manifest。前端先执行现代 Web guidance search/retrieve。

必须覆盖完整身份匹配、选择修订失效、同键重交/异载荷冲突、启动与首轮之间占用、取消和丢回执、旧记录可读但无来源时需重选。支持边界以实际 adapter 为准，Claude/Pi 无 adapter 继续明确不可派。私有 home 内持久来源先支持，不能把桌面默认目录交互资格误称受控可派。读取分析报告完整细节。

worker 只写业务代码、单元和 E2E 用例，允许单个相关 vitest 文件，重型验证由 Lead 串行。不得跑 build、打包、Electron/Playwright、全仓 typecheck/lint/knip/test。报告列实际执行与未执行，给 Lead 精确验证命令；真实固定 Codex 恢复后的首轮协议证据由 Lead 执行，你准备可运行夹具/脚本。报告同目录原子发布，回告 hc send t3p。若关键协议无法证实，说明具体证据缺口，不伪造成功。
