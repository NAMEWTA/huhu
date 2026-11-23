# t13j · TipTap 停放时保留画板快照

Lead `t3p`，worker `t13j`，任务 `task02.md`，工作树 `agent-linux`。实现和回归已写好，待 Lead 串行验证。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13j/task02.md) · [红灯准备记录](t13j-red-ready.md)

Lead 经 `t13k` 确认修复前的首次隐藏会撤销 `blob:editor-snapshot-1`，定向运行结果为 1 失败、6 跳过。[红灯日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/snapshot-parking-red.log:28)

## 实现

- `EditorContent` 在移出 ProseMirror 的视图 DOM 前登记停放，只允许当前持有内容绑定的实例登记。原实例重接或新实例换绑后结束停放观察。缓存容量驱逐、宿主释放和不可缓存实例关停都经 TipTap `destroy()`，由它触发的 `unmount` 在视图销毁后清除停放观察。[EditorContent](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.tsx#L13) · [缓存销毁](../../packages/editor/src/vendor/open-knowledge/app/src/editor/editor-cache.ts#L442) · [宿主释放](../../packages/editor/src/host/provider-pool.ts#L22)
- 快照池以弱引用登记停放根，复用文档观察的回收逻辑处理停放树中的 `src` 更换和移除。内联快照跟随画板宿主，灯箱由文档内图片保留。待挂载 URL 在已连接或已停放的宿主中受容量淘汰保护。结束停放时先交接观察中尚未处理的变更，再在同一轮布局提交完成后的微任务里根据最终 DOM 位置回收。[快照池](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L5)

## 回归

- 扩充真实 TipTap 回归，检查首次隐藏、重接时复用原 URL、重复隐藏、同一编辑器换绑后释放旧 URL，以及关闭仍隐藏的编辑器后释放新 URL。[EditorContent DOM](../../packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx#L155)
- 新增三项池测试，覆盖灯箱关闭后停放图仍保有共享 URL、随后停放图的换源与删除释放资源、待挂载 URL 经容量压力后随宿主移除而释放，以及同一轮重接和结束停放时仍脱离文档的区别。[快照池 DOM](../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.dom.test.ts#L95)

从 `agent-linux` 根目录可串行运行相关三个 DOM 文件。

```sh
pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app --maxWorkers=1 \
  src/vendor/open-knowledge/app/src/editor/EditorContent.dom.test.tsx \
  src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.dom.test.ts \
  src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.dom.test.tsx
```

## 未运行的验证

本轮 worker 只读代码、依赖源码和既有红灯日志。修复后的 DOM 测试、类型检查、lint、E2E、构建和打包均待 Lead 验证。
