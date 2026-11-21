# task05 · Home 后段首光标被 ProseMirror 写回段尾

**结论：产品缺陷，main `9f870c0` 已有。** 点击“转换目标”使光标停在段尾，Home 成功移动到段首。此时 DOM 和 PM 模型都是折叠选区，但指向不同位置。若聚焦后 20 ms 的回调先于 DOM 观察器同步执行，就把模型里的段尾写回 DOM。接下来的 Shift+End 从段尾选到段尾，结果持续为空。此过程中编辑器一直有焦点。建议由维护 ProseMirror 补丁的实现会话处理，保留原 E2E 对选区的断言。

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| pane / task / 结果 | `w4:pD` / `task05.md` / `done` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task05.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report05.md` |

## 失败现场与插桩

Lead 的 `int10/e2e-full.log:370–389` 记录全量 #46 在第 592 行收到空串。归档 `test-results-final/` 在本次检查时只剩 `.last-run.json`。两份压测 trace 仍可解包：`bt-huhu-wt-int-5184/*/trace.zip` 与 `bt-huhu-wt-perf-2036/*/trace.zip` 的 `test.trace` 均依次记录了目标段落点击、`toBeFocused` 通过、Home、Shift+End。原始动作日志没有逐事件的 DOM/PM 端点，不能直接恢复每次历史失败的内部调度。原始材料根为 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/`。

按任务在分析工作树检出 `3dbd420` 并完成 `pnpm build`。探针使用真实 Electron、原三段 Markdown、原树入口、点击与键盘事件。对受控试验，仅把原 20 ms 回调暂存，等 Home 的原生默认动作生效且 PM 仍持有段尾光标时执行原回调。探针没有设置 DOM 选区或派发 PM 事务来制造失败。日志记录焦点、鼠标、keydown/keyup、selectionchange、DOM 文本节点及偏移、PM anchor/head、观察器快照是否匹配、`selectionToDOM` 调用栈，以及文档加载、桥结算和外部文本替换。

**候选版同一次失败的时间线**（渲染器 `performance.now()`，毫秒；PM 位置 21 和 25 分别对应“转换目标”的段首和段尾）。原始数据见 `c-home.json`。

| 时间 | 事件 | 实际状态 |
| ---: | --- | --- |
| 2482.5 → 2501.5 | hydrate → synced | 以富文本模式装载完成。 |
| 2673.8 → 2689.4 | 目标段落 pointerdown；聚焦并登记 20 ms 回调；selectionchange | DOM 落在偏移 4，PM 随后到 25。 |
| 2703.3 → 2707.0 | Home keydown → keyup | DOM 从 4 移至 0，PM 仍为 25。 |
| 2707.1 → 2707.7 | 原聚焦回调进入 → 返回 | 编辑器始终聚焦，缓存不匹配。2707.4 的调用栈指向聚焦回调的 `selectionToDOM(view)`。DOM 从 0 回到 4，PM 为 25。 |
| 2710.7 → 2715.5 | Shift 已按下，End keydown、keyup，随后 selectionchange | DOM 两端均在偏移 4，PM 为 25→25，下一次 selectionchange 读到的仍是段尾。 |
| 7594.1 | 轮询结束 | 文档内仍聚焦，DOM 为空串，PM 仍折叠。 |

本次 hydrate 在首次点击前约 172 ms 已同步。点击后、Home 前记录到的桥事务回调均为 `hadWork=false`。从 Home 到错误回写期间没有富文本推导、待结算内容写入、`replaceRawBody` 或编辑器失焦。相关入口是 `packages/editor/src/host/hocuspocus-provider.ts:82,101` 和 `packages/editor/src/rich/RichMarkdownEditor.tsx:248,268`。在这个小文档样本中可沿调用栈把致因定位到 PM 聚焦回调。

## 版本对照及修复验证

| 构建与时序 | 回调前 → 回调后 | 结果与证据 |
| --- | --- | --- |
| `3dbd420`，原 20 ms 调度，首开、原点击与焦点断言 | 回调在 Home 前结束 | DOM 与 PM 随后选中四字，气泡出现。`n1.json` |
| `3dbd420`，在 Home 后放行 | DOM 0 → 4，PM 25 → 25 | 5 秒后空串。`c-home.json` |
| `e85d281`，相同时序 | DOM 0 → 4，PM 25 → 25 | 复现空串，回调进入时键码 36、来源 key。`p-home.json` |
| main `9f870c0`，相同时序 | DOM 0 → 4，PM 25 → 25 | 复现空串，main 当时使用未修补的 1.41.8。`m-home.json` |
| `3dbd420` 临时副本，增加折叠光标保护，相同时序 | DOM 保持 0，PM 25 → 21 | Shift+End 后 DOM 为 0→4，PM 达到 21→25。气泡九项菜单、转二级标题、磁盘 Markdown 及关闭重开后的二级标题全部通过。`g-home.json`、`g-home.log` |

原候选未经插桩的原始用例单 worker、零重试 **1/1 通过**（5.7 s，见 `stock.log`）。保留原 20 ms 调度的插桩对照中，同一文档重复原点击/聚焦流程 36 次、直接点击末字右缘 20 次、在 Home 的事件处理中增加 30 ms 渲染线程工作 8 次，均选中了四字。后两组使用真实鼠标和按键，组内改变点击到 Home 的间隔。这些是交互次数，各组共用一个 Electron 进程。见 `n-sample.json`、`n-pointer.json`、`n-busy.json`。本轮与历史同症状的失败来自受控回调时序；尚无历史失败现场的内部端点记录。

`77d5add` 已覆盖**扩选后**模型尚未读取 DOM 范围的竞态。本例发生在**扩选前**：Home 移动后有意折叠的光标进不了 `!selectionCollapsed(sel)` 分支，再落入底部无条件按缓存差异回写的分支。见 `patches/prosemirror-view@1.41.8.patch:85–96`（原包 `src/input.ts:781–804`）。`e85d281` 与 `3dbd420` 已有该补丁，main 也能以自己的旧回调重现。F09 的 Placeholder 优化没有引入本机制。当前材料不能估计各版本的自然触发率差异。

## 派工建议

1. 在 `patches/prosemirror-view@1.41.8.patch` 同步更新源码与 ESM/CJS。对仍存活、仍聚焦、可编辑且未组合输入的视图，若本次聚焦后有原生键盘导航、折叠端点位于编辑器内并已移动，先让观察器读取这个光标，避免旧 PM 状态覆盖用户的导航。临时对照用 PM 已有的 `lastSelectionOrigin === "key"`、`lastSelectionTime >= lastFocus` 及端点变化判定，调用 `domObserver.flush()` 后返回。它验证了修复方向，正式实现还应分清本次聚焦后的导航与先前输入，保留无导航时的光标恢复。随补丁更新 pnpm 指纹及现有 R-53 台账。
2. 在 `tests/e2e/knowledge/editor-selection-focus.spec.ts` 复用现有“暂存真实聚焦回调”的方法，加入“段尾点击 → Home 到段首、PM 尚在段尾 → 放行回调 → Shift+End”。断言回调前后 DOM 的折叠偏移、PM 最终范围及气泡可见；保留旧有键盘扩选和拖选用例。补验普通重新聚焦的光标恢复、输入法组合及停用/销毁视图分支。最后以 `editor-parity-closeout.spec.ts:580` 零重试走完整转换、保存和重开。

## 产物与复查

业务源码只读；观测代码与修复对照仅在 `/tmp/huhu-pD05-dwJMot/` 的构建副本内。该目录含 `build.log`、`prepare.py`、`probe.cjs`、`precheck.py`、`run-when-free.sh` 和上列 JSON/日志。两份历史对照从已构建的 perf 与 main 工作树读取，并核对 `out/build-info.json`。每次启动前检查无其他活动 Electron/Playwright，日志记录起止 uptime；等候其他会话的记录在 `availability.log`。

可在探针目录执行 `bash run-when-free.sh 'candidate home check-c' 'prior home check-p' 'main home check-m' 'guard home check-g'`，分别产生新的日志和事件文件。前三项预期打印 `ASSERT` 并留下失败时间线，最后一项预期打印 `H2 SAVED AND REOPENED`。本次交付为定因和临时对照，业务补丁与集成门禁由实现会话接续。

## Lead 验收


Lead（2026-11-20）：接受。产品缺陷（main 既有，B06 范围），派 w4:pH task02 修 prosemirror-view 补丁并补回归。
