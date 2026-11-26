# SIGN · 汇总逐项签收与剩余缺口

状态：部分签收——#7、#11、#16 通过并可关闭；#12、#13、#14、#17 因真实外部环境阻塞保持开放；父单 #15 随子单保持开放。

[实施票据](../tasks/134-sign.md)

## 候选与环境

- 候选 `815253a1a87d0cdde36f27166a3c253f46206f0a`（origin/main），[RC 报告](111-rc.md)。同一候选串行：typecheck、lint、单测 2544/14 跳过、构建、E2E 543 通过 / 0 失败 / 33 跳过、AppImage（SHA-256 `bd553161…5be5baf`）及 15 个打包验收模式全部通过。候选后测试补证 `c8009f4f` 仅改测试文件。
- 环境：Linux x64（Ubuntu，8 vCPU / 30 GiB），Node 24.22.1，Electron 捆绑 Chromium，X11（xvfb），独立 Web 为 Playwright Chromium；官方 Codex 0.170.0 固定二进制；本机 OpenSSH 10.2p1、zsh 5.9、Docker 29.8.2。
- 未运行环境：Windows x64、macOS arm64（用户决定只验 Linux 与 Web）；异机 CI；真实线上模型账号；真实 GitHub/SMTP/IMAP/OAuth 提供方；异机真实 SSH 主机；系统输入法引擎（fcitx/ibus）。

## 逐单结论

| Issue | 结论 | 组合旅程 | 子单验收 | 未验证/阻塞 |
|---|---|---|---|---|
| [#7](https://github.com/NAMEWTA/huhu/issues/7) SSH | 通过，关闭 | [J19](130-j19.md)、[J21](132-j21.md) | S1–S7（[S7](105-s7.md)），2026-11-19 Change 40 张 H 票均通过 | 异机真实 SSH 主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent、系统输入法引擎、Windows/macOS 后端 |
| [#11](https://github.com/NAMEWTA/huhu/issues/11) 账本 | 通过，关闭 | [J20](131-j20.md)、[J21](132-j21.md) | L0a–L11，原型 `0886426e` 已确认 | HomiBook 上游实机运行对照未做（按固定提交源码与原型对照） |
| [#16](https://github.com/NAMEWTA/huhu/issues/16) 自动化 | 通过，关闭 | [J03](114-j03.md)–[J06](117-j06.md)、[J11](122-j11.md)–[J14](125-j14.md) | AW1–AW7、AU01–AU20（[AW4](098-aw4.md)、[AW5](078-aw5.md)） | 真实 Mail/GitHub 渠道、桌面原生通知点击（回环夹具与应用内通知已验） |
| [#12](https://github.com/NAMEWTA/huhu/issues/12) MCP 聚合 | 阻塞，保持开放 | [J09](120-j09.md) 部分、[J10](121-j10.md)、[J16](127-j16.md) 未通过 | P0–P7、A1–A12 本机部分通过 | 真实外部 OAuth 提供方；真实 Agent 派遣与异机 CI 固定地址调用；交互 provider/受控 Task 真实模型三类工具实测 |
| [#13](https://github.com/NAMEWTA/huhu/issues/13) 工作台 | 阻塞，保持开放 | [J07](118-j07.md) 部分、[J09](120-j09.md) 部分、[J10](121-j10.md) 未通过 | F01–F32、S01–S14 本机通过 | Claude/Pi 真实 provider 连续输出；F18/W5 真实派遣与外部使用 |
| [#14](https://github.com/NAMEWTA/huhu/issues/14) 体验 | 阻塞，保持开放 | [J07](118-j07.md) 部分、[J10](121-j10.md)、[J16](127-j16.md)、[J17](128-j17.md) 未通过 | UX01–UX19 本机通过 | U3/U5 真实外部使用；J16/J17 真实模型与 GitHub 回传 |
| [#17](https://github.com/NAMEWTA/huhu/issues/17) 任务 | 阻塞，保持开放 | [J16](127-j16.md)、[J17](128-j17.md) 未通过；[J15](126-j15.md)、[J18](129-j18.md)、[J21](132-j21.md)、[J22](133-j22.md) 通过 | AT01–AT14、AT-A01–AT-A20 本机通过 | 真实 GitHub 事件与回传；Claude/Pi；真实模型下的三类工具调用（fixture 不能代签） |
| [#15](https://github.com/NAMEWTA/huhu/issues/15) 父单 | 保持开放 | 全部 J01–J22 | — | 随 #12/#13/#14/#17 |

## 解除阻塞所需

1. 可用于测试的真实模型账号（Codex/Claude/Pi 任一或全部）与授权 Task 运行。
2. 一台异机 CI（或第二台主机）按固定地址调用 Huhu MCP。
3. 测试用 GitHub 仓库与令牌（事件与回传），测试邮箱（SMTP/IMAP）和一个真实 OAuth MCP 提供方。

提供后按 J07、J09、J10、J16、J17 原票在同一候选补证，再关闭对应 Issue。
