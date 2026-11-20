# S1a-03 两窗口退出合并实测

Windows x64 26300，Electron 44.9.1。`t4t` 针对早期构建 `7d4fef5` 运行新回归。Main 持有一个正常编辑窗口和一个只用于拒绝退出的合成窗口。第一个窗口发起关窗，在保存回执到达前请求应用退出。正常窗口只处理一条确认请求，第二个窗口拒绝，但正常窗口已经提前销毁。保留初次运行的 Playwright trace。

`3f45c0054fde58f2bb506502984155a2d36fe385` 将在途单窗口检查交给应用退出决定。所有窗口均同意后才在停止 Engine 的 Promise 完成时释放应用退出。另一窗口取消时保留两窗，原编辑窗口的 `vault.info` 仍可用。

`t4y` 的同提交 `pnpm build` 通过，`t50` 在同一构建运行三项，均通过。分别覆盖无保存回执时保持窗口和 Engine、顶层重载结束旧检查、第二窗取消时保持已确认窗口。运行的选择器为 `tests/e2e/knowledge/session-flush.spec.ts --grep TB-1[45]`。原 Core 输出与初次 trace 位于原工作区 `temp/issue-baseline/core-finished/` 和 `temp/issue-baseline/windows-quit-multi-before.trace.zip`。

同一构建另外运行原有 `C06 结算待定时退出并重启` 两项。自动保存以磁盘正文与重开回读确认，手动保存以原文件字节未变、草稿恢复后找到最后输入确认。`t5n` 两项通过，用时 48.2 秒。

多窗口用例注入第二窗故障并替换 Native dialog 的决定以核对真实主进程。应用菜单、原生交互截图和看板离场参与者仍待对应场景确认和联验。
