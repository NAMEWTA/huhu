# #3 S1a-03 页面离场与窗口合并独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t4x`
- task — `task03.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report03.md
- 执行结果 — `done`
- 身份 — Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 `0.1.21`。发布时核对 `HC_TERMINAL_ID=t4x` 与 `t4x / task03.md / active`。

## 签收建议

**S1a-03 建议返工后签收。** 两项 P2 涉及退出许可和故障恢复。已批准窗口在 Engine 停止期间导航，旧许可失效后仍会退出。启动错误页与失联 Renderer 的关窗缺少可用的宿主处理路径。另有一项离场参与者契约边界和两处格式问题。 [#3 实施索引](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/plan.md) · [S1a-03 契约](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md) · [#10 W04-07](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md)

## 规格轴

1. **P2 · 停止 Engine 期间的顶层导航使许可失效，应用仍然关闭。** 两个窗口同意离场后，Main 核对许可并移除整轮取消监听，然后等待 `supervisor.stop()`。此时旧主文档的导航还会触发 `release()`，许可的信号已取消。停止完成后，Main 直接设置 `flushedForQuit` 并再次调用 `app.quit()`。Windows Electron 44.9.1 独立隐藏窗口探针以合成 ACK 和受控的 Engine 停止等待复现，允许后的窗口实际加载了另一个可信 URL，得到 `approvalAborted:true`。随后观测到两次 `before-quit`、一次 stop、`will-quit` 时窗口数为 0。对照探针在第二个窗口尚未放行时导航，整轮取消，两个窗口保留且未调用 stop。建议在进入不可逆的停止阶段前锁定窗口世代或让导航与退出统一裁决，确保失效许可无法关闭新文档。 [Main 提交点](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:511) · [独立 Electron 探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/probe-native.cjs) · [实测日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/electron-navigation.log) · [关闭设计](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/design.md:24)
2. **P2 · 启动错误页与 Renderer 失联时，关窗不能进入可恢复的宿主流程。** 顶层加载失败后回退到静态 `data:` 页，该页无法完成工作台握手。点击 X 仍被 Main 拦住，`checking` 三秒结束为 `stay`，`canCloseWindow` 直接保留窗口。Windows 源码事件探针在无 Vault 错误页连续两次关闭，窗口均保留且原生提示数为 0。无 supervisor 的 `app.quit()` 可正常退出。已有 Engine 的 Renderer 崩溃同样经 `release() → stay` 保持窗口、Engine，未进入宿主故障提示。父提交将初始无回执归为超时、渲染进程离开归为失败，两者都会进入宿主提示。建议让 Main 对确认干净的启动状态提供可用关窗，对已打开 Vault 的失联页提供可取消的宿主恢复选择。 [超时分流](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:85) · [渲染进程退出](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:121) · [错误页与关窗](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:190) · [源码探针日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/probe-exit.log) · [S1a-02 验收](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S1a-02-retry-close.md)
3. **P3 · 等待期间新增的离场参与者未纳入本次许可。** Workbench 在请求开始时复制参与者集合。用冻结模块挂起首个参与者，期间登记一个会返回留下的参与者，首项放行后，本轮仍返回 true，第二项调用数为 0。后一轮才得到留下。此处是交付给 W04-07 的契约边界，当前候选尚未装配生产看板参与者。若允许等候期间挂载新草稿，冻结参与者归属或在放行前复查登记变更可避免遗漏。 [参与者快照](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/packages/workbench/src/state/exit-participants.ts:18) · [模块探针日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/probe-exit.log) · [W04-07 验收](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md)

## 已核对的路径

| 项目 | 证据与范围 |
| --- | --- |
| 可信帧、请求 ID、晚到状态 | Main 同时检查存活 WebContents、发出请求时的主 frame、可信 URL 和精确 ID。只有当前 `flushing` 的 true 才是成功。完成后回执监听清除，旧 ID 的状态及回执不改变新轮次。源码事件探针确认跨窗口、其他 frame 及旧 ID 回执被忽略。preload 屏蔽原始 IPC 事件并返回注销函数。 [Main 验证](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:78) · [preload](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/preload/index.ts:47) · [Electron IPC 指南](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages) |
| 等待、合并和并发取消 | 参与者按登记顺序处理，同一窗口只接一个在途请求。明确等待用户时暂停检查时限，返回处理或落盘阶段重新计时。源码探针确认连点关窗和退出合并、两窗同意只停一次 Engine、一窗选择留下则保留两窗。取消后新请求取得新 ID，旧回执无法关窗。已通过窗口在协调阶段的顶层导航会取消整轮，同文档导航和子 frame 不撤销许可。 [事件日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/probe-exit.log) · [候选协议场景](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/tests/e2e/knowledge/session-flush.spec.ts:383) |
| 新编辑、取消恢复与真实文档 | 参与者允许后，renderer 先冻结整页输入，再运行 DocumentSession 等 flusher，释放时按请求 ID 解除冻结，并在原元素仍连接时恢复焦点。Electron 探针实测 Chromium 支持 `inert`。独立运行的 29 项文档会话用例使用内存 Engine，覆盖编辑器防抖结算、正文/手动草稿和旧保存结果保留新修改。候选 session-flush 中，真实笔记的自动保存、手动草稿重开、故障后再关窗，以及合并取消后重新输入与文件回读均有用例。合并用例的第二窗为协议夹具，首窗在取消后打开笔记并输入。冻结期间真实键盘/IME 输入与取消后的编辑器焦点仍需原生场景证据。 [renderer](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/renderer/main.tsx:275) · [文档退出保存](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/plugins/notes/src/ui/documents/DocumentSession.ts:353) · [会话用例](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/tests/e2e/knowledge/session-flush.spec.ts:47) · [Chrome inert](https://developer.chrome.com/blog/new-in-chrome-102#inert) |
| 无 Vault 与只读 | 可信启动页的 Root 在 Vault 状态查询之外安装桥接，健康启动页可回答关窗。无 supervisor 的应用退出直接通过，源码探针实测。只读 Vault 仍构造 supervisor，走同一参与者与 flusher 流程，无只读放行分支。错误页边界见 P2。只读 Vault 的真实原生关闭和保留草稿需独立场景回读。 [Vault 装配](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:264) · [Root](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/renderer/main.tsx:323) · [before-quit](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:488) |
| 看板与菜单 | W04-07 的保存、放弃、继续编辑、保存失败和真实模块导航由看板编辑会话接入后验收。真实产品菜单、原生 X 或 Alt+F4 的交互走查属于对应组合场景。候选 IPC 夹具覆盖设计的参与者协议。 [S1a-03](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md) · [W04-07](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md) |

## 规范轴

- 桌面能力沿用 `window.huhuHost` 的窄 preload 接口，Workbench 参与者注册只依赖普通 JS/DOM 类型。原生宿主提示将保留窗口设为默认和取消项。使用 zh-modern-web-guidance 实际 search/retrieve 核对了 `dialog` 与 `accessibility`，并核对 Windows 锁定的 Electron/Chromium 能力。 [退出桥](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/preload/index.ts:47) · [原生提示](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/candidate/apps/desktop/src/main/index.ts:144) · [Electron 44.9.1 发布记录](https://releases.electronjs.org/release/v44.9.1)
- **P3 · 格式检查回退。** 候选改动的 9 个文件中，`apps/desktop/src/main/index.ts` 与 `tests/e2e/knowledge/session-flush.spec.ts` 未通过锁定版 oxfmt。同配置、同文件的父提交通过。候选 oxlint 和 `git diff --check` 通过。 [格式与差异日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/style.log)

## 冻结与验证范围

- 候选 `a4681d747e5808d1721036dc79b75029ad8fe428`，树 `de2d5179ac4cfd604cbcbfe5d19af2c1160f4182`。直接父提交 `1e2aae3ad02f7883ec73d6957c4b20614b62a1dd`，树 `509146054710e4b661df99737ce54446ebaac865`。共 9 个改动文件，其中 3 个新增，已逐一核对隔离副本的 Git blob。使用 `git archive`、同锁第三方依赖和独立系统临时目录。 [快照核对](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/snapshot.log)
- Windows 上独立执行 31 项 Vitest 定向用例，含 2 项参与者和 29 项文档会话用例。Playwright `--list` 枚举 session-flush 14 项。定向源码探针使用事件替身。原生探针使用 Electron 44.9.1 / Chromium 152.0.7977.167、独立用户目录、隐藏窗口、回环内无真实业务和受控的停止 Promise，验证了导航与退出顺序。 [定向运行日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/targeted.log) · [源码探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/probe-exit.mjs) · [原生探针日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r03-aee9812ffa2a/logs/electron-navigation.log)
- 实际 HUHU 构建的完整 session-flush 实跑由 Lead 在其隔离环境取证。本轮结果覆盖上述独立探针与定向测试。真实看板、产品菜单、只读 Vault 和平台安装矩阵留到各自场景记录。

## Lead 验收

由 Lead 追加。

Lead 接收实测缺口及复核意见。本地返工 `b4dc206` 已冻结，交 `t4x/task04.md` 重放停止期间导航、失联和新登记参与者。
