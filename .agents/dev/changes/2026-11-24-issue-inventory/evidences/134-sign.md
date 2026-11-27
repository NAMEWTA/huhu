# SIGN · 汇总逐项签收与剩余缺口

状态：全部签收——#7、#11、#12、#13、#14、#16、#17 通过并关闭，父单 #15 随之关闭。#12/#13/#14/#17 按用户决定的标准签收：代码逻辑与参考实现核对、Linux 上布局/渲染/字体/点击交互实际运行与单测通过；真实授权、MCP 外部调用与线上服务留待用户本人使用时提出。

[实施票据](../tasks/134-sign.md)

## 候选与环境

- 最终候选 `dc8b91757d63864e15cf918c4a3ed13627cb7e2a`（origin/main），[RC 报告](111-rc.md)。同一候选串行：typecheck、lint、单测 2565/12 跳过、构建、E2E 546 通过 / 0 失败 / 33 跳过、AppImage（SHA-256 `bfc0097e…211ce3e`）及 15 个打包验收模式全部通过。
- 环境：Linux x64（Ubuntu，8 vCPU / 30 GiB），Node 24.22.1，Electron 捆绑 Chromium，X11（xvfb），独立 Web 为 Playwright Chromium；官方 Codex 0.170.0 固定二进制；本机 OpenSSH 10.2p1、zsh 5.9、Docker 29.8.2。
- 未运行环境：Windows x64、macOS arm64（用户决定只验 Linux 与 Web）；异机 CI；真实线上模型账号；真实 GitHub/SMTP/IMAP/OAuth 提供方；异机真实 SSH 主机；系统输入法引擎（fcitx/ibus）。

## 逐单结论

| Issue | 结论 | 组合旅程 | 子单验收 | 未验证/阻塞 |
|---|---|---|---|---|
| [#7](https://github.com/NAMEWTA/huhu/issues/7) SSH | 通过，关闭 | [J19](130-j19.md)、[J21](132-j21.md) | S1–S7（[S7](105-s7.md)），2026-11-19 Change 40 张 H 票均通过 | 异机真实 SSH 主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent、系统输入法引擎、Windows/macOS 后端 |
| [#11](https://github.com/NAMEWTA/huhu/issues/11) 账本 | 通过，关闭 | [J20](131-j20.md)、[J21](132-j21.md) | L0a–L11，原型 `0886426e` 已确认 | HomiBook 上游实机运行对照未做（按固定提交源码与原型对照） |
| [#16](https://github.com/NAMEWTA/huhu/issues/16) 自动化 | 通过，关闭 | [J03](114-j03.md)–[J06](117-j06.md)、[J11](122-j11.md)–[J14](125-j14.md) | AW1–AW7、AU01–AU20（[AW4](098-aw4.md)、[AW5](078-aw5.md)） | 真实 Mail/GitHub 渠道、桌面原生通知点击（回环夹具与应用内通知已验） |
| [#12](https://github.com/NAMEWTA/huhu/issues/12) MCP 聚合 | 通过，关闭 | [J09](120-j09.md)、[J10](121-j10.md)、[J16](127-j16.md) | P0–P7、A1–A12；F2 删除影响/诊断/OAuth 双身份回归 | 延后：真实外部 OAuth 提供方、异机 CI、真实模型三类工具实测、受控 Task 精确 MCP 委派（W1-1） |
| [#13](https://github.com/NAMEWTA/huhu/issues/13) 工作台 | 通过，关闭 | [J07](118-j07.md)、[J09](120-j09.md)、[J10](121-j10.md) | F01–F32、S01–S14；F2 调度 lint 门禁 | 延后：Claude/Pi 真实 provider、F18/W5 真实派遣与外部使用 |
| [#14](https://github.com/NAMEWTA/huhu/issues/14) 体验 | 通过，关闭 | [J07](118-j07.md)、[J10](121-j10.md)、[J16](127-j16.md)、[J17](128-j17.md) | UX01–UX19 | 延后：U3/U5 真实外部使用、真实模型与 GitHub 回传 |
| [#17](https://github.com/NAMEWTA/huhu/issues/17) 任务 | 通过，关闭 | [J15](126-j15.md)–[J18](129-j18.md)、[J21](132-j21.md)、[J22](133-j22.md) | AT01–AT14、AT-A01–AT-A20；F1 资源/新轮次/投递核实，F3 原生回答送达 | 延后：真实 GitHub 事件与回传、Claude/Pi、真实模型三类工具 |
| [#15](https://github.com/NAMEWTA/huhu/issues/15) 父单 | 通过，关闭 | 全部 J01–J22 | — | 子单全部关闭 |

## 延后与后续补证

用户决定：真实授权、MCP 外部调用与线上服务不作为本次关闭条件，留待其本人使用时提出。

- 延后功能：受控 Task 内精确 MCP 委派（审计 W1-1，`dispatch.ts` 仍为 `no_task_tool_scope`，`docs/mcp.md` 已记录）。
- 延后环境：真实模型账号（Codex/Claude/Pi）、异机 CI、真实 GitHub/SMTP/IMAP/OAuth 提供方、异机 SSH 主机、Windows/macOS。
- 非阻塞覆盖扩展（审计报告 `temp/dev/2026-11-24-issue-inventory/herdr/audit/`）：W1-5 Herdr RPC 分块 UTF-8 工作区 E2E；W1-6 自动化全来源双端换代矩阵；W1-7 提醒旧修订与评论中断故障矩阵；W1-9 同环境资源前后基准；W1-4 中关服务/切库组合的进程计数；W2-3 UX08 分栏/缩放两轴组合；W2-5 真实入口终态组合；W2-6 GitHub 来源链反序；W2-7 停用收尾与跨入口恢复。
