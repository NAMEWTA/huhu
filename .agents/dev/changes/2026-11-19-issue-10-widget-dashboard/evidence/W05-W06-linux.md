# W05–W06 Linux 实施证据

基准为 `fc044713`，确认原型为 `6da1b2ec`。在 t30 开始实施，恢复后的 Herdr Core 地址为 t3r。测试使用新建的临时 Vault。

## 实现

- 四张业务卡沿用 SSH、Git 与 Automations 的可信 Widget 注册方式。任务和收件箱使用各自业务列表，最近笔记复用已有 `home.notes.recent`，Agent CLI 只提供真实模块入口。WorkBench 根据插件运行状态和当前连接发现的能力决定是否挂载。
- 任务卡独立应用保存的筛选，查看态切换只影响当前实例。用任务模块的日历分类和时区口径计算今日，完成请求携带 `expectedVersion`。冲突会重读，写权限缺失或 Vault 只读时禁用完成操作。
- 最近笔记打开前读取所选文件，失败时在该卡显示可重试反馈。收件箱只查询待处理项，详情按本 Engine 的一次性选择请求定位，已有缓存时仍优先使用明确选择。
- 首页使用一张看板。今日安排在任务卡内切换，活动卡内按来源筛选。原有专注暂停和看板离场处理沿用现有入口。
- D-37 中由首页持有任务、最近笔记、捕获和 Agent 卡体的决定由本候选替代。概览聚合和系统卡仍由工作台提供。本次未引入新的上游源码或依赖。

## 合同与装配

| 原 v1 类型 | 当前类型 |
| --- | --- |
| `widget:kernel:tasks` | `widget:tasks:tasks` |
| `widget:kernel:notes` | `widget:notes:recent` |
| `widget:kernel:inbox` | `widget:inbox:inbox` |
| `widget:kernel:agent` | `widget:agent-cli:entry` |

`packages/contracts/src/home.ts` 在 v1 读回、更新和恢复时统一类型，保留实例 ID、筛选、标题、显隐和几何。读取与恢复预览保留文件原字节，正常提交写入新类型。W02-04/05 的备份与恢复格式保持 v1。

`apps/engine/src/boot.ts` 只补四个定义 import 和注册清单接线。`plugins/tasks/package.json` 增加独立定义导出，避免桌面打包将任务共享入口的 Workbench 资源转出为运行时依赖。首次桌面启动验证曾复现该导入错误，独立入口修复后应用可启动。

## 本候选验证

- `pnpm exec vitest run apps/engine/test/dashboard-recovery.test.ts` 通过，1 个文件，6 项。新增用例检查四种旧类型的真实 Engine 备份、恢复预览和提交，预览原件保持字节相同。日志为 `/tmp/huhu-t30.oogOam/vitest-single-resumed.log`。
- `git diff --check` 通过。

## 未运行的验证

恢复后的验收记录为上述单个 Vitest 文件。生成报告时，shell 展开误触发构建和类型检查，已中止命令，输出未用作验收。下列项目由 Lead 对最终候选串行执行。

- 构建、打包、安装版冒烟、全仓 typecheck、lint、format:check、Knip、视觉比对，以及按批次安排的全量测试。
- 以下 E2E 需在最终候选执行。恢复前的中间快照日志可用于排障。关窗保存用例末轮发生 60 秒测试与 worker 清理超时，打包在依赖收集后中断。这些结果未计入候选验收。

| 文件 | 用例 |
| --- | --- |
| `tests/e2e/workflows/acceptance.spec.ts` | W05-W06 旧看板任务卡保留独立筛选、时区与布局，冲突后重读任务 |
| 同上 | W05-W06 最近笔记定位文件，失效与撤权在单卡内恢复 |
| 同上 | W05-W06 待处理捕获可定位，插件重新启用后恢复旧实例 |
| 同上 | W05-W06 Agent 入口随插件启停，最近活动在看板内筛选 |
| 同上 | ACC-WB-05 首页“我的任务”勾选：待推进任务数减少，任务进入已完成 |
| 同上 | 首页看板用例组，包括概览读取失败重试、宽窄窗、恢复布局、保存冲突与可信卡片目录 |
| 同上 | 专注计时：运行中关闭应用，退出前暂停并保存剩余时间 |
| `tests/e2e/knowledge/session-flush.spec.ts` | W05-W06 关闭时保存看板草稿，结算笔记并暂停专注 |
| 同上 | W05-W06 关闭时放弃看板草稿，结算笔记并暂停专注 |
| `tests/e2e/workflows/web-share.spec.ts` | Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开 |
| `tests/e2e/shell.spec.ts` | 首页与健康中心：卡片反映真实数据；坏文件出现在健康检查里 |
| 同上 | 首页：专注计时到点（ACC-WB-06）、习惯勾选持久化、自定义隐藏卡片；停用任务插件后任务卡片隐藏 |

关闭回归分别调用 `BrowserWindow.close()` 和退出菜单所用的 `app.quit()`。用例核对继续编辑、保存失败、保存或放弃布局、持久化笔记及专注暂停。权限用例通过隔离的请求响应模拟能力撤销和目标文件失效。

### Modern Web Guidance

- **`accessibility`**：我把导航和写操作放在原生按钮上，让任务与捕获的正文可选择，拖动选字时无需触发操作。依据是 “Prefer HTML elements and attributes to ARIA”。
- **`html`**：我用原生按钮承载打开笔记和重试等应用操作。依据是 “use `<button>` for triggered actions”。Electron 44.9.1 捆绑 Chromium 152.0.7977.167，共享代码沿用原生 HTML 和项目现有的日期工具。
