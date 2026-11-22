# #3 页面许可失效与宿主恢复独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t4x`
- task — `task04.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report04.md
- 执行结果 — `done`
- 身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`。发布时核对 `HC_TERMINAL_ID=t4x` 和 `t4x / task04.md / active`。

## 签收建议

**建议返工后签收 S1a-03。** 上轮的三个反例均在新候选的对应场景通过。新发现一项 P2，强制停止时限过后挂起的 Engine 恢复可以跨越第二次退出。旧进程发出退出事件时，第一次取消留下的回调会启动新 Engine，第二次退出随后关窗，新 Engine 没有收到关闭请求。 [上轮报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report03.md) · [S1a-03 契约](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md)

## 规格轴

**P2 · 已取消退出的延迟恢复会在新一轮退出中重启 Engine。** Windows 隔离 Electron 探针使用候选的真实 Main 关窗处理和 `EngineSupervisor`，两个真实隐藏窗口和可控的 UtilityProcess 替身。第一次退出经两个合成 ACK 进入 stop，导航令一窗许可失效。触发 15 秒时限后，旧子进程先收到 kill，完成事件仍挂起。第二次退出为两窗重新分配 ID，两窗同意后对同一旧进程发出第二次关闭请求。此时触发旧进程 `exit`，第一次取消登记的回调启动第二个子进程。实际 Electron 到达 `will-quit`，窗口为 0，替身记录两个子进程。旧进程收到两次 shutdown 和一次 kill，新进程在该事件时仍为启动中，shutdown 数为 0。另用真实 Electron UtilityProcess 运行合成子进程，观测到 `kill()` 已返回 true、`exit` 尚未发出，这之间再次调用 `postMessage` 未抛错。该探针记录进程及关闭请求的顺序，实际 HUHU Engine 的进程最终清理由组合环境另行取证。 [Main 取消与恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/apps/desktop/src/main/index.ts:543) · [Engine 回调与停止时限](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/apps/desktop/src/main/engine-supervisor.ts:155) · [重复退出日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/native-timeout-requit-final.log) · [真实 UtilityProcess 顺序](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/utility-kill.log) · [锁定 Electron API](https://github.com/electron/electron/blob/v44.9.1/docs/api/utility-process.md)

| 复验项 | 实际结果与范围 |
| --- | --- |
| 已批准窗口在 Engine 停止期间导航 | 实际 Electron 顶层加载另一可信 URL，原许可 abort，另一窗收到 release，两窗均保留。旧进程按受控顺序退出后启动原 supervisor 的新子进程，状态为 `ready → stopped → starting → ready`，并可取得新端点。普通恢复完成后再次退出，两窗使用新 ID，旧回执未启动停止，当前回执成功后新子进程收到一次 shutdown 并退出。 [普通恢复和重试](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/native-normal-final.log) |
| 停止时限后恢复和所属 Engine 变化 | 单独触发停止时限，确认 kill 后没有立即启动第二个子进程。旧进程发出 exit 后只启动一次并恢复 ready。另一个场景中，在 stop 完成前注入新的 supervisor，候选保留两窗和新 owner，旧 owner 停止且没有重启。时限与进程事件均可控。 [时限恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/native-timeout-final.log) · [所有者变化](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/native-swap-final.log) |
| 无 Vault 错误页与工作台失联 | 真实 BrowserWindow 的合成 `data:` 错误页直接关闭，flush 请求为 0。已有活动 supervisor 时，检测无回复，宿主仅给保留窗口、重新加载工作台，默认与取消项为保留。选择保留后窗口与 ready 状态持续。下一轮派发 Renderer 退出事件，选择重新加载并等到 `did-finish-load`，窗口继续存在、原 Engine 保持 ready，shutdown 数为 0。对话框选择和崩溃事件由夹具注入。 [恢复探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/probe-host-recovery.cjs:143) · [宿主日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/native-host-recovery.log) |
| 等待期间的新参与者 | 候选遍历实时登记集合。挂起首项期间登记一个回报留下的参与者，首项确认后同一请求得到 false，新函数恰调用一次。用例使用协议参与者。 [定向回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/packages/workbench/test/exit-participants.test.ts:62) |
| 已取消窗口的输入、焦点与晚到结果 | 在独立 Chromium 页面运行候选 `connectWindowExit`，桥接、参与者和 flusher 受控。前置状态为 `checking → flushing`，落盘中正文区域 inert。匹配 ID 的 release 解除 inert 并恢复原文本框焦点，旧 flusher 迟到返回 `stay`。下一轮迟到的旧 release 不解除新冻结，当前 flusher 完成返回 true。 [renderer](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/apps/desktop/src/renderer/main.tsx:263) · [Chromium 状态日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/renderer-state-final.log) |

## 规范轴

- **需返工的状态所有权。** Main 在登记恢复时做一次 `supervisor === engine` 检查。`restartAfterStop()` 的延迟回调随后独立运行，缺少当前退出请求和当前 Engine 归属的复核，也没有由新一轮停止撤销。建议让延迟恢复持有一次可撤销的退出世代，在新退出或所有者替换时撤销，并在旧进程真正退出时复核。用同一重复退出用例验收成功结束时没有额外 fork。 [延迟恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/apps/desktop/src/main/engine-supervisor.ts:155) · [进入下一轮的边界](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/apps/desktop/src/main/index.ts:550)
- 退出桥接沿用现有受信主 frame、请求 ID 和限定 IPC。宿主失联对话框收敛到保留与重载，默认动作保留窗口。已用 zh-modern-web-guidance 搜索并获取 `dialog`，对照安全默认选择及原生取消语义。此次 6 个改动文件通过 oxfmt、oxlint 与 Git 差异检查，上轮指出的两处格式问题均消除。 [宿主对话框](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/candidate/apps/desktop/src/main/index.ts:141) · [检查日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/targeted.log)

## 冻结范围与验证

- 候选 `b4dc2066060af88efe45622201126821044319b2`，树 `ec3256c86c1d476e2f286881cdfffefea7b6abe2`。直接父提交 `bd6501289025ac2fddca97ac599b94f4a2678349`，上轮基准 `a4681d747e5808d1721036dc79b75029ad8fe428` 是祖先。相对直接父提交的退出改动为 6 个修改文件，相对上轮基准的整棵候选之间共 43 个变更文件，含其他逐步合入切片。独立归档的两组文件均按 Git blob 核验。本报告的判断聚焦退出契约。 [快照校验](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/snapshot.log)
- Windows，Node 24.21.0、Vitest 3.2.7，实际 Electron 44.9.1 / Chromium 152.0.7977.167。临时归档复用集成检出的同锁 Windows 依赖，锁文件 blob `8165f3147cf5564a2d36a67959f3afed0d697f95`。独立 Electron 使用隐藏窗口、测试用户目录与合成 Vault 路径。命令和证据与 Lead 的构建和实例隔离。
- 3 项参与者、29 项内存 Engine 文档会话用例通过，Playwright 成功枚举 session-flush 16 项。Main 和 Chromium 探针覆盖退出事务及恢复，另有一个真实 UtilityProcess 事件顺序探针。Lead 持有 `6ebe3e0` 组合构建及全套实跑。实际 Vault 磁盘回读、真实产品菜单和看板、只读场景与 Windows 安装包行为留待组合验收。 [定向验证脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/run-targeted.ps1) · [定向日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/targeted.log) · [Main 原生探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/probe-native.cjs) · [renderer 探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/probe-renderer.cjs)
- 本轮已完成的 15 个命令 pane 已关闭，报告与独立日志均可通过文件路径收取。 [Core 清理记录](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r04-6a9cc0394c71/logs/core-cleanup.log)

## Lead 验收

Lead 接收停止时限之后的复入反例。冻结 `063e97d` 更新 Supervisor 的停止及待恢复所有权，转 `t4x/task05.md` 独立复核。

由 Lead 追加。
