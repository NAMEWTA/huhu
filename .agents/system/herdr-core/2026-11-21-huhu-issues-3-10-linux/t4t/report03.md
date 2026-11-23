# #7 Ed25519 用户证书与 #3 关窗回执复审

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4t`，本机 `wta-ubuntu` 默认 Core，Lead `t3p`
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task03.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report03.md`
- 执行结果 — done，独立复审完成
- 固定版本 — `891ddd8ac41185180543a84cb2b6aadf280ee33e`。核对 `c4281b1c`、`e71f47b0`、`891ddd8a`、`bb7b9b6a`、`6f1b6cd3` 及各自在固定版本中的入口。隔离后续提交。

## #3 TB-14/15 · 已确认问题

1. **P1 · 合并关窗/退出的现有 E2E 会在新协议下失败。** 「应用退出接管在途关窗」用例记录真实 Renderer 的 `huhu:flushed` payload，仍将其声明并严格比较为 `true`。Preload 现在原样转发 `{ files, drafts }`，此处是干净窗口，预期实际为 `{ files: 0, drafts: 0 }`。这会在窗口保留与 Engine 存活的后续断言前失败。最小验证是修正该用例的协议断言，再运行同一用例，仍要求只发一次 flush、另一窗口取消时两窗保留并恢复输入。可同夹具加一轮成功退出核对合计发布一次。依据 `tests/e2e/knowledge/session-flush.spec.ts:833–893`、`apps/desktop/src/preload/index.ts:84–91`、`apps/desktop/src/renderer/main.tsx:359–370`。已有日志只列出 E2E 测试。

2. **P2 · 一项落盘失败会丢掉同窗已经成功的文件/草稿回执。** `runFlushers()` 等全部任务，任一失败先抛 AggregateError，已成功项尚未计数。若文档 A 写成、文档 B 草稿失败，或专注暂停失败，Main 收到的只有 `false`。用户选择放弃退出时，A 的成功提示不发布。选择保留并重试时，A 已干净，第二轮 `initialWrites` 从已增加的计数开始，A 仍不计入。合并退出被另一窗口取消后再关也是类似边界。实际文件已保存。TB-15 要保留失败判断，同时已证实的写入结果应可单独说明。最小验证是在同一窗口用两个合成文档夹具，一个成功，一个草稿失败，检查失败弹窗和最终保存摘要，在丢失回复及重试时不重复计数。依据 `packages/workbench/src/state/flushers.ts:10–22`、`packages/workbench/src/home/FocusPauseOnClose.tsx:9–13`、`plugins/notes/src/ui/documents/DocumentSession.ts:377–384`、`apps/desktop/src/preload/index.ts:84–91`、`apps/desktop/src/main/index.ts:176–191,638–646`。

3. **P2 · 重开回执在 Renderer 确认显示前即被删除，系统通知与重开提示也没有共同领取状态。** 系统通知不支持、同步抛错或没有 show 事件时，记录本可在同 Vault 重开后展示。但 Main 读取时立即删文件，紧接着 reload、Renderer 终止或组件卸载会使成功回执永久漏发。另一个可核对的时序是同一进程在迟到的 OS show 之前重开并领取记录，之后 OS 通知仍可能到达，形成两次反馈。ID 比对保护新记录不被旧通知删除，覆盖不了已经领取的旧通知。最小回归判据是使用受控通知替身与读取/渲染屏障，分别核对无 OS 支持、OS show 延迟、领取后重载和其他 Vault。原回执最终可在正确 Vault 上看到，OS 与工作台各路径协调去重，两次重开不重播。依据 `apps/desktop/src/main/exit-feedback.ts:24–68`、`apps/desktop/src/main/index.ts:387–390`、`apps/desktop/src/renderer/main.tsx:379–395` 与重新打开测试 `tests/e2e/knowledge/session-flush.spec.ts:492–520`。漏发路径可由代码确定，迟到 OS show 的平台表现待运行验证。

## #3 · 事务及边界核对

- Main 按窗口、WebContents、初始可信顶层 frame、请求 ID 和 flushing 阶段接收摘要。导航、崩溃与销毁撤销许可，迟到回执不能使新请求通过。Renderer 先处理离场参与者，再冻结输入并排空 flushers。完整成功分别计实际文件回执与可恢复草稿；超时走「无法确认」，明确放弃不会生成虚假成功。Refs `apps/desktop/src/main/index.ts:73–140,163–208`、`apps/desktop/src/exit-ipc.ts:1–18`、`apps/desktop/src/renderer/main.tsx:330–375`。
- 在途单窗关闭由 before-quit 接管时共用同一 WindowExit。单窗回调看见 quitting 就退出，合并成功由 Main 汇总后发布一次；单独关闭最后一窗触发的后续 before-quit 没有窗口摘要，零值也不会发布。取消整轮会释放许可并恢复 input；已持久化内容继续有效。存在一个需验证的 Vault 时序风险：合并退出读 supervisor 在所有窗口答复之后，而开/关 Vault 没有检查 quitting。若受信的在途 Vault 切换在该点前替换 supervisor，旧 frame 摘要可能归到新 Vault。最小判据是让隔离 Vault 的切换与两个退出参与者交叠，输出只归原事务对应的 Vault，切换后重新确认或取消。依据 `apps/desktop/src/main/index.ts:236–249,323–347,415–424,593–653`。
- 回执只保存文件/草稿计数和 UUID，按 Vault 目录身份哈希，位于设备 userData；读取要求可信顶层 frame 与当前 Vault 路径一致。可用 OS 通知正常显示时删除对应回执，浏览器根未接入桌面提醒。没有引入正文、路径清单或第二个关窗流程。打包运行时的原生通知表现本轮无运行证据。

## #7 · Ed25519 用户证书

- **已核对配对和实际认证。** 仅已选本机 identity-file 的 `-cert.pub` 被读取。要求普通文件，拒绝符号链接、身份变化及超 64 KiB；解析后核对用户证书类型和主体 Ed25519 公钥。证书包络用于 publickey 提议和签名请求，真正签名由原私钥生成，内层签名算法用 `ssh-ed25519`。服务端负责证书签名、有效期和 principal 结果。裸钥及 hostbased 原有载荷/签名路径仍保留。证书缺失回落裸钥，存在但坏、错配或不支持时明确报错；有效证书被服务端拒绝时未见同键裸钥重试。hostbased 仅检查差异，未跑其协议回归。依据 `plugins/ssh/src/engine/identity-certificate.ts:23–52,95–145`、`plugins/ssh/src/engine/host-configurations.ts:52–72`、`patches/ssh2@1.17.0.patch`。
- **已核对信任和工具边界。** Manager 每跳复用原 hostVerifier，核对当前授权并通过对应指纹后才认证。外部 CLI/MCP 的草稿拒绝 identityFile 路径补丁与新的设备身份，要求主机版本及确切已授权路由；外部正式连接只用已保存配置。桌面草稿可以选择新路径且改址不继承旧身份。证书与私钥留在认证调用，返回与事件未新增材料，测试检查 portable/list 中无路径、口令或证书内容。依据 `plugins/ssh/src/engine/{draft-connection.ts:60–79,index.ts:549–580,manager.ts:645–652,761–828,host-configurations.ts:317–366}`、`plugins/ssh/test/identity-certificate.test.ts:121–198`。
- **P2 · 浏览器身份文件的设备语义未对齐。** 工作台的 configure 分支先接受 desktop 与已邀请 Web，身份文件文本字段也可在 Web 使用，但文件选择按钮在无 desktopHost 时无实际选择器。绝对路径在 Engine 设备上解释，继续使用该配置时本轮新增读取 Engine 端伴随证书。CLI/MCP 路径限制未变化。这是既有宿主边界延伸到新证书读取，若产品允许 Web 管理宿主已有路径，需要明确告知设备并验证授权；若选择仅属桌面，需在 Engine 拒绝 Web 新身份路径。用隔离分享会话和合成身份确认该决策及路径、副作用，保留用户原有已授权连接。依据 `plugins/ssh/src/ui/HostEditorDialog.tsx:67–79,316–348`、`plugins/ssh/src/engine/index.ts:549–559` 和 #6 规格 §桌面分享当前工作台。
- **P2 · 大小和取消的组合缺少实证。** 伴随文件读取有 64 KiB 的实际读缓冲上限；已有私钥路径先 stat 再 readFileSync，名义 1 MiB 校验不约束后续实际读取，证书路径本身也使用同步 I/O。选择了慢挂载或文件发生变化时，JS 取消要等读取返回才能观察。Manager 在拨号前/指纹/外部授权处有取消门槛；没有证据表明已取消测试会继续在线认证，但证书读取期间的响应性未验。最小判据用合成临时文件替身覆盖读取期间取消、路径变化和正好 64 KiB；需要证明及时返回与未拨号。另应补裸钥、hostbased 及 **已授权外部连接走真实证书服务端** 的回归。Ed25519 以外伴随证书和主机 CA 保持已有范围。依据 `plugins/ssh/src/engine/host-configurations.ts:55–72`、`plugins/ssh/src/engine/identity-certificate.ts:23–48`、`plugins/ssh/src/engine/manager.ts:449–478,615–653`。
- **发行证据。** lock 绑定 ssh2 1.17.0 及 patch hash，台账 R-79/R-81 列出上游及分发。真 OpenSSH 用例通过 Huhu 的 `HostConfigurations`、`testSshDraft`、`SshManager.connect/exec` 和真实回环服务端；既执行配对证书成功，也验证无伴随文件且无裸钥授权时失败、错 principal 且裸钥已允许时仍失败。它实际进入 Huhu 领域层，不经过 Electron、Dispatcher 或 CLI/MCP。入口参数传播用例使用 `Client.connect` 替身。依据 `plugins/ssh/test/identity-certificate.test.ts:143–178,273–354`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`docs/upstream/ledger.md`。Electron 运行时外置 ssh2，封装后加载补丁的实证不在本轮证据中。

## report02 两项返工复核

- **`bb7b9b6a` 修复同代后续布局变更后的重交。** 新意图保存首次应用快照，省略 prompt、authPrompt 和 error，当前授权仍先于回放。测试重排后关闭一栏，再重交两个旧意图，原结果分别返回，当前布局及已关闭次数保持不变，撤权后拒绝。旧的只有 revision 的回执在后续布局改动后仍冲突，这是可区分的历史格式。后续最小复查可用复连换代后重交及被移除路由结束的夹具，核对原回执政策与新代资源不被修改。依据 `plugins/ssh/src/engine/public-workspaces.ts:20–28,119–153`、`plugins/ssh/test/public-resources.engine.test.ts:1540–1568`、`h7-layout-receipt-after.log`。
- **`6f1b6cd3` 修复显式停用反馈。** 私有 Core 停止确认交给 Engine PluginEntry，失败持有 cleanupError，停用状态与失败结果同时可观察。仅 holder 夹具确认状态为 disabled、能力调用被拒、无法提前重新启用、清理确认后可以继续。该修复针对 `plugins.setEnabled`。Engine 的 `disposeAll` 仍只遍历 disable，关窗流程不接收这个 cleanupError。可用同一 holder 夹具补一次通过实际关闭入口的验证，区分文档保存确认与设备回收未知，保留 report02 的期限及崩溃回收范围。依据 `packages/kernel/src/plugin-manager.ts:92–100,145–179,225–227`、`packages/kernel/src/capabilities/system.ts:200–216`、`apps/engine/test/web-share.test.ts:143–175`、`h7-cleanup-feedback-after.log`。

## 验证依据及交付

- 读取固定 Git 对象、相关 AGENTS 与 #3/#7 规格。`git diff --check 29c3fe32 891ddd8a` 无输出。前端按 `zh-modern-web-guidance` 搜索、获取并对照反馈区域和动态提示。
- 本机日志目录 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/`。证书日志为 10 项通过含真实 OpenSSH，桌面回执日志为类型检查和 35 项 DocumentSession 单测通过、26 项 E2E 收录。布局回执是 4 项通过，清理反馈是 Engine 4 项、PluginManager 14 项通过。
- 本轮未运行测试、E2E、应用、构建或打包。以上静态问题给出了最小验证路径。未触碰真实 Vault、凭据或 Agent 历史。

## Core 文件协议

`t4t`、`wta-ubuntu`、topic、manifest `t4t/task03.md active` 和 Lead `t3p` 已核对。当前 `hc get` 仍报告默认 Core lock 文件系统只读。同号报告在 Lead 可读共享根完整发布。

## Lead 验收

由 Lead 复核后填写。

## Lead 验收

已复核范围。关窗回执、部分保存反馈和重开接收完成于 `a8bcd145`，文档会话和关闭参与者定向通过，关窗桌面 E2E 尚待实际运行。SSH Web 工作台的设备路径限制随 `31352cae` 合入交叉复核；文件读取上限与打开语义继续单独跟踪。
