# d667d1ac 定向独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report02.md`
- 审查候选 — `d667d1acaee81c854cd0ef56f9132c26caad6c7a`，比较基线 `9bb7efaffe2a101ed1de755731dd176aa9883106`
- 执行结果 — `done`

## 结论

- **T7.1 上一轮 P1 的桌面生产路径已修复。** 旧 Safe 引用无法经规则创建、规则启动或 Agent CLI 启动生效。Windows 桌面和真实 Core 使用规则自有环境的回归通过。E07 的外部终端规则授权范围仍待下一阶段决定和取证。
- **E04 的旧打包测试已替换。** 新测试覆盖原会话不可用时，运行抽屉和任务详情显示同一笔派遣，并确认没有替代会话或旧 Task Runs 文件。旧包上 4 项通过，当前候选的同 SHA 打包复跑仍待取证。
- **S1b.2 的正常路径和草稿条件写通过，附件取消有两处 P2 缺口。** Vault 切换应即时撤销旧 Engine 内的在途导入。未提交附件对象还需要排除在导出范围之外。两处为可定位的源码判断，当前回归覆盖的是不同的取消阶段。
- **#10 的恢复默认和几何修复在本轮范围内通过。** 固定候选的 Desktop E2E、Engine 和 Kernel 回归均通过。恢复已校验备份通过 Engine 能力验证。

## 规格发现

### P2 · 切换 Vault 开始后，已交给旧 Engine 的附件导入仍能提交

Scope 为 S1b.2 的实例撤销约定。Main 在系统选择前、选择后和读取文件元信息后比对来源、当前 supervisor 与 endpoint 对象，旧选择无法进入新 Engine。提交到当前 utilityProcess 后，Main 的收尾只监听原 IPC signal、端口和 child exit。`EngineSupervisor.stop()` 设置 stopping 并发送 shutdown，未关闭在途附件端口。Engine 的 private handler 利用端口关闭取消，Mail 插件 lifetime 要等 Engine 关闭 watcher 并销毁插件时才终止。普通 Vault 切换流程收集文档保存结果后请求 Main 切换，页面 reload 在 stop 之后。若切换确认时旧 child 已开始附件导入而尚未到提交，读取有可能在关闭等待期完成并给旧草稿增写一个版本。新 Vault 的 ID 校验仍有效。

修复指针为 `EngineSupervisor.addMailDraftAttachment/stop`，在停止或换代的同步边界撤销该 generation 的在途导入，再由现有端口信号传到 Engine。补一条以合成源暂停在草稿提交前、此时切换 Vault 的回归，随后重开原草稿核对 revision 和附件，另查新 Vault 无该附件。当前成功路径 E2E 通过，但只模拟对话框取消和正常添加。 [S1b.2 撤销约定](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1b.2-desktop-attachments.md:16) · [Main 端口](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/engine-supervisor.ts:60) · [停止](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/engine-supervisor.ts:209) · [换 Vault](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/index.ts:293) · [界面切换](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/workbench/src/shell/VaultSwitchDialog.tsx:38) · [Engine 取消](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/main.ts:53) · [Engine 关闭顺序](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:487)

### P2 · 取消或 CAS 拒写后，无引用的附件字节仍可能进入 ZIP

`MailDrafts.addAttachment` 原有的两步写入现在由原生选择直接调用。字节先以摘要写进最终对象目录，随后才做取消检查和草稿 CAS。若撤销在对象落盘后被观察到，或草稿 CAS 因外部修改失败，草稿保持旧 revision，刚写的无引用对象仍留在正式附件目录。当前移除接口成功后才做清扫。整包导出等同一串行队列释放后递归收集 Vault，未按已提交 Mail 引用过滤。因而界面显示取消或版本冲突后，后续 ZIP 仍可能包含该文件的字节。

修复指针为 `MailDrafts.addAttachment/change` 与 Mail 导出快照。失败时在同一快照边界确认新对象是否被任何已提交草稿或发件箱引用，再回收，或让出口只枚举已提交引用。补对象已写、草稿提交尚未完成时取消和 CAS 失败的测试，并核对回包、原 revision、ZIP 和共享对象保留。该窗口为源码判断。已有中断和写入失败回归验证旧草稿与有效字节保全，成功导出回归验证共享引用和导出队列。 [Mail 数据边界](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/design.md:64) · [对象与草稿操作](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/drafts.ts:106) · [CAS](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/drafts.ts:225) · [移除后清扫](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/drafts.ts:421) · [导出收集](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/vault/src/package/package.ts:24)

## 已复核范围

- **E07 旧引用切换。** 固定候选集成 `311ba0c8` 的受保护运行改动。规则的 `envRefs` 只用于读旧格式和判定补配。公开规则响应剥离旧引用，写入口拒绝非空旧引用，scheduler 排除旧规则，立即运行和启用检查拒绝旧规则。显式编辑替换清掉引用并暂停。Agent CLI launch schema 拒绝旧字段，生产路径未找到 Automations 或 Agent CLI 的 `secretUse` 调用。受保护启动使用一次性票据，Windows 中继转发 helper 处理后的输出。在真实 Core 测试中第一次启动确认丢失，仍只启动一次，分段回显脱敏，ZIP 还原需本机补配。 [规则 guard](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:80) · [调度过滤](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts:175) · [受保护启动](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/protected-launch.ts:11) · [旧引用 Engine 测试](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/test/engine.test.ts:962) · [Windows Core 测试](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/test/module-credential-host.test.ts:157)
- **E04 包用例。** `e13d8d6d` 把 fake provider 的旧 supervisor/`agent_prompt` 用例换成 `agent_tasks` 立即运行，创建指向不可用既有会话的任务，查一个 scan 派遣及同 run 的抽屉和原任务。该用例取消 Windows 跳过。它验证不可用分支，`9bb7efaf` 的原任务成功结果与定位由之前独立 smoke 提供。 [打包用例](D:/Document/code/huhu/temp/issue-worktrees/integration/tests/e2e/packaged/packaged.spec.ts:163) · [旧包上运行更新用例](D:/Document/code/huhu/temp/issue-baseline/9bb7efaf-packaged-current-automation.log)
- **S1b.2 信任与条件写。** Main 验证可信主 frame、窗口、独占选择和当前可写 Vault。renderer 仅提交四项身份，绝对路径和字节只在 Main/utilityProcess。Engine 使用打开后的文件句柄在读前后核对文件身份和长度，先比草稿 revision 才开源，并用文件版本原子替换。Windows E2E 从真实 renderer、preload、Main 到 Engine 通过，OS 文件选择结果由合成夹具替换。覆盖路径字段拒绝、对话框取消、导入后移走选中源、重开读回、移除与回收。 [选择处理](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/mail-attachment-picker.ts:15) · [Engine 流读取](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/mail-desktop-attachment.ts:31) · [Windows E2E](D:/Document/code/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/mail.spec.ts:47)
- **#10 W04-09 与 W02-05。** 恢复默认要求明确确认和可用定义，按当前已启用能力筛掉卡片及其布局，只更新现有草稿。保存沿用原 revision。几何修复预览读当前格式，确定性修位，确认同时核对 Vault、revision、源摘要和计划摘要，先按摘要保全原字节，再 CAS 写入。只读、无法保全、目标冲突与未知格式已有隔离回归。Windows E2E 验证恢复默认前后取消、保存和重开，以及几何预览、冲突拒绝、保全原件和修后重开。 [默认布局草稿](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/workbench/src/home/Dashboard.tsx:93) · [修复提交](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/capabilities/home-dashboard.ts:218) · [Desktop E2E](D:/Document/code/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/acceptance.spec.ts:510) · [恢复回归](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/test/dashboard-recovery.test.ts:141)

## 验证

- **独立执行 33 项通过。** Windows 使用固定 pnpm 12.10.1、Vitest 3.2.7、候选资源 Herdr Core 0.1.19、独立系统临时目录和合成夹具。运行前后检查完整候选和工作区。 `hc read t18x` 的 32 项由 Automations service 18、模块凭据 3、Mail 附件 3、看板 Engine 5 和 Kernel 3 组成。`hc read t18y` 的 Engine 旧环境回归 1 项通过，48 项按精确筛选跳过。首次筛选没有命中，计数只含随后实际执行的用例。
- **Lead 同候选门禁。** lint、TypeScript、format、knip、build 均标记通过。两组 E2E 共 20 项通过，其中批次 14 项包含 Mail 原生选择用例，任务组 6 项包含两项看板与终端规则保护。早期终端试跑日志包含失败，本结论采用该候选的通过日志和独立复跑。 [d667d1ac 门禁](D:/Document/code/huhu/temp/issue-baseline/d667d1ac-windows-gates.log)
- **发布边界。** 仅写本报告。准确源代码、测试和打包证据均在本机取证，未重复构建。

## 后续阶段与缺证据

1. report01 第 2 项仍在。定时终端先写 activation 再创建 run，二者之间中断时，同计划点按已写 activation 去重。重启对账只扫描 run。 [发生写入](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:329) · [对账](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:478)
2. report01 第 3 项仍在。窗口状态 blocked 的回调仅按 `waiting.taskId` 选择或创建 Human 等待任务。与已绑定任务的纯 blocked 现场路由仍待补，结构化回执沿用原通道。 [等待入口](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts:123)
3. E07 外部终端规则授权仍待明确范围。受保护环境 get/save 只允许 Desktop，`automations.runNow` 不外露，终端规则新建、改动和启用仍有调用方限制。这是明确的当前入口范围，桌面配置、Safe 状态和受保护启动通过后，仍需按最终授权契约另验 CLI/MCP。 [执行限制](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts:25) · [立即运行](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts:375) · [环境配置](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:103)
4. 需在当前或修复候选的同一打包产物补 W8.3 包内前置，然后独立签收 W8.2 工作区完整旅程和 T7.2 真实 provider 的到期、问答、重投、人工完结。候选报告不沿用前一 SHA 的安装包范围。Mail 仍缺实际 OS 对话框和两项取消窗口的端到端证据，#10 的已校验备份恢复目前证据在 Engine，几何修复已有 Desktop 证据。

## Lead 验收
