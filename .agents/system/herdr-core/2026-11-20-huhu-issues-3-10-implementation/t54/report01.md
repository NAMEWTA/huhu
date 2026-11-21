# 独立审查报告 · #4 W1.1 与 #5 T1.1

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t54
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report01.md
- 执行身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 执行结果 — done

## 结论

| 冻结候选 | 规格轴 | 规范轴 |
| --- | --- | --- |
| #4 W1.1 · `ce5289ddd1ae5713167f6987fe6db53c3beef51f` | 中文及空格目录的启动预览和实起通过。超长目录通过预览后无法启动，交互 Agent 退出后 pane 无 shell，完整 W1.1 暂不通过。 | 复用设置、resolver、SessionsService、权限登记及锁定 Core。未发现新增的明确项目规范违规。Windows 回归有一条可在父提交复现的测试失败。 |
| #5 T1.1 · `a5d82cb704cdd44fbae387518f7d1c4246908fb1` | 持久化、部分更新、表单条件写和权限通过。输入首尾空行仍可抬高 revision，父提交也可复现。桌面缺配保存及 existing 选择尚未达到完整交互规格。 | 复用现有 Markdown、Dispatcher、条件写和桌面调用路径。未发现新增的明确项目规范违规。 |

## #4 W1.1

审查 `5daf048665ea46ae62e60dfbda9beed6459a8868` → `ce5289ddd1ae5713167f6987fe6db53c3beef51f` 的 6 个变更文件，含新增 `launch.live.test.ts`。范围和实际入口按 [W1.1](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W1.1-launch.md)、[Issue 验收矩阵](../../../../dev/changes/2026-11-19-issue-4-agent-cli/source.md) 和 [t19/report04.md](../t19/report04.md) 核对。

### 规格轴

1. **P2 · 有效超长 cwd 通过预览，实际启动报告 Core 不可用。** 在同一个临时 Space 下创建三个 95 字符子目录，传入 `path.toNamespacedPath(longCwd)`。Node `realpathSync` 能取得真实目录。会话预览返回成功与带扩展前缀的 cwd。用相同配置和新 requestId 启动合成 `.cmd` 时，锁定 Core 0.1.19 返回 `The directory name is invalid. (os error 267)`，Huhu 对外返回 `HERDR_UNAVAILABLE`。同一 Core 随后正常启动并停止 PowerShell。这是显式目录和启动错误阶段的缺口。定版前应验证可行的启动映射，或在预览和启动共同返回明确的 cwd 不支持原因。真正的 UNC 仍需单独验证。定位 `plugins/agent-cli/src/engine/sessions.ts:178–209,246–258`。
2. **P2 · 交互 Agent 自然退出后没有可继续操作的 shell。** C01 要求交互 Agent 返回 shell。交互模式把 provider argv 直接交给 `terminal.run`，冻结夹具实测合成 Agent 退出 0 后终端为 `finished`，夹具也固定期望 `finished`。现状满足直接进程的退出回执，完整交互生命周期缺少 shell 保留。另查到 `provider:"shell",shell:"powershell"` 在无 `command` 时预览返回 `command:null, argv:[]`，按现有行为由 Core 选择默认 shell。定位 `sessions.ts:201–216,246`、`plugins/agent-cli/test/launch.live.test.ts:157–164`。
3. **常规入口通过。** 短扩展盘符路径规范化成普通路径，Core 记录的 machine、cwd、argv 与会话预览吻合。PowerShell 自读 cwd，合成 `.cmd` 子进程自读 cwd 和 argv，含空格的两个参数保留边界。缺失路径、普通文件、Space 外目录及相对路径均由预览和启动返回 `INVALID_INPUT`，Core 在全部预览后依旧未启动。两种有效启动均退出 0。四个持久标签与运行记录一致，重交同一 requestId 后仅有原两个终端。

### 规范轴

- 会话预览和启动共用 `prepareLaunch`，`launch.resolve` 保持只读且不外露。现有设置草案预览继续用声明或草案命令并遮罩 env。旧交互及 headless 输入形状继续注册，实际执行基于已保存设置定位本机二进制，版本检测失败与未找到分开处理。旧 schema 1 设置无需迁移，支持原来声明的命令绝对路径及 PATH 名称。设置草案的命令文本允许与实起解析出的绝对路径有表示差异。定位 `plugins/agent-cli/src/engine/index.ts:47–53,169–213`、`detect.ts:78–106,129–166`、`launch.ts:90–99`。
- 领域回归在 C 盘临时目录为 49 通过、9 跳过、1 失败。失败项是在 Windows 假设 POSIX 的 `findOnPath("tool", ..., "linux")`，断言普通文件不可执行。在同主机环境用冻结父提交定向复跑，同一断言也失败。Agent CLI 类型检查和该比较的 `git diff --check` 均通过。

### 实机证据与后续范围

- 复跑了冻结的 `launch.live.test.ts`。Node 24.21.0，Vitest 3.2.7，Windows x64。二进制为 `temp/issue-worktrees/integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe`，运行版本 0.1.19，SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`，与 t19 一致。冻结的 `scripts/herdr.lock.json` 指定归档 SHA-256 `1cf7de14c862abc49b8eaeed32dc6a60d8146740edb2c244570d1a9f07cb813a`。
- 独立附加探针使用同一夹具，在隔离 Core `36ba11f6733b227a383aff121b7d0963` 上取证超长 cwd 和停止入口。通过 `agent.sessions.kill` 停止一个活的合成 PowerShell，`wait` 确认结束。另复跑 Lead 的合成生命周期探针 `temp/issue-baseline/core-lifecycle/probe.ps1`，在隔离 Core `66d9aeffa1e2647bda556757499436ad` 上确认父自然退出 0 或 kill 后，默认子终端结束，`outlive_parent` 子终端保持原 PID 存活，随后清理。三套取证分别覆盖正常启动、Huhu 停止入口和 Core 父子策略。
- W1.2 负责同键异意图、跨重启的启动对账、传输未知和四标签加代次的验证。此候选仍按 requestId 回原会话，丢回包分支仅按 launch 标签匹配，无法查询时可落为 failed。W6.1 的目标、绑定及输入所有权合同也待接线。这些行为和后续范围已分别定位。焦点 pane 的实时 cwd 继承、安装版 GUI PATH、真实 provider 登录、shim/shebang 和原生历史没有独立实测。 [W1.2](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W1.2-launch-reconcile.md) · [W6.1](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md)

## #5 T1.1

审查 `1b3b385797eee2dbd9d9af42c57be44dd8ad2562` → `a5d82cb704cdd44fbae387518f7d1c4246908fb1` 的 7 个变更文件，含新增 `persistence-http.test.ts`。 [T1.1](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T1.1-create-task.md) · [行为规格](../../../../dev/changes/2026-11-19-issue-5-task-automation/spec.md) · [t44/report01.md](../t44/report01.md)

### 规格轴

1. **P2 · 既有输入版本误增。** 真 HTTP 将正文 `New input` 改为同一文字加首尾换行。读回仍是 `New input`，`inputHash` 仍为 `41704227570599c3`，候选的 revision 却从 2 增到 3，父提交相同探针从 1 增到 2。代码用原始 patch 正文计 hash，落盘后用去掉区段边界换行的读回正文重新计算。由于 processing key 含 revision，可能把同一正文当作新输入。后续应以持久化后的规范化内容判定输入变化。定位 `plugins/tasks/src/engine/service.ts:230–237`、`packages/vault/src/markdown/regions.ts:91–95`。
2. **桌面仍限制缺配保存。** T1.1 全流程允许 Agent 先保存再配置。冻结提交的 `TaskEditor` 仍调用 `validateDraft` 拒绝缺 Space 或 CLI，且没有 existing 选择控件。HTTP 已支持两种持久状态，当前桌面表单只更换条件写字段。t44 的 Electron 44.9.1 / Chromium 152 烟测覆盖 Human 保存、并发评论、删除线和三列看板。两份原型六文件指纹均核对一致，确认记录仍为待确认，桌面这两个场景留给原型确认后的 UI 实施与验收。定位 `plugins/tasks/src/ui/TaskEditor.tsx:90–96`、`plugins/tasks/src/shared/draft.ts:64–75`。 [#5 原型确认记录](../../../../dev/changes/2026-11-19-issue-5-task-automation/prototype-review.md)
3. **部分更新与同一表单的并发保护通过。** HTTP 上只传 tags 保留 execution、提醒、hash 与 revision。旧表单形状只写无 target 的完整执行设置时，已有 existing sessionId 继续保留。外部改标题后，带旧 inputHash 的标题补丁和带过期 editHash 的标题补丁均返回 `VERSION_CONFLICT`，磁盘字节保持外部版本。只有评论、区段外 Markdown 或独立状态改变时，打开时 editHash 允许完整表单条件写。附加实测 `tasks.update` 直接写 status 返回 `INVALID_INPUT`，之后使用旧表单保存保留最新的完成状态、完成时间和系统评论，hash 与 revision 保持稳定。定位 `packages/contracts/src/dto/task.ts:65–92`、`plugins/tasks/src/engine/service.ts:208–237,258–298`。
4. **旧请求与零启动通过。** 附加 HTTP 探针中，旧 `baseInputHash` 可重试只改正文或 execution 的请求。真实正文改变后旧正文哈希重试返回冲突。旧 Agent 文件缺省 target 与显式 new 共用 inputHash 及 revision。独立复跑的冻结 HTTP 夹具确认默认 Human，缺配 Agent 和显式 existing 重启后保留数据及路径引用。外部创建或代填配置、评论 Agent 均被拒绝。Human 的外部讨论强制 `external`，不采信调用者的 run/ask/session/event 归属。测试夹具记录零次子进程 spawn，`Task Runs` 未创建。缺配和 existing 的 DTO 均给出阻塞原因，旧 Automations 首次扫描按阻塞原因过滤。定位 `plugins/tasks/src/engine/index.ts:35–38,170–203`、`service.ts:55–69,90–100`、`plugins/automations/src/engine/scan.ts:62–79`。

### 规范轴

- 保留 Task 所有权及三状态写入口。新 schema 复用创建和补丁字段定义，创建默认值集中在创建 schema。区段修改经 Vault helper 及目标文件当前版本条件写。editHash 由服务端按表单可写字段计算，编辑器绑定打开时 DTO；status 等独立写入使用单独能力。
- `zh-modern-web-guidance` 已运行 `search "prevent stale form updates"` 和 `retrieve forms`。本次只审查。表单继续走原 POST，由服务端完成版本判断，对应指南 “Never treat browser constraints as a data integrity defense”。冻结树的 TaskEditor 实际注册在桌面 renderer，未找到 Web 应用入口。
- 独立 Windows 回归 11 个文件、133 通过、11 跳过。另运行两个附加隔离 HTTP 探针和一个冻结父提交探针。生成冻结版本的 Cosmokit、Cordis 声明后，Contracts、Tasks、Automations、Engine 类型检查全通过。两组冻结差异均通过 `git diff --check`。Electron 结果来自 t44 脚本和实跑日志，本次独立执行使用真实 HTTP 入口。

### W6.1 契约差距

`execution.target` 持久表达 new 或带 Huhu sessionId 的 existing 意图。现有代码尚无 `agent.targets.list`、`agent.runs.dispatch`、`agent.runs.inspect`，也未验证实际绑定、进程代次、输入归属与持久回执。现有 Automations 仍走自己的扫描、工作进程和整份 Markdown 快照。T2/T3/T7 接线需按合同冻结可执行目标及选中的输入消息，并处理 existing 的实际可用性。 [#4 执行合同](../../../../dev/changes/2026-11-19-issue-4-agent-cli/design.md#两个-issue-共用的执行合同拟议)

## 复核方式与交接

- 用 Git 对象确认两个候选均是指定基线的直接子提交。解包到独立 Windows 临时目录，复用本地锁定依赖，工作树及用户改动只读。按实际测试范围运行 `vitest run --maxWorkers=1 --minWorkers=1` 加 `packages/herdr-client/test/frames.test.ts plugins/agent-cli/test/launch.live.test.ts plugins/agent-cli/test/agent.test.ts plugins/agent-cli/test/sessions.test.ts`，其中 live 测试设置 `HUHU_AGENT_LAUNCH_TEST_BIN`。#5 运行 `vitest run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test packages/contracts/test plugins/automations/test`。
- 审查任务已完成。未使用真实 Vault、原生 Agent 历史或远端写入，未增加 Git worktree。原型确认记录和正式界面验收范围保留给 Lead。报告终稿由外部 Lead 按 topic 收件。

## Lead 验收

由 Lead 追加。
