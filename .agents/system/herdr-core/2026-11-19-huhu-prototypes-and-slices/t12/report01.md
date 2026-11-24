# t12 · #6 与 #7 切片规划报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- terminal_address — t12
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t12/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t12/report01.md
- 执行结果 — done
- 模型 — GPT-6.2-astra，xhigh；本机 wta Core，ID `346bd5608735e3fcb27f9d01f5c8008e`
- 工作树 — D:/Document/code/huhu，`feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`

## 结论

为 #6 写入 33 个任务，为 #7 写入 40 个任务。两个计划保留上级交付编号，索引指向唯一任务正文。每个切片有可观察结果、规格与代码入口、真实前置、范围、正常与失败判据、侧栏场景和待确认记录入口。[#6 计划](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/plan.md) · [#7 计划](../../../../dev/changes/2026-11-19-issue-7-ssh-module/plan.md)

## 产物与改动

| 范围 | 实际交付 |
| --- | --- |
| #6 统一工具与 Web 工作台 | [33 份任务](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/tasks)、[规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/spec.md)、[设计](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/design.md)及上述计划。覆盖目录与可用性、批量策略、四个外部入口、领域接入、桌面服务、可重复邀请、设备端文件与工作台。 |
| #7 SSH | [40 份任务](../../../../dev/changes/2026-11-19-issue-7-ssh-module/tasks)、[规格](../../../../dev/changes/2026-11-19-issue-7-ssh-module/spec.md)、[设计](../../../../dev/changes/2026-11-19-issue-7-ssh-module/design.md)及上述计划。覆盖 H1–H12 的主机/认证、工作区/Shell、文件/传输、路由、转发、监控、设置、公共对象与分发条件。本轮按离线夹具规划；生产协议、执行组件和平台证据属于后续交付。 |

#6 的干净安装策略明确为全部工具关闭。G6.3/G6.4 分开验收邀请的重用、重取与独立撤销。撤销立即断开从它进入的会话及流，其他邀请及入口继续可用；停服务或换 Vault 则结束该服务代次。#5 的队列决定在 G5b.2 消费，#10 的共享布局及保存／放弃／继续编辑归属在 G5c.4 交接。#7 采用新路由及 SSH 自有凭据，保留新格式正常备份恢复；第三方格式的主动导入单独验收。基线和来源按[批次清单](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/sources.md)核对。

## 验证

| 验收要求 | 实际检查与结果 | 证据或复查入口 |
| --- | --- | --- |
| 协作身份 | 读取 task、topic 与 manifest；环境 HC_TERMINAL_ID 为 t12，清单为 t12 / task01.md / active。hc server status 确认 wta 及其 ID，hc get t12 确认工作目录、模型与推理参数。 | [task](task01.md) · [topic](../topic.md) · [manifest](../manifest.tsv) |
| 规格覆盖、依赖 | 从原 Issue 反查：#6 全部 39 项 A–F 验收；#7 全部 21 项 A 验收及 H/W/F/R/P 的 44 项细目。逐文件比对 plan 索引、上级 ID 和直接依赖，#6 有 63 条组内依赖、#7 有 66 条；两图均可拓扑排序。 | 两份计划的“从规格反查”及每个任务的“前置产物”“验收”。 |
| 代码、链接、场景 | 用 Python 逐项解析任务、spec、design、plan 的仓内链接和 Markdown 章节；#6 共 540 处引用、#7 共 617 处。检查全部 73 个文件的正常/异常步骤、场景、确认入口，逐项匹配两份 prototype.js 中的侧栏名称。除 t13 尚在撰写的两个 prototype-review.md 目标外，其他路径及所引章节均存在。 | 例如 [G6.4 撤销判据](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/tasks/G6.4-revoke-invite.md) · [H6.1 文件会话归属](../../../../dev/changes/2026-11-19-issue-7-ssh-module/tasks/H6.1-file-session.md) |
| 新增撤销决定 | 以本机 Playwright/Edge 157.0.4341.60 从 file URL 进入 #6 原型。让 A、B 使用第一份邀请，C 使用第二份。撤销第一份后计数由 2→0，第二份仍为 1；分别回到 A、B 均显示已撤销，旧链接再次加入被拒。全程拦截外部请求，请求计数为 0。 | [#6 原型](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/prototype/index.html) 的 Web 服务、浏览器工作台。此为模拟交互观察，无实际 LAN 服务或浏览器认证测试。 |
| 上游与运行环境 | 核实 Huhu 当前提交、Motty main@2daa9db582e1、Viva main@a5da67aa6344。逐项检查本地代码或目录入口；Motty go.mod 的同级替换、SFTP 的 Viva/leaks 引用均存在。已用 file URL 打开 #7 原型入口并读取同批正在形成的场景导航；未在本任务中测 SSH、真实文件、网络、进程或安装包。 | [#7 当前来源与架构](../../../../dev/changes/2026-11-19-issue-7-ssh-module/design.md) |

## 阻碍与接续

本终端的规划交付已完成。产品仍有两个局部决定：Q6-3 是否增加按已保存主机缩小外部授权范围，Q7-1 如何处理被其他对象引用的主机删除。分别影响 G5c.1/H10.3 和 H2.3。用户尚未确认 HTML 版本，t13 负责发布原型指纹、走查与确认记录；本报告未代签。未修改来源快照、原型、公共配置或 Git 记录。

## Lead 验收

由外部 Lead 读取本报告，核对产物后追加。

- Lead 验收通过。核对 #6、#7 的任务和上游路径。Edge 复验了重复邀请、分组撤销及 SSH 纯模拟信任，目录记录包括 Viva。
