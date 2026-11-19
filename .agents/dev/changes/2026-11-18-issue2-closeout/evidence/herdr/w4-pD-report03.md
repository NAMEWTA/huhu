# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pD
- task：task03.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task03.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report03.md
- 执行结果：done

## 结论

**确认一项 main 已有的产品竞态。** 编辑器刚获得焦点时，ProseMirror 安排一个 20 ms 回调。如果浏览器已选中文字，而 ProseMirror 尚未收到这次 `selectionchange`，回调会把模型里的旧光标写回 DOM。稍后收到事件时，DOM 和观察器缓存都已折叠，气泡自然没有可展示的选区。快速原生键盘输入在 main 复现 11/64 次（17.2%），在候选复现 6/64 次（9.4%）。17 次都记录到了同一回调前后的选区反转。对这一机制和它早于候选存在的判断，确定程度高。两版的频次差异不足以断言候选改变了发生概率。

**鼠标和键盘都可以触发。** 候选的另一轮交错试验中，快速聚焦并用键盘扩选有 6/24 次丢失气泡。快速鼠标拖选有 1/24 次整个选区丢失，另有 1 次拖满四字后被回写为三字，气泡仍可见。只在该回调中先同步合法的编辑区选区后，键盘和鼠标各 24/24 次完整显示。输入由 X11 XTest 注入，经 Xvfb、Electron 和 Chromium 的原生输入路径处理。没有操作物理键鼠，不能外推日常用户的发生率。

**历史三次失败的归因仍是推断。** 脚注和块类型用例都曾读到正确的 DOM 选区，随后才超时，符合本次录到的回写顺序。H03 只记录按键和超时，归因把握更低。本次有负载的原用例复跑没有重现历史失败。判断该机制早于候选的直接依据，是在同一夹具、同一输入路径上对 main 的复现。

## 产物与改动

唯一交付物为本报告。工作目录 `/home/wta/projects/huhu-wt-analysis`，detached HEAD `9b143a4ce9af5d6d9dfec6bb131b4adbcc10855f`。基线为 `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。候选按要求重新 checkout、frozen install 与 build。对照使用已核验 out/build-info.json 的 main 构建。探针和修复对照仅作用于本工作区的临时测试及其独立 renderer 进程，未修改业务源码或提交代码。临时测试已删除，四个负载进程已回收，工作区干净。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 原始三例的失败位置 | Lead 全量运行中，脚注、块类型分别停在第 465、564 行。两例在紧邻的上一步已读到完整原生选区。H03 停在第 167 行，其前一步仅发送 Shift+Home。历史 trace 记录了测试调用，没有当时的 PM 模型、菜单内部状态或回写栈。 | `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int4/e2e-full.log:355–430`，pA/report07、pC/report05 |
| 同机压力复跑 | Linux x86_64，8 个可用 CPU，Electron 44.9.1。4 个持续运行的 `yes >/dev/null` 进程施压，候选与 main 分四批交错，各批 5 次，1 worker、零重试。8 批起跑时 1 分钟负载为 4.63–23.33，期间另有专门探针和其他工作区负载。详见下表。 | `candidate-{1,2,3,4}.log`、`main-{1,2,3,4}.log` |
| 同一小文档、同一输入序列 | 两版各 20 次 Playwright Home→Shift+End、20 次 X11 键盘（键事件间隔 40 ms）、20 次 X11 分步鼠标拖选、20 次聚焦后用 DOM Range 选中正文。两版每种方法均 20/20 同时满足 DOM、PM 选中完整四字、气泡已挂载且可见。 | `probe-main.jsonl`、`probe-candidate.jsonl` |
| 自然时序下复现 | 每版在同一编辑器上逐次清除选区并失焦。用 X11 点击重新聚焦，在释放鼠标后的 0–28 ms 内发送 Home、Shift+End。每个间隔重复 8 次。仅记录真实 20 ms 定时器进出状态，保留其调度与正文。main 11/64、候选 6/64 丢失选区。 | `timing-{main,candidate}.jsonl`，`mode=natural` |
| 判红与修复实验 | 固定同一关键顺序，每版均为原逻辑 8/8 回滚，先同步 8/8 完整显示。另把气泡可见性写成真正的 Playwright 断言，候选原逻辑 3/3 红在菜单不存在，先同步 3/3 绿。 | `timing-{main,candidate}.jsonl`，`redgreen.log`、`redgreen-result/` |
| 普通时钟下的修复对照 | 候选用同一个编辑器交错原逻辑和先同步两组，每组 24 次快速按键及 24 次快速拖选。每次只改变 20 ms 回调对尚未同步选区的处理，保留原始计时。快速按键、拖选完整成功率分别由 18/24、22/24 提升至 24/24、24/24。 | `paired.jsonl`，各条含 before/after 及终态 |

### 原始用例的分母

| 版本及用例 | 全用例失败 / 总次数 | 气泡失败 / 到达气泡的次数 |
| --- | ---: | ---: |
| 候选 · 脚注 | 0/20（0%） | 0/20 |
| 候选 · 块类型 | 0/20（0%） | 0/20 |
| 候选 · H03 简体中文粗体 | 0/20（0%） | 0/20 |
| main · S3 菜单 | 8/20（40%） | 0/19 |

main 的 8 次失败均为磁盘文件内容断言：第 48 行有 1 次在到达气泡之前失败，第 59 行有 7 次在气泡已显示且 DOM 加粗之后失败。

两版都使用新启动的 Electron 及临时 Vault。候选命令为 `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts:453 tests/e2e/knowledge/editor-parity-closeout.spec.ts:551 tests/e2e/knowledge/i18n-zh-hans.spec.ts:127 --repeat-each=5 --workers=1 --retries=0`，运行四批，输出分别隔离。main 缺少上述两个测试文件，使用该提交的 `editor-s3-menus.spec.ts`，复制到本工作区仅将 launch helper 指向 main 应用，保留 S3 原有步骤及断言。上表的气泡失败率只统计到达气泡步骤的尝试。相同操作的跨版本比较采用另列的四字夹具。

补充候选冷启动取证另跑三例各 10 次，只增加记录选区、定时器与菜单挂载的探针。30 次中 26 次整例通过，1 次 H03 在正文出现前（第 142 行）失败，其余 3 次已通过气泡操作后触及 60 秒整例时限。到达气泡的 29 次均成功显示。29 份落盘事件记录中，28 份记录了目标文本的非空 selectionUpdate、DOM 与 PM 一致、气泡挂载，1 份属于未到达的 H03。另一次块类型用例未写出事件记录，Playwright trace 显示已通过菜单并选择二级标题。落盘的 37 对定时器前后记录均未改变 DOM 选文。此轮与压力基准分开统计。见 `cold.log`、`cold.jsonl` 和 `cold-results/`。

### 一次候选失败的事件顺序

`timing-candidate.jsonl` 的第 12 次快速键盘尝试，以编辑器取得焦点为 0。键盘发给 X11，未重排定时器。

| 相对焦点时间 | 实际事件 | DOM / PM |
| ---: | --- | --- |
| 57.9 ms | Shift+End 的 End 键释放 | DOM 已选中“需要注释”，PM 仍为 [14,14] |
| 65.8 ms | 20 ms 聚焦回调实际开始 | DOM 仍为四字，PM 仍折叠，观察器快照与 DOM 不同 |
| 66.4 ms | 同一个回调返回 | DOM 变为空，PM 仍为 [14,14]，观察器快照已相同 |
| 66.6 ms | 浏览器送达 selectionchange | 两侧均为空，随后未产生非空 selectionUpdate |

最终编辑器仍有焦点，气泡 plugin view 已注册，`getShouldShow() === false`，元素未接入 DOM。main 的对应样本为第 7 次，回调在聚焦后 45.2–45.6 ms 将 DOM 四字改为空，随后才送达事件。鼠标样本见 `paired.jsonl` 的 `i=13, input=fastdrag, mode=natural`，mouseup 时四字完整，聚焦后 111.0–111.4 ms 被同一回调清空。

### 源码与归因

- `prosemirror-view@1.41.8/src/input.ts:781–792` 在新 focus 后排入回调，发现缓存与 DOM 不同就执行 `selectionToDOM(view)`。`src/selection.ts:87,100` 将 PM anchor/head 写入浏览器并更新缓存。`src/domobserver.ts:132–145,174–182` 的后续处理依赖快照差异。观察到的事件顺序能解释为什么等待 5–10 秒也不能恢复。
- 三个原用例均靠键盘默认行为建立选区。脚注和块类型是点击正文后 Home、Shift+End，H03 是收起详情及树菜单后点击编辑器、Ctrl/Meta+End、Shift+Home。前两例的 DOM 文本轮询只能证明读数当时正确。单独的 Range 和鼠标路径已在上表验证，原三例未调用 DOM Range 建立选区。
- `packages/editor/src/vendor/open-knowledge/app/src/editor/TiptapEditor.tsx:1267` 在富文本且面板可见时挂载气泡。`bubble-menu/BubbleMenuBar.tsx:101–107` 向 Tiptap 传入自定义 shouldShow 和 250 ms 延迟。`bubble-menu/bubble-menu-state.ts:16–29` 排除拖放、查找、代码块、普通文本的空选区及空白选文，另有图片和文件节点分支。该谓词覆盖 Tiptap 的默认谓词。失败时焦点仍在编辑器，PM 空选区已足以拒绝显示。Tiptap `bubble-menu-plugin.ts:470–499,524–555` 对有效变更去抖后才挂载。Floating UI 随后定位或隐藏已挂载的元素，本次失效发生在挂载前。
- B06 的 `0f69158` 在 `packages/editor/src/rich/RichMarkdownEditor.tsx:298–305` 对 keydown / beforeinput 捕获阶段已变化的 DOM 快照执行 flush。旧 P-S3-08 只在 Ctrl/Meta 快捷键前同步。两者都早于当次键盘默认扩选，覆盖不了扩选后的焦点定时器窗口。main 已复现，B06 不是本机制的引入点。`extensions/chunk-wrapper-decoration.ts:22,48–49` 要求至少 300 个顶层块才启用 content-visibility。四字夹具中 `data-ok-cv` 全程未启用，原三例也都是短文档。

### 最小修复与稳定回归

**建议在 ProseMirror 聚焦回调处修复产品。** 保留既有视图存活、焦点及快照检查。当浏览器选区的起点和终点都在当前可编辑视图内、非组合输入且浏览器已有非折叠选区时，先让 `view.domObserver.flush()` 接收原生选区，再重新检查是否仍需执行原来的回写。已折叠光标保留原有焦点恢复逻辑。实验通过 renderer 运行时的定点包裹验证该次序。正式实施可使用项目可重放的依赖补丁，并复核失焦、组合输入及浏览器复位光标的路径。无需改变气泡延迟或在每键增加事件监听。

可复查的红绿用例分三步：

1. 用三个短段落，令模型选区折叠并使编辑器失焦。只暂存下一次 PM focus 注册的 20 ms 回调，保留其原函数。用真实点击取得焦点，再发送 Home、Shift+End。
2. 在 document 的 selectionchange 捕获阶段、PM 读取它之前放行原函数。先断言 DOM 选中四字、PM 仍折叠、焦点在编辑器且缓存与 DOM 不同。任一前提不成立时，该轮不能证明此竞态。
3. 断言 `bubble-menu-bar` 和 `footnote-bubble-button` 均可见，并核对 DOM 与 PM 最终都包含完整四字。原版三次均通过前提、失败于第一个可见性断言，调整回调后三次均通过。报告中的 8 次时序对照与这 3 次带断言的回归分开统计。

已运行的回归在准备夹具和放行回调后使用以下断言。`trace` 为上表同一探针的记录，`own` 表示编辑器持有焦点，`cached` 表示观察器快照与 DOM 一致。

```ts
await para.click()
await page.keyboard.press('Home')
await page.keyboard.press('Shift+End')
await expect.poll(() => page.evaluate(() => window.trace.some(e =>
  e.what === 'timer-before' && e.dom === '需要注释' &&
  !e.pm && e.own && !e.cached
))).toBe(true)
await expect(page.getByTestId('bubble-menu-bar')).toBeVisible({ timeout: 1800 })
await expect(page.getByTestId('footnote-bubble-button')).toBeVisible()
expect(await page.evaluate(() => [window.st().dom, window.st().pm]))
  .toEqual(['需要注释', '需要注释'])
```

可在原三例中增加 PM 选区的诊断断言，让下一次失败指出选区还是菜单丢失。强设 PM 选区、延长超时或重试会掩盖已经通过原生输入复现的产品问题。

## 阻碍与接续

诊断完成，产品修复待实施。没有物理设备实测，也没有对历史三个失败进程事后补采 renderer 状态的途径。本机原始数据和测试日志位于 `/tmp/huhu-pd03.6ljBo0`，核心计数与事件顺序已列在本报告内。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。按 B06 判为产品缺陷（虽然 main 上早已存在），转 w4:pF/task01 实施。
