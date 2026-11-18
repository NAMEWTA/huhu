# 审计遗留三项（2026-11-18）

## (1) 1 MiB 文档切到实时预览偶发 60 s 超时 —— 复现，未找到根因

- 复现条件：`tests/e2e/knowledge/editor-s3-large.spec.ts:21`（原用例）空载连续运行，**5/10 失败**（run 3/5/6/9/10）；最小诊断用例（`large-switch-diagnostic.spec.ts.txt`，去掉了“确认无 ProseMirror + 等 2 s + 读盘比对”几步）6 批共 40 次 **0 次失败**，但切换耗时极不稳定：多数 260–430 ms，另有 919 ms、2.6 s、3.5 s、3.9 s、4.8 s、5.2 s、6.8 s、14 s。
- 失败时已知：trace 时间线显示最后一个断言 `expect(.ProseMirror).toContainText("巨型改")` 自 4.7 s 起一直等到 60 s；之前的所有步骤（打开、源码里键入、点击“实时预览”）都正常完成；无 pageerror；失败时没有页面快照（应用已随超时关闭），所以不知道当时 `.ProseMirror` 是否存在 / 是否在 loading。
- 线索（未验证）：`RichMarkdownEditor` 的 `ensureRich().then(setRichReady)` 之后挂载 `TiptapEditor`；原用例比诊断用例多了“等 2 s 且比对磁盘”，说明与打开后后台活动（索引 / 保存回声）相关；耗时分布双峰（亚秒 vs 数秒）。
- 状态：**未解决**。下一步：在原用例里于第 4.7 s 之后每 5 s 转储 `.ProseMirror` 数 / `.ok-editor-loading` / 主线程长任务（PerformanceObserver longtask）。

## (2) 格式快捷键首次被忽略 —— 根因证实并修复（P-S3-08）

- 探针（`ok=false` 时）：PM state 选区折叠在 4，而 DOM 选区已是 3→0（Shift+Home 已扩展）——ProseMirror 尚未处理 `selectionchange`，快捷键作用在旧选区上，只产生存储标记。
- 修复：`keydown` 捕获阶段对 Ctrl/Meta 组合先 `domObserver.flush()`（P-S3-08）。修后探针 24 次按键 23 次生效。
- 剩余：1 次是 Shift+Home 自身没有扩展 DOM 选区（DOM 选区折叠），与快捷键无关，根因未定位；规则用例改为用 DOM Range 建立选区（不等 selectionchange）后一次按键，**“按两次”的宽容已去掉**，连续 10 次通过。

## (3) /api/pages、/api/audit 404 —— 修复（P-S3-07）

- 回归用例 `tests/e2e/knowledge/host-routes.spec.ts`：旧行为下失败（`[PageListContext] Failed to load pages: … 404`、`[audit] request failed 404`），修复后通过。
