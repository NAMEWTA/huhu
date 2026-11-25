# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task09.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task09.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report09.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/` 下的 `005-f09.md`、`073-f28.md`、`074-f31.md` 和 `075-f32.md` 由 Lead 填写
- 执行结果 — done

## 成果与运行指针

- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，批次起点 `7488abb8`，最终提交 `cc75ad1c`。各提交的完整路径可用 `git show --stat <提交>` 查阅。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task09/`。日志按验证阶段存放。
- 合并 — 初次 `git merge main` 快进至 `269dac4a`。随后合并 `dc6af121` 得到 `ecf5917e`，两个 MCP 冲突文件完整采用 main 的 w2 修复 `e9bc46fb`。本地较早的 `45f89969` 留在历史，组合结果与合并时 main 的 MCP 目录及对应测试文件一致。

### 上一批逐包类型修复 · 497f84ca

- 调整 `packages/vault/src/engine-endpoint.ts`、`apps/cli/test/engine-lifecycle.test.ts`、`plugins/tasks/test/persistence-http.test.ts` 和 `plugins/automations/test/task-scan-occurrences.test.ts`。补齐可选值形状、HTTP 回包校验、原生请求绑定和目标能力测试夹具。
- 持锁运行 `volta run --node 24.22.1 pnpm --filter "./vendor/*" run build:types` 后，`@huhu/vault`、`@huhu/cli`、`@huhu/engine`、`@huhu/plugin-tasks`、`@huhu/plugin-automations`、`@huhu/plugin-agent-cli` 和 `@huhu/desktop` 逐包类型检查均为 0 错误。记录见 `types-vendor/` 和 `types-prior-recheck/`。

### F09 · dfa81d4b

- 改动包括 `plugins/agent-cli/src/engine/{history/scanner,index,dispatch-capabilities,dispatch}.ts`、`plugins/agent-cli/test/history.test.ts` 和 Tasks 的派遣执行器及其定向测试。
- 显式冷恢复目标核对读取当前的私有历史记录。普通历史浏览保留已有缓存、Space 过滤与分页。新会话和现有会话的派遣就绪检查向 Agent 声明只需这两类目标，避免每轮查一遍无关的冷历史。
- 缓存预热后即时新增 Codex rollout 的回归单测通过。固定 Core 和 Codex 0.170.0 的派遣夹具能识别目标并完成冷恢复。首次执行器测试的旧调用参数断言补上 `includeResume` 后复跑 3 项通过。

### #14 工作台原型 · 14d97a17

- 修订 `prototype/workbench/` 的 `knowledge.js`、`module.css` 和 `workspace.js`，新增四个 Herdr App SVG 及两份许可。配套记录在 `prototype-review-workbench.md` 的「修订版」，来源提交、改动对照与新指纹均在该节。
- 文件包 SHA-256 为 `9f5db0cb02b2aaf035ab4d80177bb1411ebce2291dc84b8a3e23cdc8d8ed42bb`。Playwright 1.65.0 与 Chromium 158.0.8127.18 离线走查文件原型，浅色 1440 × 1000 共 9 条，深色 390 × 844 共 8 条，含 700 × 844 外壳复核。全部通过。
- 测量了编辑区填满、右侧栏开关与键盘焦点、窄屏覆盖、Agent 标签及 Spaces 图标、键盘分栏及终端末行。原件为 `workbench-walkthrough.cjs`、`workbench-walkthrough.log`、`workbench-walkthrough.json` 与 `workbench-fingerprint.txt`。

### F28 · 97fc087d、de8a727a

- 改动包括 Automations 的 `task-reminder-plans.ts`、`plans.ts`、`reminder-deliveries.ts` 和计划操作组件，以及 Tasks 的文档、编辑入口和任务详情。CLI 与 Engine 实际启动测试改用计划能力，通知提示使用已写入的通知事件。
- 自动化中心和任务详情读取同一个一次性或周期提醒，改期写入新修订。暂停或删除后，原修订在投递边界重新核验。稳定发生 ID 连接通知的持久检查点和结果，丢失回复时按同一通知 ID 核对，无法核对的投递维持待核实。
- Tasks 删除旧轮询。启动时导入旧文档里尚未递送的提醒，计划删除记入原 ID 的墓碑。关闭、只读或进入回收站期间阻止关联提醒。恢复原任务沿用原关联与检查点，复制任务从无提醒开始。旧客户端提交空 `reminders` 数组仍兼容。
- 冻结时钟和写入竞态验证了选中之后改期，旧发生取消，重启只递送新修订。常驻 CLI 到点补发与停用保护通过。Lead 待运行 `tests/e2e/workflows/acceptance.spec.ts` 的「任务提醒到点：持久提示（打开任务 / 知道了）+ 通知中心条目带正文、时间、来源，点击跳转来源并标已读」和「F28：关联任务的周期提醒在任务来源和中心使用同一计划」。

### F31 · 5cfdfa5a、cc75ad1c

- 改动包括 Automations 的 `observations.ts`、计划目录和 `ObservationEditor.tsx`，Agent 的 `sessions.ts` 和 Core 订阅，以及 Tasks 的活动查询。观察以任务或 Agent 会话为来源，每 N 秒或分钟检查，支持状态变化或持续超时、重复、终态停止、改期、暂停与删除。观察对象、阈值、重复和递送设置可在同一 ID 上编辑，原修订冲突及同意图重交已验证。
- 自动化负责可选递送。通知、建任务及评论使用同一发生的稳定身份；原执行等待、回答、停止和原生 ACK 保留在 Agent 和 Tasks。页面列表读取缓存投影。观察轮次共享同一对象的状态查询，断线维持待核实。自动规则已冻结的派遣在任务可用时间改到未来后要求下一次规则轮次重新受理。
- 真实 Core 验证等待状态和无页面时递送，持久检查点回归覆盖通知、建任务和评论。Lead 待运行 `tests/e2e/workflows/acceptance.spec.ts` 的「F31：自动化中心建立、改期、暂停和删除任务观察」。

### F32 · f0b07078

- 改动包括 `packages/kernel/src/capabilities/home.ts`、`packages/contracts/src/home.ts`、Automations 的 `focus-deadline.ts` 和投递设施，以及 `FocusCard.tsx` 和工作台事件失效表。
- Home 一次落盘保存专注状态及计划身份，登记受阻时保持暂停。首页与中心返回同一 plan ID/revision，中心改期同步改变 Home 的截止时间。继续使用同一计划及新修订。暂停、重置或删除使旧截止失效。旧版运行记录缺少计划时按暂停显示，并保留原已存时长。
- Engine 的 Automations 时钟推进截止计划。页面时钟只显示。到点在同一发生记录中保存 Home 结算和通知效果。Home 完成后、通知检查点写入前中断，重开核对原结算后补发一次。结算确认仍沿用 Home 时区日切。桌面正常关窗沿用既有暂停入口。
- Engine 定向测试验证无页面时重启补跑，不可用时拒绝开始，以及多客户端并发读取同一完成状态。Lead 待运行 `tests/e2e/workflows/acceptance.spec.ts` 的「F32：桌面和两个获邀 Web 页面切离专注卡片后由 Engine 到点结算」和「专注计时：运行中关闭应用，退出前暂停并保存剩余时间」。

### 定向单测

每次运行一个文件，命令为 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`，启动前核对 `MemAvailable ≥ 12 GiB`。以下为通过的最后一轮，测试原件保留各次尝试。

| 票据 | 文件 | 结果 |
| --- | --- | --- |
| F09 | `apps/engine/test/codex-dispatch.live.test.ts` | 1 通过，组合分支再次验证 |
| F09 | `plugins/agent-cli/test/history.test.ts` | 17 通过 |
| F09 / F31 | `plugins/agent-cli/test/sessions.test.ts` | 60 通过 |
| F09 | `plugins/agent-cli/test/tool-exposure.test.ts` | 12 通过 |
| F09 | `plugins/tasks/test/agent-dispatch-executor.test.ts` | 3 通过 |
| F28 | `plugins/tasks/test/service.test.ts` | 14 通过 |
| F28 | `plugins/tasks/test/ui-shared.test.ts` | 9 通过 |
| F28 / F31 | `plugins/tasks/test/persistence-http.test.ts` | 45 通过 |
| F28 | `plugins/automations/test/task-scan-occurrences.test.ts` | 29 通过 |
| F28 / F32 | `apps/cli/test/engine-lifecycle.test.ts` | 1 通过 |
| F28 / F31 / F32 | `apps/engine/test/engine.test.ts` | 51 通过 |
| F28 / F31 / F32 | `plugins/automations/test/service.test.ts` | 49 通过，包含改期竞争、评论与专注通知失去检查点后重启 |
| F31 | `plugins/agent-cli/test/native-receipts.live.test.ts` | 5 通过 |
| F31 | `apps/engine/test/task-dispatch.live.test.ts` | 2 通过 |
| F31 | `apps/engine/test/capability-catalog.test.ts` | 4 通过 |
| F32 | `packages/kernel/test/home.test.ts` | 8 通过 |
| F32 | `packages/kernel/test/kernel-exposure.test.ts` | 98 通过 |

Core 现场夹具使用 `HUHU_AGENT_LAUNCH_TEST_BIN=$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core`。Codex 冷恢复另用 `HUHU_CODEX_NATIVE_TEST_BIN=/home/wta/projects/huhu/temp/dev/codex-0.170.0/codex-x86_64-unknown-linux-musl`。F31 原生回执常规跑法跳过的 5 项在固定 Core 环境下全部通过，包含 Automations 停用后的手动派遣、回复、停止与两阶段 ACK。各阶段 `results.tsv` 和原始日志均保留。

### 逐包类型检查

命令为 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter <包名> run typecheck`。上一批包名单见前节。TS 维持 ES2023。

| 票据 | 0 错误的包 | 记录目录 |
| --- | --- | --- |
| F09 | `@huhu/plugin-agent-cli`、`@huhu/plugin-tasks` | `types-prior-recheck/` |
| F28 | `@huhu/contracts`、`@huhu/plugin-automations`、`@huhu/plugin-tasks`、`@huhu/workbench`、`@huhu/engine`、`@huhu/cli` | `types-f28-recheck/`、`types-f28-recurring/` |
| F31 | `@huhu/plugin-agent-cli`、`@huhu/plugin-automations`、`@huhu/plugin-tasks`、`@huhu/engine` | `types-f31-final/`、`types-f31-ui/`、`types-f31-edit/` |
| F32 | `@huhu/contracts`、`@huhu/kernel`、`@huhu/plugin-automations`、`@huhu/workbench`、`@huhu/engine` | `types-f32/`、`types-f32-final/` |

### Modern Web Guidance

- `custom-button-actions` 的 “If the button displays additional content, use the `aria-expanded` attribute” 用于批注侧栏开关。
- `icons` 的 “Give the button an accessible name with `aria-label`” 用于 Agent 工作区的图标按钮。
- `forms` 的 “use native constraints: `required`, `minlength`, `maxlength`, `pattern`” 用于观察表单的必填项和标题长度。

## 阻碍与接续

- Lead 待运行的真实应用 E2E 包括逐票列出的用例，以及 F09 在 `tests/e2e/shell.spec.ts` 中的「Agent CLI 历史：Codex 和 Pi 在大量其他 Space 记录中分页并预览旧会话」。独立 Web 邀请、多窗口事件传播和关窗由 Lead 在候选上核实。
- 本批没有运行真实应用的 Playwright、全量单测、全仓类型检查、构建、安装包、全仓 lint、knip、视觉截图取证或 S13 的 0/1k/10k 规模测量。真实线上模型、平台外的原生 provider 和外部服务均未验证。

## Lead 验收

- Lead 2026-11-25：F31/F32 通过；F28 E2E 失败转 task10；合并冲突（query.ts）由 Lead 在 a4f89775 解决。清单转 task10。
