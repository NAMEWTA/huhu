# #8 / #9 Linux 剩余交付边界

| 交接项 | 记录 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux` |
| Core / Lead / terminal_address | `wta-ubuntu` / `t3p` / `t5h` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task07.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report07.md` |
| 核对依据与执行结果 | `f310e541a86825cc5a7ac100b4c230e5bbf1fdca`，`done`。引用的代码均按此 Git 对象读取。只读核对，只写本报告。 |

**同一源 Vault 的 Mail/Safe 恢复已经有代码与定向运行证据。最小剩余工作是让用户在同一固定 Linux 安装包内走完导出、恢复、退出重开和本机凭据重配，并补上已有投递事实的零重发观察。** 另有一个可直接实施的需求缺口：Huhu 新格式 Mail 子集遇同地址时，用户已确认可显式保留为独立账号，固定候选的界面和提交层仍一律禁止选择。两项均可使用合成数据。

## 一、同源备份已验证到哪一步

| 边界 | 固定候选中的实现、已有证据 | 剩余验收 |
| --- | --- | --- |
| 整 Vault 快照与导入 | `apps/engine/src/boot.ts:199–230` 在 Safe 与 Mail 快照边界内选取当代 Safe 文件、Mail 草稿和投递记录引用的附件、可移植模块定义，核对实际归档哈希。导入先在暂存区校验 Safe 与 Mail，再发布到新目录。Safe 的包装 keyring 随快照恢复；系统钥匙串中的模块密钥留在本机。 | 直接复用包能力、存储页及原有领域校验。用固定包在数据与存储页导出/导入，记录两次导出各自的 ZIP 摘要、新目录及新 VaultId、真正重开后的用户可见状态。 |
| 同一源的联验 | `46987e71` 的 `plugins/mail/test/tool-exposure.test.ts:145–289` 用隔离 Vault、TestProtection 与回环服务。CLI 和 HTTP MCP 两个参数化用例分别从各自同一源完成默认关闭、逐项开放、IMAP 登录、撤权及导出恢复。草稿附件哈希及字节吻合、账号/主机 ID 保留、认证待重配，旧工具在撤权后不产生新登录。Safe 三个账号和标签可用该快照密码读回。CLI 分支另测改密后第二包、新密码可用旧密码被拒，以及缺 keyring 或缺被引用附件时目标保持空。日志确认筛选的两项通过。 | 保留这组领域证据，尤其是损坏包和改密前后双包。固定制品的桌面链还需覆盖真实文件选择、重新选择或打开目标 Vault，以及运行中 Engine 使用的实际本机后端。把源和两个目标分别编号，不能用不同用例生成的 Vault 拼成一条旅程。 |
| 投递事实与附件范围 | 上述整包用例创建带附件草稿，总 SMTP DATA=0。它没有在源建立一笔正在投递、结果未知或已接受的历史。S6b.1 在另一组 Windows Mail 子集测试中已有 unknown 记录，源投递一次，恢复没有增加计数。通用外部整包即使 `includeAttachments:false` 也保留已引用的 Mail 受管附件，这一点有字节断言。 | 在**同一源整包**中通过回环 SMTP 建一笔可核对的投递记录，优先选发送后丢失确认而形成的 unknown。保存源端 DATA 计数 N，恢复、重开、打开记录后仍为 N，保留原收件人事实及待核实状态。对比普通附件开关和受管草稿必需附件的实际清单、哈希及界面说明；完整包缺必要对象应失败，Mail 子集允许缺字节时应明确待重选。 |

既有运行记录来自 Linux 的 `46987e71`，已合入本次候选。固定包现有 `tests/e2e/packaged/packaged.spec.ts:78` 验证笔记、任务和 ZIP 存在，尚未覆盖上述双包重开。另有 Vault 包 17 项、Kernel 外部包权限 1 项、Engine ACC-SY-08 1 项、Mail 快照 4 项的定向回归。[同源联验记录](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence/P3.4-P10-linux.md#同一源-vault-联验) · [两项同源日志](../../../../../temp/issue-evidence/huhu-2026-11-22/vault-package-combined-recheck.log) · [定向回归日志](../../../../../temp/issue-evidence/huhu-2026-11-22/vault-package-regress.log) · [子集恢复证据](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S6b.1-subset-restore.md)

**固定包的最短用户路径**：同一合成源 Vault 新建带三个账号与标签的 Safe 条目、Mail 账号、带附件草稿和上述投递记录。锁定 Safe 后仍可用 Mail 自有认证刷新。导出 A，改 Safe 主密码后导出 B。分别恢复至两个空目录，关闭应用，再用相同制品打开各目标。Safe 初始锁定，A 和 B 分别由当时密码解锁，逐项读回账号与标签。Mail 显示原配置、附件和投递事实，认证提示重新配置；在其中一个目标补配合成凭据再刷新，另一目标及源账号独立。损坏、非空目标、错误密码时保全已有资料。记录安装格式、源码及制品 SHA-256、入口、源目标 ID、摘要、回环计数、错误和重开结果。Linux 目标为 AppImage、deb，按实际运行格式填证。

## 二、Linux 本机保护的已有授权与证据

`t6/task01.md` 和 `task02.md` 已授权使用真实系统保护后端写入本次测试的合成条目，并按精确 ID 清除。可复用这项授权验证系统服务。测试资料应位于独立用户数据目录和临时 Vault，只操作本次生成的键。个人邮箱、账号、既有条目或日常会话的解锁口令都不参与。选用隔离 D-Bus/gnome-keyring 可同时覆盖成功和不可用分支；本报告未打开任何钥匙串。[原授权](../t6/task01.md) · [续项授权](../t6/task02.md)

- **真实后端已经测过。** P0.1 在 Ubuntu 26.04.1 x64、基线 `4d86c84b` 上由实际 Engine 经 Secret Service 保存、锁定 Safe、重开取用，拒绝重复创建并确认清理。断开 D-Bus 后写探针得到 unavailable。保留旧 revision 与密文的失败路径还有可控故障用例。无服务时正向测试会 skip；不能将 skip 记作系统调用成功。Linux 实现固定为 `secret-service`，无 keyutils 或明文回退。源码 `apps/engine/src/module-credential-host.ts:15–57,64–80`、`apps/engine/test/module-credential-host.test.ts:31,122`。[P0.1 平台矩阵](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence/P0.1-protection-platform-matrix.md)
- **归档加载也有证据。** `t11/report01.md` 对早期集成候选的 Linux x64 `--dir` 产物检查了 `app.asar.unpacked` 原生绑定；从归档包装器加载后，在隔离 Secret Service 实际写、读、删。该观察与同源恢复所用 TestProtection 各自回答不同问题。Windows 历史包有 Credential Manager 实测；macOS Keychain 实机和最终同版制品各自登记。[Linux 包内绑定审查](../t11/report01.md)
- **剩余最小验证。** 让指定制品的 utilityProcess 通过 Mail 正常配置/取用一个合成账号，锁 Safe、重开源 Vault 后仍能向回环 IMAP 验证；恢复副本需重配。再在隔离会话使该服务不可用，核对用户可见错误、旧密文与 revision、未发起认证、服务恢复后原绑定可用。按实际结果分别记缺总线、锁定集合或缺键，不能用其中一个替另一个签收。清理本轮键并验空。该行可以与上一节使用同一制品和数据集，也可独立先做。

## 三、受保护 Agent / Automations 的产品合同和平台边界

#9 要求 Agent 原生登录留给各 CLI，额外环境归 Agent，规则环境归 Automations。Safe 未初始化、锁定、停用及改密不影响有效模块认证。用户应能区分普通变量与受保护值、替换与显式清除、已配置与待重配。受保护的执行按同一 requestId 对账，目标子进程取得本次输入。任务、评论、Core 恢复环境、输出与 ZIP 不暴露保护值。当地保护或交接不可用时，界面须说明受影响的操作，维持普通启动和独立配置入口。这些已确认行为不需要真实 provider 登录。[#9 原始要求 §4.4](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/source.md) · [P6.1](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P6.1-agent-launch-env.md) · [P6.2](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P6.2-automation-run-env.md)

| 用户操作 | 已有实现和证据 | 同版可验及后续归属 |
| --- | --- | --- |
| Agent「使用启动环境」启动交互终端 | `interactive-environment.ts:116–124` 要求 Windows x64、可用凭据及原生 helper。`ProtectedLaunchDialog.tsx:71` 有缺 Windows 宿主提示。历史 W7.3 Windows 用离线进程经真实 ConPTY 验证桌面入口、进程身份、TTY/resize 和回收。Linux 可存模块配置；这一交互入口会拒绝。 | Linux 包验可存/替换/清除，显示确切原因、无受保护子进程、普通 shell 可用。Windows 由同一源码构建的对应包复验 Safe 三态、合成进程仅回布尔值、取消/崩溃、同请求对账及恢复文件脱敏。若要在 Linux 提供等价交互启动，归 #4 原生宿主，先证明实际交互 PTY、映像与目标进程身份固定、目录复核、终止后整树回收及运行/恢复数据无秘密。仅移除平台判断不能满足合同。 |
| Automations 本地工作台手动/调度的终端规则 | `automations/src/engine/index.ts:269–278` 在规则凭据 lease 内交内部 `agentProtectedTerminal`；`terminal-environment.ts:469` 后按规则、目标和 revision 复核。POSIX 有一次性票据 helper；`agent-cli/test/protected-launch.test.ts:103` 后用真实 Linux Core 和 sh 验了原终端、目录、受控环境、输出遮蔽和票据重放失败。该测试直接调用 SessionsService。Windows 有实际工作台 PowerShell 规则证据。 | Linux 可直接补“规则配置 → 手动或计划发生 → 真实 sh 进程 → 运行抽屉 → 清除再运行”的固定包正向证据。使用已授权 Linux Secret Service，记录请求/发生/会话关联，检查清除后失败、重复请求一次启动、日志和 ZIP 无合成值。若具体产品入口无法创建或执行该规则，记录首个失败点交 #5；底层 helper 的成功不能代签本行。 |
| 外部 CLI/HTTP/MCP 触发已批准的规则 | `terminal-environment.ts:222–236` 的外部批准描述只接受已迁移的 Windows PowerShell 终端规则；该守卫与上行的本地凭据取用不同。规则 UI 是否展示批准入口还看 shell；`localAvailable` 只表示本机配置能力。Linux 已有拒绝且无会话的证据。 | Linux 包验未批准/平台不适用时表述明确、零执行；同一条本地规则的配置与手动运行独立。Windows 包验工作台批准、逐项外部授权、命令/目录/变量版本变化使旧批准失效，撤销或重试无额外启动。Linux 外部批准如要交付，归 #5 的同一批准与执行链，补 POSIX 目标身份、撤销与对账的正反证据。 |

P6 规划没有把 Windows 限制确认为永久的产品豁免，也没有授权开启 Linux 上尚无对应保证的入口。发布者可如实标注已支持和受限的平台。若要变更对用户承诺的平台范围，应单列决策。当前各项正常路径、受限提示和 Windows 回归均可继续。[Linux 三条路径的实测区别](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W-linux-native-execution.md) · [Windows Agent 工作台](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-desktop-protected-environment.md) · [Windows 规则工作台](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T6.3b-protected-terminal.md)

## 四、可分派的其余最小工作

1. **Mail 所有者可立即补同地址子集恢复。** 批次定案为“预检列双方，默认跳过，显式保留为独立账号，保全既有本机认证”。固定候选 `subset-data.ts:151–166,355–385` 将同地址标记冲突，提交时再拒绝；`accounts.ts:168–173` 也拒绝重复邮箱；`MailSubsetSettings.tsx:172–187` 禁用冲突项。最小改动应贯通预检、显式选择、账号独立 ID 和域记录重映射、提交与重试。保留来源指纹与恢复映射，草稿、投递、附件及可恢复的读标记各归新账号；无法可靠重映射的标记须显式处理。新账号待重配，旧账号、绑定和 revision 保持。合成用例覆盖取消、同地址不同 ID、原 ID 已占用、重试、投递事实与网络零重发。只给同地址冲突增加此选项，损坏、内容或引用冲突仍按原合同处理。复用 Mail 子集预检、journal 和按地址串行提交，整 Vault 导入不需要另建合并流程。[批次定案](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)
2. **S4.2 可用合成授权推进；S4.1 保留用户选择。** 既有 Outlook 默认 Exchange IMAP/SMTP。额外 Graph 专属 consent 当前暂不追加，未来扩大授权仍需用户决定。固定候选缺少受控存量 Graph 凭据的生产装配。可按已有报告验证受众、委托范围、INBOX delta 分页、原生 ID 取 MIME、游标失败回滚与独立 SMTP 回复。精确区分模拟适配器、正式凭据来源与真实租户验收。[S4.2 上一轮架构报告](report06.md)
3. **组合包与账号服务的缺证分开记。** S8.3 可用第二个客户端、合成 issuer 和受控回调核对授权所在机器、会话 ID、状态/取消和迟到回调零写入；物理第二设备覆盖另记。S9/P9/P10 可在干净包里核对 Safe 空态/三个账号、模块自有认证、Mail 桌面或窄屏操作、逐项开放/撤权、复原及用户帮助。路径齐全后记录复跑方式、制品哈希、平台与未测项。真实 IMAP/SMTP、Google/Microsoft 正式应用登记、真实租户/邮箱、跨平台安装各有独立前提；仅在相应行保留缺证。#7 按用户要求暂缓，沿用既有恢复断言即可。
4. **分工和关闭顺序。** Mail 子集实现与 Linux 固定包取证可并行。包复验由 Lead 在指定制品上串行完成，优先复用 `tests/e2e/packaged/packaged.spec.ts` 的可执行文件入口和现有 Mail/Safe 数据夹具。#4/#5 负责平台相关交互、规则与外部批准；#9 只签收独立凭据合同与用户可见结果。后续修复若改变制品，记录新的提交与 SHA，受影响场景在新制品复验。历史 Windows、Linux Engine 和 Linux `--dir` 结果分别保留。

本轮核对了固定树、上述历史日志和共享任务的授权记录。未访问真实账号或系统钥匙串，未运行测试、构建或打包，未写业务代码或远端。固定候选的安装制品 SHA 及实际运行结果仍待包验收者填写。

## Lead 验收

由 Lead 追加。
