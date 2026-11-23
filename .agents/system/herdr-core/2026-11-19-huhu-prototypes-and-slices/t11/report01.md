# t11 · #3 桌面外壳与 #10 首页看板规划报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- terminal_address — t11
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t11/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t11/report01.md
- 执行结果 — done
- 执行模型 — GPT-6.2-astra，xhigh。由 `hc get t11` 的启动参数核对。
- 工作树 — `D:/Document/code/huhu`，`feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。

## 结论

两个 change 共交付 **54 个 Markdown 实施切片**。每项都有可见结果、对应规格编号、可读代码入口、所有权及前置产物、原型场景、待确认范围和正常／失败验收步骤。两个计划保留原交付编号，索引只维护路径、依赖和覆盖。三平台原生行为及真实存储留给实施时验证。

## 产物与改动

| Change | 本任务的产物 | 覆盖 |
| --- | --- | --- |
| #3 桌面外壳 | [计划索引](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/plan.md)、[17 个任务](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/tasks)、[规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/spec.md)、[设计](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/design.md) | S0～S4，TB-01～18。覆盖三平台装饰、启动/错误、统一工作台、主题与窄窗、菜单与焦点、文档落盘、重试与应用退出。 |
| #10 首页看板 | [计划索引](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/plan.md)、[37 个任务](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks)、[规格](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/spec.md)、[设计](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/design.md) | W01～W06，ACC-DASH-01～18。覆盖目录、独立实例、显隐与移除、插件缺失/故障、网格和键盘、事务草稿、并发冲突、只读、备份恢复、原首页业务能力和整合。 |

#10 的窄屏顺序和尺寸写回同一布局，被动缩窗不写盘。切模块或关窗遇到未保存改动，提供保存、放弃、继续编辑，保存失败留在原处。#3 由 Main 等待离场结果，再决定是否允许关窗。#10 的 ACC-DASH-12 按新格式备份、恢复与损坏保护验收，旧 hidden/order 迁移只保留在原 Issue 历史出处。验证使用临时测试 Vault。[窄屏编辑](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-05-narrow-layout.md) · [草稿离场](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md) · [应用退出](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md) · [新格式恢复](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W02-05-restore-board.md)

#5 的规则与已入队任务归对应任务组，#10 自动化卡仅读取摘要。#6 的默认工具关闭及撤销后断开该邀请所建会话，已在 #10 的外部联验处引用。版本依据为本地默认分支及批次清单。UI 使用 Huhu 自有品牌、主题、导航及文案。两个 HTML 原型与其评审记录由平行组交付，本任务只读取和复核。[批次决定](../topic.md) · [来源清单](../../../../dev/changes/2026-11-19-huhu-issues-3-10/sources.md)

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 派发身份 | `hc server status` 返回本机 wta、ID `346bd5608735e3fcb27f9d01f5c8008e`；本机 `HC_TERMINAL_ID=t11`，manifest 中同号任务为 active。 | [任务](task01.md) · [清单](../manifest.tsv) |
| 规划完整性 | 逐个从磁盘读取任务，核对文件在索引恰好出现一次、前置引用与索引一致、有向依赖无环，规格编号与索引一致。排除最终整合行后，两组仍各覆盖全部 18 项。检查 #3 的 251 处、#10 的 484 处相对链接，均能解析。所有 54 个任务引用的 HTML ID 均存在，两份确认记录可读。 | 两份 plan.md 的「切片与依赖」及其链接的任务正文 |
| 开发参考 | 已比对本地 HEAD、默认分支、上游源码及清单。OK main `b2af296a7304`、Homarr dev `b440fdd574c9`、RGL master `ec4ab79c9744`、GridStack master `a7f828af1c53`、dnd-kit main `ccaf3d583903`。 | 两份 design.md 的来源与适配章节、批次 sources.md |
| 原型版本 | 使用项目 `fingerprint.mjs --expect` 校验，两个六文件资源包均匹配。#3 为 `d220319a4d25e3cc0d4ddd17a013e354afc54d4c4118a787b1321ead6d73a02e`，#10 为 `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342`。确认记录均明示待用户确认。 | [#3 记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/prototype-review.md) · [#10 记录](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/prototype-review.md) |
| #3 场景指向 | t11 用 Playwright Core 与 Edge 157.0.4341.60 直接打开 file URL。在 1100×760 切到 macOS 模拟，未打开 Vault 时看见启动页和系统菜单，再切到主页面失败，看见「无法加载工作台」。该次页面脚本错误为零。 | [平台和场景选择](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/prototype/index.html#scene) |
| #10 宽窄共用布局 | 打开目录并搜索 SSH，得到对应的主机卡。390 像素视口页面滚动宽度也是 390。在窄窗将任务卡后移一位并调高到 4 格，保存后切至 1366×768，四个实例的顺序与规范格位一致。任务卡为第 4 列、第 3 行、3×4，之前的笔记卡位于它前方。 | [看板](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/prototype/index.html#board) |
| #10 带草稿离开 | 在已编辑卡的关闭提示中看到三个选项。选继续编辑保留草稿，注入写失败再选保存仍在编辑页且保留新标题，随后放弃并重开恢复先前已存板。另在切任务模块时选继续编辑，再选保存并离开，回到首页读到保存的标题。 | [离场任务](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md) · [故障演练](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/prototype/index.html#save-fault) |

## 阻碍与接续

规划交付无阻碍。两版 HTML 仍待用户确认。待定产品项为 #3 的 Linux 支持组合及最小窗搜索入口、#10 的默认首屏卡片集合。网格 PoC、三平台安装包、真实 Host、Engine 及磁盘的产品验收留给对应切片。本次运行的是浏览器模拟，未运行产品构建或安装测试。

### Modern Web Guidance

我检索并读取了 `size-aware-styling`、`dialog` 和 `accessibility`，用于核对卡片按容器调整、弹层焦点和键盘路径的验收条件。本次交付为 Markdown 规划。

## Lead 验收

由外部 Lead 核验后追加。

- Lead 验收通过。核对 #3、#10 的切片索引、原型锚点和用户决定。已把看板联验引用与桌面退出事务的实施前置分开。
