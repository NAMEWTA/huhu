# 最终验收覆盖独审

- 状态：只读审查完成。固定候选仍有未完成的验收和已观察的失败。
- 任务：Lead `t3p` → `t10b/task01.md`，`wta-ubuntu`。
- 审查对象：`4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。集成工作树干净，`HEAD`、本地远端跟踪引用 `origin/main` 与 `origin/feature/issue-fix` 相同。本地 `main` 为 `7811141b`，主目录本地 `feature/issue-fix` 为 `47f190b1`。本次以固定提交为准，未重新查询服务器引用。
- 源码链接以集成工作树为基准。规格依据为 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/{program.md,decisions-2026-11-21.md,evidence/linux-final-gates.md}` 及七项各自的 `source.md`、`spec.md`、`plan.md` 和下列任务。运行日志位于 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/`。

## 规格轴

### 仍阻碍最终签收的差距

1. **#6 D01 / G5b.1 的两条独立业务链仍缺。** 已实际通过的 `plugins/agent-cli/test/native-receipts.live.test.ts:261` 使用真实 Engine、Core、HTTP MCP 和 CLI 命令入口，provider 为合成 App Server。一条任务由 MCP 创建、CLI 派遣和答复，MCP 查询问题。另一条由 CLI 创建、MCP 派遣和答复。两条均缺各自入口内的编辑步骤。它证明跨传输共用业务记录、原会话和重交，但规格明确要求 MCP-only、CLI-only 各自完成创建、编辑、派遣、查询、回答、读结果。随包 `tests/e2e/workflows/task-journey.spec.ts:216,457` 从工作台和内部能力驱动真实 Codex 与回环模型，分别补真实调度、定位和 ACK，无法补外部入口独立性。另缺同一外部任务在已打开桌面与 Web 上的刷新读回（D09），现有 HTTP 工作台测试仅由 Web 创建任务再从桌面能力查询。产品公开能力已有接线，此处判为验收覆盖缺口。
2. **#6 G6.2/G6.5/G7.2/G8.2 与 #3/#10 的同包 Web 路径缺证。** `tests/e2e/workflows/web-share.spec.ts:57,99,152,174,189,209,245` 经真实桌面、Chromium 和 Engine 验证当前菜单保存、两邀请三会话、关联撤销、浏览器布局保存、刷新与桌面重开，明确选择 `local`，并由 `tests/e2e/helpers/launch.ts:22` 起源码应用。未从固定包的 Web 资产打开及刷新业务深链，也未测第二台 LAN 设备双向任务/笔记编辑和 Agent 终端刷新保留会话。HTTP 级 `apps/engine/test/web-share.test.ts:33,100,114` 与 `packages/kernel/test/web-assets.test.ts:8` 分别覆盖同 Vault、版本冲突、MIME/深链/缺资源。它们不能填同包和 LAN 的验收格。Widget 读权限缺失、写能力撤回在 `acceptance.spec.ts:139,150,249` 经桌面拦截响应覆盖，浏览器联验实际验证有权保存与邀请整体撤销，尚缺卡片权限退化这一断言。#7 SSH 均按暂停范围排除。
3. **#8 S4.2 存在实现差距，另有第三方环境限制。** 批次决定仅暂缓新增 Graph 专属授权，保留 Outlook IMAP 完整闭环，并写明已有合适 Graph token 路径按能力验证。当前 `plugins/mail/src/engine/oauth-provider.ts:72,109,156` 仅配置 Exchange，`Mail.ReadBasic` 输出 `graph-metadata-only`，完整 `Mail.Read` 也被归为 `wrong-resource`；生产代码未找到可接受该 token 的 Graph 同步、delta 和正文路由。现行 `oauth-engine.test.ts:500` 明确断言上述拒绝，因此增加真实租户亦不能使当前版本通过 S4.2 的正向 Graph 夹具。Outlook IMAP/SMTP 回环闭环已有证据。最终报告可签已验证的 Exchange 路径，Graph 应以实现差距或经确认的范围决定收口。真实 Gmail、Outlook 和授权 IMAP/SMTP 另受客户端、租户和账号可用性限制（S9.1）；当前两项桌面 OAuth E2E 使用受控浏览器启动和取消/迟到回执，尚缺 S8.3 的第二设备发起、Engine 回调完成、Web 与 CLI 读回同一会话链。
4. **#9 P10.2 同包凭据组合尚未齐；#5/Linux 规则和 Git 有分层证据。** `packaged.spec.ts:241` 以同一 AppImage 的随包 CLI、HTTP MCP 和隔离钥匙串触发真实回环 IMAP 登录，再导入新 Vault 验证 Mail 待配置和 Safe 三账号恢复。该用例在常规全量配置中被 `playwright.config.ts:5` 排除，Lead 单独执行。`scripts/accept-linux-candidate.sh:58` 只选择该用例。它不包含 Git 回环认证或 Agent/规则用例。Agent 的随包环境测试已有可见通过行；Automations 桌面批准/撤销是源码应用入口（`automation-linux-environment.spec.ts:19,23,65,98,120`），真实 Git HTTPS/锁定与停用后同步是 Engine 集成。三者均有实际调用证据，当前缺同一候选包的 Git 与受保护规则组合。普通候选包四项冒烟（`packaged.spec.ts:115,139,180,200`）也不在 t109 或 credentials 专跑覆盖内。记录实际独立冒烟或标未运行，包生成与个别包场景不能代填。
5. **平台签收格仍有缺口。** #3 的 Ubuntu GNOME 原生 Wayland 与 Xorg 均由 11-21 定案明确承诺。当前 `window-chrome.spec.ts:11` 整文件仅 Win32，Linux 连其中的浏览器项也跳过；Xvfb 的源码/Electron 路径无法证明 GNOME 原生拖动、边缘缩放、最大化、全屏、键盘关闭、任务切换器或安装关联。AppImage 与 deb 包日志还提示 `desktopName` 缺少可能影响运行窗口与 desktop entry 关联，是否构成用户可见缺陷需实测。#3 S4 的 Windows/macOS 实际安装、#4 Windows 原生 provider 路径、#8 S9 三平台与真实邮箱、#10 W06 四主题/明暗/实际尺寸及键盘走查，按真实环境逐格签收。历史 Windows 记录仅用于它自己的平台和提交。

### 逐 Issue 证据映射

| Issue / 契约 | 可复核入口、已有证据与最终报告需保留的结果 |
| --- | --- |
| #3 TB-01–18 / S1a、S1b、S3、S4 | `shell.spec.ts:352` 关窗时最后输入落盘；`knowledge/session-flush.spec.ts:48,139,710,754,799,838,904,958,986` 菜单焦点、关窗事务、草稿写失败、迟到回执、app quit、崩溃/加载失败、磁盘回读；`web-share.spec.ts:31,70,166,209` 检查真实 Electron 菜单项处理、另一文件无改写、Web 无桌面控件、看板离场。菜单用例拦截原生 popup 后激活菜单项，物理 Alt/F10、系统菜单和窗口控件仍归原生平台表。 |
| #4 A–F / W7.3、W8.1–3 | `agents/linux-environment.spec.ts:166,203` 已在候选 AppImage 看到两项通过（16.2s/15.4s）：普通值编辑且 D-Bus 不可用，受保护变量 Safe 三态、真实 PTY、键盘/resize、单 pane 返回 shell 与后代回收。probe 为合成二进制。W7.3 的真实 Claude/Codex/Pi Linux 启动与返回由 `real-provider-netns-check.log` 等较早定向证据支持；`task-journey.spec.ts:457` 待取分栏、工作区重连、派遣 PID/会话、两段 ACK、历史恢复和 candidate 附件；`W8.1-space-package.md` 记录纯布局恢复另一路，报告保留异机路径/未绑定状态证据。 |
| #5 原文 §15 / T1–T7 | `persistence-http.test.ts` 38 通过，`task-scan-occurrences.test.ts` 29 通过；覆盖竞态、原问题、重试、规则发生和停用前后。 `task-journey.spec.ts:97,147` 核对实钟/手工与不可用目标、DST 及保持启用；`:216,292,317,332,368` 包内跨日真实调度、同原生会话继续、收件前停用、只丢一次 ACK、唯一结果与人工完成已有具体断言，等 t109 实得及附件。Linux 外部终端两项源码 E2E 与 `apps/cli/test/approved-terminal.test.ts` 2 项（真实 Core/CLI/MCP）分别记录实际执行次数、撤销、脱敏与本机环境。 |
| #6 A–F / G2–G8 | `apps/cli/test/cli.test.ts` 18 项定向、与 Engine 共 68 项复跑；`workflows/acceptance.spec.ts:1097,1116,1872` 网关配置、批量冲突、实际调用记录；上述 Engine/Kernel Web 用例与 `web-share.spec.ts` 覆盖邀请及基线资产。最终报告引用每个非 SSH 能力组的现有 Linux 定向记录（`evidence/G-{notes-inbox-guide,kernel,tasks-automations,agent-cli,mail,versioning-safe}-exposure-linux.md` 等），明确四种传输的实际业务读写与撤销范围，保留上列 D01、D09、LAN/静态包、Web 终端缺口。 |
| #8 M-01–08 / S1–S9 | `workflows/mail.spec.ts:24,105,147,180,225,240,279,332,389` 分别覆盖工作台重开继续原子集批次、OAuth 宿主和迟到回执、通知/搜索焦点、草稿故障与重开、桌面附件、9 MiB Web 上传/哈希及取消、单封图片与原文。主门禁中 `outbox-engine.test.ts` 20 项、`oauth-engine.test.ts` 2 项、`web-draft-attachments.engine.test.ts` 1 项、`tool-exposure.test.ts` 5 项通过。需分别报实际 Gmail/Exchange/自定义 IMAP/SMTP 路径、Outbox 单次 DATA 与未知投递、恢复后零重投、AI 明确批准、桌面与 Web 相应用户路径。包内 credentials 单例仅覆盖其中凭据/整包场景；同地址恢复 GUI、跨设备授权、批准的真实邮箱及 Graph 各按实际口径记录。 |
| #9 A01–D05 / P1–P10 | `safe-tags.spec.ts:51,179,265` 标签、第三账号复制、剪贴板拒绝/迟到锁定及筛选；`personal.engine.test.ts` 10、`external.engine.test.ts` 3、`remote-auth.engine.test.ts` 6、`safe-sync.test.ts` 7 已通过预候选门禁。P8 需要同包新 Vault 的归档 SHA、原账号/标签与新机凭据状态；原包变异拒绝与 Git 整代/暂存证据另引用 `P3.4-P10-linux.md`、`P8.3-safe-git-linux.md`。P10 分别引用真实 Agent、Automations、Mail 与 Git 结果并标记运行层级。 |
| #10 ACC-DASH-01–18 / W02–W06 | `workflows/acceptance.spec.ts:37,58,150,189,249,724,771,823,849,898,949,1004` 覆盖实际任务/笔记/捕获/Agent、布局移动缩放草稿、窄窗重开、恢复/损坏/冲突。 `session-flush.spec.ts:139,162` 已定义继续编辑、保存失败保留脏稿、保存或放弃、笔记落盘及专注暂停。 `web-share.spec.ts:174,197,245` 验证跨会话保存、浏览器刷新和重开读回；`dashboard-recovery.test.ts` 6 项通过。最终分别引用保存失败和重开、真实能力可用性，以及 W06 所承诺的主题/尺寸/键盘证据。 |

## 规范轴与验证状态

- 仓库规定的只读、验证和并发边界均已遵守。索引与测试配置已核对。既有关于 Mail 续跑、原生取消及返回 shell 的定向独审（`t8g/report01.md`、`t9b/report01–05.md`）沿用关闭结论或既有待验项，本次未重复定性。非 SSH 消费者的定向生产扫描没有找到仍从 Safe 解锁取得模块凭据的调用。保留的 `envRefs` 用于识别、拒绝或去除旧规则字段（`plugins/automations/src/engine/service.ts:108,426`）。
- 链路证据：全仓 lint、Knip、format、vendor types 及类型检查在 `349fd374` 通过。Vitest 同次为 2056 通过、4 失败、11 跳过；原两项 SSH 失败原样保留。Engine 坏环境测试隔离修复后定向通过；CLI 扩展卸载/复装的 `ECONNRESET` 在原用例、完整文件和 Engine/CLI 68 项组合均未复现，根因未定。 `dc88d854` 全仓源码 build、Engine types 和 CSS 检查通过，与候选仅证据文档变动，构建脚本及日志可查。
- `final-package-4ae7e7e4.log` 有 AppImage SHA-256 `f497456baf7a6ea4146b3ec82694374ad3965cb51f3a747adcac5c4003d68d8a` 与 deb SHA-256 `c800e9e971c075546daa935551502c917493080ff704c3a9397ea8a6972f7447`。打包产物已生成。对每项包验收仍需对应实际启动、用例与结果，deb 尚无实装记录。
- t109 写入 `e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/run.log`（417 项，1 worker）；读取时仍无最终 `result.json`。保留实际已失败的 compact-inbox G07、compact-submit 三项、editor-compact-commands 选区项，均未修复。故障归因由 t10c 另查。本报告仅确认上表两条候选包 Agent 用例已出现通过行，其余进行中项目等待逐项结果，不签全量或逐 Issue 完成。
- 本审查没有执行测试、类型检查、构建、安装、GUI 或开子代理。Windows 既往报告、原型、测试定义/枚举、环境跳过和未结束的运行分别保留各自证据属性。

## Lead 收取
已核对 Graph 的正向路径缺口与现有批次决定，接受覆盖差距结论。报告从 worker 工作区路径收取，避免扩大写入权限。此处 done 仅表示审查交付完成，不表示功能验收。
