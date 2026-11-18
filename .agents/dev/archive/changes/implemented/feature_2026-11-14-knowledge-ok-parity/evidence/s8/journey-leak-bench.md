# 用户完整路径 / F10 泄漏 / bench（2026-11-18，真实 Electron，xvfb，本机）

## journey（`tests/e2e/knowledge/journey.spec.ts`）
连续 11 步，每步断言磁盘或界面真实结果：全部真实文件可见（md/txt/json/pdf/html/目录）→ 隐藏目录（`.huhu/notes/hidden-paths.json` 含该目录，磁盘文件不动）→ `@` 引用被隐藏目录里的文件（磁盘落成 `[[资料/机密笔记.md]]`）→ `/` 插块 → 属性改 title（`zip: 007` 保留）→ 选区评论落 `Comments/` → 保存重开一致、打开—停留—离开的冷笔记字节与 mtime 都不变 → TXT/JSON 编辑（JSON 保存不格式化）→ PDF 2 页渲染 + 文本层 → HTML 沙箱 iframe（`sandbox="allow-scripts"`，脚本运行）→ 档案首页/类型/记录标签与档案侧栏、改字段落盘 → 切回文件树继续编辑落盘。
结果：连续 3 次运行 **3/3 通过**（各 17.0–17.2 s），无 pageerror。
**发现并修复的真实缺口**：笔记的文档编辑器（`NoteEditorSurface`）没有给 `RichMarkdownEditor` 传 `referenceSearch`，所以笔记里输入 `@` 没有任何候选（只有任务与档案的紧凑编辑器有）。已接入 `useReferenceIndex().search`（全 Vault 候选，含被隐藏的资源），journey 第 3 步即覆盖它。

## F10 泄漏（`tests/e2e/knowledge/leak.spec.ts`，200 轮：笔记编辑器 → PDF → HTML → TXT）
数据：`leak-f10-200.json`。方法：页面内埋点 + CDP（强制 GC 后 Performance.getMetrics；Runtime.queryObjects 数存活 Y.Doc）。

| 轮次 | Nodes | JS 监听器 | JS 堆 MB | iframe | Y.Doc 存活 | 活跃 interval | worker 创建/存活 | Object URL 创建/存活 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | 1309 | 614 | 27.7 | 0 | 1 | 1 | 20 / 0 | 0 / 0 |
| 100 | 1309 | 614 | 28.0 | 0 | 1 | 1 | 100 / 0 | 0 / 0 |
| 200 | 1309 | 614 | 28.2 | 0 | 1 | 1 | 200 / 0 | 0 / 0 |
| 关闭全部标签后 | 1222 | 563 | 27.5 | 0 | 1 | 1 | 200 / 0 | 0 / 0 |

结论：第 20 → 200 轮 Nodes、监听器**完全不变**，堆 +0.5 MB（噪声量级），PDF worker 每轮创建 1 个、每轮终止（存活 0），iframe 始终 0，没有 Object URL。pending `setTimeout` 稳定在 22。
**限制（如实）**：① “编辑器实例”只在采样瞬间（此时活动标签是 TXT）数到 `.ProseMirror`=0，没有单独统计 park 中的实例，间接证据是 Nodes / 监听器 / Y.Doc 存活数稳定；② Y.Doc 存活 1 是采样时的瞬时值，`editor-cache` 上限 10 的 park / evict 路径未在本用例里被压到上限（只有 1 篇 md）；③ observer 没有单独计数，以 JS 监听器数为代理；④ 只有 Linux / xvfb。

## bench（`pnpm bench`，一次，`bench.log`）
5000 篇笔记全量索引 1431 ms（目标 ≤ 15000 ms）；全文检索（随机词）均值 0.78 ms，p99 2.04 ms（640 样本）；重建索引（全量，已有索引）均值 1269 ms（3 样本）。注意：该基准只覆盖 vault 索引 / 检索，不含编辑器；编辑器性能（F09）见 S3 的 perf.spec 记录。

## 本分支门禁（我自己跑的，未经 audit）
`pnpm lint` exit 0；`pnpm typecheck` exit 0；`pnpm knip` exit 0；`pnpm build` exit 0。
