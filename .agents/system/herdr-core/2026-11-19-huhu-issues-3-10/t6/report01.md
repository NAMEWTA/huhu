# 任务报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10
- terminal_address — t6
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/t6/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/t6/report01.md
- 执行结果 — done

## 结论

#4、#5 各交付一份可单独审阅的规格、设计与切片计划。Agent CLI 拥有终端、输入仲裁、执行凭据和待交回执；Tasks 拥有输入、轮次、请求与评论投递；Automations 拥有日程、发生及跟进记录。共享执行合同只在 #4 的 design.md 定义，#5 引用该合同。收到输入、接受轮次、业务结果、Tasks 持久接收、评论送达分别有可查询的事实和恢复办法。同 ID 换内容、取消迟到、未知运行以及 keep 后变为 shell 均有明确处置。

## 产物与改动

| Change | 规格 | 架构与待决项 | 切片与证据安排 |
| --- | --- | --- | --- |
| #4 Agent CLI | [工作区、终端与历史](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/spec.md) | [状态所有权与执行合同](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/design.md) | [W0–W8](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/plan.md) |
| #5 任务与自动化 | [派遣、答复和收取结果](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/spec.md) | [持久接受与恢复](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/design.md) | [T0–T7](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/plan.md) |

写入前两个 change 均只有 source.md。本 worker 新增上述六份 Markdown 和本报告。切片已在 plan.md 写明依赖、入口及验收，未另建 tasks 文件。当前分支 feature/issue-fix，HEAD 为 9f870c0fad0c1d0538b9783214d2f4a3a3278b10。本任务未提交、构建、部署、运行产品测试或写入 GitHub。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 派工与身份 | 开始时 report01.md 不存在。HC_TERMINAL_ID=t6，cwd 与 task 相符；hc server status 显示 wta、Core ID 346bd5608735e3fcb27f9d01f5c8008e、0.1.21。topic 记录 t6 接续 t2；manifest 为 t6 / task01.md / active。发布前复核身份和指针。 | [任务](task01.md)、[topic](../topic.md)、[manifest](../manifest.tsv) |
| 完整来源和基线 | #4 快照 725 行，#5 快照 661 行，均含完整正文、固定源码链接及“无评论”。读写前后 SHA-256 一致，分别为 4b7bb19eabb35c690e6046010ab2deebe3069e5523d1155a4b078c9f5bd063a8 与 ee4298f3076338612e2f866725c6b1c8d83462c89a56f5402c4c1c34dd6f4707。用 git diff --name-status 比对 Issue 的 9132640 与 HEAD，另查 #6/#9 的工具、宿主、秘密所有权。 | [#4 原始快照](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/source.md)、[#5 原始快照](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/source.md) |
| 核对当前实现 | 查到 AgentCliModule.launch→agent.sessions.launch→SessionsService→terminal.run、fillCells/固定 layout、hello/attach/WS→TerminalView、SpaceStore 和原生历史入口；查到 AutomationsService.activate/drive→processWorker/launchSupervised、TasksService.runs 的数量/TaskDetail 数组冲突、answerRun、completeTaskRun 和 claim/条件写恢复。针对同地址换进程、同时间多规则、回复双投及评论确认丢失分别写了判据。 | 两份 design.md 的现状首表、合同及故障窗口 |
| 复用与环境 | 按 Huhu 现有实现、缺失的 temp/sources、项目依赖、固定上游逐项核对。raw 源码可取 herdr-app/Core（Apache-2.0）、agent-autoloop（MIT），抽查函数和 schema。ORCA 固定提交的 GitHub API、源码及 LICENSE 返回 404，R-42 只证明旧基线的参考。Huhu 项目锁 Core 0.1.19；派工 Core 版本不作产品证据。 | 两份 design.md 的固定 SHA、文件、许可证和缺口；仓库 scripts/herdr.lock.json、docs/upstream/ledger.md、THIRD_PARTY_NOTICES.md |
| 共享前端 | 已执行 modern-web-guidance 的 search→retrieve，实际取回 tabs、css-layout、dialog、accessibility、forms、coordinate-global-events。已核 pnpm 锁与 Electron 44.9.1 对应 Chromium 152.0.7977.167；Web 按 Baseline Widely available，终端键盘有独立回退，规则时区不能从浏览设备的本地控件推定。未启动桌面或浏览器进行运行验收。 | 两份设计的平台依据与 Huhu 前端入口；[Electron 发布记录](https://releases.electronjs.org/release/v44.9.1) |
| 覆盖与指针 | 按原快照逐行提取复选框编号，展开两份计划的编号范围，集合差集双向为空。#4 共 51 项（8/8/13/8/8/6），#5 共 43 项（8/9/8/11/7）。六份产物的 22 个相对 Markdown 链接均存在，表格列数一致，文件以 UTF-8 读取，无冲突标记。已复核原型、运行证据与本次静态结论的界限。 | 两份 plan.md 末尾覆盖表，对照原来源 #4 §16、#5 §15 |
| 写入范围 | 核对两个目标目录均恰有 source/spec/design/plan 四个文件。git status 按范围检查 apps、packages、plugins、tests、scripts、vendor、docs 和根依赖文件均无改动。根 AGENTS.md 的已修改状态和其他 worker 各自目录在开始检查时已存在，未处理它们。 | 本报告产物表和两个快照的哈希 |

## 阻碍与接续

本轮文档交付无阻碍。下一阶段可独立推进 #4 的 Core/身份查证和 resolver 实机诊断，以及 #5 的 Tasks 持久接受、时间筛选和可重放投递。原型尚未制作或确认，UI 切片需按实际版本走查。ORCA 需取得固定版本的授权源码与测试闭包；Core 的父子生命周期、真实打包版协议、xterm 自动回复来源、各 provider 的身份/原生请求/结果回执、真实 GUI 环境仍待实测。

两个 Issue 的跨模块联调依赖 #4 的受控输入/回执合同与 #5 的 Tasks 持久消费，Web/MCP/CLI 权限衔接 #6，共用 SSH viewer 衔接 #7，模块秘密与同步/数据包衔接 #9。#4 的目标已关闭时如何呈现已启动终端、备份是否包含纯布局，#5 的规则编辑后启停、取消未发意图的范围和 DST 歧义输入方式，均为待选产品行为，选项与局部阻塞仅在各自设计中维护。本报告供外部 Lead 读取并验收。

## Lead 验收


- 通过。核对 #4、#5 共六份规划文档与本地链接。#4 的执行合同为共同入口，#5 的输入、日程与回执送达保持独立所有权。ORCA 固定来源缺口和后续运行证据已在文档中标出。
