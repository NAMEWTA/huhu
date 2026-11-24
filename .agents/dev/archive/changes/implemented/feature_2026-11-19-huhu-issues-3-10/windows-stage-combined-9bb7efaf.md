# Windows 组合候选 9bb7efaf

候选代码为 `9bb7efaffe2a101ed1de755731dd176aa9883106`。Windows x64 26300、Node 24.21.0、pnpm 12.10.1、Electron 44.9.1／Chromium 152.0.7977.167。应用构建 `0.0.1-rc.4`，时间 `2026-11-20T18:29:17.081Z`。Stage 包为未签名 NSIS。取证使用同包构建的解包目录、独立 Vault 和合成数据。

| 产物 | SHA-256 |
| --- | --- |
| `HUHU-0.0.1-rc.4-win32-x64.exe` | `18d62216ebd3c0fa0c4a4857922cebae8aec60de2f79f2f6712f3e91593de088` |
| `resources/app.asar` | `958e8c8ffa631549690a3cb5c524c2630abb40b8a3bd6c4cbed915791d243121` |
| `Herdr Core 0.1.19` | `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d` |

安装包和哈希清单（本机原件 `temp/issue-baseline/packaged-9bb7efaf-win-x64`） · 固定提交门禁（本机原件 `temp/issue-baseline/9bb7efaf-windows-gates.log`）

## 实际行为

- 包内现行冒烟 4 项通过。覆盖笔记写入、任务完成、ZIP、随包 Herdr shell、CLI 调用和 Automations 规则对指定失联会话的派遣。运行抽屉与任务详情显示同一 `runId`，失联不会创建替代会话或旧任务运行文件。此验证使用后来替换的测试文件调用上述候选包。 包内冒烟（本机原件 `temp/issue-baseline/9bb7efaf-packaged-current-automation.log`）
- 包内工作台发起一轮手动派遣，实际 Codex 0.171.0 走本机 Responses 夹具。模型端匹配同一输入一次，原任务收到唯一结果。任务详情打开结果，定位原会话后 Agent CLI 选中同一 `sessionId` 对应标签。此轮关闭 Automations，验证人工派遣独立。 包内派遣与定位（本机原件 `temp/issue-baseline/9bb7efaf-packaged-smoke.log`）
- 同包在 Edge 157.0.4341.60 的普通 HTTP 生效，两份邀请、三个浏览器会话。独立撤销、深链、笔记与任务共享、收发文件、剪贴板回退、停用后桌面继续可用。CLI/MCP 工具默认全关，逐项授权再撤销。锁定 Safe 后 Mail 目录仍可查询。浏览器均在同一台 Windows 运行。 包内浏览器取证（本机原件 `temp/issue-baseline/9bb7efaf-packaged-smoke.log`）
- 同一提交源码通过 lint、typecheck、format、knip 和 build。源代码端到端 25 项通过，含桌面菜单、关窗结算、看板布局、Web 邀请、SSH 导入与主机编辑、Safe 多账号、Mail 草稿。全量用例 1,219 通过、26 跳过，凭据测试一项超时，另报一次临时仓库锁文件失效。工具占用降低后的同提交凭据定向复跑 18 项全通过。 全量原始结果（本机原件 `temp/issue-baseline/9bb7efaf-windows-regressions.log`） · 定向复跑（本机原件 `temp/issue-baseline/9bb7efaf-windows-recovery.log`）
- Herdr Core 独立审查 `t187` 复跑 86 项通过。真实 Core 与合成 App Server 在同会话经 MCP 和 CLI 走三轮输入，独立故障注入核对双 ACK 失联后的去重。审查发现旧 `envRefs` 仍能解析 Safe 项、计划终端运行前的写入断点及绑定会话的等待归属遗漏。该包是阶段候选；修复后需新 SHA 并继续 W8.2、T7.2。 [独立审查](../../../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report01.md)
