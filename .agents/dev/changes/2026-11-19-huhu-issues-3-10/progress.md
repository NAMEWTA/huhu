# Huhu Issue #3–#10 实施记录

## 2026-11-20 启动与首批验证

本地集成分支 `impl/huhu-issues-3-10-integration` 位于 `D:/Document/code/huhu/temp/issue-worktrees/integration`。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c` 已含 `origin/main@f16f614` 的 #2 收尾。对 apps、packages、plugins、scripts、tests、vendor、package.json 和 pnpm-lock.yaml 比对，#2 最终代码候选 `ce913d2` 与该基线无差异。[#2 验收台账](../2026-11-18-issue2-closeout/acceptance.md)

原工作区原有的 program.md 和 model-roles.md 修改留在原处。经项目 GitHub 来源读取，#3–#10 均开放、零评论，正文逐份与现有 `source.md` 完全匹配。八份原型目录运行 fingerprint.mjs `--expect` 均匹配。已请求用户按指纹与场景确认，回复后写入相应 `prototype-review.md`。

| Issue | 本轮产物与状态 | 下一交付点 |
| --- | --- | --- |
| #3 | `51d0863` 修正桌面收不到文档保存回执时误放行。`f193612` 绑定窗口主文档。`a4681d7` 增加页面离场参与者，14 项[两窗退出、自动保存与草稿恢复](../2026-11-19-issue-3-desktop-shell/evidence/S1a-03-quit-coalescing.md)通过。 | `t4x` 独立核对；故障反馈选项、真实看板与菜单联验。 |
| #4 | W6.0 经三轮独立审查合入 `1b3b385`，回执合同及 Markdown 回归 55 项通过。[Windows Core](../2026-11-19-issue-4-agent-cli/evidence/W0.2-windows-core-lifecycle.md)实测子进程、握手 generation 与 doc/CAS。W1.1 `ce5289d` 已用锁定 Core 和合成 `.cmd` 实跑。 | `t54` 独立核对 W1.1，再接 W1.2 的持久启动对账。W8.3 等 #5 T7.1，同包分别执行 W8.2 和 T7.2。 |
| #5 | [T0.1](../2026-11-19-issue-5-task-automation/evidence/T0.1-provider-evidence.md)实得 Codex 和 Pi 原生结果。T1.1 `6cc99ed` 修复正文身份，T1.2 `6b43fce` 用合成执行器验证持久受理、占用、重开及迟到结果。集成 `e940403` 修复同文件跨句柄的条件写竞争，Vault 定向 26 项通过。 | `t6n` 核对并发编辑及非法 UTF-8 输入，`t54` 独立复核持久受理。真实执行器和问答仍待接线。 |
| #6 | `ca8290d` 合入 [G1.1 能力盘点](../2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md)。`t4x` 复核回滚反例、99 项定向及 11 项授权回归。[G1.2/G2.1](../2026-11-19-issue-6-unified-tools-web/evidence/G2.1-windows-integrated-access.md) 合入后八文件 80 项通过。[G6.1 监听生命周期](../2026-11-19-issue-6-unified-tools-web/evidence/G6.1-windows-listener.md)通过。Edge 实测[G6.2 普通 HTTP 意图键](../2026-11-19-issue-6-unified-tools-web/evidence/G6.2-windows-http-intent.md)。 | G6.1 接入 Engine 和桌面，继续打包 Web、邀请和撤销。 |
| #7 | [H1.1 来源](../2026-11-19-issue-7-ssh-module/evidence/H1.1-upstream-map.md)与 [H1.2 Windows 构建](../2026-11-19-issue-7-ssh-module/evidence/H1.2-windows-executor-reference.md)有证据。Motty 参考二进制验证同级 Viva 和三项回环权限用例。 | 核对单一执行端接入、分发错误与实际授权 SSH 主机。 |
| #8 | [S0.1 来源](../2026-11-19-issue-8-mail-module/evidence/S0.1-source-baseline.md)与 [S0.2 TS/Rust 对照](../2026-11-19-issue-8-mail-module/evidence/S0.2-transport-probe.md)已实测同一 IMAP/API 和 SMTP 确认中断，分别关闭连接并在新进程读回投递身份。已选 TS Engine 路径。 | S1a.1 等 #9 模块凭据合同和生产接入。应用认证、真实邮箱和包内 Mail 待实测。 |
| #9 | `t1b` 实跑 Windows 本机保护。`86f810e` 修复复制库回收和只读取用竞态，`t4z` 独立重放两项通过。 | `t4z` 新增探针发现首次本机回收记录被中断后无法重新初始化。先补齐恢复，再接正式驱动和 P10.2。 |
| #10 | [W02-02 整板写](../2026-11-19-issue-10-widget-dashboard/evidence/W02-02-atomic-board.md)通过测试装配的 Engine 提交并重启读回。`t4z` 复跑 `15403bd` 的 Edge 与 Electron 静态 SSH Widget 投影。 | 修复注册描述与嵌套 Schema 可漂移。生产整板写者按 W06 切换，W04-07 等 #3 的退出契约。 |

## 平台与运行证据

- Windows x64，构建号 26300，Node 24.21.0，pnpm 12.10.1。锁定 pnpm.exe 运行 `install --frozen-lockfile`，Core `t1d` 退出 0。Electron 可执行文件版本 44.9.1。项目锁定的 Herdr Core 是 0.1.19，Windows x64 的发布压缩包经 fetch-herdr.mjs 校验，调度用的本机 hc 为 0.1.21。
- `173baab` 上 `lint` 与 `typecheck` 退出 0。旧备份夹具改用 Windows 目录联接后保留同一悬空目录安全检查，ACC-SY-08 通过。`7f012b0` 为已退出进程的测试目录引入有界清理重试。随后 `t29` 的 Engine/Home 两文件共 51 通过、6 跳过，含 W02-01 的两个 HTTP 用例和真实 Herdr shell 路径。
- `6e820fa` 上全量 `pnpm test` 观察到 936 通过、21 失败、52 跳过。失败包括 Windows 符号链接权限、Git/Vault 测试超时、索引和监听顺序。原始输出位于原工作区 `temp/issue-baseline/windows-unit-t2c.log`。
- `t28` 在 Windows 完成桌面编译，生成 Electron 44.9.1 的应用。CSS 守护把平台路径误认为自有 CSS，报告 A 304、B 12、C 0 并退出 1。`76862e6` 以项目相对路径和本机分隔符识别上游目录，同一产物重跑守护后恢复到已登记的 A 10、B 12、C 0，18 个守护单测通过。
- `t2h` 初次桌面用例在等待进入编辑器设置时超时，已保全 Playwright trace。`ea1acc3` 从常用自动保存路径验收，`t2w` 于 14.2 秒通过关窗回归。
- `t3k` 从 `f193612` 使用两个 worker 重跑全量测试，仍以 1 退出并报告 `ERR_IPC_CHANNEL_CLOSED`，没有完整计数。保留原始输出。
- `1b3b385` 的固定检出完成冻结安装和 `pnpm build`。`t46` 通过两项 Windows Electron 关窗测试，覆盖延迟保存和顶层重载中止旧请求。测试用隔离窗口、Vault 和用户目录。
- `3f45c00` 的 Windows 全仓 `lint` 与 `typecheck` 均退出 0，Core `t5x`、`t5w`。`a4681d7` 的 Desktop、Workbench 类型和定向 lint 通过，`t70` 构建和 `t73` 的完整窗口回归退出 0。
- 固定检出重新打出的 Windows 阶段 NSIS 通过全部 ASAR 内文件校验。`t5g` 同一轮三项 Windows 包内冒烟通过。首轮 `7d4fef5` 阶段包因扫描后读取到变更文件而损坏，已保全失败记录。见 [Windows 打包对照](windows-stage-packaging.md)。
- `ubuntu26` 已只读核对为 Linux x86_64、Wayland，可用 Xvfb 与 dpkg。用户答复「暂仅在 Windows 继续」，本轮没有在该主机写入或运行候选。Linux 与 macOS 的安装包和实机验收均待相应平台授权与环境。
- 任务与报告见原工作区 `.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md`。当前报告、独立审查和合入以实际终稿、候选提交及检查输出为准。
- 用户限制最多四个 worktree。退役已交付的实现检出及固定包检出先降至两处，计原工作区和集成分支，再按返工范围分配。候选分支和提交保留。用完的 pane 按实际退出状态关闭，命令输出在原工作区 `temp/issue-baseline/core-finished/`，工作分派、研究和独立审查在实施主题目录。

同一组合候选的安装包、八项验收与三条联验路径仍待交付。

## Windows 阶段复验

- `2ceec67` 的 [真实 Edge 共享工作台与 Electron 回归](../2026-11-19-issue-6-unified-tools-web/evidence/G6-windows-shared-workbench.md)通过，含两份邀请、三个浏览器上下文、笔记与任务深链、落盘、文件传输、依邀请撤销，以及同一构建的 16 项桌面回归。桌面分享管理页面、第二台设备及看板退出联动继续按各自验收条件推进。
- `f49df4a` 的停止代次经 `t4x/report06.md` 独立重放，旧 Vault 的迟到退出不能重启旧 Engine。相邻关窗和换库场景通过。W1.1 两个 Windows 启动增量合入 `9d36640` 与 `30da8fe`。`t4z/report08.md` 独立重放 W1.2 的记录破损修复和 W6.1 的合成 provider。新反例发现插件重启会让旧启动处理覆盖新绑定，停用后仍可能发送正文。两项需在签收前修复。Claude、Codex 与 Pi 的产品收件证据尚待实测。
- #5 `3c79467` 经真正 Engine HTTP 和 Vault ZIP 注入回放，用有归属的本机记录防止复制库自动派遣。记录复核在 `t110/report01.md`，独立审查后再合入。#7 主机目录 `7edd015` 已合入，`efea64a` 修复目录路径被非普通文件占用时的错误语义并复跑共享目录。#8 私有账号候选通过合成 IMAP 和持久凭据回放，独立复核发现 NAMESPACE 及取消重入问题，返工中。
- #9 `47f854b` 的首次本机范围恢复已复核；`2ceec67` 以候选数据键摘要核对删除归属，确认已有系统键不受失败事务回收影响，18 项合成保护回归通过。真实 Windows 保护驱动接入与包内核验待完成。
- #10 `57f3bec` 经真实 HTTP 断开代理验证替换之前保持同一 revision、替换后丢包可读到相同提交、相同意图拿回原结果、其他版本已写时旧保存请求冲突。已提交看板备份按新格式读取，损坏原件拒绝生成备份。恢复和显式修复预览进入下一切片。
- `65bd6eb` 的全量单测 1021 通过、8 失败、52 跳过。修复 Windows Fetch 禁用端口和测试路径夹具后，9 个受影响文件复跑 121 通过、6 条件跳过，保留原始 `t87` 及复跑 `t9g` 日志。同一最终组合版本仍需完整复验。

## Windows 组合构建与独立复核

- #4 的 W1.2 启动身份对账和 W6.1 输入归属修复合入 `6c2cc92` 至 `3bd2e24`。独立冻结复跑 91 通过、6 条件跳过。真实 Windows Core 在停用重开后保留原 attempt、地址和 PID。发送前停用保持零输入，发送后丢回包保持原归属，合成 provider 对账确认一份正文。已独立实测 [Codex 原生问答](../2026-11-19-issue-4-agent-cli/evidence/W6-windows-codex-native-turn.md)。Huhu 的实际 Tasks 调用、持久回执和恢复仍需组合验收。
- #5 的本机 Vault 归属与原派遣恢复合入 `9761f2a`。与 #6 共用默认关闭策略后，录入测试先验证 MCP 空目录，再显式授权任务列表。Tasks、Mail、Web 邀请、能力目录与工具授权共六文件 59 项通过。记录为 `core-finished/t132.log`。
- #8 的账号发现与取消复核合入 `9704003`、`3461045`。Windows 原生 Engine 注册在 `b5b3c61`，在同一临时 Vault 中从真实回环 IMAP 发现 INBOX，以 Windows Credential Manager 写入账号凭据，锁定 Safe 后重开仍可独立取用。ZIP 恢复保留邮箱定义并要求重新配置。相关四文件 25 项通过。保存通过受信 Mail 账号服务，账号列表通过真实 Engine HTTP。生产添加界面、首封邮件与实际提供商尚待。
- #9 的 `6478854` 原生 Keyring 宿主通过独立复跑，包括系统键精确清理、恢复到同路径的新物理目录与实际 Electron userData 转发。当前 Safe 的会话代和原子密钥环合并为 `a7c51d9`，独立定向 19 项通过、57 项按名称过滤。个人多账号加密提交进入独立复验，Renderer 仍待即时清理接线。
- #10 的 `f8fb9f5` 合入私有恢复与当前格式修复。独立复跑有效备份跨 Vault 恢复和显式确认两个场景。重开保留实例与几何，原件保全一次，并发确认仅一次成功且旧请求冲突。生产写入、确认界面、离场与 Vault 包接线仍归 W06。
- [Windows 阶段安装包](windows-stage-combined-3bd2e24.md)新增同包证据。该构建通过三项包内冒烟、真实 Electron UtilityProcess 的 23 项凭据检查，以及实际 Edge 中两份邀请和三个会话。
- `c839daf` 完成 Windows 全仓类型检查。#5 的问题投影、回执持久化和 #8 的首封原文缓存通过独立复跑。#4 真实 Windows Codex 的受控新会话保持同一 Core 绑定，借助本机合成模型端只发布一次原任务正文。原生接收两阶段回放合入 `79b495a`，固定 Core 与合成 App Server 在生产 Tasks 收件箱内观察到同一会话、一次输入、两份持久 ACK 及一条结果评论，重开后结果和 ACK 身份不变。
- #5 [原生问题回答](../2026-11-19-issue-5-task-automation/tasks/T3.2-reply.md)合入 Tasks 侧持久受理。Windows Engine 测试验证写评论前中断后的一次补写、并发回答只保存一条，以及接受确认丢失后查询原回复。现场 Codex 对同一原生请求的作答另验。
- [组合阶段候选 3290af1](windows-stage-combined-3290af1.md)保全安装包及七个关键文件的逐字节证据。实际包内以真实 Windows Codex、固定 Core 和本机合成模型完成一次派遣及结果，Edge 两份邀请与三会话和两种外部工具网关授权回归通过。此提交已快进到本地 `feature/issue-fix`。

## Windows Safe 与 IMAP 增量

- `feature/issue-fix` 本地快进到 `1316cf8`，核对原 `program.md` 和锁文件差异，保留操作期间工作区最新的角色表。原工作区 `temp/issue-baseline/feature-checkpoint-preservation.md` 记录字节对照。
- `0b30323` 接入现有 Safe 页面的世代锁定事件。Engine、Safe 与 Workbench 十文件 59 项通过。Electron 冻结窗口用原能力读出一条合成旧格式凭据，延迟第二次显示响应，再从独立请求锁定。在 2.5 秒观察窗内回到锁屏，释放响应后无秘密节点。首轮窗口关闭时夹具清理超时，保全 trace。显式释放路由和响应后复跑 1 项通过，运行 7.1 秒。日志 `core-finished/t13t.log`、`t148.log`、`t14b.log`。
- `7f7c554`、`8ee7643` 合入 Safe 多账号存储和按版本更新。两片共 9 项独立验证通过，初次资源争用的 3 项经定向复跑通过。重开时各账号 ID、电话和备注按原值读回，密码按指定账号显式读取，旧版本冲突和晚到的锁定前写入被拒绝。独立记录为 `t13x/report01.md`。新原型表单及旧版本密文回收继续分片。

## Windows 邮件投递、任务调度与 SSH 导入

- `415efe9` 把 Mail SMTP 提交、查询和选择性重试接到工作台 Engine。固定 Nodemailer 10.6.0。并发样例从桌面 HTTP 和 Web 调度入口得到同一投递 ID，仅一次 DATA。部分拒收只向显式选择且已证实未投递的地址补送。确认丢失、记录写失败及 ZIP 恢复保留原记录。Mail 与 Vault 共 144 项通过、1 项跳过。 [联合测试](../../../../temp/issue-baseline/mail-production-smtp-vault.log) · [独立出箱复核](../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report04.md)
- `764e324` 固定的 Windows 阶段版本通过全仓 lint、typecheck 和 build。全仓单 worker 初跑 1062 项通过，编辑器与 Git 审查各遇一处生命周期钩子超时。在同提交分别通过 128 项编辑器往返和 1 项 Git 审查。CLI 使用 forks 单独通过 11 项。 [初跑](../../../../temp/issue-baseline/764e324-pnpm-test.log) · [编辑器复跑](../../../../temp/issue-baseline/764e324-golden-rerun.log) · [Git 审查复跑](../../../../temp/issue-baseline/764e324-git-review-rerun.log) · [CLI](../../../../temp/issue-baseline/764e324-pnpm-cli-test.log)
- `53003e14` 和 `f9ad06b7` 增加默认 15 分钟规则的数据初始化、删除标记及扫描归属。ZIP 保留和重置 Vault ID 都能查询原名单，恢复后原时刻重交产生零派遣。`964fd1ce` 增加每条扫描规则的执行槽，原生暂停释放槽，原回答取回槽后续跑。三文件 37 项通过。定时、手动和列表的生产切换仍归 T7.1，目标预检与规则配置需要一起核对。 [调度联测](../../../../temp/issue-baseline/task-automations-slot-regression.log) · [初始扫描独立复核](../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report05.md)
- `0839ab75` 为受信工作台增加八种 SSH 文件的只读导入预览。合成文件验证映射、组、冲突、加密口令和跳过原因。Engine 定向 13 项通过。静态能力目录在插件停用后保留说明。选中后确认写入和导入体验继续按 H2.4 验收。三份用户改动已按摘要或原差异核对。 [SSH 验收](../2026-11-19-issue-7-ssh-module/tasks/H2.4-import-preview.md) · [工作区核对](../../../../temp/issue-baseline/feature-checkpoint-ssh-task.log)
