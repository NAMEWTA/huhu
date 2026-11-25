# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task11.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task11.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report11.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/` 下的 `072-f11.md`、`097-w5d.md`、`014-f26.md` 和 `013-f25.md`，由 Lead 填写
- 执行结果 — done

## 成果与运行指针

- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，批次起点 `febf92ea`，最终提交 `2471337e`。按票独立提交，完整路径见 `git show --stat <提交>`。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task11/`。按阶段保留逐文件日志和 `results.tsv`。
- 单测使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <测试文件>`，每次一个文件。类型检查逐包使用同一把锁和 Node 版本运行 `pnpm --filter <包名> run typecheck`。启动前核对可用内存和磁盘门槛。Core 定向测试设置 `HUHU_AGENT_LAUNCH_TEST_BIN=$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core`。

### 072 F11 · b7734d32

- 改动 `plugins/tasks/src/engine/{dispatch,dispatch-store,journal-index,receipt-inbox,native-replies}.ts` 及 Tasks 测试。记录仍从签名原文件校验。重开构建仅含文件成员关系的索引，文件事件或领域内写入更新成员。同次对账复用收件回放和占用检查的回执快照，根据 task/run/dispatch 查记录。已经确定结束并核对任务链接的派遣移出活动集，仍可按原身份查询。
- 损坏派遣阻断无法证实安全的新派遣，其余已受理记录仍可恢复。重复回执以原身份确认，关闭任务与停止原 Agent 进程保持独立。将已排队任务的最早执行时间移到未来会使旧派遣失效。到点由有效计划或用户重新受理；停用 Automations 期间的即时手动派遣仍通过。
- 定向通过 `plugins/tasks/test/persistence-http.test.ts` 45 项、`apps/engine/test/task-dispatch.live.test.ts` 2 项、`plugins/agent-cli/test/native-receipts.live.test.ts` 5 项，以及启用 `HUHU_F11_BENCH=1 HUHU_F11_ASSERT_ACTIVITY=1` 的 `plugins/tasks/test/activity-reconciliation.test.ts`。改动包 `@huhu/plugin-tasks` 类型检查通过。原件在 `f11-final-units/`、`f11-final-types/` 和 `f11-candidate/`。批次集成后复跑仍为每轮 8 次读取，见 `f11-integrated/`。
- 固定两个活动执行，使用相同签名派遣和已完成回执夹具。预热后逐档运行 5 轮，核对 Engine `tasks.dispatch.resources` HTTP 成功回包仍报告两个活动执行。以下时间为中位数，单位毫秒。读取计数为返回内容并进入派遣或回执记录解析的次数，夹具无回答记录。密钥、目录 stat 和初始化未计入。原始逐轮 CPU、耗时和 HTTP 数据在 `f11-baseline-final/` 与 `f11-candidate/`。批次集成后复跑仍为每轮 8 次读取，见 `f11-integrated/`。

| 已结束历史 | 每轮读取 旧 → 新 | CPU 旧 → 新 | 对账耗时 旧 → 新 | 并发 HTTP 旧 → 新 |
| --- | ---: | ---: | ---: | ---: |
| 0 | 8 → 8 | 13.47 → 8.96 | 7.10 → 4.65 | 13.31 → 8.75 |
| 1,000 | 6,008 → 8 | 1,332.04 → 3.58 | 1,269.30 → 3.25 | 1,274.89 → 6.47 |
| 10,000 | 60,008 → 8 | 12,201.33 → 3.27 | 11,788.51 → 2.89 | 11,795.42 → 4.93 |

- 前后版本分开运行，未交错。10,000 历史时对账范围为 10,428.63–12,191.12 ms → 2.41–3.12 ms。测量说明热对账不再逐条读取冷历史，启动仍须索引既有记录。这组测量使用本机合成运行与真实回环 Engine HTTP，未测生产 provider 或首次重开所需时间。
- Lead 待跑 `tests/e2e/workflows/task-journey.spec.ts` 的「C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答（TW3 Engine 重开与 Web）」及「W8.2/W8.3 候选安装包：跨 Space 分栏、原生会话重连、消费 ACK 重交与历史恢复」。

### 097 W5d · b6b2b026

- 清退前后入口清单见 `w5d/entrypoints-before.txt`、`w5d/entrypoints-after.txt`。改动覆盖 Tasks 执行对账、Automations 跟进/扫描与提醒路由、默认模板、Agent 设置及相关测试。
- 删除 Tasks 插件的常驻五秒 `setInterval`。启动只对账一次，之后由派遣、文件、回执和计划事件唤醒。未决派遣、停止、原生回答或回执还有恢复工作时才保留作用域内重试，插件关闭或工作清空后停止。
- 删除 `AutomationsService.runReminderAction` 的直发通知和直接建任务。Cron 与手动提醒都走 `ReminderDeliveries` 的原发生和逐效果检查点。终端运行错误仍沿终端执行服务报告。直接通知留下的旧激活历史仍可查询。
- 删除未被产品入口消费的 `automations.defaultTaskScan` 内部服务注册和 `initializeAfterEnable` 名称。模板创建和恢复共用显式的 `automations.plans.defaultTaskScan`，保留删除墓碑和中断恢复。测试改经 HTTP 工作台能力走相同入口。
- 删除 Agent 设置输入、输出、前端提交和持久 schema 的 `waitingTasks`。旧文件与请求的该字段由对象解析忽略，原生等待事实继续由 Agent 上报，是否执行可选通知或建任务归 Automations。
- 保留 Mail、Git 的只读旧配置导入，以及 SSH 未启动面板的草稿周期。当前周期均由统一计划拥有。SSH 临时侧栏/外部运行的租约采样、Git 退出前的修订结算、Agent 原生 ACK 和连接重试、Kernel 请求超时继续在各领域作用域执行。
- 对扫描和跟进，在发送记录写入边界重查原计划；已暂停、删除或被新修订替换的旧候选失效。恢复时只从原派遣身份核对已受理项。故障注入在送出前停用计划，Agent 调用为零。已实际开始的派遣和原生问答仍能继续收尾。
- 定向通过 `plugins/automations/test/service.test.ts` 49 项、`task-scan-occurrences.test.ts` 30 项、`default-task-scan.test.ts` 6 项，以及 Tasks 持久化 45 项、Engine 真实 Core 派遣 2 项和 Agent 原生回执 5 项。旧扫描测试曾先改规则再期待旧候选发出，改为真实送出后再编辑以核对在途行为，并另测发送边界撤销。原件在 `w5d-units/`、`w5d-scan/`。改动包 `@huhu/plugin-tasks`、`@huhu/plugin-automations`、`@huhu/plugin-agent-cli` 逐包类型检查通过。
- Lead 待跑 `tests/e2e/workflows/task-journey.spec.ts` 的「T7.2 Linux 实际定时与手动运行共享同一 Tasks 派遣，原目标不可用时可人工关闭」，以及 `tests/e2e/workflows/acceptance.spec.ts` 的「任务提醒到点：持久提示（打开任务 / 知道了）+ 通知中心条目带正文、时间、来源，点击跳转来源并标已读」和「F31：自动化中心建立、改期、暂停和删除任务观察」。

### 014 F26 · 2a8a5674

- 修改 `scripts/check-lint-rules.mjs`，删除 `scripts/lint-samples/` 的复制配置及旧样例，移除根 `oxlint.json` 的过期样例忽略项。把有效生产配置的原字节放进临时检查目录，保留真实路径选择器。核对 Oxlint 实际检查的 9 个样例逐文件诊断，覆盖全局 `any`/深路径、插件 engine/UI 双向边界、合法公开导入及技术超时反例。
- 持锁运行 `volta run --node 24.22.1 node scripts/check-lint-rules.mjs`。生产配置通过，临时副本分别移除全局、engine、UI 规则后均因精确漏拦截而失败，把 engine 违规降级为 warning 也会失败，恢复使用生产配置后通过。完整脚本和原件见 `f26/prove.sh`、`f26-severity/`。改动为根目录 Node 检查脚本和配置，未涉有独立类型检查的工作区包。无新增 E2E。

### 013 F25 · 2471337e

- 修改 `packages/editor/test/golden-roundtrip.test.ts`。读取磁盘时使用平台路径，普通文件与 JSON 片段的逻辑 ID 都用 POSIX 路径。Linux 模拟 Windows 分隔符逐一命中现有的 18 条差异约束。原文和序列化 SHA-256、精确字节相等及语义等价检查均保留。定向用例证明已知差异和普通样例都拒绝意外字节。
- 定向运行 `packages/editor/test/golden-roundtrip.test.ts`，255 项全部通过。`@huhu/editor` 类型检查通过。原件见 `f25/`、`f25-types/`。无新增 E2E。按用户决定，Windows/macOS 未验证。

### Modern Web Guidance

- 我查阅了 `forms` 中的表单提交指南。客户端改动是移除旧设置 JSON 字段，页面控件和提交交互保持原样。

## 阻碍与接续

- 实施无阻碍。独立 Web 和桌面的真实 E2E 由 Lead 在合并候选上运行，入口见逐票记录。
- 未运行全量单测、全量 E2E、构建、打包、全仓类型检查或 lint、knip、视觉截图取证。真实线上模型和外部服务未验证。Windows 和 macOS 按用户决定未验证。

## Lead 验收

- Lead 2026-11-25：F11/W5d/F26/F25 合入 main 2d242e02，验收通过（engine 测试迁移 5f9090d0）。会话上下文 79%，回收。
