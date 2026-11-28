# SIGN · 汇总逐项签收与剩余缺口

状态：全部签收——#7、#11、#12、#13、#14、#16、#17 与父单 #15 通过并关闭。#12/#17 在受控 Task 精确 MCP 委派（W1-1）实现并经最终候选全量复验后重新关闭。按用户决定的标准签收：代码逻辑与参考实现核对、Linux 上布局/渲染/字体/点击交互实际运行与单测通过；真实账号、真实外部服务与线上模型留待用户本人使用时提出。2026-11-28 整体复核补齐：Linux CI 门禁、vendor 评论刷新回归、L5 HomiBook 图表迁入、Waiting 订阅重复与 E2E 隔离缺陷，最终候选改为 `d50d990f`。

[实施票据](../tasks/134-sign.md)

## 候选与环境

- 最终候选 `d50d990fec74e6132c629246d89aef0753aa1d73`（推送至 origin/main），[RC 报告](111-rc.md)。在独立验收 worktree 串行：门禁（evidence、knip、format、version、vendor-dirs）、typecheck、lint、构建、test:vendor、AppImage（SHA-256 `4448e381…6058b3f9f`）及 15 个打包验收模式全部通过；单测 2583/2 失败/12 跳过、E2E 559/2 失败/35 跳过，4 项均为负载偶发，单独复跑通过（终端吞吐采样数守卫 2/3，细节见 RC）。
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

## 逐项矩阵

各 Issue 的验收编号对应到实施票据及其验收报告；「报告所列未运行/延后」摘自报告状态行，均属用户决定延后的真实账号、外部服务或 Windows/macOS。170 项全部有票据，所列票据状态均为通过。

### #13 F01–F32

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| F01 | Vault 单文件与多文件写入没有共同提交边界 | [F01](025-f01.md)、[W7](103-w7.md) | — |
| F02 | 回滚凭内容相同认领从未执行的步骤 | [F02](043-f02.md)、[W7](103-w7.md) | — |
| F03 | 语义实体标题改名可覆盖异常的已有目标文件 | [F03](044-f03.md)、[W7](103-w7.md) | — |
| F04 | 回收站的 payload 与元数据同名，且搬移/身份… | [F04](060-f04.md)、[W7](103-w7.md) | — |
| F05 | JSON 格式化会改写数据语义并可能自动保存 | [F05](003-f05.md)、[W7](103-w7.md) | — |
| F06 | Web 刷新/关页缺少知识库脏编辑保全 | [F06](026-f06.md)、[W7](103-w7.md) | — |
| F07 | Inbox 跨插件转换缺少持久绑定，失败重交可重复创… | [F07](061-f07.md)、[W7](103-w7.md)、[J02](113-j02.md) | — |
| F08 | Inbox 转笔记没有携带捕获正文 | [F08](004-f08.md)、[W7](103-w7.md)、[J02](113-j02.md) | — |
| F09 | Agent CLI 全局截断历史后才按 Space … | [F09](005-f09.md)、[W7](103-w7.md)、[J07](118-j07.md) | 受控 Codex 原生恢复（task-journey C01，固定官方 Codex 0.170.0）在最终候选全量通过，真实线上模型账号按用… |
| F10 | 高频自动化长间隔后枚举上限漏掉宽限内的最近计划点 | [F10](006-f10.md)、[W5D](097-w5d.md)、[W7](103-w7.md)、[J06](117-j06.md) | — |
| F11 | Tasks 对账把已结束历史留在全量热循环 | [F11](072-f11.md)、[W7](103-w7.md)、[J06](117-j06.md) | — |
| F12 | Mail 联系人分页/定位先读取全部 MIME 与发… | [F12](035-f12.md)、[W7](103-w7.md)、[J11](122-j11.md) | 真实外部邮件服务未验证 |
| F13 | Mail 部分接受被投影成给全部 To/Cc 的已发… | [F13](008-f13.md)、[W7](103-w7.md)、[J11](122-j11.md) | 真实外部邮箱未验证 |
| F14 | Versioning 正常停用/退出会丢弃待记录的最… | [F14](009-f14.md)、[W5D](097-w5d.md)、[W7](103-w7.md)、[J01](112-j01.md) | — |
| F15 | 已取消的普通 Dispatcher 调用仍可执行同步… | [F15](027-f15.md)、[W7](103-w7.md) | — |
| F16 | 普通能力调用绕过公开 output schema | [F16](028-f16.md)、[W7](103-w7.md) | — |
| F17 | 幂等日志坏尾吞掉下一条完整回执 | [F17](029-f17.md)、[W7](103-w7.md) | — |
| F18 | 工作台事件流授权与工具权限、凭据生命周期没有统一 | [F18](030-f18.md)、[W7](103-w7.md)、[J10](121-j10.md) | 外部使用部分按用户决定延后 |
| F19 | 同 Vault 的 Engine 重启后笔记会话仍捕… | [F19](031-f19.md)、[W7](103-w7.md) | — |
| F20 | Herdr 普通 JSON-RPC 按数据块解码会损… | [F20](010-f20.md)、[W7](103-w7.md)、[J07](118-j07.md) | — |
| F21 | 命令面板丢弃命中身份，清空后仍接受旧搜索结果 | [F21](011-f21.md)、[W7](103-w7.md)、[J02](113-j02.md) | — |
| F22 | 命令面板宣告模态，但键盘焦点可进入背景 | [F22](047-f22.md)、[W7](103-w7.md)、[J02](113-j02.md)、[J11](122-j11.md) | — |
| F23 | 一次笔记保存可调度两次整树读取并重复排序 | [F23](036-f23.md)、[W7](103-w7.md)、[J01](112-j01.md) | — |
| F24 | 全工作区并行 typecheck 与 CI 排队妨碍… | [F24](012-f24.md)、[W7](103-w7.md) | Windows/macOS 按用户决定不验证 |
| F25 | Windows Markdown golden 用例… | [F25](013-f25.md)、[W7](103-w7.md) | Windows/macOS 按用户决定不验证 |
| F26 | lint 规则护栏验证的是复制配置 | [F26](014-f26.md)、[W7](103-w7.md) | — |
| F27 | 性能测试有基础，缺少统一正确性与对比产物 | [F27](007-f27.md)、[W7](103-w7.md) | — |
| F28 | Tasks 内嵌提醒构成第二套业务调度，并有改期与投… | [F28](073-f28.md)、[W5D](097-w5d.md)、[W7](103-w7.md) | — |
| F29 | Automations 自身缺少统一计划目录，已有跟… | [F29](062-f29.md)、[W5D](097-w5d.md)、[W7](103-w7.md) | — |
| F30 | Mail、Versioning、SSH 的用户周期行… | [F30](089-f30.md)、[W5D](097-w5d.md)、[W7](103-w7.md) | — |
| F31 | Task/Agent 时间触发、状态观察与通知策略混… | [F31](074-f31.md)、[W5D](097-w5d.md)、[W7](103-w7.md) | — |
| F32 | 首页专注计时的到期结算依赖卡片挂载 | [F32](075-f32.md)、[W5D](097-w5d.md)、[W7](103-w7.md) | — |

### #13 S01–S14

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| S01 | 全量可见 | [J03](114-j03.md)、[J04](115-j04.md) | — |
| S02 | 同一对象 | [J03](114-j03.md)、[J04](115-j04.md) | — |
| S03 | 用户控制 | [J03](114-j03.md)、[J04](115-j04.md) | — |
| S04 | 不复活 | [J04](115-j04.md) | — |
| S05 | 竞争与故障 | [J05](116-j05.md) | — |
| S06 | 定时语义 | [J06](117-j06.md) | — |
| S07 | Task/Agent 观察 | [J06](117-j06.md) | — |
| S08 | 运行完整性 | [J05](116-j05.md) | — |
| S09 | 执行域隔离 | [J04](115-j04.md) | — |
| S10 | 专注计时 | [J06](117-j06.md) | — |
| S11 | 同步与监控 | [J04](115-j04.md) | — |
| S12 | 关闭与恢复 | [J05](116-j05.md) | — |
| S13 | 规模与资源 | [J06](117-j06.md)、[J12](123-j12.md) | — |
| S14 | 删除重复实现 | [J04](115-j04.md) | — |

### #14 UX01–UX19

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| UX01 | 编辑排版 | [UX01](048-ux01.md)、[U7](096-u7.md) | — |
| UX02 | 保存 | [UX02](063-ux02.md)、[U7](096-u7.md) | — |
| UX03 | 单条批注 | [UX03](064-ux03.md)、[U7](096-u7.md) | — |
| UX04 | 日记月历 | [UX04](049-ux04.md)、[U7](096-u7.md) | — |
| UX05 | 任务表单 | [UX05](050-ux05.md)、[U7](096-u7.md)、[J02](113-j02.md)、[J03](114-j03.md) | — |
| UX06 | 快速捕获 | [UX06](071-ux06.md)、[U7](096-u7.md)、[J02](113-j02.md) | — |
| UX07 | 邮件 | [UX07](051-ux07.md)、[U7](096-u7.md) | — |
| UX08 | 终端 | [UX08](052-ux08.md)、[U7](096-u7.md) | 真实 Pi TUI 按用户决定延后 |
| UX09 | 会话导航 | [UX09](053-ux09.md)、[U7](096-u7.md) | — |
| UX10 | 启动器 | [UX10](054-ux10.md)、[U7](096-u7.md) | — |
| UX11 | 自动化表单与中心 | [UX11](088-ux11.md)、[U7](096-u7.md)、[J03](114-j03.md)、[J13](124-j13.md) | — |
| UX12 | 公共控件 | [UX12](055-ux12.md)、[U7](096-u7.md)、[J13](124-j13.md) | — |
| UX13 | HTTP MCP | [UX13](045-ux13.md)、[U7](096-u7.md)、[J08](119-j08.md) | — |
| UX14 | 工具授权 | [UX14](067-ux14.md)、[U7](096-u7.md)、[J08](119-j08.md) | 真实外部提供方未验证 |
| UX15 | 同步表单 | [UX15](056-ux15.md)、[U7](096-u7.md) | 远端外部 Git 服务未接 |
| UX16 | Safe 三栏 | [UX16](057-ux16.md)、[U7](096-u7.md) | — |
| UX17 | 外观 | [UX17](058-ux17.md)、[U7](096-u7.md) | — |
| UX18 | 看板编辑 | [UX18](059-ux18.md)、[U7](096-u7.md) | — |
| UX19 | 添加卡片 | [UX19](070-ux19.md)、[U7](096-u7.md) | — |

### #12 A1–A12

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| A1 | 配置可恢复 | [P1](068-p1.md)、[P2](087-p2.md)、[J08](119-j08.md)、[J12](123-j12.md) | — |
| A2 | 单入口真实调用 | [UX13](045-ux13.md)、[P1](068-p1.md)、[P2](087-p2.md)、[J08](119-j08.md) | — |
| A3 | 名称和分页 | [P2](087-p2.md)、[J08](119-j08.md) | — |
| A4 | 原生结果与定义更新 | [P2](087-p2.md)、[J08](119-j08.md) | — |
| A5 | 资源/模板/提示 | [P3](094-p3.md)、[J08](119-j08.md) | — |
| A6 | 发现与调用授权一致 | [UX14](067-ux14.md)、[P3](094-p3.md)、[J08](119-j08.md) | 真实外部提供方未验证 |
| A7 | 认证不串用 | [P4](095-p4.md)、[J09](120-j09.md) | 真实外部 OAuth 提供方未验证 |
| A8 | 回收与故障隔离 | [P5](102-p5.md)、[J09](120-j09.md)、[J12](123-j12.md) | — |
| A9 | 主体与未知结果 | [UX13](045-ux13.md)、[P5](102-p5.md)、[J08](119-j08.md)、[J09](120-j09.md) | — |
| A10 | 实际接入 | [UX13](045-ux13.md)、[P6](107-p6.md)、[J08](119-j08.md)、[J10](121-j10.md)、[J16](127-j16.md) | 外部使用部分按用户决定延后；真实交互模型与异机 CI 按用户决定延后；真实模型实测按用户决定延后 |
| A11 | 页面与双端 | [J11](122-j11.md) | — |
| A12 | 协议范围 | [J12](123-j12.md) | — |

### #16 AU01–AU20

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| AU01 | 全来源目录 | [AW2](076-aw2.md)、[AW4](098-aw4.md)、[J03](114-j03.md)、[J04](115-j04.md) | — |
| AU02 | 列表与筛选 | [AW2](076-aw2.md)、[J11](122-j11.md)、[J14](125-j14.md) | — |
| AU03 | 详情与导航 | [AW2](076-aw2.md)、[AW5](078-aw5.md)、[J11](122-j11.md)、[J14](125-j14.md) | — |
| AU04 | 可用编辑布局 | [AW3](077-aw3.md)、[J11](122-j11.md)、[J14](125-j14.md) | — |
| AU05 | 草稿与并发 | [AW3](077-aw3.md)、[J03](114-j03.md)、[J11](122-j11.md)、[J14](125-j14.md) | — |
| AU06 | 排期类型 | [AW3](077-aw3.md)、[J06](117-j06.md) | — |
| AU07 | 时间与策略 | [AW3](077-aw3.md)、[J06](117-j06.md)、[J14](125-j14.md) | — |
| AU08 | 扫描完整设置 | [AW3](077-aw3.md)、[J14](125-j14.md) | — |
| AU09 | 执行目标 | [AW3](077-aw3.md)、[J14](125-j14.md) | — |
| AU10 | 模板 | [AW2](076-aw2.md)、[J04](115-j04.md) | — |
| AU11 | 预览无副作用 | [AW3](077-aw3.md)、[J14](125-j14.md) | — |
| AU12 | 立即运行与不确定确认 | [AW3](077-aw3.md)、[J05](116-j05.md)、[J14](125-j14.md) | — |
| AU13 | 真实状态 | [AW5](078-aw5.md)、[J05](116-j05.md)、[J14](125-j14.md) | — |
| AU14 | 运行历史 | [AW5](078-aw5.md)、[J05](116-j05.md)、[J14](125-j14.md) | — |
| AU15 | 停止与删除 | [AW4](098-aw4.md)、[AW6](104-aw6.md)、[J03](114-j03.md)、[J04](115-j04.md)、[J05](116-j05.md) | — |
| AU16 | 来源双向一致 | [AW4](098-aw4.md)、[AW6](104-aw6.md)、[J03](114-j03.md)、[J04](115-j04.md) | — |
| AU17 | 主体与执行归属 | [AW6](104-aw6.md)、[J03](114-j03.md)、[J12](123-j12.md) | — |
| AU18 | 成本与同步 | [AW5](078-aw5.md)、[AW6](104-aw6.md)、[J06](117-j06.md)、[J12](123-j12.md) | — |
| AU19 | 视觉与可达性 | [J11](122-j11.md)、[J14](125-j14.md) | — |
| AU20 | 迁移与交付 | [AW6](104-aw6.md)、[J12](123-j12.md)、[J13](124-j13.md) | — |

### #7 A01–A21

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| A01 | 主机搜索/快速连接、分组/标签、列表/网格、右键/多… | [S2](040-s2.md)、[H2.1](../../2026-11-19-issue-7-ssh-module/evidences/H2.1-host-directory.md)、[H2.2](../../2026-11-19-issue-7-ssh-module/evidences/H2.2-host-record.md)、[H2.3](../../2026-11-19-issue-7-ssh-module/evidences/H2.3-host-references.md)、[H2.4](../../2026-11-19-issue-7-ssh-module/evidences/H2.4-import-preview.md)、[H2.5](../../2026-11-19-issue-7-ssh-module/evidences/H2.5-key-library.md)、[H2.6](../../2026-11-19-issue-7-ssh-module/evidences/H2.6-draft-test.md) | 未验证：异机真实多跳主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent |
| A02 | 真实直连及至少三层跳板链均能完成终端、SFTP、监控… | [S2](040-s2.md)、[H3.1](../../2026-11-19-issue-7-ssh-module/evidences/H3.1-trust-and-prompts.md)、[H3.3](../../2026-11-19-issue-7-ssh-module/evidences/H3.3-route-attempt.md) | 未验证：异机真实多跳主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent |
| A03 | 路由页独立可用，完整路径、批量关联/启停、代理继承/… | [S2](040-s2.md)、[H3.2](../../2026-11-19-issue-7-ssh-module/evidences/H3.2-route-editor.md)、[H3.3](../../2026-11-19-issue-7-ssh-module/evidences/H3.3-route-attempt.md)、[H3.4](../../2026-11-19-issue-7-ssh-module/evidences/H3.4-config-sync.md)、[H3.5](../../2026-11-19-issue-7-ssh-module/evidences/H3.5-proxy-sharing.md) | 未验证：异机真实多跳主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent |
| A04 | 临时和固定工作区按原流程工作，六种预设+自定义分割、… | [S3](041-s3.md)、[H4.1](../../2026-11-19-issue-7-ssh-module/evidences/H4.1-workspace-template.md)、[H4.2](../../2026-11-19-issue-7-ssh-module/evidences/H4.2-workspace-launch.md)、[H4.3](../../2026-11-19-issue-7-ssh-module/evidences/H4.3-pane-layout.md) | 系统输入法引擎本身未验证 |
| A05 | 同一主机同时打开多个终端、文件视图、监控和转发，关闭… | [S3](041-s3.md)、[H12.1](../../2026-11-19-issue-7-ssh-module/evidences/H12.1-lifecycle-cutover.md)、[H2.3](../../2026-11-19-issue-7-ssh-module/evidences/H2.3-host-references.md)、[H4.2](../../2026-11-19-issue-7-ssh-module/evidences/H4.2-workspace-launch.md)、[H4.3](../../2026-11-19-issue-7-ssh-module/evidences/H4.3-pane-layout.md)、[H5.1](../../2026-11-19-issue-7-ssh-module/evidences/H5.1-shell-view.md)、[H8.2](../../2026-11-19-issue-7-ssh-module/evidences/H8.2-forward-runtime.md)、[H9.1](../../2026-11-19-issue-7-ssh-module/evidences/H9.1-session-monitor.md) | 系统输入法引擎本身未验证 |
| A06 | 真实全屏程序、中文 IME、resize、焦点、广播… | [S3](041-s3.md)、[H5.1](../../2026-11-19-issue-7-ssh-module/evidences/H5.1-shell-view.md)、[H5.2](../../2026-11-19-issue-7-ssh-module/evidences/H5.2-terminal-actions.md)、[H5.3](../../2026-11-19-issue-7-ssh-module/evidences/H5.3-terminal-history.md)、[H5.4](../../2026-11-19-issue-7-ssh-module/evidences/H5.4-local-shell.md) | 系统输入法引擎本身未验证 |
| A07 | 附属文件面板、独立新窗口/Tab 双栏均可用，独立窗… | [S4](042-s4.md)、[H6.1](../../2026-11-19-issue-7-ssh-module/evidences/H6.1-file-session.md)、[H6.2](../../2026-11-19-issue-7-ssh-module/evidences/H6.2-file-changes.md) | — |
| A08 | 递归上传下载/跨远端复制、暂停/续传/取消/重试、冲… | [S4](042-s4.md)、[H7.1](../../2026-11-19-issue-7-ssh-module/evidences/H7.1-transfer-queue.md)、[H7.2](../../2026-11-19-issue-7-ssh-module/evidences/H7.2-transfer-conflicts.md)、[H7.3](../../2026-11-19-issue-7-ssh-module/evidences/H7.3-archive-transfer.md) | — |
| A09 | 远端编辑保存冲突和权限保留有效；SCP 回退和文件 … | [S4](042-s4.md)、[H6.2](../../2026-11-19-issue-7-ssh-module/evidences/H6.2-file-changes.md)、[H6.3](../../2026-11-19-issue-7-ssh-module/evidences/H6.3-text-edit.md)、[H6.4](../../2026-11-19-issue-7-ssh-module/evidences/H6.4-directory-follow.md) | — |
| A10 | 四种转发实际转发流量；端口冲突、服务端拒绝、跳板断开… | [S5](090-s5.md)、[H8.1](../../2026-11-19-issue-7-ssh-module/evidences/H8.1-forward-config.md)、[H8.2](../../2026-11-19-issue-7-ssh-module/evidences/H8.2-forward-runtime.md) | — |
| A11 | 单终端监控和多主机仪表盘显示真实指标、历史、采样/暂… | [S5](090-s5.md)、[H9.1](../../2026-11-19-issue-7-ssh-module/evidences/H9.1-session-monitor.md)、[H9.2](../../2026-11-19-issue-7-ssh-module/evidences/H9.2-monitor-panels.md)、[H9.3](../../2026-11-19-issue-7-ssh-module/evidences/H9.3-server-tools.md) | — |
| A12 | 设置按通用/终端/连接/文件/MCP 分类，搜索/默… | [S6](099-s6.md)、[H10.1](../../2026-11-19-issue-7-ssh-module/evidences/H10.1-layout-terminal-settings.md)、[H10.2](../../2026-11-19-issue-7-ssh-module/evidences/H10.2-connection-file-settings.md)、[H10.3](../../2026-11-19-issue-7-ssh-module/evidences/H10.3-shared-tool-settings.md) | — |
| A13 | 只用已授权 MCP 完成列主机→连接→处理等待交互→… | [S6](099-s6.md)、[H11.2](../../2026-11-19-issue-7-ssh-module/evidences/H11.2-session-jobs.md)、[H11.3](../../2026-11-19-issue-7-ssh-module/evidences/H11.3-entry-parity.md) | — |
| A14 | 工作区/路由/转发/监控/设置等新增用户操作全部进入… | [S6](099-s6.md)、[H11.1](../../2026-11-19-issue-7-ssh-module/evidences/H11.1-resource-catalog.md) | — |
| A15 | SSH 设置与全局 MCP/CLI 页显示同一工具选… | [S6](099-s6.md)、[H10.3](../../2026-11-19-issue-7-ssh-module/evidences/H10.3-shared-tool-settings.md)、[H11.1](../../2026-11-19-issue-7-ssh-module/evidences/H11.1-resource-catalog.md)、[H11.3](../../2026-11-19-issue-7-ssh-module/evidences/H11.3-entry-parity.md) | — |
| A16 | 工具重试不重复连接/运行/监听/传输，终端控制权不冲… | [S6](099-s6.md)、[H11.2](../../2026-11-19-issue-7-ssh-module/evidences/H11.2-session-jobs.md)、[H11.3](../../2026-11-19-issue-7-ssh-module/evidences/H11.3-entry-parity.md) | — |
| A17 | 切 Vault、关闭会话、停用插件、原生组件退出/崩… | [H12.1](../../2026-11-19-issue-7-ssh-module/evidences/H12.1-lifecycle-cutover.md)、[H12.2](../../2026-11-19-issue-7-ssh-module/evidences/H12.2-platform-evidence.md) | — |
| A18 | 按项目支持平台验证原生组件启动/打包/路径；缺产物在… | [H1.2](../../2026-11-19-issue-7-ssh-module/evidences/H1.2-executor-boundary.md)、[H12.2](../../2026-11-19-issue-7-ssh-module/evidences/H12.2-platform-evidence.md) | — |
| A19 | 功能对照表、截图/操作记录、最小真实主机验证、来源台… | [H1.1](../../2026-11-19-issue-7-ssh-module/evidences/H1.1-upstream-map.md)、[H12.2](../../2026-11-19-issue-7-ssh-module/evidences/H12.2-platform-evidence.md) | — |
| A20 | 不留下只有菜单无执行器、只有开关无实际效果、UI 和… | [H1.1](../../2026-11-19-issue-7-ssh-module/evidences/H1.1-upstream-map.md)、[H1.2](../../2026-11-19-issue-7-ssh-module/evidences/H1.2-executor-boundary.md)、[H12.1](../../2026-11-19-issue-7-ssh-module/evidences/H12.1-lifecycle-cutover.md)、[H12.2](../../2026-11-19-issue-7-ssh-module/evidences/H12.2-platform-evidence.md) | — |
| A21 | Safe 未初始化/锁定/停用时，桌面与已授权 MC… | [S2](040-s2.md)、[H11.3](../../2026-11-19-issue-7-ssh-module/evidences/H11.3-entry-parity.md)、[H12.1](../../2026-11-19-issue-7-ssh-module/evidences/H12.1-lifecycle-cutover.md)、[H2.2](../../2026-11-19-issue-7-ssh-module/evidences/H2.2-host-record.md)、[H2.5](../../2026-11-19-issue-7-ssh-module/evidences/H2.5-key-library.md)、[H2.6](../../2026-11-19-issue-7-ssh-module/evidences/H2.6-draft-test.md)、[H3.1](../../2026-11-19-issue-7-ssh-module/evidences/H3.1-trust-and-prompts.md) | 未验证：异机真实多跳主机、Ed448/KRL（ssh2 不支持，界面提示）、PuTTYgen 外部样本、硬件 Agent |

### #17 AT-A01–AT-A20

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| AT-A01 | 同一 Task 正文/配置编辑、普通评论、显式派遣 | [TW0](023-tw0.md) | — |
| AT-A02 | 已受理Codex failed，分别提供/不提供结构… | [TW1](032-tw1.md)、[J15](126-j15.md) | — |
| AT-A03 | 外因interrupted、已证用户stop、com… | [TW1](032-tw1.md) | — |
| AT-A04 | 结果/终态已保存后丢 ACK、重启、旧 attemp… | [TW1](032-tw1.md) | — |
| AT-A05 | 只有 PTY/Core 写入、缺 provider … | [TW1](032-tw1.md) | — |
| AT-A06 | 不同 provider/平台/profile 的 t… | [TW2](033-tw2.md)、[J16](127-j16.md) | Claude/Pi 受控执行与真实线上模型未验证；真实模型实测按用户决定延后 |
| AT-A07 | 受控 Codex 真实模型修改授权工作区、运行命令、… | [TW2](033-tw2.md)、[P6](107-p6.md) | Claude/Pi 受控执行与真实线上模型未验证；真实交互模型与异机 CI 按用户决定延后 |
| AT-A08 | Desktop/CLI/MCP/外部actor回答，… | [TW3](034-tw3.md)、[TW4](066-tw4.md)、[J17](128-j17.md) | 真实 GitHub 与独立 Web 旅程未验证；真实 GitHub 回传按用户决定延后 |
| AT-A09 | 普通后续轮次、native回答、原进程丢失；确认原A… | [TW3](034-tw3.md)、[J18](129-j18.md) | — |
| AT-A10 | 同一GitHub事件重投、同ID不同指纹、同Issu… | [TW4](066-tw4.md) | 真实 GitHub 与独立 Web 旅程未验证 |
| AT-A11 | 外部事件经一次跟进、提问、答复再输出；迟到旧事件 | [TW4](066-tw4.md)、[TW5](086-tw5.md)、[J17](128-j17.md) | 真实 GitHub 与独立 Web 旅程未验证；真实 GitHub 回传与真实邮件发送未验证；真实 GitHub 回传按用户决定延后 |
| AT-A12 | Task结果重交；GitHub POST已提交/响应… | [TW5](086-tw5.md) | 真实 GitHub 回传与真实邮件发送未验证 |
| AT-A13 | Huhu 自己的 GitHub 输出成为新入站事件 | [TW5](086-tw5.md) | 真实 GitHub 回传与真实邮件发送未验证 |
| AT-A14 | Inbox capture 转 Task、任务等待和… | [TW8](093-tw8.md) | — |
| AT-A15 | 多轮摘要、关联产物、历史消失 | [TW6](046-tw6.md)、[J22](133-j22.md) | — |
| AT-A16 | 多规则同时运行、native 等待、未知运行、多个页… | [TW6](046-tw6.md) | — |
| AT-A17 | 正式常驻启停/状态；同Vault重复启动与CLI/桌… | [TW7](069-tw7.md) | — |
| AT-A18 | 无页面而 Engine 在线、Engine 离线再恢… | [TW7](069-tw7.md) | — |
| AT-A19 | Auto暂停/停用前分别已受理手动运行、已受理计划运… | [J21](132-j21.md) | — |
| AT-A20 | 同一候选 Desktop/Web/CLI/MCP，S… | [TW9](110-tw9.md)、[J21](132-j21.md) | — |

### #17 AT01–AT14

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| AT01 | 工作单、执行与投递各有身份 | [TW1](032-tw1.md)、[TW8](093-tw8.md)、[J15](126-j15.md) | — |
| AT02 | 原生终态必须完整、可重交、可解释 | [TW1](032-tw1.md)、[J15](126-j15.md) | — |
| AT03 | provider 能力按具体目标和环境表达 | [TW2](033-tw2.md)、[J16](127-j16.md) | Claude/Pi 受控执行与真实线上模型未验证；真实模型实测按用户决定延后 |
| AT04 | 真实工具执行沿用已有授权 | [TW2](033-tw2.md)、[P6](107-p6.md)、[J16](127-j16.md) | Claude/Pi 受控执行与真实线上模型未验证；真实交互模型与异机 CI 按用户决定延后；真实模型实测按用户决定延后 |
| AT05 | 评论、回答、补充和批准分别处理 | [TW3](034-tw3.md)、[J15](126-j15.md) | — |
| AT06 | 来源身份与事件受理 | [TW4](066-tw4.md)、[J17](128-j17.md) | 真实 GitHub 与独立 Web 旅程未验证；真实 GitHub 回传按用户决定延后 |
| AT07 | 一个可扩展、可执行的外部适配示例 | [TW4](066-tw4.md)、[TW5](086-tw5.md)、[J17](128-j17.md) | 真实 GitHub 与独立 Web 旅程未验证；真实 GitHub 回传与真实邮件发送未验证；真实 GitHub 回传按用户决定延后 |
| AT08 | Inbox 保留整理职责，待处理视图读取已有事实 | [TW8](093-tw8.md)、[J17](128-j17.md) | 真实 GitHub 回传按用户决定延后 |
| AT09 | 结果保存与外部发送分开 | [TW5](086-tw5.md)、[J17](128-j17.md) | 真实 GitHub 回传与真实邮件发送未验证；真实 GitHub 回传按用户决定延后 |
| AT10 | 跨轮次上下文与进度 | [TW6](046-tw6.md)、[J22](133-j22.md) | — |
| AT11 | 设备资源与单一执行所有者 | [TW6](046-tw6.md)、[J22](133-j22.md) | — |
| AT12 | 常驻复用同一 Engine | [TW7](069-tw7.md)、[J18](129-j18.md) | — |
| AT13 | 可见结果与可行动错误 | [TW8](093-tw8.md)、[J15](126-j15.md) | — |
| AT14 | CLI/MCP 与插件生命周期一致 | [TW9](110-tw9.md)、[TW8](093-tw8.md)、[J21](132-j21.md) | — |

### #11 验收 18 项

| 项 | 内容 | 报告 | 报告所列未运行/延后 |
|---|---|---|---|
| #11-01 | 在 Vault A 启用插件并创建两个账本，分别录入… | [L1](039-l1.md)、[L11](106-l11.md) | — |
| #11-02 | 同币种 A、B 账户各有 100 期初余额。A 收入… | [L2](065-l2.md)、[L5](084-l5.md)、[L11](106-l11.md) | — |
| #11-03 | 明细筛选覆盖所有页，列表、统计下钻和 CSV 的记录… | [L2](065-l2.md)、[L3](082-l3.md)、[L5](084-l5.md)、[L11](106-l11.md) | — |
| #11-04 | 导入支付宝、微信、京东及通用 CSV 的脱敏样本。验… | [L3](082-l3.md) | — |
| #11-05 | 去重预览可选保留行，冲突处理与附件迁移可见，过期预览… | [L4](083-l4.md)、[L11](106-l11.md) | — |
| #11-06 | 固定预算命中指定月份、分类、方向和币种，自由预算对同… | [L6](091-l6.md) | — |
| #11-07 | 贷款以零利率、月末起算等样本核对等额本息与等额本金的… | [L8](092-l8.md) | — |
| #11-08 | 含账户、流水、预算、贷款、映射及凭证的备份可恢复到测… | [L9](101-l9.md) | 外部凭证与 HomiBook 实机安装环境未验证 |
| #11-09 | 在账本关联一篇现有财务笔记，能从明细打开并从报表保存… | [L10](100-l10.md) | — |
| #11-10 | 通过实际桌面和浏览器入口完成记账、导入、查报表和凭证… | [L11](106-l11.md)、[J20](131-j20.md) | — |
| #11-11 | 新增账本能力在插件停用时仍有静态描述，激活后才可调用… | [L11](106-l11.md) | — |
| #11-12 | 导入、平账、补期或恢复到一半中断后，重启能得到完整前… | [L3](082-l3.md)、[L4](083-l4.md)、[L7](085-l7.md)、[L9](101-l9.md) | 外部凭证与 HomiBook 实机安装环境未验证 |
| #11-13 | CNY 0.10+0.20、超出安全整数的合法字符串… | [L0A](020-l0a.md)、[L2](065-l2.md) | — |
| #11-14 | 带/不带凭证的全Vault包与账本包各验证一次；未授… | [L9](101-l9.md) | 外部凭证与 HomiBook 实机安装环境未验证 |
| #11-15 | 删除已生成流水、修改未来周期规则、重启和恢复备份后，… | [L7](085-l7.md)、[L8](092-l8.md) | — |
| #11-16 | 每项复制或改写在来源台账记录上游完整URL、固定SH… | [L0A](020-l0a.md)、[L11](106-l11.md) | — |
| #11-17 | 对同一固定收支计划分别在账本页和 #16 中心改期/… | [L7](085-l7.md)、[AW4](098-aw4.md)、[J20](131-j20.md) | — |
| #11-18 | 同一候选版本的桌面、浏览器、普通 CLI 和 #14… | [L11](106-l11.md)、[J21](132-j21.md) | — |
