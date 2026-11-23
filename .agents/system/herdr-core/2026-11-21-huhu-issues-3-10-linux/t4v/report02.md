# #3、#6、#10 桌面、Web 与看板组合验收准备

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t4v
- 实际执行终端 — t4v，wta-ubuntu 默认 Core
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/task02.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/report02.md
- 执行结果 — done（完成只读验收准备）

## 结论

第三组联验已有两个可复用主入口。Linux 先选 `session-flush.spec.ts` 的两条 W05–W06 关窗用例和 `web-share.spec.ts` 的两邀请三会话用例。当前没有同时覆盖**桌面应用菜单保存、同 Vault 的 Web 邀请、看板关窗**的一条用例。Windows 已有菜单与关窗合场景，可在同一构建补跑三会话用例。若需要一条贯穿三者的自动用例，保留 `web-share.spec.ts` 的现有三会话主线，再复用 `session-flush.spec.ts` 的菜单触发与关窗夹具。

已确认两个产品行为缺口。Web 分享初始首选「仅本机」，规格和已确认原型要求「局域网」。文档退出回执能保全正文或可恢复草稿，但缺少向用户区分两种成功结果的反馈。现成用例可验证当前产品行为和持久化，不能用一次回环或构建版通过替代安装版、实际系统菜单和物理 LAN 设备验收。

## 基准与合入

- 固定读基准为 `f2159c2e0c0d1338f786233ac36b8bec3dfcc1f6`，工作目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`。按批次 `program.md:51`、三份原文/规格及 `6da1b2ec` 对应确认记录核对；不重新请求原型确认。基准检查后整合树推进到 `3d2a986a`，差异只有 #7 和批次进度记录，审查结论保持固定基准。
- **候选合入。** 菜单和看板离场 `78aa04f2`、邀请 `dcc95e63`、Widgets `e197f9ab` 经 `369efcfd`，以及 E2E 退出清路由 `e9e6fcd9` 均为固定基准的祖先。相关路径搜索中未在祖先链上的 `464c0e03` 和 `688122c1` 分别与已合入的 `dcc95e63`、`cfbce161` 有相同 stable patch-id。未发现本联验需等待合入的独立业务补丁。
- **本地产物。** 审查时 `apps/desktop/out/build-info.json` 标的是 `5d043100d40f3538744e669b6f6e8aa43a7fdded`，工作树没有 `apps/desktop/release`。这份输出可用于定位环境，不能作为 `f2159c2e` 的运行证据。后续记录必须用产物版本、commit 和实际平台核对。

## 实现路径与验收缺口

| 范围 | 源码和当前行为 | 状态、用例与补验 |
| --- | --- | --- |
| #3 真实应用菜单保存与模块切换（TB-12/13/17） | `apps/desktop/src/main/app-menu.ts:9–45,106–165` 安装 macOS 原生应用菜单，Windows/Linux 用同一模板和弹出菜单，按钮和 Alt/F10 均由主进程连接。打开前捕获可信主 frame 和活跃文档 ID。 `packages/workbench/src/shell/AppShell.tsx:66–83,140–148` 根据 Engine、模块和 Vault 可写性更新菜单，并在首页保留已打开的编辑器。`plugins/notes/src/ui/NoteDocument.tsx:128–159` 只对匹配 ID 的菜单事件执行 flush/关闭文档。 | **业务已接线，Linux/macOS 缺菜单实跑。** `tests/e2e/knowledge/session-flush.spec.ts:46–111` 在 Windows 下拦截 Electron 菜单弹层，通过 F10 和菜单按钮读取真实 Menu 对象，点击保存项并回读文件。Linux 当前会跳过。实体菜单键盘、Escape 后的原焦点、原生 X/退出角色、两篇笔记只写目标，以及无库/只读/主页菜单禁用仍需补场景。现用例菜单段未先证明目标内容尚未自动落盘。复用同文件的 `manualSave` 或 `holdBridgeTimers`，保存前断言未落盘，点击后按目标文档读字节；关窗段继续使用自动保存。 |
| #3/#10 关窗与退出顺序（TB-14/15，ACC-DASH-04/11，W04-07/W06-01） | `apps/desktop/src/main/index.ts:70–138,161–184,224–236,574–622` 对系统关窗及 quit 使用同一许可，校验窗口、frame 与请求 ID，等待用户决策时暂停超时，明确失败后保留或确认退出。`apps/desktop/src/renderer/main.tsx:330–372` 先等待离场参与者，允许后才调用 runFlushers。`packages/workbench/src/home/useDashboard.ts:65–97,140–175,307–312` 负责继续编辑、放弃本轮草稿、保存/版本冲突/结果未知；失败保留草稿。笔记的退出 flusher 和常驻专注 flusher 分别见 `plugins/notes/src/ui/documents/useDocumentSession.ts:57`、`packages/workbench/src/home/FocusPauseOnClose.tsx:6–14`。 | **现成用例，仅缺固定候选和安装版实跑。** `session-flush.spec.ts:127–192` 两用例先 `BrowserWindow.close()`，覆盖继续编辑、模拟看板写失败时不落盘且专注仍运行，后走 `app.quit()` 分别保存或放弃；最终比较 Markdown、看板文件和计时状态。它调用真实生命周期，未操作系统 X 或退出菜单项本身，失败夹具为 HTTP `INVALID_INPUT`。冲突/失联分别借用 `acceptance.spec.ts:1004` 与 `apps/engine/test/dashboard-save.test.ts:32–93`；要验关窗遇真实拒写/冲突后的体验，复用相同选择步骤，在临时 Vault 预置已保存 revision，并确认旧板字节及原文档在继续编辑时保持。 |
| #3 正文与恢复草稿的退出反馈（TB-14/15） | `plugins/notes/src/ui/documents/DocumentSession.ts:375–382` 自动保存失败或手动模式会写恢复草稿。`packages/workbench/src/state/flushers.ts:9–17` 只汇集失败，Renderer 返回 true，Main 在 `index.ts:99–103,167–183` 收成同一成功结果。失败/超时有宿主提示，正文落盘与仅草稿保全使用同一成功退出路径。 | **用户反馈缺实现。** 保留既有落盘策略，补出正文写入、仅草稿、未确认的实际结果说明。复用 `session-flush.spec.ts:482,584,690,734` 的自动保存、手动草稿恢复、草稿写失败和无回执分支，分别核对文件与用户看到的状态。 |
| #6 Web 分享首选范围和地址（E01，批次第三组） | `packages/workbench/src/gateway/WebSharePanel.tsx:26,69–72,123–137,167–180,204–215` 初始选 local，明确选择 LAN 才会提交 LAN 模式。运行时地址使用静态 code，邀请弹窗可复制链接。 `packages/kernel/src/server/web-listener.ts:65–80,115–121` 已支持真实 LAN 监听并枚举有效地址。 | **首选规格未实现。** 按 #6 `source.md:362`、`spec.md:41` 和原型确认 E01–E03，服务初始停止、首选 LAN、允许主动选仅本机。先修默认，再让 `web-share.spec.ts:18–20` 验默认并显式切 local 跑回环。E01 的运行地址打开/复制和没有有效 LAN 地址时的明确反馈也尚缺，现 UI 可复制带邀请的链接。相关地址枚举可复用 Kernel listener 夹具，通过静态地址与物理设备两类入口验证。 |
| #6 邀请与 Web 宿主（Q6-2、E01/05/07、TB-18） | `packages/kernel/src/server/web-invitations.ts:31–83` 可多次兑换，每次有独立会话，撤销先删链接与所属会话再 abort。`web-share.ts:35–40,62–91` 用同一 Engine，Web caller 随会话代次、事件/终端流同用该 signal。`apps/desktop/src/renderer/main.tsx:399–429` 无桌面宿主仍能启动，并在断流后复查会话。 | **现成用例，仅缺固定候选实跑，物理设备另验。** `web-share.spec.ts:9–88` 从桌面创建/取回 A、创建 B、用 A/A/B 三个隔离浏览器上下文，撤 A 后两会话失效，旧链接拒绝，B 刷新能用，再停止分享。`apps/engine/test/web-share.test.ts:28–129` 已断言 A 的 HTTP/WS 退出、B 和桌面继续、停止后控制端活着。缺普通浏览器无桌面菜单但有命令入口的 Linux 自动验证，`window-chrome.spec.ts:398` 该断言被文件级 Windows guard 跳过。可直接并入 Web 主用例或移到通用文件。物理 LAN 的重新兑换、双设备编辑与浏览器设备文件独立验。 |
| #6/#10 Widget 权限和布局保存/重开（ACC-DASH-02/07/08/09/16/17，E02/E03） | `HomeModule.tsx:46–69,115–128` 用当前连接发现和插件状态判断是否挂载可信 Widget。`plugins/tasks/src/ui/HomeWidget.tsx:23–29` 另查写能力和只读状态。 `packages/kernel/src/capabilities/home-dashboard.ts:119` 及 `apps/engine/src/boot.ts:423` 使用基准 revision、整板保存和跨连接事件。浏览器用户会话的权限独立于 CLI/MCP 的工具开放。 | **核心回环已覆盖，合场权限断言需补。** `web-share.spec.ts:57–83` 验 B 使用任务和最近笔记卡、隐藏专注并保存，A 收到变化，撤 A 后 B 同上下文刷新读回，比较磁盘字节。它未直接比对桌面 revision、浏览器干净上下文重开或浏览器卡片缺权限后不发业务查询。Engine 用例 `web-share.test.ts:84–112` 已证明角色发现、并发冲突和同一布局读回；UI 单独用 `acceptance.spec.ts:150,1918` 复用能力拒绝、插件停用/恢复的场景。 |

## 固定候选的命令选择

以下命令供 Lead 在对应环境串行执行。本轮未执行这些命令。Linux 复用已成功的 Xvfb 与隔离 Secret Service 夹具，前置 Node 24.21.0，使用 pnpm 12.10.1 并显式设置 `PLAYWRIGHT_BROWSERS_PATH`。回环用例需确认实际通过数，缺 Chromium 会 skip。

```sh
pnpm e2e tests/e2e/knowledge/session-flush.spec.ts -g 'W05-W06 关闭时|TB-14/15 关窗缺少保存回执'
pnpm e2e tests/e2e/workflows/web-share.spec.ts -g '两份邀请和三个浏览器会话'
pnpm e2e tests/e2e/workflows/acceptance.spec.ts -g 'W05-W06 最近笔记|窄屏调整顺序|其他会话先保存|可信目录添加 Git 和 SSH'
pnpm exec vitest run apps/engine/test/web-share.test.ts apps/engine/test/dashboard-save.test.ts -t '独立浏览器会话|断开前后的整板'
```

Windows 用 `pnpm e2e tests/e2e/knowledge/session-flush.spec.ts -g '应用菜单保存当前文档|W05-W06 关闭时'`，另用 `pnpm e2e tests/e2e/window-chrome.spec.ts -g 'loopback browser title bar|native caption tracks'`。Linux X11/Wayland 用程序菜单及实际系统 X、键盘关闭和窗口管理器取证。macOS 走系统菜单与关闭键，检查关闭最后窗口后激活恢复。Windows 真实菜单键盘导航与贴靠用原生宿主，Playwright 捕获 Menu 对象只用于验动作和后续状态。

`tests/e2e/helpers/launch.ts:19–33` 运行仓库桌面输出。`playwright.packaged.config.ts` 和 `tests/e2e/packaged/packaged.spec.ts:9–25,78` 通过 `HUHU_PACKAGED_EXE=<当前安装或解包后的可执行文件> pnpm e2e:packaged` 做封包冒烟，现有四项未包含本组合。安装态需将上述动作移植到 packaged 夹具或在真实安装版操作。核对菜单的实际版本、Web 静态资源由包内 renderer 提供（`apps/desktop/src/main/engine-supervisor.ts:141`），关闭再重开临时 Vault 读 Markdown 和看板 revision。S4-01 的多平台窗口装饰、G8.2 的真实 LAN 和 W06-01 的安装版范围分别留证。

## 优先组合成一条用例时

1. 以现有 `web-share.spec.ts` 的 Electron、临时 Vault 与 A/A/B 浏览器上下文为骨架。桌面在笔记 A 上通过真实 MenuItem 保存，确认动作前后磁盘字节，只改精确目标。依次切至首页和能力网关。浏览器端确认无桌面菜单，命令搜索仍可用。
2. B 保存一个实例的布局/显隐，桌面从同一业务查询读回 revision。停用一个测试 Widget 的贡献或复用现有权限失败夹具，验证受限卡和其他卡仍可用，复开时实例 ID 不变。撤销 A 后确认两个会话均失效，B 原会话及干净上下文再次兑换 B 都读到同一版；保留原测试的字节比较。
3. 回到桌面，留下防抖中的最后笔记输入与新的看板草稿。先选继续编辑，再模拟一次看板失败，均确认窗口、Engine、已保存布局 revision 与笔记原字节。随后从桌面退出菜单保存并离开，按另外一次运行覆盖放弃。用同一临时 Vault 重开校对正文和已预期的布局 revision。复用近端的 Playwright 技术路径，实际系统快捷键和菜单操作另挂宿主记录。

## 既有证据和本轮边界

- 批次 `windows-shell-dashboard.md` 记载 Windows 的菜单、F10、最终笔记和看板文件回读，`4f5cb1c8` 的 23 项桌面回归以及 Edge 两邀请三会话。其菜单弹层由夹具驱动，原始日志路径为 Windows 阶段记录。#6 `evidence/G6-windows-shared-workbench.md` 区分 Windows 同机非回环和第二物理设备，二者不能合并计作通过。
- [t30/report01.md](../t30/report01.md) 的 Lead 验收明确记录 `369efcfd` 构建下 Linux W05–W06 关窗 2 过、Web 三会话 1 过、acceptance 选组 14 过、shell 首页 2 过。候选中间日志的 teardown 超时单列。topic 的早期 `00d644d3` 记录有 6 项关窗清理挂起，`e9e6fcd9` 后由 `tests/e2e/helpers/launch.ts:29–32` 先撤测试路由再退出。这里没有目标 SHA 的同套新结果。
- 只读取实现、用例和既有证据。本轮未运行 E2E、全量门禁、构建或打包，未触碰真实 Vault 或凭据。保留 `report01.md`。topic 与 task 的 Lead 均为 `t3p`，manifest 唯一指向 `t4v/task02.md active`，hostname 与 `HC_TERMINAL_ID=t4v` 一致。独立 `hc get` 仍报 Core 锁文件所在文件系统只读，终稿可从共享路径读取。

## Lead 验收

Lead 已核对固定基线、已合入候选及现成用例。修正 `196cfbc6` 的 Web 分享初始范围和地址操作。补充 `ee599ce6` 的菜单动作前后磁盘断言和独立浏览器命令入口。定位器和用例收录已核对。实际桌面、浏览器和关窗验收按固定候选实施，正文与恢复草稿的成功结果提示仍有待处理。
