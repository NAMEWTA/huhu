# t13d · 画板快照生命周期独立审查

Lead `t3p`，执行者 `t13d`，任务 `task01.md`，状态 `done`。基线为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。审查对象是 `agent-linux` 工作树的两个实现文件与两个 DOM 测试文件，Git blob 分别为 `df745c8f`、`7d82af4a`、`6e1a03ca`、`49a81520`。对照 [任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13d/task01.md)、[前轮审查](t12q-report01.md) 与 [返工报告](t12z-report01.md)。

## 规格发现

**P2 · Activity 隐藏 TipTap 编辑器会提前撤销快照，显示后继续使用原 URL。** 触发条件是 Activity 内的 TipTap 节点视图已绘制内联画板、灯箱关闭，随后隐藏编辑器并保持到 MutationObserver 回调执行。React 隐藏 Activity 时调用类组件的 `componentWillUnmount`，`ActivityEditorContent` 把 `view.dom` 移入一个未接到文档的临时容器。同时，编辑器的 layout cleanup 从文档移除 portal 容器。NodeView 的 DOM 与状态仍由编辑器保存。快照池读到移除的图片或断开的 owner，在文档中找不到该 URL 的图片后调用 `revokeObjectURL`。Activity 恢复时，`reattach` 把原 DOM 接回。画板的文件、场景和颜色模式若都未变，导出 effect 直接返回，保存的快照仍指向已撤销的 URL。此时 URL 已失效，可用恢复后新建图片的解码结果检查。现有快照 Activity 用例把 `ExcalidrawEmbed` 直接放在 Activity 下，未经过 TipTap 的 detach/reattach。Huhu 工作台常规模块隐藏使用 CSS，笔记标签切换渲染按路径设 key 的当前文档。此发现限定于 Activity 包裹编辑器的路径。
[编辑器断开与重接](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.tsx#L42) · [编辑器 portal 清理](../../packages/editor/src/vendor/open-knowledge/app/src/editor/TiptapEditor.tsx#L618) · [回收判定](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L18) · [快照复用](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.tsx#L164) · [TipTap Activity 夹具](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx#L66) · [画板 Activity 用例](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.dom.test.tsx#L226) · [工作台模块隐藏](../../packages/workbench/src/shell/AppShell.tsx#L323) · [笔记文档挂载](../../plugins/notes/src/ui/NotesModule.tsx#L606)

其余指定路径未发现具体缺陷。真正关闭连在文档中的画板会回收最后一个消费者使用的 URL。同一轮 DOM 移动后，池会检查图片的最终位置。内联图与灯箱共用 URL 时，最终离场或换源才触发回收。`unreachable` 和 `empty` 会清除快照状态，原字节恢复后可以沿用场景重新导出。第 31 幅画板导出的 URL 在图片提交前由已连接的 owner 保留。颜色模式或可读文本变化会重新运行导出 effect，已取消的导出在创建 URL 前退出，忙碌期间的新请求由 trailing export 接续。
[快照池](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L8) · [状态恢复](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.tsx#L105) · [导出取消](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.tsx#L178) · [延迟导出用例](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.dom.test.tsx#L316)

## 项目规范与验证证据

Lead 在独审期间单独提交 HTML 四个文件（`f0fb1810`），快照差异相同。新增 B01 E2E 通过“知识库 → 首页 → 知识库”验证原 URL 保留，走的是工作台 CSS 隐藏路径。它还断言清空后原 URL 失效、恢复相同字节后新 URL 可以解码、关闭笔记后新 URL 失效。Lead 报告该用例的类型检查和 lint 已通过，尚待在新构建上运行。
[B01 E2E](../../tests/e2e/knowledge/local-reference-blocks.spec.ts#L93) · [工作台 CSS 隐藏](../../packages/workbench/src/shell/AppShell.tsx#L323)

本轮范围内未发现独立的项目规范违反。以上发现来自静态代码追踪。Lead `t13c` 的日志记录组件 DOM 用例 28 项、池 DOM 用例 7 项，合计 35 项通过。此次审查只读取代码、用例及既有证据，未运行测试、构建或 Electron 验收。新 Electron 构建的实际解码与生命周期验收仍待完成。
[DOM 运行日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/snapshot-lifecycle-check.log#L74)
