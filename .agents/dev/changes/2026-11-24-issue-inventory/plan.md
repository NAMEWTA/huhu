# Huhu 七子项实施计划

当前状态（2026-11-27）：134 张批次票已实施；审计修复 F1–F3、受控 Task 精确 MCP 委派（W1-1）与覆盖补证 G1–G2 合入后，最终候选 `204deaea` 全量与打包验收通过（[RC](evidences/111-rc.md)）。[SIGN](evidences/134-sign.md) 签收 #7、#11、#12、#13、#14、#16、#17 与父单 #15；真实账号与外部服务按用户决定延后。SSH 原有 40 张领域票在原 Change 维护并已回写报告。

[行为契约](spec.md) · [当前代码对照](brief.md) · [SSH 原票与进度](../2026-11-19-issue-7-ssh-module/plan.md) · [父单的产物依赖](https://github.com/NAMEWTA/huhu/issues/15)

## 从哪里开始

Lead 先领 [G0](tasks/001-g0.md) 固定观察版本。最先会影响多个成员的是 [C12base](tasks/002-c12base.md) 的写入/主体样例与 [U0](tasks/016-u0.md) 的保存、浮层、终端现场调查。其余可从当前事实直接开始的票见下列前沿。多个独立项排队共享本机资源。

**当前无票内前置的切片**　[G0](tasks/001-g0.md)、[C12base](tasks/002-c12base.md)、[F05](tasks/003-f05.md)、[F08](tasks/004-f08.md)、[F09](tasks/005-f09.md)、[F10](tasks/006-f10.md)、[F27](tasks/007-f27.md)、[F13](tasks/008-f13.md)、[F14](tasks/009-f14.md)、[F20](tasks/010-f20.md)、[F21](tasks/011-f21.md)、[F24](tasks/012-f24.md)、[F25](tasks/013-f25.md)、[F26](tasks/014-f26.md)、[PlanAPI](tasks/015-planapi.md)、[U0](tasks/016-u0.md)、[HostUI](tasks/017-hostui.md)、[Endpoint](tasks/018-endpoint.md)、[P0](tasks/019-p0.md)、[L0a](tasks/020-l0a.md)、[L0b](tasks/021-l0b.md)、[AW0](tasks/022-aw0.md)、[TW0](tasks/023-tw0.md)、[S1](tasks/024-s1.md)。

票内“前置产物”列出贯通本票行为所需的直接输入。已定字段可用于算法、夹具、原型和数据适配；各方的真实 provider 就绪后再做相应联调。每票通过后回写同名报告，记录 SHA、平台、条件与结果。依赖表按真实可消费产物推进。最终可见页面的版本确认和真实环境条件见对应票，已完成的历史证据保留其平台与范围。

## 写入与验证安排

- Vault 写入/恢复由 #13 W1 集成。共享 contracts、Dispatcher 与事件由 #13 W2/Lead 集成。#14 U5 与 #13 共用一个 HTTP 集成人，之后 #12 在同一出口接聚合；Gateway 页面也由一人合入。Engine boot/main、依赖锁定与整合由 Lead 负责。
- #13 W5a 拥有计划存储、触发和迁移。#16 拥有 Automations 业务 UI，各来源的页面由对应领域负责人接入。#14 U1 拥有公共 UI；Notes 保存与批注的 editor host 和适配由 U2/W3 共同指定一人。受控 provider 与 Task 回执归 #17，域凭据、SSH 生命周期、账本期次分别保留原所有者。
- 同机最多 3 个 worktree、Lead 加最多 2 个 worker、1 项重验证，以当前根 AGENTS.md 为准。Lead 开工前核对 worktree、Herdr Core 与进程、系统和 cgroup 可用内存、磁盘及 inode。worker 每次仅跑一个定向单测，E2E、构建与完整验收由 Lead 串行执行。完成后复核本批 worker、worktree 与验证进程的回收。[项目规则](../../../../AGENTS.md) · [环境记录](../../context/environment.md) · [全 GPT 模型分工](../../context/team/huhu-development-gpt.md)
- 共享文件逐批合入同一候选；大范围接口切换同批更新所有消费方。每份报告标记实际覆盖和未运行项，最终套件在同一候选集中执行。若修复改变候选，重新判断哪些场景与制品需复验。实际进展记在各票及其同名报告。

## 票据与依赖 DAG

下表是有向无环图的邻接表。每行列出本票消耗的直接前置，票据序号固定以便引用。链接进入票内可查交付、验收与来源。领域内同步接线的独立准备工作见票中说明。

### #13 公共一致性与调度

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [C12base](tasks/002-c12base.md) | 约定写入回执、主体和提交边界 | 可开始 |
| [F05](tasks/003-f05.md) | 无损格式化 JSON | 可开始 |
| [F08](tasks/004-f08.md) | 转换笔记时保留正文 | 可开始 |
| [F09](tasks/005-f09.md) | 在目标 Space 内分页历史 | 可开始 |
| [F10](tasks/006-f10.md) | 在宽限内找到最近计划点 | 可开始 |
| [F27](tasks/007-f27.md) | 固定性能基准的正确性与对照 | 可开始 |
| [F13](tasks/008-f13.md) | 按收件人显示真实发送状态 | 可开始 |
| [F14](tasks/009-f14.md) | 退出时结算末次修订 | 可开始 |
| [F20](tasks/010-f20.md) | 跨块保留 UTF-8 码点 | 可开始 |
| [F21](tasks/011-f21.md) | 按当前搜索身份打开命中项 | 可开始 |
| [F24](tasks/012-f24.md) | 取得可归因的跨平台检查结果 | 可开始 |
| [F25](tasks/013-f25.md) | 跨平台匹配同一 Markdown 样例 | 可开始 |
| [F26](tasks/014-f26.md) | 用有效规则验证 lint 护栏 | 可开始 |
| [PlanAPI](tasks/015-planapi.md) | 确定计划与活动查询的最小字段 | 可开始 |
| [F01](tasks/025-f01.md) | 竞争写入按实际提交版本结算 | C12base |
| [F06](tasks/026-f06.md) | Web 离场时保全未保存编辑 | C12base |
| [F15](tasks/027-f15.md) | 提交前取消能力调用 | C12base |
| [F16](tasks/028-f16.md) | 校验公开能力的输出 | C12base |
| [F17](tasks/029-f17.md) | 修复日志尾部并保留下一回执 | C12base |
| [F18](tasks/030-f18.md) | 按当前主体限制事件可见性 | C12base |
| [F19](tasks/031-f19.md) | Engine 重启后重绑笔记会话 | C12base |
| [F12](tasks/035-f12.md) | 按需读取联系人页的邮件 | F27 |
| [F23](tasks/036-f23.md) | 按本次写入增量更新笔记索引 | F27, C12base |
| [F02](tasks/043-f02.md) | 恢复时核实步骤是否属于原操作 | F01 |
| [F03](tasks/044-f03.md) | 安全改名并保留冲突目标 | F01 |
| [F22](tasks/047-f22.md) | 将键盘焦点保留在模态层 | U1 |
| [F04](tasks/060-f04.md) | 原内容与回收元数据分别恢复 | F01, F02 |
| [F07](tasks/061-f07.md) | 按原捕获身份恢复转换 | F01, F02, F15 |
| [F29](tasks/062-f29.md) | 统一 Cron 和 FollowUps 的计划目录 | F01, F02, F15, F16, F17, PlanAPI |
| [F11](tasks/072-f11.md) | 按活动执行对账 | F27, F29 |
| [F28](tasks/073-f28.md) | 将任务提醒迁入同一计划 | F29 |
| [F31](tasks/074-f31.md) | 将 Agent 状态观察迁入计划 | F29 |
| [F32](tasks/075-f32.md) | 无页面时仍结算专注计时 | F29 |
| [MailPlan](tasks/079-mailplan.md) | 邮件账号的周期同步 | F29 |
| [GitPlan](tasks/080-gitplan.md) | Git 同步计划与待写修订 | F29, F14 |
| [SSHPlan](tasks/081-sshplan.md) | 已启动面板的 SSH 采样计划 | F29 |
| [F30](tasks/089-f30.md) | 汇合后台同步与采样计划 | MailPlan, GitPlan, SSHPlan |
| [W5d](tasks/097-w5d.md) | 清退已迁移的调度与通知路径 | F28, F29, F30, F31, F32, F14, F10 |
| [W7](tasks/103-w7.md) | 汇合一致性修复、迁移与性能基准 | W5d, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, F24, F25, F26, F27, F28, F29, F30, F31, F32 |

### #14 工作台与宿主

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [U0](tasks/016-u0.md) | 复核三处现场故障与各页体验依据 | 可开始 |
| [HostUI](tasks/017-hostui.md) | 约定浮层容器与日期字段的宿主语义 | 可开始 |
| [Endpoint](tasks/018-endpoint.md) | 约定端点发现、重启与冲突的语义 | 可开始 |
| [U1](tasks/037-u1.md) | 共用浮层、日期和表单宿主 | HostUI |
| [UX13](tasks/045-ux13.md) | HTTP MCP | F15, F16, F18, Endpoint |
| [UX01](tasks/048-ux01.md) | 编辑排版 | U1 |
| [UX04](tasks/049-ux04.md) | 日记月历 | U1 |
| [UX05](tasks/050-ux05.md) | 任务表单 | U1 |
| [UX07](tasks/051-ux07.md) | 邮件 | U1, F13 |
| [UX08](tasks/052-ux08.md) | 终端 | U0, F20, U1 |
| [UX09](tasks/053-ux09.md) | 会话导航 | F09, U1 |
| [UX10](tasks/054-ux10.md) | 启动器 | U1 |
| [UX12](tasks/055-ux12.md) | 公共控件 | U1 |
| [UX15](tasks/056-ux15.md) | 同步表单 | U1 |
| [UX16](tasks/057-ux16.md) | Safe 三栏 | U1 |
| [UX17](tasks/058-ux17.md) | 外观 | U1 |
| [UX18](tasks/059-ux18.md) | 看板编辑 | U1 |
| [UX02](tasks/063-ux02.md) | 保存 | U0, F01, F02, F06, F19, U1 |
| [UX03](tasks/064-ux03.md) | 单条批注 | U1, F01, F02 |
| [UX14](tasks/067-ux14.md) | 工具授权 | UX13 |
| [UX19](tasks/070-ux19.md) | 添加卡片 | UX18 |
| [UX06](tasks/071-ux06.md) | 快速捕获 | U0, U1, F07, F08 |
| [UX11](tasks/088-ux11.md) | 自动化表单与中心 | AW2, AW3 |
| [U7](tasks/096-u7.md) | 汇合工作台迁移与旧入口清单 | UX01, UX02, UX03, UX04, UX05, UX06, UX07, UX08, UX09, UX10, UX11, UX12, UX13, UX14, UX15, UX16, UX17, UX18, UX19 |

### #12 MCP 来源聚合

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [P0](tasks/019-p0.md) | 锁定复刻映射与共享合同 | 可开始 |
| [P1](tasks/068-p1.md) | 添加一个 stdio 来源并从 Huhu 调用一项外部工具 | P0, F01, F02, F15, F16, F18, UX13 |
| [P2](tasks/087-p2.md) | 多来源工具聚合、导入和即时撤权 | P1 |
| [P3](tasks/094-p3.md) | 同一连接访问资源、模板与提示 | P2 |
| [P4](tasks/095-p4.md) | 静态凭据与 OAuth 完整生命周期 | P2 |
| [P5](tasks/102-p5.md) | 连接恢复、停用回收与会话一致性 | P2, P4 |
| [P6](tasks/107-p6.md) | Agent CLI 与 CI 只配置一个 Huhu | P5, TW2, TW7 |
| [P7](tasks/109-p7.md) | 整合验证、文档与来源交付 | P3, P6 |

### #16 自动化中心

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [AW0](tasks/022-aw0.md) | 基线/复刻映射 | 可开始 |
| [AW1](tasks/038-aw1.md) | C9交互合同与原型 | PlanAPI, HostUI |
| [AW2](tasks/076-aw2.md) | 计划中心与模板 | AW1, F29, U1 |
| [AW3](tasks/077-aw3.md) | 完整编辑与目标 | AW1, F29, U1 |
| [AW5](tasks/078-aw5.md) | 运行与异常旅程 | AW1, F29, TW1, PlanAPI, TW3, TW5 |
| [AW4](tasks/098-aw4.md) | 来源页与共同管理 | AW2, AW3, F28, F30, F31, F32, L7, S5, UX05, UX18 |
| [AW6](tasks/104-aw6.md) | 公共接口和旧路径收敛 | AW2, AW3, AW5, AW4 |
| [AW7](tasks/108-aw7.md) | 真实集成与交付 | AW0, AW4, AW6, TW7 |

### #7 SSH 领域接续

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [S1](tasks/024-s1.md) | 锁定复刻基线 | 可开始 |
| [S2](tasks/040-s2.md) | 主机/路由/连接 | S1 |
| [S3](tasks/041-s3.md) | 工作区/终端 | S1 |
| [S4](tasks/042-s4.md) | 文件/传输 | S1 |
| [S5](tasks/090-s5.md) | 转发/监控 | S1, SSHPlan |
| [S6](tasks/099-s6.md) | 设置/公共能力 | S1, F18, UX13, S2, S3, S4, S5 |
| [S7](tasks/105-s7.md) | 对照验收和清理 | S2, S3, S4, S5, S6 |

### #11 账本

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [L0a](tasks/020-l0a.md) | 冻结账本领域、来源与金额样例 | 可开始 |
| [L0b](tasks/021-l0b.md) | 确认账本核心旅程原型 | 可开始 |
| [L1](tasks/039-l1.md) | 建账后能重开使用 | L0a |
| [L2](tasks/065-l2.md) | 账户与记账闭环 | L1, F01, F02 |
| [L3](tasks/082-l3.md) | 历史账单导入与导出 | L2 |
| [L4](tasks/083-l4.md) | 去重与平账 | L2 |
| [L5](tasks/084-l5.md) | 总览、日历与报表 | L2 |
| [L7](tasks/085-l7.md) | 固定收支生成 | L2, F29 |
| [L6](tasks/091-l6.md) | 预算管理 | L5 |
| [L8](tasks/092-l8.md) | 贷款逐期闭环 | L7 |
| [L10](tasks/100-l10.md) | 财务笔记与复盘 | L5, L6 |
| [L9](tasks/101-l9.md) | 账本包与HomiBook迁入 | L3, L4, L6, L8 |
| [L11](tasks/106-l11.md) | 统一入口与整合交付 | L3, L4, L5, L6, L7, L8, L9, L10, L0b |

### #17 Task 与 Agent

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [TW0](tasks/023-tw0.md) | 现状与复用 | 可开始 |
| [TW1](tasks/032-tw1.md) | 终态闭环 | C12base |
| [TW2](tasks/033-tw2.md) | 目标与真实执行 | C12base |
| [TW3](tasks/034-tw3.md) | 人机多轮 | C12base |
| [TW6](tasks/046-tw6.md) | 上下文与资源 | TW1, PlanAPI |
| [TW4](tasks/066-tw4.md) | 来源受理 | F01, F02, F15, TW3 |
| [TW7](tasks/069-tw7.md) | 同 Engine 常驻 | UX13 |
| [TW5](tasks/086-tw5.md) | 输出投递 | TW4, TW1 |
| [TW8](tasks/093-tw8.md) | 页面与公共入口 | TW1, TW3, TW5, TW7, AW5, UX05, AW1 |
| [TW9](tasks/110-tw9.md) | 整合与清理 | TW2, TW6, TW8, P6, TW0 |

### #15 批次整合与组合验收

| 票据 | 交付 | 直接前置 |
| --- | --- | --- |
| [G0](tasks/001-g0.md) | 固定批次基线与交接样例 | 可开始 |
| [RC](tasks/111-rc.md) | 固定七项整合候选与验收环境 | G0, W7, U7, P7, AW7, TW9, L11, S7 |
| [J01](tasks/112-j01.md) | 文件/编辑/恢复 | RC |
| [J02](tasks/113-j02.md) | 捕获到目标 | RC |
| [J03](tasks/114-j03.md) | 计划多入口 | RC |
| [J04](tasks/115-j04.md) | 所有来源与删除不复活 | RC |
| [J05](tasks/116-j05.md) | 竞争/未知/收尾 | RC |
| [J06](tasks/117-j06.md) | 无页面与多端 | RC |
| [J07](tasks/118-j07.md) | 真实 CLI 工作区 | RC |
| [J08](tasks/119-j08.md) | HTTP 与完整聚合 | RC |
| [J09](tasks/120-j09.md) | 认证/生命周期 | RC |
| [J10](tasks/121-j10.md) | 任务约束与外部使用 | RC |
| [J11](tasks/122-j11.md) | 整体工作台 | RC |
| [J12](tasks/123-j12.md) | 成本/持久归属/交付 | RC |
| [J13](tasks/124-j13.md) | 自动化完整旅程 | RC |
| [J14](tasks/125-j14.md) | 自动化复杂状态与交互 | RC |
| [J15](tasks/126-j15.md) | Task终态 | RC |
| [J16](tasks/127-j16.md) | 三类工具实测 | RC |
| [J17](tasks/128-j17.md) | 来源到交付 | RC |
| [J18](tasks/129-j18.md) | 常驻与恢复 | RC |
| [J19](tasks/130-j19.md) | SSH完整领域 | RC |
| [J20](tasks/131-j20.md) | 账本与计划 | RC |
| [J21](tasks/132-j21.md) | 领域/入口与迁移 | RC |
| [J22](tasks/133-j22.md) | 上下文与资源 | RC |
| [SIGN](tasks/134-sign.md) | 汇总逐项签收与剩余缺口 | J01, J02, J03, J04, J05, J06, J07, J08, J09, J10, J11, J12, J13, J14, J15, J16, J17, J18, J19, J20, J21, J22 |

## 从原单反查验收

| 原单 | 实施与子项验收 | 组合证据 |
| --- | --- | --- |
| #13 F01–F32、S01–S14 | F01–F32 对应同编号票，MailPlan/GitPlan/SSHPlan 对应来源迁移。[W7](tasks/103-w7.md) 汇总专项、结果和基准。 | [J01–J07](spec.md#组合验收)、J12–J15、J18、J22 |
| #14 UX01–UX19、图 01–26 | UX01–UX19 对应同编号票。[U0](tasks/016-u0.md) 承接三处现场和图号，[U7](tasks/096-u7.md) 核对迁移和实际界面。 | [J01–J03](spec.md#组合验收)、J06–J08、J11、J13 |
| #12 A1–A12 | P1/P2 承接 A1–A4，P3 承接 A4–A6，P4 承接秘密导入和 A7，P5 承接 A6/A8/A9，[P6](tasks/107-p6.md) 承接 A10，[P7](tasks/109-p7.md) 承接 A11/A12 与完整协议回归。 | [J08–J12](spec.md#组合验收)、J16、J21 |
| #16 AU01–AU20 | AW2/AW3 承接目录、编辑与预览，AW4 承接来源，AW5 承接运行和异常，AW6 承接公共入口及迁移，[AW7](tasks/108-aw7.md) 汇总视觉与双端结果。 | [J03–J06](spec.md#组合验收)、J11–J14、J22 |
| #7 A01–A21 | A01–A21 沿用 [SSH 原计划的规格覆盖表](../2026-11-19-issue-7-ssh-module/plan.md#从规格反查)。S1–S7 核对基线、实际差距和新增的跨项接线。 | [J19](tasks/130-j19.md)、[J21](tasks/132-j21.md) |
| #11 原 16 项及两条跨项要求 | L1/L2 建账记账，L3/L4 导入和平账，L5/L6 报表预算，L7/L8 固定收支和贷款，L9/L10 恢复复盘。[L11](tasks/106-l11.md) 汇总能力目录和消费者。 | [J20](tasks/131-j20.md)、[J21](tasks/132-j21.md) |
| #17 AT01–AT14、AT-A01–AT-A20 | TW1–TW3 终态/真实执行/答复，TW4/TW5 来源和投递，TW6/TW7 上下文/资源/常驻，TW8 公开入口，[TW9](tasks/110-tw9.md) 汇总清理和迁移。 | [J15–J18](spec.md#组合验收)、J21、J22 |

## 最终交付

七个成员把新增代码、消费者迁移、清理和可运行用例交给 RC。J01–J22 在共同制品上按真实入口联验，同一场景的证据在子单和父单共用。SIGN 复核每个成员完整原始清单、性能口径与平台缺口，届时再写整体验收报告。产品发版、部署、合并及 GitHub 关闭依据届时授权执行。
