# 任务报告 · #4 W1.1 Core 启动合同与 W1.2 前置核对

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t19
- task — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report04.md
- 执行结果 — done

## 结论

W1.1 后端切片已完成。已保存配置的会话预览和实际启动使用同一份本机命令、参数和目录解析。锁定的 Windows x64 Core 0.1.19 已在独立管道和临时 Vault 上启动 PowerShell 及合成 `.cmd` Agent，两个进程实际 cwd 与预览一致，且均以 0 退出。W1.2 的现状和缺口已独立取证。

## 产物与改动

- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`，分支 `impl/huhu-issues-3-10-receipt`，父提交 `5daf048665ea46ae62e60dfbda9beed6459a8868`，本地提交 `ce5289ddd1ae5713167f6987fe6db53c3beef51f`，工作树干净。差异只含 Agent CLI 后端和六文件中的相关测试。
- `agent.launch.resolve` 增加 `{ session: { spaceId, spaceRevision, provider, cwd?, … } }` 形式，返回 `machineId`、cwd、command 和 argv。默认 shell 以 `command: null` 表示由 Core 配置选择。现有设置草案和无界面解析输入沿用原接口。`agent.sessions.launch` 接受 Space 范围内的显式 cwd。
- `SessionsService.prepareLaunch` 在解析命令前校验 Space、revision 与绝对目录。显式路径经 `realpath`、Space 边界及目录类型检验。Windows 下比较盘符路径的两种形式，并在常规长度的本机盘符目录向 Core 传普通路径。实测原先传 `\\?\C:\...` 时 `cmd.exe` 将 cwd 当作 UNC 并回到 Windows 目录，探针尝试写入时被 `EPERM` 拒绝。最终探针使用仅指向临时目录的绝对输出路径，规范化后 `.cmd` 在所选目录成功运行。
- `AgentDetector` 在同一份已保存设置上定位本机程序。预览及启动可直接使用定位结果。检测页仍单独执行版本查询，批处理版本查询经显式 `cmd.exe` 引号边界执行。带空格和中文路径的 `.cmd` 在先前 `execFile(..., { shell: true })` 路径返回退出码 1，修复后可探得版本。已定位但版本查询失败的 `.bat` 仍可识别为已发现，停用项报告 skipped。
- 直接调用方已核对。`AgentSettingsPage.tsx` 走旧的设置预览，`AgentCliModule.tsx` 走 `agent.sessions.launch`，历史恢复经 `agent.history.resume` 进入同一 SessionsService，Automations 终端操作调用 `agent.sessions.launch`、其旧受控运行仍调用 `agent.launch.resolve`。新会话预览形态可供后续界面接入。本次读取 #4 W0.2、W1.1、W1.2、设计及原型待确认记录，交付 Engine 入口和验证。

## 验证

- 平台 Windows 11 Pro x64，10.0.26300，Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7。实际执行 `D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/resources/herdr/win32-x64/herdr-core.exe`，文件 SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。`scripts/herdr.lock.json` 的 Win x64 归档 SHA-256 为 `1cf7de14c862abc49b8eaeed32dc6a60d8146740edb2c244570d1a9f07cb813a`。Lead 的 `t3y` 记录提供自然退出和 kill 的默认子进程及 outlive_parent 基线。
- `plugins/agent-cli/test/launch.live.test.ts` 经真实插件注册、Dispatcher 和临时 Vault 调用 `agent.catalog.detect`、`agent.launch.resolve`、`agent.sessions.launch`。最终 Core ID `b573969f71940159860a52c8d934159d`，管道 `\\.\pipe\huhu-4dw4chqj-d85e`，测试 Vault `vault-4dw4chqj8tgl`。单独对该管道执行 `herdr-core.exe server status`，测试后返回 5 / os error 2，临时目录已清理。
- 实机顺序为预览及非法目录验证、启动、Core `wait`、`get`、读进程所写 cwd/argv、读 Huhu 会话 JSON、用新网关键重交同 requestId、`ls --all` 核对总数。不存在的目录、普通文件、Space 外目录、相对路径均返回 `INVALID_INPUT`。这四项与两次有效预览运行完后 `server status` 仍为 5，且会话列表为空。
- PowerShell `-NoProfile -Command` 所在目录和 Core argv 与预览吻合。合成 `.cmd` Agent 实际收到 `--model`, `opus`, `--fixture`, `two words`, `带 空格的提示`，其中含空格的两项各自保留一个 argv 元素。两个进程实读 cwd 均为 `vault/中文工作 目录`。Core `get` 核对 `huhu.vault`、`huhu.space`、`huhu.session`、`huhu.launch` 与返回和落盘记录一致。重复执行请求后该 Core 仍为两个终端。
- 复测命令为设置 `HUHU_AGENT_LAUNCH_TEST_BIN` 指向上述 exe 后运行 `pnpm --config.verify-deps-before-run=false exec vitest run --maxWorkers=1 --minWorkers=1 packages/herdr-client/test/frames.test.ts plugins/agent-cli/test/launch.live.test.ts plugins/agent-cli/test/agent.test.ts plugins/agent-cli/test/sessions.test.ts`。4 文件 50 项通过，9 项为系统或旧二进制入口条件跳过。`pnpm --config.verify-deps-before-run=false --filter @huhu/plugin-agent-cli run typecheck` 及 `git diff --cached --check` 通过。类型检查前按仓库约定生成 Cordis/Cosmokit 声明。全 vendor 命令另提示未安装的 Timer 工作区链接，Agent CLI 所需类型已生成。

## W1.2 前置核对

| 范围 | 已观察到的现状及缺口 |
| --- | --- |
| 同键去重 | 同一 `SessionsService` 有 `inflight` 合并，持久 JSON 可按 requestId 查回。实机同意图重交保持两个终端。合成探针重新构造 service，用同 requestId 改 cwd，仍收到原 session。W1.2 需持久保存规范化意图身份并在同键异意图时返回冲突。 |
| Core 响应丢失 | 既有 `sessions.test.ts` 模拟 Core 建立终端后丢失回包，唯一匹配时找回且只 run 一次。合成探针同时让 `terminal.run` 和 `terminal.list` 抛传输错误，现状落为 `failed / HERDR_UNAVAILABLE`。空列表同样落为 failed，多个匹配为 unknown。成功与否未确知时需要保留待查事实，并重新握手和查询。 |
| 操作生命周期 | 创建前写 `launching`，但 `reconcile()` 只扫描已有 terminalId 的 `running`。合成探针在首条记录写入后让 Core 连接在途，重新构造 service 后同键仍返回 `launching` 和空地址。Dispatcher 的 24 小时键与会话 requestId 是两套记录，W1.2 需覆盖重启、断开和操作代次。 |
| 跨 Vault | 正常会话记录按 Vault 存放，Core 使用约定的管道域，四个标签发给 Core。当前响应丢失分支只按 `huhu.launch` 查询。合成探针注入唯一但带其他 Vault 标签的返回，原代码绑定了 `t-foreign`。W1.2 应在自己的 Core 上核对 Vault、Space、session、launch、地址及 generation。Core 管道名为截断标识，还需纳入隔离核对。 |

W1.2 额外合成探针在独立临时状态目录完成，确认同键异意图、查询传输错误、启动记录在途及错误 Vault 标签绑定四项，探针随后清理。生产 W1.2 对账代码留给后续切片。

## 阻碍与接续

本任务的 W1.1 后端切片无阻碍。完整 W1.1 的桌面安装包、GUI PATH、真实 Claude/Codex/Pi 登录与历史、焦点 pane 实时 cwd 继承、Windows 超长目录和真正 UNC 及非 Windows 端待对应实机验收。W6.1/W6.3 的生产接线仍依赖 W1.2 和真实 provider 绑定取证。

## Lead 验收

由 Lead 追加。

