# 非SSH批次完成证据审计
Lead t3p；worker t15p；角色独立审查 sol/xhigh；工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。
目标是检查 Issue #3–#6、#8–#10 的交付证据是否覆盖原规格和目标，产出可落实的剩余验收清单。#7 SSH明确暂停并保留分支/change，禁止重开该模块。
当前固定候选 HEAD 05a748b61eaa6dddaaa86aa648a2e68dd385d085，feature远端已核对相同，main旧4ae7e7e4。当前候选lint/knip/format/全工作区types/build/CSS检查通过，AppImage与deb已构建（日志temp/final-audit/combined-gates-05a748b6.log、combined-build-05a748b6.log、package-05a748b6.log）。门禁驱动脚本因Lead在运行时修改脚本造成127，在所有types完成后、build开始前停止；build独立t15k成功。不要记为全量Vitest绿色。
Lead t15n正在固定候选串行跑Notes/Mail/旧非SSH失败33项，禁止执行任何测试/E2E/构建/打包。禁止修改业务或文档，只有本报告可写；不启动子agent。
阅读 .agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/program.md、各非SSH Issue source/spec/plan/现有evidence，按需追直接代码和测试对应证据。前期完整Vitest t101四失败其中二SSH，CLI ECONNRESET三次定向通过但根因未知；完整E2E t109旧candidate351通过48失败18跳过6外部错误。现只定向复验不重复全量。
重点输出：逐Issue原验收要求 -> 实际代码/具体测试/有效SHA或日志 -> 已证明/旧版证据可复用原因/当前正在跑/尚未运行/缺实现/需用户或环境。不把--list、假夹具、旧包、空跳过当通过。三组同包联验见 scripts/accept-linux-candidate.sh modes 和目标program。Graph S5.2新信通知口径仍有待用户决定的记录，不自行替用户决定，不重新向用户发问。Windows/macOS/第二物理设备等无环境证据须如实标明，但区分发布前平台门槛与本次Linux可完成部分。
不要泛化为全库重新review；仅当验收要求缺少真实实现或证据才列具体缺口。引用准确文件、用例及已有证据路径，避免提出与既定规格无关改造。报告 temp/final-audit/t15p-report01.md，写任务身份/范围/未运行验证。完成后等待Lead收取，无需发送外部消息。
