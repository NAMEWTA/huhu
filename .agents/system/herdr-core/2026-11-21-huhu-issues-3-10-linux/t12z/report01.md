# t12z · B01 画板快照生命周期返工

- Lead `t3p`，worker `t12z`，任务 `task01.md`，执行状态 `done`。
- 派工文件 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t12z/task01.md`。
- 工作树 `agent-linux`，分支 `impl/huhu-mail-graph-completion`，基线 `4ae7e7e4`。改动留在工作树。

## 改动

- `ExcalidrawEmbed.tsx` 在视图撤下快照时同步清除快照状态，保留解析结果。文件从暂不可达或清空恢复到原内容时，用已解析场景导出新的 URL。导出仅使用当前可读文本对应的场景。
- `snapshot-url-pool.ts` 沿用 DOM 观察器跟踪图片移除和 `src` 变更。接入 URL 时记录已连接的画板容器，覆盖 React 尚未提交图片的窗口。容量清理仍回收孤立条目，已连接的待挂载画板及已有图片消费者可超过 30 项。画板真正卸载时清理待挂载条目，内联图和灯箱共用的 URL 在最后一个消费者离场或换源后回收。Activity 隐藏及同文档移动保留仍挂载的图片。
- `PATCHES.md` 已更新 B01 记录。相关文件均位于 `packages/editor/src/vendor/open-knowledge/`。

## 回归

先于实现写入 `ExcalidrawEmbed.dom.test.tsx` 的同内容恢复和容量回归。

- `a board recovering from %s with identical content mounts a usable snapshot` 分别覆盖 `unreachable`、`empty`，检查旧 URL 回收、恢复后使用新 URL 和最终卸载回收。
- `mounts a new snapshot when every URL at the pool limit is in use` 先挂载 30 幅图，再挂载第 31 幅图并检查撤销记录。
- `snapshot-url-pool.dom.test.ts` 补充 `a pending URL is released when its embed is removed before the image commits` 和 `replacing image sources releases the old URL only after every image has switched`。已有 Activity、移动、共享与卸载用例保留。

## 未运行的验证

按派工约定，本轮未运行任何验证命令。两份 DOM 测试的红绿结果、新构建的 B01 UI/E2E 验收、打包、类型检查、lint 和全量测试均待 Lead 执行。建议 B01 构建验收覆盖恢复后 SVG 实际解码、第 31 幅图解码、Activity 多次切换，以及关闭后旧 URL 回收。

## Modern Web Guidance

- `js` 指南建议 “call `container.replaceChildren()` with no arguments to remove all `childNodes`”。我用它清空 DOM 测试夹具，避免为清空节点调用 HTML 解析器。
