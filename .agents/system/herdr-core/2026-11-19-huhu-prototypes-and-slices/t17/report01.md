# t17 · #8 Mail 与 #9 Safe 实施切片报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- Core — 本机 wta，346bd5608735e3fcb27f9d01f5c8008e，外部 Lead 主动收取
- terminal_address — t17
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t17/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t17/report01.md
- 模型 — GPT-6.2-astra，xhigh（已核对 hc get t17 启动参数）
- 工作目录与版本 — D:/Document/code/huhu，feature/issue-fix，9f870c0fad0c1d0538b9783214d2f4a3a3278b10
- 执行结果 — done

## 结论与产物

本轮新增 58 份可单独接手的 Markdown 任务，更新两个 change 各自的 spec.md、design.md、plan.md，共 64 份规划文件。任务保留原交付编号，并列出具体代码入口、前置产物、可观察行为、正常与故障验收、原型场景及待确认范围。

| 范围 | 交付与覆盖 | 产物 |
| --- | --- | --- |
| #8 Mail | 33 份，覆盖 S0 至 S9 及 M-01 至 M-08。拆开预设/收件/账号维护、草稿/附件/投递/对账、联系人/搜索/阅读/标读/回复/转发、Gmail/Outlook、同步、通知、备份/恢复、设置/AI 和工具接入。S6b 交付 Huhu 新格式邮件子集恢复，原 one-mail 旧格式迁入仅在历史来源保留。 | [计划及覆盖表](../../../../dev/changes/2026-11-19-issue-8-mail-module/plan.md) · [任务目录](../../../../dev/changes/2026-11-19-issue-8-mail-module/tasks/) · [规格](../../../../dev/changes/2026-11-19-issue-8-mail-module/spec.md) · [设计](../../../../dev/changes/2026-11-19-issue-8-mail-module/design.md) |
| #9 Safe | 25 份，覆盖 P0 至 P10 与 A01–D05。个人条目、多账号、标签、锁定、改密、保存、显隐和复制分开验收。SSH/Git/Agent CLI/Automations/Mail 各有认证责任。P9 采用清洁安装，P8 保留新格式备份、恢复与 Git 验证。 | [计划及覆盖表](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/plan.md) · [任务目录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks) · [规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/spec.md) · [设计](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/design.md) |

## 已执行验证

| 验收要求 | 实际检查及结果 | 证据位置或复核方法 |
| --- | --- | --- |
| 身份与写入边界 | 读取 task、topic 与 manifest；环境 HC_TERMINAL_ID=t17，Core 启动参数、工作目录及清单当前指针相符。报告仅发布到同号路径。 | [任务](task01.md) · [主题](../topic.md) · [清单](../manifest.tsv) |
| 开发基线 | 读取本机 Huhu 和上游源码，对四个参考项目比较 git rev-parse HEAD 与 git ls-remote --symref origin HEAD；one-mail main d1be24d5bb83、Motty main 2daa9db582e1、ORCA main 8bc232f5ed8b、herdr-core master c7517808d64f 与批次记录一致。 | [批次源码清单](../../../../dev/changes/2026-11-19-huhu-issues-3-10/sources.md)；两个 design 的复用和调用链章节 |
| 编号、索引、规格覆盖 | 从磁盘逐份解析 64 份规划，33 + 25 份任务名称和 H1 对齐，每项均在计划的索引及规格覆盖表中。核对任务内规格、设计、源码、具体原型区域、确认记录及两条以上可判定的验收。 | 两份 plan 的“规格覆盖”，各自 tasks 目录。 |
| 本地链接与依赖 | 已解析 885 个已存在的本地链接及 180 个显式锚点，待发布的确认记录目标 2 个。58 个任务、93 条显式任务链接构成无环依赖图。再将阶段区间与整合验收展开复查，58 个节点、177 条边仍无环。 | 从两份 plan 的“切片索引与依赖”到任务“前置产物”；Python pathlib 解析相对路径，graphlib.TopologicalSorter 对依赖及整合区间排序。 |
| 场景定位与实现环境 | 对照两份 index.html 的真实静态区域 ID 和故障选择，以及模拟脚本的工作台、设置、读写流程。每份任务含 HTML 区域、需走查的状态和确认记录指针。规划指明 Electron 44.9.1、宿主接口和 Web Baseline 条件；检索并读取 forms、validate-input-after-interaction、sanitize-untrusted-html、security 指南。 | [Mail 入口](../../../../dev/changes/2026-11-19-issue-8-mail-module/prototype/index.html) · [Safe 入口](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/prototype/index.html)。原型与浏览器运行证据归 t14。 |
| 数据边界 | 反查活动 spec、design、plan、tasks，旧格式仅作为历史差异或拒绝输入；#9 无旧库盘点、转存或清理任务。新格式分别有数据包范围、校验、重授权及失败保全。全部规划验证使用合成标记或隔离测试资料。 | #8 S6a.1、S6a.2、S6b.1；#9 P8.1–P8.3、P9.1。两份 source.md 原文保留。 |

## 待决与接续

- 两份 prototype-review.md 均仍由 t14 编写。本轮没有用户确认的 HTML 版本。Lead 合并检查时以 t14 的实际版本指纹、浏览器走查和待确认范围为准。原型素材、确认记录与实现测试均不计入本 worker 的产物。
- #8 设计保留两个局部选择，分别是是否追加 Graph 专属授权，以及 Huhu 新格式子集遇同地址账号时如何提交。默认 Outlook IMAP 和无冲突的新格式恢复可以按各自切片推进。
- #9 本机保护后端、真实打包 Core 的恢复环境、三平台行为仍需后续实测；Safe 清洁安装和个人库实现可独立推进。真实邮箱、SSH、Git 认证、浏览器能力及跨设备运行均属后续实现验证，本轮未调用这些业务服务、读取真实 Vault 或投递邮件。
- 此次仅发布本地规划。未开子代理、提交或推送代码。工作树中的全局及其他工作组改动不计入本报告。

## Lead 验收

由外部 Lead 追加。

- Lead 验收通过。核对 #8、#9 的切片索引、最新引用、新格式备份和无旧库兼容决定。
