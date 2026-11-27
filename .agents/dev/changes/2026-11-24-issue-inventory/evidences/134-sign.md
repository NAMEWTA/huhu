# SIGN · 汇总逐项签收与剩余缺口

状态：全部签收——#7、#11、#12、#13、#14、#16、#17 与父单 #15 通过并关闭。#12/#17 在受控 Task 精确 MCP 委派（W1-1）实现并经最终候选全量复验后重新关闭。按用户决定的标准签收：代码逻辑与参考实现核对、Linux 上布局/渲染/字体/点击交互实际运行与单测通过；真实账号、真实外部服务与线上模型留待用户本人使用时提出。

[实施票据](../tasks/134-sign.md)

## 候选与环境

- 最终候选 `204deaeafcf67169e5a2c0bb25a41ba9c372765b`（origin/main），[RC 报告](111-rc.md)。在独立验收 worktree 串行：typecheck、lint、单测 2580/12 跳过、构建、E2E 559 通过 / 0 失败 / 35 跳过、AppImage（SHA-256 `62225503…44791e`）及 15 个打包验收模式全部通过。
- 环境：Linux x64（Ubuntu，8 vCPU / 30 GiB），Node 24.22.1，Electron 捆绑 Chromium，X11（xvfb），独立 Web 为 Playwright Chromium；官方 Codex 0.170.0 固定二进制；本机 OpenSSH 10.2p1、zsh 5.9、Docker 29.8.2。
- 未运行环境：Windows x64、macOS arm64（用户决定只验 Linux 与 Web）；异机 CI；真实线上模型账号；真实 GitHub/SMTP/IMAP/OAuth 提供方；异机真实 SSH 主机；系统输入法引擎（fcitx/ibus）。

## 逐单结论

| Issue | 结论 | 组合旅程 | 子单验收 | 未验证/阻塞 |
|---|---|---|---|---|
| [#7](https://github.com/NAMEWTA/huhu/issues/7) SSH | 通过，关闭 | [J19](130-j19.md)、[J21](132-j21.md) | S1–S7（[S7](105-s7.md)），2026-11-19 Change 40 张 H 票均通过 | 异机真实 SSH 主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent、系统输入法引擎、Windows/macOS 后端 |
| [#11](https://github.com/NAMEWTA/huhu/issues/11) 账本 | 通过，关闭 | [J20](131-j20.md)、[J21](132-j21.md) | L0a–L11，原型 `0886426e` 已确认 | HomiBook 上游实机运行对照未做（按固定提交源码与原型对照） |
| [#16](https://github.com/NAMEWTA/huhu/issues/16) 自动化 | 通过，关闭 | [J03](114-j03.md)–[J06](117-j06.md)、[J11](122-j11.md)–[J14](125-j14.md) | AW1–AW7、AU01–AU20（[AW4](098-aw4.md)、[AW5](078-aw5.md)） | 真实 Mail/GitHub 渠道、桌面原生通知点击（回环夹具与应用内通知已验） |
| [#12](https://github.com/NAMEWTA/huhu/issues/12) MCP 聚合 | 通过，关闭 | [J09](120-j09.md)、[J10](121-j10.md)、[J16](127-j16.md) | P0–P7（[P6](107-p6.md) 含受控 Task 精确委派 W1-1）、A1–A12；F2 删除影响/诊断/OAuth 双身份；G2 生命周期进程计数 | 延后：真实外部 OAuth 提供方、异机 CI、真实线上模型 |
| [#13](https://github.com/NAMEWTA/huhu/issues/13) 工作台 | 通过，关闭 | [J07](118-j07.md)、[J09](120-j09.md)、[J10](121-j10.md) | F01–F32、S01–S14；F2 调度 lint 门禁 | 延后：Claude/Pi 真实 provider、F18/W5 真实派遣与外部使用 |
| [#14](https://github.com/NAMEWTA/huhu/issues/14) 体验 | 通过，关闭 | [J07](118-j07.md)、[J10](121-j10.md)、[J16](127-j16.md)、[J17](128-j17.md) | UX01–UX19 | 延后：U3/U5 真实外部使用、真实模型与 GitHub 回传 |
| [#17](https://github.com/NAMEWTA/huhu/issues/17) 任务 | 通过，关闭 | [J15](126-j15.md)–[J18](129-j18.md)、[J21](132-j21.md)、[J22](133-j22.md) | AT01–AT14、AT-A01–AT-A20；F1 资源/新轮次/投递核实，F3 原生回答送达，G1 任务 MCP 授权与终态/停用收尾组合，G2 GitHub 来源链反序 | 延后：真实 GitHub 事件与回传、Claude/Pi、真实线上模型 |
| [#15](https://github.com/NAMEWTA/huhu/issues/15) 父单 | 通过，关闭 | 全部 J01–J22 | — | 子单全部关闭 |

## 延后与补证结果

用户决定：真实账号、真实外部服务与线上模型不作为本次关闭条件，留待其本人使用时提出。

- 延后环境：真实模型账号（Codex/Claude/Pi）、异机 CI、真实 GitHub/SMTP/IMAP/OAuth 提供方、异机 SSH 主机、Windows/macOS。
- 审计开发缺口 W1-1（受控 Task 精确 MCP 委派）：已实现并验收，见 [P6](107-p6.md)。
- 审计覆盖补证全部写成并在最终候选全量中通过：W1-4 MCP 关服务/停插件/切库进程计数，W1-5 Herdr 事件分块 UTF-8，W1-6 自动化全来源双端换代矩阵，W1-7 提醒旧修订与评论中断，W2-3 UX08 分栏/视口/字号/缩放两轴，W2-5 真实入口终态组合，W2-6 GitHub 来源链反序，W2-7 停用收尾与 SSH/账本跨入口。补证中发现并修复 4 处产品缺陷：Mail 周期槽被跳过、Web 画布裁掉重排后的聚焦终端、任务授权长标签挤掉复选框、观察评论回执丢失后重启停在 unknown。
- W1-9 资源比较：见下节。

## W1-9 资源比较

- 脚本 `scripts/compare-inventory-resources.mjs`（G2），同机交错 2 轮，固定工作量与正确性门禁（10k 历史下 2 个活动派遣；1 条观察规则、1 个 PTY 会话、0/1/3 个观察端；F09/F12/F23 Playwright 样本），全部门禁通过。[comparison.json 与原始样本](../../../../../temp/dev/2026-11-24-issue-inventory/herdr/g/w1-9-resources/)
- 运行方式：A/A——两个独立检出均为最终候选 `204deaea`。F11 之前的提交 `febf92ea` 缺少测量工作量依赖的 `@huhu/contracts/execution-receipt`，无法在同一工作量下运行，故跨版本对比改为与票据记录的旧样本对照：10k 历史档每轮读取 8 次 / 15,936 B（旧样本 60,008 次），对账中位 3.2–3.4 ms、p95 6.2–8.5 ms（旧样本 12,191 ms），Engine RSS 约 596 MB；AU18 10k/3 观察端 Core 查询各 1 次（hello、terminal.list）、调度唤醒 0、到点误差 1000 ms（按 1 s 节拍）、Core RSS 5.2 MB；F09 首页 525–551 ms / 21 KB，F12 同一 MIME 首读 21–24 ms、复读 15–16 ms，F23 5,001 篇笔记保存 237–246 ms。两检出中位差在噪声范围内。
- 主机：i7-12700，8 逻辑 CPU，32.5 GB，Linux x64，同一固定 Herdr Core。
