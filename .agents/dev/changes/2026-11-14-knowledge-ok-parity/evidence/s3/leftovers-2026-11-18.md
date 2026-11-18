# 审计遗留三项（2026-11-18）

## (1) 1 MiB 文档切到实时预览偶发 60 s 超时 —— 复现，未找到根因

- 复现条件：`tests/e2e/knowledge/editor-s3-large.spec.ts:21`（原用例）空载连续运行，**5/10 失败**（run 3/5/6/9/10）；最小诊断用例（`large-switch-diagnostic.spec.ts.txt`，去掉了“确认无 ProseMirror + 等 2 s + 读盘比对”几步）6 批共 40 次 **0 次失败**，但切换耗时极不稳定：多数 260–430 ms，另有 919 ms、2.6 s、3.5 s、3.9 s、4.8 s、5.2 s、6.8 s、14 s。
- 失败时已知：trace 时间线显示最后一个断言 `expect(.ProseMirror).toContainText("巨型改")` 自 4.7 s 起一直等到 60 s；之前的所有步骤（打开、源码里键入、点击“实时预览”）都正常完成；无 pageerror；失败时没有页面快照（应用已随超时关闭），所以不知道当时 `.ProseMirror` 是否存在 / 是否在 loading。
- 线索（未验证）：`RichMarkdownEditor` 的 `ensureRich().then(setRichReady)` 之后挂载 `TiptapEditor`；原用例比诊断用例多了“等 2 s 且比对磁盘”，说明与打开后后台活动（索引 / 保存回声）相关；耗时分布双峰（亚秒 vs 数秒）。
- 第二阶段（原用例 + 埋点 + CDP 暂停，`large-switch-orig-with-dumps.spec.ts.txt`）：**失败时主线程被占满**（`page.evaluate` 超过 8 s 不返回，持续 >100 s），不是挂载没发生。时间线：点击“实时预览”后 `ensureRich` 在 ~7 s 前正常结束（derive ≈1.6 s、installObservers ≈0.5 s、`setRichReady(true)` 已执行并渲染），随后 `TiptapEditor`（12790 个块）挂载 / 布局阶段不再返回；通过的运行里同一阶段在 2.5–3 s 内结束。因此“richReady 之后没有挂载”的猜测被推翻，`ensureRich` / 状态机没有问题。
- CDP `Debugger.pause` 在卡住的主线程上取到的栈顶（两次）：`CaretLabelLayerView` 的 ResizeObserver 回调（`caret-label-layer.ts`，`reconcile()` 对整个 `view.dom` 做 `querySelectorAll`）与 `frozen-table-headers` 的 rAF 回调。它们都是对 12790 个块的反复扫描 / 布局观察者，疑似 ResizeObserver ↔ 布局的反馈循环，但**栈只有一帧，不能证明是根因**。
- 试验：去掉 `caretLabelLayerPlugin`（远程协作光标标签，Huhu 无协作）后原用例 10 次 **仍失败 4 次**（run 1/2/5/7）——不是（唯一）根因，已撤销，未提交。
- 状态：**未解决**（3 轮用尽，按协调者要求停止）。下一步建议：用 Electron `--inspect` / Chrome Tracing 对失败运行做 CPU profile（`Profiler.start` 在点击前开启，卡住时 `Profiler.stop` 需要在页外线程；或 `--js-flags=--prof`），或在 `TiptapEditor` 创建前后用 `PerformanceObserver('longtask')` 取长任务归因（attribution）；同时排查 `frozen-table-headers` 的 ResizeObserver 与 `chunk-wrapper-decoration` 的 `data-ok-cv`（P-S3-06）属性同步是否互相触发。

## (2) 格式快捷键首次被忽略 —— 根因证实并修复（P-S3-08）

- 探针（`ok=false` 时）：PM state 选区折叠在 4，而 DOM 选区已是 3→0（Shift+Home 已扩展）——ProseMirror 尚未处理 `selectionchange`，快捷键作用在旧选区上，只产生存储标记。
- 修复：`keydown` 捕获阶段对 Ctrl/Meta 组合先 `domObserver.flush()`（P-S3-08）。修后探针 24 次按键 23 次生效。
- 剩余：1 次是 Shift+Home 自身没有扩展 DOM 选区（DOM 选区折叠），与快捷键无关，根因未定位；规则用例改为用 DOM Range 建立选区（不等 selectionchange）后一次按键，**“按两次”的宽容已去掉**，连续 10 次通过。

## (3) /api/pages、/api/audit 404 —— 修复（P-S3-07）

- 回归用例 `tests/e2e/knowledge/host-routes.spec.ts`：旧行为下失败（`[PageListContext] Failed to load pages: … 404`、`[audit] request failed 404`），修复后通过。
