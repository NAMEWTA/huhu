# task01 · G07 工作台冷启动相对 rc.4 回退的根因

角色：疑难分析（gpt-6.2-astra high）。工作目录 `/home/wta/projects/huhu-wt-perf`（detached `cf882bd` = 最终候选，依赖已安装，尚未构建；需要时 `pnpm build`）。基线工作树 `/home/wta/projects/huhu-wt-rc4`（rc.4 `9132640`，已构建）。
可写：本 worktree 内的临时试验（不提交、不推送）、`/tmp`、本目录 report01.md。业务修复由 Lead 另派实现会话。

## 现象（Lead 在 cf882bd 实测）
`xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 20`，20 对交错，1 分钟负载 1.9–3.4。原始数据：本目录 `g07-final.out`、`g07-load.txt`。
- 冷启动到「工作台可见且引擎就绪」(homeMs)：rc.4 p50/p95 1415.7/1489.5，候选 1509.4/1602.4；配对差中位 +56.5 ms，16/20 对候选更慢。
- 收件箱：候选更快（配对中位 −11 ms）。首篇笔记 75 → 472 ms（知识库路径，规格只要求记录）。
spec G07（归档 spec.md:79）要求首屏与非知识库模块冷启动对 rc.4 **无回退**；这是关闭 Issue #2 的阻断项。
既往：pB 两轮（高负载）同方向（16/20，+108 ms）；其分阶段诊断见 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md`（task02 定因与拆分；首屏 JS 已较 task01 减 22.9%，但 rc.4→交付的主进程 / 引擎阶段未定因），工具 `scripts/trace-notes-startup.mjs`。

## 要求
1. 把 homeMs 拆成可归因阶段：Electron 主进程启动→app ready→窗口/导航→渲染首帧→工作台 DOM→引擎就绪（引擎进程启动、插件加载、Vault 索引 2,001 篇、评论/模板/表情等新增初始化）。确认额外的 ~60–110 ms 落在哪个阶段、由哪些提交 / 模块引入（`git log 9132640..cf882bd`，可二分；rc.4 之后 OK 移植在 `7edcaa8`）。
2. 给出可执行的修复建议（文件、改法、预期收益、风险），以及验证方法（同脚本 20 对交错、低负载）。若判断差值属于不可避免的必要成本或测量伪影，给出充分证据（例如同一构建自身两轮的波动、A/A 对照）。
3. 负载纪律：正式 20 对测量前确认 `uptime` 1 分钟负载 < 2 且无其他 Electron/Playwright 进程（`pgrep -fa 'electron|playwright'`）；pD 也可能在跑 e2e 复现，冲突时先做静态/单次诊断，记录负载。
回报 `report01.md`；完成后在 manifest 追加/更新 `w4:pG	task01.md	done`。
