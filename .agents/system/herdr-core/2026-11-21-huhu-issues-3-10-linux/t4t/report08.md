# 复核候选包身份与 Tasks 回执顺序

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- Core / Lead / terminal_address — wta-ubuntu / t3p / t4t
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task08.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report08.md
- 执行结果 — done（审查完成，包验收待修待测）
- 范围 — 基准 2b314d4c，复核 447df865 与 2b438bc7。按补充指令另读四个 E2E 文件的未提交 diff，随后与 HEAD 47fb9c283acfa4aeb6af7f29e14a792aa383d4fa 比对，四文件补丁一致。该提交另有一份既有证据文档更新，已读，未改生产前端。发布前复查工作树干净。以下行号对应 47fb9c28。

## 结论

W8 和 T7 的候选旅程已经消除可独立传入另一个 exe 的缺口。AppImage SHA、包内完整构建提交、随包资源哈希和 Electron 运行身份已形成一条可核对的记录。Tasks 接收前停用、重新启用及首次消费 ACK 丢失的顺序已有定向源码证据。新增的 CLI／MCP／备份用例仍绕过共同制品身份和夹具环境。建议先修这一项，再以同一包取得三组实际证据。其余验收矩阵沿用 [report07.md](report07.md)。

## 规格轴

1. **P1 · CLI／MCP／备份可在另一份程序或个人环境下通过。** 新用例接受旧的 HUHU_PACKAGED_EXE，既未调用 candidatePackage／confirmCandidate，也未写制品、ASAR、exe 和随包 CLI 身份附件。start() 仅删除 HUHU_HERDR_BIN，仍传入整个 process.env 和整 worker 共用的 USER_DATA_ARG。开发页面覆盖仍会生效，CLI execFile 也继承父进程环境，启动器允许 HUHU_ENGINE_ENTRY 指向外部 Engine。若从个人会话开启 opt-in，mail.accounts.save 可能把合成凭据写入个人 Secret Service。保留泛平台冒烟入口，新凭据用例改用候选 fixture，给 source／restore 各自明确 Vault 和应用资料路径，桌面与 CLI 共用同一隔离环境，确认两次启动的身份并从已核验 resources 取 CLI。沿用私有总线和合成探针，opt-in 后若缺隔离或候选输入则报错。 [packaged.spec.ts](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/packaged/packaged.spec.ts:18) · [凭据用例入口及 CLI 调用](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/packaged/packaged.spec.ts:207) · [恢复启动](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/packaged/packaged.spec.ts:313) · [CLI 启动器](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/resources/bin/huhu:16) · [正式页面地址选择](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:143)

2. **P2 · T7 包用例尚未用同一组读数验证完整回执和 UI。** Agent 持久记录与 pending 的整条回执已有比较，Tasks 存的是含 receipt、consumption、status 的记录，Agent 的 .tasks-ack 则是含 stage、receipt 的 ACK，路径及字段与生产一致。现有断言只数原 receiptId 的 Tasks 记录，再按 runId 取第一条结果，最后对照该条记录的 ACK。仍可能漏掉第二个 receiptId，首个丢失 ACK 也只与 pending 比了 receiptId。建议按 runId、dispatchId、attempt 读取全部 result 记录，要求恰好一条且 receipt 完整等于 pending，最终 Agent ACK 等于第一份 held，delivery.messageId 等于唯一评论 ID。停用后的目录检查只是瞬时读数，phases 附件是写死的标签。用实际尝试记录或轮询边界证明期间至少一次拒绝、随后一次 ACK 丢失及签收后停止重投。生产以匹配 ACK 停止枚举 pending，现有源码可支持该断言。恢复后点击任务和人工完成的动作已接上，但结果正文仅由 API 查询。打开任务后再断言 task-timeline 内相同 data-comment-id 的唯一正文，并等任务入口或详情经历停用、恢复两次可见状态，避免两次快速切换绕过 UI 检查。 [包用例回执与 UI](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/task-journey.spec.ts:290) · [回执重放](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/receipt-inbox.ts:209) · [Agent pending 和 ACK](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/execution-receipts.ts:76) · [任务时间线 DOM](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/tasks/src/ui/TaskDetail.tsx:219)

## 规范轴

1. **P2 · 将解包输入和派生文件锁在一次私有快照里。** helper 先散列原路径，随后按路径执行 AppImage。共享制品被替换时，记录的 AppImage SHA 可能来自另一份字节。exe 经过 realpath 后直接采用其父目录，ASAR 和关键资源也未检查解析后是否仍在解包树。建议把制品复制到用例管理的私有临时目录，核验该快照再解包，确认文件与规范化解包根的包含关系，给解包子进程显式环境。记录的 exe、ASAR 和资源 SHA 建议在启动前与收尾复验，并用 worker fixture teardown 清除解包目录，当前模块级 promise 只缓存结果，没有清理。正常单一候选下，helper 的完整 40 位比对与 appInfo 前 12 位交叉核验正确，三层 createRequire 的相对路径也已用本机依赖解析探针确认。构建提交仍由 build-info 提供，门禁应关联对应的干净构建输入并避免沿用旧产物。 [候选解包和运行确认](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/helpers/candidate-package.ts:17) · [appInfo 读取](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:30) · [构建提交写入](/home/wta/projects/huhu/temp/issue-worktrees/integration/scripts/write-build-info.mjs:7)

2. **P2 · 让 opt-in 错配失败，并落实私有总线。** 两个 journey 的 Electron、Git、Core 辅助命令现在不继承开发渲染器、HC 或用户 Git 环境，HOME／XDG／provider 目录已独立。candidateEnvironment 仍直接接收调用器的 DBUS_SESSION_BUS_ADDRESS，既可能来自个人会话也可能为空。命令入口应在私有已解锁 Secret Service 和 Xvfb 环境启动，检查三组各 1 通过、0 跳过。候选输入为 HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT、HUHU_TASK_JOURNEY_PACKAGE_SHA、HUHU_CANDIDATE_GIT_SHA 与已锁定的 HUHU_CODEX_DISPATCH_BIN，三组分别显式打开相应 opt-in。将“没有 opt-in”与“opt-in 后缺少输入／平台不匹配”分开处理，让后者给出明确错误。T7 在共享 helper 中检查 Linux x64，W8 仍在外层跳过，凭据用例目前只检查 Linux。 [继承的总线](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/helpers/candidate-package.ts:56) · [T7 入场条件](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/task-journey.spec.ts:204) · [W8 入场条件](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/task-journey.spec.ts:386)

3. **P3 · 回执源码用例应清除环境桩。** 新用例调用 vi.stubEnv，afterEach 会关闭 Engine、删除目录和清夹具对象，但无环境清理，根 Vitest 配置也只有 maxWorkers。这一用例位于文件末尾，当前顺序降低了串扰概率。把环境恢复放到 finally 或 afterEach，确保失败和重排时也恢复。生产故障入口检查绝对路径、指定 dispatchId 和 result。E2E 将目录建为 0700，生产入口本身不校验目录归属或权限，接收前标记在持久写之前，held 标记在持久化并回读之后，drop-once 命中时后续请求继续返回 ACK。现有 W8 的 release 模式仍可沿用。 [源码 fixture](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/tasks/test/persistence-http.test.ts:1660) · [afterEach](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/tasks/test/persistence-http.test.ts:91) · [故障门](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/receipt-inbox.ts:38)

## 已核对证据与交付

- 已读工作树 TypeScript 修复。四文件处理了字符串环境类型、宿主 AppInfo 的可选字段匹配、源类型入口和断言收窄。Lead 在证据文档记录独立类型检查退出 0，并说明用了 ES2024.Promise。复查日志为空，没有独立退出状态记录。本轮只做代码和现有证据复核。 [类型与源码验证记录](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T7-cutover-linux.md)
- 同一文件定向回归 2 项实际通过，36 项被过滤，覆盖接收前中断和持久结果／原评论重开补送。日志中的四条 Playwright 记录是枚举。当前没有候选包，也没有三个包入口的通过结果。 [回执定向回归](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/task-ordered-receipt-regress.log)
- 本轮完成 Git diff 检查与本机 @electron/asar 依赖解析。仅写本报告，未派发代理、未启动包构建、E2E 或测试套件。签收复验仍需两个 journey 入口和同包的 CLI／MCP／备份入口各实际运行一次。

## Lead 验收

待 Lead 追加。
