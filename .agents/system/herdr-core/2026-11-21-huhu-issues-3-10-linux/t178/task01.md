# t178 task01 性能定位探针与有效终端采样
Lead t3p。cwd integration。读取 temp/final-audit/t175-report01.md，dev-benchmark 和 frontend guidance（该报告已列真实检索主题，必要时按search/retrieve）。无子代理，不改生产业务，不提交。
可写 tests/e2e/perf.spec.ts、新的 tests/e2e/helpers/perf-diagnostics.ts（如需），及 temp/final-audit/t178-report01.md。不要改shell.spec、acceptance.spec、session-slow-bridge，另有worker负责。
1. 10MiB终端采样：按报告替换每键locator和done RPC为预先验证定位、一次聚焦真实输入框、page.keyboard.press和结束信号；仍保持满速10MiB，实际键盘事件、≥10窗内样本、完整尾标，p95≤100ms，窗内慢样本必须等待。不得慢放生产者或拼多轮不足样本。不运行E2E，Lead实测。记录信号开始/结束与按键分布便于判断覆盖。
2. 增加显式环境开关 HUHU_PERF_DIAGNOSTICS=1 的旁路取证，默认关闭，不更改正式阈值工作量。优先任务1000行滚动退出：创建文件前请求计数（tasks.list/home.focus.get等）、对话框出现和真实返回、main before-quit/will-quit、huhu:exit-progress/flushed（只记录时间/requestId/状态，禁止token）、Engine shutdown进程退出。app.close之前挂主进程监听日志发stderr或test附件，避免关闭后page依赖。所有wrapper调用原函数，不能替用户答复对话框，不能强杀以冒充成功。用原trace/request数据已能回答的不要新增探针。
3. 给该测试可选CDP Profiler取样/保存独立附件，计数按时间阶段汇总，标记写完/首行/滚动起止，诊断与正式测量分离。不能为诊断把任务列表等到静稳来改变原正式场景。
4. 现有__huhuPerf空阶段数组输出0ms不实，改为空样本明确未采到，不改真实p95。
报告列未运行E2E/类型/构建；仅允许单个相关Vitest（若无对应就不跑）。报告只在integration/temp/final-audit写，协作目录由Lead复制，不申请扩权。
