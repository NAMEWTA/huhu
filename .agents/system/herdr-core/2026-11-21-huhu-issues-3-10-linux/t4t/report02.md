# #7 批量路由、外部布局和私有 Core 复审

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4t`，本机 `wta-ubuntu` 默认 Core，Lead `t3p`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report02.md`
- 执行结果 — done，复审已完成。H3.2 桌面服务入口有定向证据，私有 Core 异常关闭及外部布局重交仍有缺口。
- 证据版本 — `29c3fe32417aa99ad7c4790d3d879218e73cf362`，分别对照 `29c3fe32`、`f2159c2e`、`951fe442`、`d4544abb` 的父提交及其在固定版本的调用者。

## 规格轴 · 发现

1. **P1 · 私有 Core 回收未确认时，停用 SSH 仍会返回成功。** `stopPrivate()` 遇到只剩 holder、无效停机回执或超时会抛带 `outcome: "unknown"` 的错误。SSH 把它交给 Cordis async disposer，Cordis 的 `_unload` 捕获并只记日志，然后 Kernel 标记 disabled 并持久化停用偏好。只剩 holder 的情况有 `herdr-core.test.ts` 的低层夹具，现有测试只断言 `core.stop` 拒绝。应用入口会收到 `state: "disabled"`，刷新后看到停用成功，无法区分未确认的资源回收。最小回归判据是以临时 Vault 和替身 Core/holder 通过 `plugins.setEnabled` 停用，确保新 SSH 调用被拒绝，同时用户能读到回收未确认；重复停用或后续写者可继续处理原任务。依据 `packages/herdr-client/src/herdr-core.ts:252–271`、`plugins/ssh/src/engine/index.ts:172–176`、`vendor/cordis/src/fiber.ts:713–731`、`packages/kernel/src/plugin-manager.ts:140–147`、`packages/kernel/src/capabilities/system.ts:205–207`、`packages/workbench/src/plugins/PluginCenterModule.tsx:53–64`。

2. **P2 · 外部布局已提交的意图在同代的新修改后重交会返回版本冲突。** 先成功重排为 R1，再成功调整或关闭一栏为 R2。若 R1 的首次回复丢失，权限仍完整的原主体用相同 key 和原输入重交，`HostIntents` 读到完成回执，随后 `changeLayout` 以 R2 和 R1 不同抛 `VERSION_CONFLICT`。调用者无法从原意图确认 R1 已发生。#6 来源 §6.3 要求相同 key 和输入返回原结果，当前权限检查仍应保留。已有用例只在 R1 仍是当前版时重交。关闭后撤掉已删除主机的授权，旧 close 回执返回 `PERMISSION_DENIED` 是已有测试明确要求的行为，活运行仍可列出并保留其他 pane。最小判据是同一主体、同一授权下执行两次布局修改后重交第一次，能读取原已应用结果或明确的已应用版本，当前布局仍是 R2，关闭仍只发生一次。另跑相同请求在被移除的连接结束、被撤权时的已有边界。依据 `plugins/ssh/src/engine/public-workspaces.ts:112–145,284–300`、`plugins/ssh/src/engine/host-intents.ts:69–111`、`plugins/ssh/test/public-resources.engine.test.ts:1515–1564`、`.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/source.md:262–267`。

3. **P2 · 批量路由在已经进入文件写入队列后，临提交前的取消不会被读取。** 定义层在写前检查 signal，但 `#publish` 只提供文件版本。Vault 文件队列和最终替换没有收到取消判据。若文件写入在队列中等待时调用被取消，Dispatcher 可先返回结果未知，后续仍发布整批并产生更新事件。现有取消用例只覆盖预先取消，CAS 用例验证失败保持原字节，均未覆盖写入已经排队、实际提交尚未发生的窗口。最小判据是在临时 Vault 对提交点设置屏障，确认在提交前取消时定义字节和活动快照保持原状，暂存回收且无更新事件；在提交后取消时，整批结果可查询且不会重放。依据 `packages/kernel/src/credentials/module-credentials.ts:280–290,326–336,380–387`、`packages/vault/src/write.ts:112–151`、`packages/kernel/src/dispatcher.ts:376–411`、`plugins/ssh/test/route-edits.test.ts:115–143,178–189`。

## 规范轴 · 生命周期与用例缺口

- **P1 · 8 秒确认超时尚未覆盖启动、attach 和 Shell 回收。** 新 signal 能取消 `HerdrClient.connect/call` 的本地等待，停机 RPC 已使用它。SSH 的 `ensure`、`terminal.run`、framed hello/attach、标签 list/kill/rm 仍未传入本次操作的取消或统一时限。SSH disposer 先等所有 opening/close，`stopPrivate` 还先等 `starting`，之后才创建 8 秒 deadline。可以构造合法的时序让连接先完成、hello 和 attach 分段迟到，使 Core stop 尚未发送时就超过桌面 Engine 的总 15 秒。此缺口在上一轮已有，本轮只限制最后的 stop RPC。最小判据是在临时目录夹具分别卡住 ensure、run 回复和 framed hello/attach，并在期间停用及关闭 Engine，断言总预算内只处理本次标签，原任务结束或有可复查的未确认状态，晚到启动不会被当成回收完成。依据 `plugins/ssh/src/engine/local-pty-herdr.ts:17–71,74–97`、`plugins/ssh/src/engine/local-shell.ts:182–198`、`packages/herdr-client/src/client.ts:51–83,143–182,213–228`、`packages/herdr-client/src/herdr-core.ts:99–121,252–266`、`apps/desktop/src/main/engine-supervisor.ts:261–278`。
- **P2 · 丢失创建回复的清理限定在一种错误路径。** `951fe442` 在传输断开或超时的 `HERDR_UNAVAILABLE` 下，经 `peek` 只清理精确标签的本地终端；未观察到该标签时返回不可自动重试的 unknown。已取得地址后的 attach 失败或流丢失仍使用旧 RPC 连接，后者吞掉回收错误并通知 view ended。JSON-RPC 错误在共享客户端为 `HerdrError`，也不进入对账。相邻上游 `api/run.rs:30,60` 允许终端启动后在持久化阶段报 RPC 错误，随包 0.1.19 的这一故障分支仍需实测。最小判据是替身分别模拟已交付地址后的 RPC 换连接、已创建后返回错误、首次 list 之后才出现标签。记录清理确认或持续待核对，且同 Core 的旁路 Shell 不受影响。依据 `plugins/ssh/src/engine/local-pty-herdr.ts:23–81`、`packages/herdr-client/src/client.ts:11–18,134–139`、`plugins/ssh/test/terminal-runtime.test.ts:132–194`。
- **P2 · Windows 的严格停止尚无 holder 确认证据。** POSIX 检查对应命名端点文件，Windows 的 `hasHolderEndpoint()` 固定返回 false，Core pipe 不可达时就可能被视为全部停止。原生 Windows、过期 socket 与 holder 进程级检查均未验证。完整崩溃恢复、迟到启动持久对账、Herdr 0.1.19 在 Unix 主动脱离的后代及 WSL 来宾回收仍是已知 A17 缺口。依据 `packages/herdr-client/src/herdr-core.ts:252–279`、`packages/herdr-client/test/herdr-core.test.ts:32–57`、批次 `t5h/report01.md` 的平台与验收说明。

## 已核对的行为和入口

- **批量路由的发布与凭据。** 每个目标都检查原 revision，包括预期跳过的项。候选整图包含停用边，拒绝缺失、自指、环和旧式跳板。写入先阶段化按新 revision 的本机快照，再对 portable 定义整文件进行一次 CAS。已配置认证的加密引用及派生目标不变。canonical Vault/module 队列内保留进行中认证的快照 pin，完成后统一回收。两服务相同旧版本同时提交只成功一次，带当前版本重交已生效状态是 no-op，带旧版本重新提交会冲突。相同 Dispatcher key 的正常短期重交沿用现有幂等缓存。清理历史未引用 key 时仍可能调用本机保护后端，已通过的锁定夹具证明普通更新不需读取密钥，未证明所有收尾都与密钥后端独立。依据 `plugins/ssh/src/engine/host-configurations.ts:195–245`、`packages/kernel/src/credentials/module-credentials.ts:114–139,273–341,390–449`、`packages/kernel/src/credentials/versions.ts:207–253`、`packages/kernel/src/dispatcher.ts:311–338`。
- **H3.2 的工作台与 CLI/MCP 边界。** 普通桌面从 SSH 的「跳板路由」进入批量面板，筛选后保留勾选及原 revision，按钮提交 `ssh.routes.edit`，提交后按实际更新逐项刷新。它与主机表单读取同一份定义图。后端认可 desktop 和受邀请 Web 的工作台主体。独立路由按钮仍受 desktop 宿主判断，浏览器没有这条普通 UI 入口；这项限制来自前置实现，浏览器 API 可用性无法替代用户入口。CLI/MCP 的能力目录中是 `exposable: false`，直接 CLI 已测 `CAPABILITY_NOT_EXPOSED`，MCP 使用同一拒绝判据。外部批量编辑仍缺原路径、拟改路径和所有受影响者的资源授权合同，不应算作 H3.2 的外部交付。工作台已打开的传输由原 manager 快照维持，受影响的外部探测会按当前授权和路由版本重新校验并可被关闭。依据 `plugins/ssh/src/ui/SshModule.tsx:74,259,357–361`、`plugins/ssh/src/ui/RoutePanel.tsx:92–132,151–211`、`plugins/ssh/src/engine/capabilities.ts:62,85–94`、`plugins/ssh/src/engine/index.ts:142–151,549–556`、`plugins/ssh/src/engine/public-probes.ts:304–312`。
- **外部 workspace owner 与已移除绑定。** 当前 owner 以 CLI 或独立 MCP session 主体确定。外部请求必须含 generation、expectedLayoutRevision 和 intentKey，正式修改前核对有效 host 授权及绑定路由版本。换序保持 pane/shell IDs，连接绑定按 paneId 重排。关闭只 detach 对应 watcher、结束该 Shell 并重算保留的 host 集，后续检查不会重新读取已移除的绑定。重连会新建代次和布局 revision。仍缺同一跳板被多个保留/删除 pane 共用、删除后其原连接关闭、失效保留路由、重连期间并发旧请求及旧代次重放的组合用例。工作台原本由 Dispatcher 缓存的布局幂等因新增 handler 策略被绕过，当前桌面表单每次提交新 key，带原布局 revision 重发仍可防止二次副作用。见 `plugins/ssh/src/engine/public-workspaces.ts:84–145,228–266,284–300`、`plugins/ssh/src/engine/workspace-pane-capability.ts:8–28`、`packages/kernel/src/dispatcher.ts:311–318`。
- **私有 Core 常规路径。** 停止直接使用私有连接上的 RPC，要求 stopped 回执，再查 endpoint/holder，避免了依赖二次 spawn 和只查 CLI exit code。并发严格 stop 共用请求。Linux 两种二进制解析入口的正常停用已有真 PTY 证据。Agent 的默认 stop 路径与 framed attach 调用方式保持原行为。随包 Herdr 0.1.19，编排 hc 0.1.21，相邻上游源码只作为协议行为线索。依据 `scripts/herdr.lock.json`、`packages/herdr-client/src/herdr-core.ts:235–279`、`packages/herdr-client/test/herdr-core.test.ts:32–57`。

## 已有验证及未运行项

| 证据 | 确认范围 |
| --- | --- |
| `t4x/report02.md` 与 `h7-batch-routes-integration.log` | worker 7 项对应前置实现，Lead 并入 `29c3fe32` 后记录 3 个定向类型检查、8 个路由测试、18 个凭据测试和 2 个能力目录测试通过。路由 E2E 只有收录证据。 |
| `h7-external-layout-before/after.log` | 两条 CLI/HTTP MCP owner/layout 用例由失败变为通过，另有两条 PTY 撤权用例及一条工作台分栏用例通过。现有用例覆盖 peer、启用、旧 revision、即时重交及关闭后撤权，未覆盖旧完成结果被后续合法编辑替代。 |
| `h7-local-launch-before/after.log` | 两条 lost reply 替身用例红转绿，合计 5 条 runtime 通过。真 PTY 绝对路径与 PATH 两条通过，分享总流程用例被过滤。 |
| `h7-core-stop-before/after.log` | Core 二进制缺失与仅 holder 两条替身用例红转绿，另有两条真 PTY 和一条真实 attach 通过。替身 holder 用例只检查 stop 方法的错误，不检查插件停用响应。 |
| 静态核对 | 根及相关 `.agents` 的 AGENTS 约束已核对，`git diff --check f2159c2e^ 29c3fe32` 无输出。路由界面按 `zh-modern-web-guidance` 搜索并获取 forms、accessibility、accessible-error-announcement，与原生选择控件、提交和结果播报对照。 |

日志位于 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/`。本轮仅复审源码、项目规格和已有日志。未运行测试、E2E、应用、构建或打包。尤其缺桌面 H3.2 E2E、浏览器工作台入口和跨平台异常停用证据。

## 阻碍与接续

`HC_TERMINAL_ID=t4t`、本机、topic、`manifest.tsv` 当前指针 `t4t/task02.md active`、来信与 Lead `t3p` 已核对。当前沙箱中 `hc get t4t` 仍报默认 Core lock 所在文件系统只读。报告从同目录临时稿完整发布到同号路径。

## Lead 验收

Lead 复核固定基线和证据。`bb7b9b6a` 修复同代中后续编辑后失去旧回执，保留原有撤权检查，两类入口和 PTY 撤权共四项通过。`526699ef` 将取消检查推进到 Vault 写入队列内的提交点，9 项批量路由与 18 项凭据回归通过。`6f1b6cd3` 使停用返回回收待核对并保留停用状态，移除 holder 后可复查并重新启用。`717ae0a4` 接通启动等待、RPC 和 attach 的取消时限，定向验证 13 项通过。Windows holder、崩溃清单和脱离 PTY 的进程仍需实现与实测。
