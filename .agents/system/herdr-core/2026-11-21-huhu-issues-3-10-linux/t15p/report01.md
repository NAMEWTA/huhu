# 非 SSH 批次完成证据审计

- **任务身份**　Lead `t3p` → `t15p/task01.md`，本机 Herdr Core，独立审查。共享任务根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`。状态为审查报告交付。
- **审查范围**　工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，干净 HEAD `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。以 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030` 为已运行旧候选对照。现有远端核对由 Lead 提供，本地跟踪引用相符，feature 指向当前候选，main 仍在旧候选。#7 SSH、其分支/change 及依赖 #7 的验收项保持暂停。
- **依据**　逐项采用七个 change 的 `source.md`、`spec.md`、`plan.md` 和实测记录。原型确认取 `6da1b2ec`，范围变更和组合要求取 [program.md](../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/program.md)、[11-21 定案](../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md) 和任务指示。下文 `E` 表示项目主目录下的 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/`，无此前缀的运行日志在本报告同目录。旧候选 E2E 以 `E/e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/{result.json,run.log}` 为准。

## 当前候选结论

候选具备源码门禁和 Linux 制品。七项整体签收仍缺同包实测，并有两组定向失败须完成复验。独立外部工具的任务链、真实 Codex 任务路径、Mail 回环协议及模块凭据分别有运行依据，结果按各自实际提交、包和运行入口使用。

| 验证 | 已核对的结果 |
| --- | --- |
| 固定候选源码 | `combined-gates-05a748b6.log` 显示 lint、CSS 源文件检查、knip、格式、vendor 类型及全部工作区类型完成。脚本变更导致第 16 行 `-r: command not found`、退出 127，停止在 build 之前。t15k 的 `combined-build-05a748b6.log` 独立完成构建和桌面产物 CSS 检查，build-info 为 `05a748b`。 |
| 固定候选制品 | `package-05a748b6.log` 的 Electron 44.9.1、Linux x64 AppImage SHA-256 为 `44eb01b894a4b81a17c27132b8aab29c98894f52340c5129036c1d5ae90c49d1`，deb 为 `bcf19efd240bcf81aabc19ace8685b905c932a0c12c32b6d8ece47ab0e96d05f`，均在本工作树 `apps/desktop/release/`。构建日志提示 desktop entry 与窗口关联可能受 `desktopName` 缺失影响，用户影响待原生桌面核对。 |
| 前期全量 Vitest | t101 `349fd374` 原始结果 2056 通过、4 失败、11 跳过。两项 SSH 原失败属暂停范围。Engine 健康检查夹具明确使用不存在的 Core 后定向通过。CLI 同一 Engine 扩展卸载/复装 `ECONNRESET` 在原用例、完整文件（18/18）和 Engine+CLI（68/68）三次定向通过，原因仍未证明。见 [linux-final-gates.md](../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/evidence/linux-final-gates.md)。 |
| 前期全量 E2E | t109 `4ae7e7e4` 为 351 通过、48 失败、18 跳过，另有 6 项测试外错误。运行层级混合，T7.2 和两项 Linux Agent 使用旧 AppImage，Web 分享由源码应用启动。旧包 SHA-256 为 `f497456baf7a6ea4146b3ec82694374ad3965cb51f3a747adcac5c4003d68d8a`。 |
| 固定候选定向 E2E | t15n Notes **31 通过、1 失败**，Mail **9 通过、4 失败**。原非 SSH 失败集正在复验，收件正文/发表、紧凑命令、旧编码、1440px 工具栏及 B01 画板快照等已有通过行，整组以最终 JSON 为准。映射为 33 项源码选择和 1 项另行同包 `workspace`，`failed-source-selection.json` 仅是选择表。t15r 同锁排队单独复现 Notes 失败。t15q 包队列在等 t15n，同包结果尚无通过证据。 |

## 规格轴 · 逐 Issue

### #3 桌面外壳

| 原要求 | 核对结果 |
| --- | --- |
| TB-01–12、17–18，启动/工作台/错误页共用标题栏，主题、菜单、原生窗控、Web 宿主边界 | `apps/desktop/src/main/window-chrome.ts:18,38`、`app-menu.ts:115` 及 `index.ts:274,298` 提供平台窗口、可信来源、菜单和失败页接线。旧 t109 `shell.spec.ts:33,75,407,1492` 已实跑空库/切库、窗口启动、主题持久化、关于页。旧 `web-share.spec.ts:57` 验证实际菜单与 Web 区别。当前 Notes 的主框架重载、工作台失联、启动资源失败分别通过 `session-flush.spec.ts:1167,1326,1354`。`window-chrome.spec.ts:11` 全文件限 Win32，旧 t109 的六个跳过项无 Linux 覆盖。历史 Windows 26300 对四主题、长标题、WM_NCHITTEST 和全屏有实际构建记录，详见本 change `evidence/S1b-S2-window-chrome-windows.md`。 |
| TB-13–16，焦点操作、最后输入落盘、取消/失败保留、IPC 回执 | 当前 `session-flush.spec.ts:305,396,1078,1122,1167,1272` 已过真实 Electron 菜单焦点和单次保存、看板优先、重试、超时、顶层重载及迟到许可。关键的多窗口 TB-15 在 `session-flush.spec.ts:1211` 等待 `engine-state` 20 秒超时，未进入第二窗和取消断言。旧 t109 同名用例及 Windows t73（`a4681d74`）均通过，可作为原协作行为证据。关闭时序的 Main 文件相对旧 Linux 候选无变更，Notes 参与者已有实质变化，所以当前候选该交互仍待复现，不能归为已确认的关闭逻辑回归。JSON 在 `E/targeted-notes-05a748b61eaa6dddaaa86aa648a2e68dd385d085.kmitLe/result.json`。 |

**剩余**　t15r 先确定首窗进入工作台后再取 TB-15 双窗断言。当前包以 `web` 和 `package` 补首次进入、菜单和关窗重开。Ubuntu GNOME 原生 Wayland **与** Xorg 都是已承诺的 Linux 安装验收，需要记录操作系统、会话、DPI/主题、拖动、窗口边缘、最大化/全屏、键盘菜单/退出、任务切换器和桌面关联。Windows/macOS 实装、Snap、红黄绿与系统菜单是另列的平台签收。

### #4 Agent CLI

| 原要求 | 核对结果 |
| --- | --- |
| A/B、D/E，Space、四向分栏、历史身份、文件和评审、UI 生命周期 | 旧 t109 `shell.spec.ts:329,1233,2070,2138,2242,2299,2341` 通过实际 Space/文件/worktree、至少两 Space 的递归分栏、布局保存与跨 Tab 移动、CLI 启动回包丢失和历史筛选。`acceptance.spec.ts:615` 验历史固定。核心接线在 `plugins/agent-cli/src/{engine/workspace-layout.ts,shared/workspace-layout.ts,ui/history/HistoryPanel.tsx}`。旧 ACC-AG-04/05/08、终端 exit、变更评审、Agent 设置尚依赖当前 33 项复验。现有单项证据未覆盖三 Space 全矩阵、所有键鼠/IME/缩放组合及持续输出场景。 |
| C01–13，实际 provider、协议、运行身份、受保护环境 | `6a510e6f` 的 `E/real-provider-netns-check.log` 实跑 Volta Codex、Volta Pi、直接 npm Pi、原生 Claude 4 项和同 host 返回 shell，另有 `cce683a0` Bash-as-sh 及原生 PTY 复验。见 W7.3 本地证据及 `E/provider-shell-alias-check.log`。原生启动底座及随包 Core 锁相对旧集成候选无差异，可复用为 Linux 实程依据。该环境离线，覆盖真实二进制和登录界面/输入，账号认证或真实模型服务另行取证。t109 旧 AppImage `agents/linux-environment.spec.ts:166,203` 两项实测覆盖真实 Core/PTY、普通值、Safe 三态与后代回收，provider 使用合成探针。丢失目标 `8c1a9675` 有 t112→t113 的红绿和当前独立链的生产调用覆盖，详见 `E/ended-target-check.log`。 |
| F01–06、W8.1–W8.3，布局恢复、任务定位、真实包 | W8.1 `evidence/W8.1-space-package.md` 和 `spaces-package.test.ts` 验已提交纯布局往返、ZIP 不含 runtime、无效路径不触达 Core，恢复后的实际界面及重绑仍待组合证据。t109 的 W8.2/W8.3 `task-journey.spec.ts:457` 在预期的 `blocked/target_unavailable` 实际返回 `waiting_resource` 时失败。当前实现修复详见 `dispatch.ts`、Tasks 执行器和 `8c1a9675`，最终 `workspace` 待运行。 |

**剩余**　同包跑 `workspace`、`native` 和 `web-terminal`，核对原尝试、会话、历史落点和退出/继续，不用旧包代签。完成失败集内的恢复、评审、设置及终端输出性能，补 W8.2 尚无对应证据的高输出交互、主题/缩放和布局恢复后的操作现场。Windows 原生 Pi、ConPTY/登录入口及其他声明支持的实际平台单列，交叉编译用于构建证据。

### #5 任务与自动化

| 原要求 | 核对结果 |
| --- | --- |
| A01–08、B01–09，Task 为收发入口、人工和定时、DST、停用与跟进 | `plugins/automations/src/engine/{default-task-scan,dispatch-window,task-scan-occurrences}.ts` 与 Tasks 回执/执行器共用调度和任务持久化。早期 `persistence-http.test.ts` 38 项和 `task-scan-occurrences.test.ts` 29 项通过，见本 change `evidence/T7-cutover-linux.md`、`E/agent-tasks-combined-linux.log`。t109 源码 `task-journey.spec.ts:97,147` 验定时与人工同路径、目标不可用后人工关闭、DST 且保持启用。旧失败的 Agent 规则已迁到 Tasks 契约，当前 `shell.spec.ts` 的任务派遣/结果/会话复验仍待。 |
| C01–08、D01–11、E06，原问题原会话续接、故障恢复、唯一结果、人工完成 | t109 **真实 Codex**（受控回环模型）在旧 AppImage 的 `task-journey.spec.ts:216` 通过；JSON 有回执身份、包摘要、人工立即派与新模板附件。测试具体断言包括跨日、停用前 Tasks 无收件记录、恢复只丢一次消费 ACK、同 receiptId 重交、持久投递、单评论和人工完成。这个用例与当前字节一致，调度主体未改，不过当前候选的 Agent/Tasks 不可用判定有变化，最终仍需同包 `tasks`。t114 独立链 5/5 给真实 Core 的协议和回执补证，模型侧为合成 provider，见 `E/native-independent-journeys-check.log`。 |
| E01–07，外部权限、Linux 终端批准、模块环境 | `f13d4c78` 的原生取消和清理独审关闭，Agent 54/54、Automations 44/44、真实 CLI/MCP 2/2，详见 program 和 #4 W7.3。t109 源码 `automation-linux-environment.spec.ts` 已跑真实 sh/Core、同请求批准和两传输；当前扩展到 `rule`，会验证 Safe 三态、轮换、撤销、回执和实程，尚待当前包。现有生产自动执行矩阵按实际支持的 provider/模式记录，Claude/Pi 的交互启动和单轮输出不足以证明原生多轮自动任务。 |

**剩余**　同包 `tasks` 与 `rule`，保留唯一发生/结果、前置停用和一次 ACK 丢失、执行计数及撤销结果。Agent 规则桌面工作流等候当前源码失败集。

### #6 统一工具与 Web 入口

| 原要求 | 核对结果 |
| --- | --- |
| A–C/F、D02–03/D08/D10 非 SSH 部分，目录、默认关、共享配置、批量和故障、四入口及逐领域 | #6 `evidence/G-{session-identity,resource-grants,notes-inbox-guide-exposure,tasks-automations-exposure,agent-cli-exposure,kernel-exposure,mail-exposure,versioning-safe-exposure}-linux.md` 与 `G1.1-action-inventory.md` 分别绑定实际 handler、授权及传输。旧 `acceptance.spec.ts:1097,1116,1872` 实跑网关配置、冲突、实际调用记录。当前 `80db95d0` 复验 `domain-exposure.engine.test.ts` 11/11，CLI/HTTP MCP 各做 33 项默认关、授权、撤销和重启，旧外部版本条件也通过。Safe 的四入口和 Mail 双入口见 #9、#8 的实际集成证据。旧 `G-mail-exposure-linux.md` 的 EPERM 不能当通过，之后有 `web-mail-safe-combined-linux.log` 和旧全量 Mail 能力文件绿灯补证。历史网关用例的策略假设已调整，当前剩余实际结果待失败集。 |
| D01/D09，各自完成 Agent 任务，桌面和 Web 刷新同任务 | `4beb7eae` 的 `plugins/agent-cli/test/native-receipts.live.test.ts:470` 两条 **CLI-only**、**HTTP MCP-only** 分别完成创建、编辑、派遣、查询、回答与原会话结果。t114 在相同差异上实跑 5/5，后来这些用例未改，实际生产 Engine/Core 与合成 provider。`external-task-web.spec.ts:21,80,92,110` 另验证包内 CLI 创建、MCP 编辑、桌面/Web 读同 ID、刷新和撤销。它创建普通任务，覆盖 D09。当前真实 Codex 包旅程经工作台/内部调用，未用各自外部入口跑完整问题闭环。若按 program 签同版本外部独立链，需补固定候选上的这两条运行证据并关联实际工作台，报告应保留两层运行来源。 |
| E01–07、G6/G7/G8.2，单 Engine/Vault、邀请、静态资源、文件、终端与双设备 | 旧 t109 `web-share.spec.ts:57` 实跑源码桌面加浏览器，两邀请三会话、关联撤销、布局保存/刷新/重开。`apps/engine/test/web-share.test.ts` 与 `packages/kernel/test/web-assets.test.ts:8` 证明同 Vault、条件冲突、MIME/深链与缺失资源。当前 `web-share.spec.ts:80,211` 新增包启动和笔记深链、桌面/浏览器双向保存；`web-terminal-widgets.spec.ts:246` 新增 Web 观察、接管、刷新同一 Agent shell；两条当前包路径均待运行。Mail 源码 E2E 里的 9 MiB 文件可证 Web 受管上传和读回，不能覆盖第二设备下载、普通 LAN HTTP 剪贴板、UUID 及文件选择的全矩阵。 |

**剩余**　同包 `web`、`tools-web`、`web-terminal`，取得真实授权入口和同对象读回。G8.2 所列同包四入口的授权、读写与失效目前有分层记录，若仅跑现有模式，要保留未发生的 stdio/通用外部 API 同包格，不能用 D09 的 CLI+HTTP MCP 代签。G6.5/E02 和 G7.1/E04 还需第二物理 LAN 设备及实际文件落点。D04–07 和 D10 的 SSH 路径按用户决定暂停。

### #8 Mail

| 原要求 | 核对结果 |
| --- | --- |
| M-01–08/S1–S2、S7，账号、联系人、阅读、写信和 AI | 本 change `evidence/S1-workbench.md`、`S2.1-public-reader.md`、`S2.2-search-locate.md`、`S2.5-replies.md`、`S2.6-forward.md`、`evidence-S7.2-mail-ai-selection.md` 给回环 Engine、真实组件或宿主的入口证据，层级各见记录。当前 Mail 九个通过项覆盖同地址原批次恢复、系统浏览器启动/迟到回执、IMAP 通知定位、搜索焦点、保存失败后重试、选择附件、Web 9 MiB 上传/取消和单封图片/原文。用例为 `workflows/mail.spec.ts:368,449,491,524,569,584,623,676,733`。旧账号/联系人/回复转发的字段和 UI 历史证据仍可补充，Graph 收件与权限交互采用当前结果。 |
| S3–S5，Gmail、Exchange、适用 Graph、同步与通知 | `25f5866b` 已有 Graph 生产正向实现 `engine/{oauth-provider,graph-mail,graph-send,message-cache,outbox}.ts`。Exchange 默认授权，适用的 Graph token 按资源和范围处理，Mail.ReadBasic 有限制。`mail-recovery-check.log` 真实 Engine + 隔离 OAuth 发行方、回环服务的 OAuth 9/9 与 Outbox 20/20；覆盖 Gmail history/原生 ID、Exchange IMAP/SMTP、Graph delta 分页/补位/重启续查、换回 Exchange、Graph 降权和可重试收件人。旧 t10b 对正向实现缺失的结论已被当前代码和回环回归替代。S5.2 的 Graph 「可证实首次入箱」、其他目录移入及证据不足时静默仍待用户决定，见 `t14s-report01.md`；现有 IMAP 通知和 Graph 补位均不能代签此口径。 |
| S4/S5 工作台争议路径 | 当前四项 Graph UI **实际失败在共同夹具** `workflows/mail.spec.ts:190` 的 `getByLabel("时间", { exact: true })`。四份 error-context 均显示名为「时间」的 combobox，且选在「今天」。初始回环同步和 Web 进入已成功，降权继续读取、切账号取消、关闭标签取消、只接收重试与复权重试的业务断言均未到达。可按实际可访问角色/名称修正夹具后保持原四项断言复跑；当前证据不能据此确认 Graph 业务发生回归。原 trace 见 `mail-artifacts-05a748b6/`，结果见 `targeted-mail-05a748b6.log`。 |
| S6/S8/S9，持久投递、恢复、权限和真机 | `outbox-engine.test.ts` 计数证明同版本两来路只有一次 SMTP DATA、部分拒收可定向重试、未知结果或恢复不重投；同地址独立恢复、已读标记、原批次继续见 `E/mail-batch-recheck.log` 与当前 UI 第 5 项。对应生产接线在 Mail Outbox/账号和受管附件。旧包/源码的外部开关实测可证明范围契约；最终包 `package` 凭据及新格式恢复、S8.3 第二设备 OAuth 发起并由 Engine 回调后 Web/CLI 核对同会话，仍缺当前证据。 |

**剩余**　复验四项 Graph UI 和当前包凭据场景。保留 Graph S5.2 待定，并另列 S9.1 真实授权的 Gmail、Outlook、第三方 IMAP/SMTP、授权配置/提供商限制，以及 Windows/macOS 实装、全主题/键盘和原型场景走查。新增 Graph 专属 consent 与历史 one-mail 迁入按已定范围排除。真实 OAuth/SMTP 不从回环或探针推导。

### #9 Safe 与模块自有凭据

| 原要求 | 核对结果 |
| --- | --- |
| A01–07、B01–05，三账号五字段、标签、锁定/冲突、恢复 | 旧 t109 `safe-tags.spec.ts:51,179,265` 及 `shell.spec.ts:682,838` 实跑多账号、标签、按账号复制、迟到锁定、最后账号确认。`personal.engine.test.ts` 10 项及 `evidence/P3.4-P10-linux.md` 覆盖锁定和敏感读写。Safe 业务代码在旧候选至当前未改，现有细项可复用。旧「本机 Web 初始化/重锁/解锁」「窄窗三账号、回执丢失与冲突」分别失败，候选当前复验待结果。B05 按新格式和真实旧库保全执行，旧库转换不在范围。 |
| C03–06、D01–05，Git/Agent/规则/Mail 独立，ZIP/Git 保护和撤权 | `remote-auth.ts`、`askpass.ts:75` 负责 Git 定向认证。`remote-auth.engine.test.ts` 有真实回环 HTTPS push/pull、锁定/停用、换目标不重用旧值。`safe-sync.test.ts` 7 项保全整代密文和暂存，加上 `E/vault-package-combined-recheck.log` 的包异常及恢复测试。`external.engine.test.ts` 3 项由桌面、CLI stdin、HTTP API、stdio/HTTP MCP 修改同一数据，按显式授权取值并验证在途撤权。真实本机 Linux Secret Service、旧 AppImage 的 Agent 三态、真实规则回环和 Mail IO 分别有实测，见 #4/#5/#8。候选包 `git-credentials-package.spec.ts:76`、`automation-linux-environment.spec.ts:25` 和 `packaged/packaged.spec.ts:241` 各有对应断言，当前尚无联合结果。 |

**剩余**　在同一当前 AppImage 跑 `native`、`rule`、`git` 和 `package`。检查普通列表不回显、外部撤权而内部仍工作、新空库恢复三账号标签和模块重新认证的实际结果，以及 Git 换地址仍拒旧凭据。C01/02 SSH 暂停。其他平台钥匙串使用和新机真实重新配置保留实际宿主范围。

### #10 首页看板

| 原要求 | 核对结果 |
| --- | --- |
| ACC-DASH-01–13、16–18，插件实例、草稿、持久化、故障、Vault 边界和真实卡片 | `packages/workbench/src/home/HomeModule.tsx`、`packages/kernel/src/capabilities/home-dashboard.ts:106,119,207` 接入相同布局、原子提交和恢复。旧 t109 `acceptance.spec.ts:37,150,189,249,724,771,823,849,898,949,1004` 分别通过真实任务操作、笔记定位、捕获、Agent 活动、移动/尺寸草稿、窄窗共用布局、重开和恢复。`dashboard-recovery.test.ts:113,141,168,211,255,286` 6 项有实际 Engine 新格式恢复与保全原件。旧 `acceptance.spec.ts:58` 的独立筛选/时区/冲突失败仍待固定候选的 33 项复验。自动旧 hidden/order 迁移按确认取消。 |
| ACC-DASH-04、09、11、14–15，失败保留、离场与重开、单卡权限、键盘/响应式 | 当前 Notes 的 `session-flush.spec.ts:305,396` 已证明看板先于笔记检查、继续编辑/保存失败保留、保存和放弃两种真实关窗、落盘及专注暂停。当前包 `web-share.spec.ts` 补浏览器布局保存后刷新和桌面重开。`web-terminal-widgets.spec.ts:360,383` 以浏览器拦截真实能力目录模拟单卡能力缺失和撤回，核对零相应写请求及其他卡可用。即使运行通过，也只证明前端权限退化；真实授权撤销在 `tools-web`/邀请用例另有断言。 |

**剩余**　同包 `web`、`web-terminal` 中取布局/读写能力失效、刷新和重开结果。补 W06 的四主题明暗、1024×768/1366×768/最小窗/窄浏览器、键盘移动与尺寸及 reduced-motion 的实际记录。历史窄窗和原型结果按原范围使用。依赖 SSH 的实例证据不重开 SSH 模块。

## 同一包剩余验收清单

| 顺序与责任 | 可验收输出 |
| --- | --- |
| **1. 源码定向，t15n 与 t15r** | 收取 `targeted-groups-05a748b6.json` 和各组完整 Playwright JSON，保留每个失败的阶段。TB-15 单项独立 trace 核对首窗是否-ready、双窗取消是否真正到达。Mail 四项同一夹具定位修复后复跑，保留业务断言。旧 33 项保留 #2 编辑器回归和既有性能门槛，不用脚本枚举或运行中计数结案。若测试或产品随之变更，记明新 SHA 与旧包适用范围。 |
| **2. Agent / Tasks / 工具，t15q** | `tasks` 1 项、`workspace` 1 项，保留 task/run/attempt/session/request/receipt/message 和包身份附件。`tools-web` 1 项补同任务的外部创建更新和双面刷新。按 #6 D01 指向独立 CLI/HTTP MCP 全链记录，保留当前包的独立链覆盖差距。 |
| **3. 模块认证，t15q** | `native` 2 项、`rule` 1 项、`git` 1 项、`package` 5 项。包内 CLI+HTTP MCP 真正授权/撤销、Mail 认证与新格式 ZIP 恢复包含在 `package`，`credentials` 是其中 1 项的窄模式，避免重复计数。区分 Agent 真二进制、合成探针、真实 Core/PTY、回环邮箱/Git 服务器与真实第三方账号。 |
| **4. 桌面 / 共享工作台 / 看板，t15q** | `web` 1 项验证菜单、无桌面动作、深链、笔记双向写、两邀请三会话及关窗重开；`web-terminal` 3 项验证原会话和两种单卡退化。追加对应 Ubuntu 原生会话、物理第二设备相应格，保留未获环境的原因。 |
| **5. Lead 汇总及远端** | 按同一候选提交与 AppImage SHA 收各模式 JSON，使用 `scripts/accept-linux-candidate.sh:86` 的实际通过数、无 unexpected/skipped/flaky 和无外部错误判据。包建立和 AppImage 启动分别记，deb 仍需实际安装操作。只有 Lead 能据成员证据决定是否落地并核对远端 main。发布平台门槛与本机可完成项分别如实保留。 |

## 规范轴与未运行验证

审查范围内的生产调用和候选启动脚本未发现新增的明确项目规范违规。已核对按既有 preload/共享工作台划分宿主动作、按模块所有者取得非 SSH 凭据、按可调用的公共合同走工具。`envRefs` 的剩余识别或迁移拒绝用途有原回归证据。当前包装器先核对干净 HEAD 和 artifact/provider 摘要，再隔离 HOME、XDG、Secret Service、Xvfb 和 heavy lock。旧 RC.4 同版本号有不同摘要，报告以完整 SHA 和实际启动路径为准。源码门禁、包生成、真实 UI、多平台取证各自独立。

本次仅做只读审查和写入本报告。未运行测试、E2E、类型或静态门禁、构建、打包、安装、截图、部署、推送或任何子 agent。未操作旧 Vault、真实个人凭据或 SSH。报告采用 t15n/t15r/t15q 的审查时点运行状态，后续结果以 Lead 收取的相应独立日志和 JSON 为准。

## Lead 验收
2026-11-23：已核对逐Issue原规格、日志和当前候选边界，接收本次只读证据审计。不代表整批实现/验收完成；运行中结果继续以独立JSON收取。
