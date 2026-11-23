# t13j · TipTap 画板快照红灯准备

Lead `t3p`，worker `t13j`，任务 `task01.md`，工作树 `agent-linux`，基线 `f0fb1810`。回归已写好，等待 Lead 运行红灯。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13j/task01.md) · [独审记录](t13d-report01.md)

## 回归用例

用例 `keeps a board snapshot while its editor is parked and revokes it on close` 复用现有 `Host` 的 TipTap React NodeView、`EditorContent`、React portal 与 `Activity`。TipTap 实例由 Activity 外的宿主持有，隐藏触发 `EditorContent` 的真实停放。节点视图挂载真实 `ExcalidrawEmbed` 和快照池，板面字节由本地引用的公开 provider 入口提供，Excalidraw 场景恢复和 SVG 导出沿用轻量替身，Object URL API 记录撤销调用。[用例](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx#L155)

首次隐藏先让 MutationObserver 消化 DOM 变更，再检查编辑器未销毁、URL 未撤销。恢复后验证图片沿用原 URL，再次隐藏并卸载宿主，等待实际的 TipTap `destroy` 及 URL 恰好撤销一次。当前实现预计在首次隐藏的 `expect(revokeObjectURL).not.toHaveBeenCalledWith(url)` 处失败，并显示 `blob:editor-snapshot-1` 已被撤销。[断言](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx#L192)

在 `agent-linux` 根目录运行单个用例。

```sh
pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx -t 'keeps a board snapshot'
```

## 静态修复建议

以 `ActivityEditorContent` 当前绑定的 ProseMirror `view.dom` 为停放所有权边界，复用其停放、重接、换绑和 TipTap `destroy` 生命周期。快照池在判断撤销时，把停放树里仍引用该 URL 的内联图片计入消费者，并在停放时保留等待第一次 DOM 提交的当前快照。停放树内部的图片移除或换 `src` 也需要触发同一个池的回收检查，以覆盖关闭已隐藏的 React 内容但缓存仍持有编辑器的情况。解除停放所有权时检查剩余消费者，真实销毁或换绑清除旧所有权，共享灯箱继续走文档内图片的检查。这样回收依据来自实际生命周期和 URL 使用情况。[停放与换绑](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.tsx#L18) · [编辑器缓存的停放和销毁](../../packages/editor/src/vendor/open-knowledge/app/src/editor/editor-cache.ts#L400) · [快照池](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L8) · [React Activity](https://react.dev/reference/react/Activity)

## 未运行的验证

本阶段仅检查测试 diff 和本地依赖接口。DOM 红灯、其余 DOM 测试、类型检查、lint、构建、打包和 E2E 均未运行。生产修复待下一任务授权。
