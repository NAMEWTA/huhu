# task21 独立外部Agent任务到桌面原会话同包验收
Lead t3p；worker t176；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
读取 temp/final-audit/t17c-report17.md 的Linux组合缺口2第一项。仅补E2E，不改业务。创建 tests/e2e/workflows/external-agent-desktop.spec.ts，两条独立用例 CLI-only 与 HTTP MCP-only：同候选安装包+锁定原生Codex+已有回环Responses fixture，各自创建/修改/派遣Agent任务/读取问题/回答/读取唯一结果；桌面只做授权准备与观察，最终打开同一任务结果并定位原会话，核对session ID与唯一派遣/结果。不混用入口完成任务动作、不用内部setter或模拟返回替代实际外部能力。
复用 plugins/agent-cli/test/native-receipts.live.test.ts 两个外部链、tests/e2e/workflows/task-journey.spec.ts 锁定provider原生问答和core清理、tests/e2e/workflows/external-task-web.spec.ts CLI/MCP真实入口、helpers/candidate-desktop.ts / candidate-package.ts。先核对已有实现再小范围适配；如需要helper仅新建专属helper，不改公共helper和runner。用 HUHU_EXTERNAL_AGENT_DESKTOP_ACCEPTANCE=1 开关，其他包变量沿用。不碰SSH。
仅写代码及定向静态/类型检查，不运行E2E/build/全仓检查，不提交，不启动agent。报告 temp/final-audit/t176-report21.md：用例名/运行条件/复用及新增事实/未运行。如现成能力不能满足契约，给确切缺口而非削弱验收。hc不可用只写报告，不求权限升级。
