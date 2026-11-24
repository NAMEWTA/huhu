# Windows 组合候选 40822efd

Windows x64 `10.0.26300`，Electron `44.9.1`，Chromium `152.0.7977.167`，Herdr Core `0.1.19`。构建源提交为 `40822efd63d80cdc1bcba1d0f9c7d1219aa5bbd1`。

| 产物 | SHA-256 |
| --- | --- |
| NSIS `HUHU-0.0.1-rc.4-win32-x64.exe` | `3b9d72dd8da98add223243650986ad77a3ba5c50e2b9007e408a049ae1df7521` |
| 随包 Herdr Core | `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d` |
| 随包受保护终端宿主，Go `1.26.7` | `2a5a8d1598354ce8191a5dbd42c79fb534e5a3ac33d60f642d930daf63dbc5b9` |

从固定提交执行 Windows 原生测试、lint、typecheck、format、knip、build，全部通过。38 项桌面与 Web 端到端用例通过，包含布局保存和重开、窗口菜单保存、看板草稿协同、SSH 主机信任与文件操作、Mail 搜索和草稿、Safe 标签与待核实任务。冻结记录为 `temp/issue-baseline/40822efd-windows-gates.log`。

同一个未签名候选包的四项打包用例通过，包括应用携带的 CLI、Core、文档、任务、数据包和自动化派遣。实际 Codex `0.171.0` 对隔离的本机 Responses 输入执行一次，工作台从任务回到原会话，获得一份结果。Edge `157.0.4341.60` 三个浏览器会话验证邀请重用和按邀请撤销，并验证工作台附件上传、下载、桌面继续工作及 MCP/CLI 授权与撤销。使用包内原生宿主，实际交互进程在 Safe 未初始化、锁定和停用时各完成一次，核对 TTY、数据传入和遮蔽输出。证据为 `temp/issue-baseline/40822efd-packaged-smoke.log`。

安装包位于 Windows 本机临时目录 `huhu-40822efd-release-8c634516`。上述为阶段候选。独立回环 SSH 复核发现两个后续需处理的覆盖发布边界，其他成员剩余切片和最终同版本全量单测仍按批次进行。
