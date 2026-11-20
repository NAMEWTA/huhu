# task04 · 新建笔记后的空文件树与任务导航超时

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| pane_id / task / 执行结果 | `w4:pD` / `task04.md` / `done` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task04.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report04.md` |

## 结论与派工

| 现场 | 归因 | 实现建议 |
| --- | --- | --- |
| 全量第 3 项，树空、底栏 1、标签已打开 | **产品缺陷。** 文件树首次挂载时可以在目录路由注销与重注册之间取得合法的空清单，并持续显示空态。 | 在 `packages/editor/src/host/explorer.tsx:77` 恢复 `b12e156` 的两段 effect。文件路由只依赖 `deps`，隐藏操作和菜单钩子独立跟随回调。保留该文件其余改动。 |
| 压测 repeat25，找不到“新建任务” | **测试同步问题。** 文件树出现早于创建对话框关闭。此时测试可以完成对“任务”的 focus 调用，实际焦点仍在模态框内，Enter 再次送给文件名输入框，知识库保持激活。 | 在 `tests/e2e/a11y.spec.ts:75–82` 保留树断言，等 `new-note-dialog` 关闭及“键盘笔记”文档标签可见，再聚焦功能图标栏中的“任务”并按 Enter。随后断言 `tasks-module` 可见，再继续原流程。 |

**两种机制在 main `9f870c0` 和候选 `cf882bd` 均可按相同时序复现。** 因而均早于本次收尾。原始 trace 没有记录路由表、网络数据、控制台或键盘事件目标。下文用原 trace 确认症状与先后，另用真实 Electron 的受控时序及单项改动对照确认机制。历史失败那一次的内部调度无法逐帧还原，也没有数据推断本次收尾是否改变了触发概率。

## 原始证据

原始目录为 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int8`。已解包两份 `trace.zip`。两包均含 `test.trace`、测试源和 error-context 附件。

- 全量 `test-results-final/a11y-键盘：不碰鼠标新建笔记、新建任务并用空格勾选/`。提交 Enter 的 `gzgj@276` 成功，树行断言 `@277` 等了 5005 ms。快照同时显示已选“文件”、空树、“1 个文件”、打开的“键盘笔记”标签和“已保存”。因此用户可见状态确实矛盾。
- 压测 `a11y-out/a11y-键盘：不碰鼠标新建笔记、新建任务并用空格勾选-repeat25/`。树行断言 `exqr@45` 成功，`@46` 执行 focus，`@47` 是页面级 Enter，`@48` 查找“新建任务”耗时 30008 ms。该附件没有页面快照。全轮为 6 workers、30 次，共 29 通过、1 失败。

## 文件树的事件与列举

1. `plugins/notes/src/engine/index.ts:79–89` 完成创建后发布 `entity.changed`。在界面上，`NotesModule.tsx:115–120,391,606–611` 等待查询刷新并开标签，底部用 `notes.list` 的条目数。树头计数则来自 `ResourceTree.tsx:62–85,115` 的已列举目录。树通过事件递增 token，再由 `explorer.tsx:97–99` 广播刷新。
2. `OkExplorer` 要等异步语言目录就绪才挂载 `FileTree`。此前发布的刷新不会重播，树在挂载时会主动发起根目录请求。与此同时，`ResourceTree.tsx:91–98` 的 `writeHidden` 依赖整个查询结果对象，其变化也会改变 `onHide`。候选版把这个回调与文件路由放在同一个被动 effect 内。父组件重新渲染与子树首次就绪若在同次提交，旧路由先清理，子树发起列举，父组件随后才重注册。
3. `packages/editor/src/host/host-fetch.ts:11–15,35–51` 的兜底对 `GET /api/documents` 返回成功且 `documents: []`。这时 `routes/files.ts:138–149` 的真实 `deps.list` 和 `filesDeps.ts:79–85` 的 `vault.list/onListed` 都没有被调用。上游 `use-file-tree-listing.ts:225–261` 会接受空结果并结束加载。仅重注册不会补一次刷新，因此树头也保持为零。
4. 候选探针保留真实创建、事件、路由及查询，仅把树就绪和创建完成后的界面提交安排在同一批。渲染器时间 1619 ms 已发出刷新；2498 ms 注销文件路由，2499 ms 的根目录请求命中 baseline，2501 ms 重注册。5 秒后文件已落盘，仍是树 0、底栏 1、标签已打开。main 同样在 2701 / 2702 / 2705 ms 重现该顺序。临时副本仅拆分 effect 后，同一时序于 2062 ms 命中文件路由，2082 ms 的真实根目录结果包含 `键盘笔记.md`，原树断言通过。
5. G07 的 `b12e156` 引入过这一拆分，`94e79ea` 收窄懒加载范围时明确撤回。可用 `git show b12e156 -- packages/editor/src/host/explorer.tsx` 和 `git show 94e79ea -- packages/editor/src/host/explorer.tsx` 核对。main 的同一文件第 67–86 行已经合并注册路由与菜单。候选版 core 路由对 `showAll=true` 的透传不能覆盖文件路由未注册的窗口。

## 任务导航的焦点

`NotesModule.tsx:117–120,606–611` 在写操作和失效查询完成后才关闭对话框。树可通过独立的文件事件先绘制该行。`packages/ui/src/components/Dialog.tsx:25–39` 调用原生 `showModal()`，关闭时恢复焦点。侧栏“任务”依靠原生按钮激活进入模块（`packages/workbench/src/shell/AppShell.tsx:121–129`）。`plugins/tasks/src/ui/TasksModule.tsx:107–114` 在模块正常挂载时即渲染新建按钮。

探针只延迟创建完成后提交关闭操作 800 ms。候选中，面板外“任务”的 focus 调用返回，随后 1674 ms 的 Enter 仍落在“文件名”，此时模态框为 open。2368 ms 才提交关闭，最终活动模块为知识库，任务模块从未挂载。main 同样在 1448 ms 将第二次 Enter 送到“文件名”。保持延时，在测试中等待对话框退出及新标签可见后，候选于 2262 ms 聚焦“任务”、2271 ms 收到 Enter 和 click，2310 ms 成功聚焦“新建任务”。原测试在两个版本中相同。修复可保留完整键盘路径，无需增加等待秒数。

## 验证与产物

工作目录 `/home/wta/projects/huhu-wt-analysis` 已按任务切到 detached `cf882bd`，业务源码只读。临时探针、构建副本及逐事件日志位于 `/tmp/huhu-pD04-jXN8VA/`。候选取自 `huhu-wt-int`，main 取自 `huhu`，已核对两份 `out/build-info.json`。未使用基于 `9132640` 的 rc.4 构建作 main 对照。

| 零重试、串行运行 | 结果 | 日志（含起止 uptime 全文） | 起止一分钟负载 |
| --- | --- | --- | --- |
| 原候选，原始 `a11y.spec.ts:64`，1 worker | 1/1 通过，2.2 s | `stock.log` | 1.49 → 1.85 |
| 候选，树首次挂载与关闭同批 | 树断言失败，命中空清单 | `candidate-tree.log` | 1.38 → 1.35 |
| main，相同树时序 | 同症状，命中空清单 | `main-tree.log` | 2.14 → 2.53 |
| 候选副本，仅拆分路由 effect | 同时序树断言通过 | `split-tree.log` | 2.43 → 2.43 |
| 候选，延后关闭创建对话框 | Enter 落入输入框 | `candidate-task.log` | 1.81 → 2.14 |
| main，相同对话框时序 | Enter 落入输入框 | `main-task.log` | 2.53 → 2.52 |
| 候选，相同延时并等待创建完成 | 任务模块打开，新建按钮可聚焦 | `candidate-task-sync.log` | 2.52 → 2.52 |

原用例从集成工作树执行 `xvfb-run -a pnpm exec playwright test tests/e2e/a11y.spec.ts:64 --workers=1 --retries=0 --output=/tmp/huhu-pD04-jXN8VA/stock-out`。复查受控实验可在探针目录运行 `xvfb-run -a node probe.cjs candidate tree`，将参数分别换为 `main tree`、`split tree`、`candidate task`、`main task`、`candidate task-sync`。构建探针由 `prepare.py` 和 `split.py` 生成。受控实验覆盖到“新建任务”取得焦点为止，探针的 ASSERT、STATE 和逐事件记录用于判断结果。未运行全量 E2E 或全量单测。

## 接续

建议实现会话将树的同批挂载时序固化为回归用例，断言新笔记既在真实根目录列举中，也在树行中可见。测试同步改动沿原键盘用例验收到任务创建和状态更新。两项改动落地后，以单 worker、零重试复核原场景，再按 Lead 的负载窗口安排压力验证。

## Lead 验收


Lead（2026-11-19）：接受。树空清单为产品缺陷（main 同样存在，属 A01 文件树列举范围，修复）；任务导航为测试同步问题。派 pB task09 实现。
