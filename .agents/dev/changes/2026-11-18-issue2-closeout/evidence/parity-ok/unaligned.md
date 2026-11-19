# 原差异复验与已登记差异

按 [运行说明](README.md) 所列版本复现。task06 的 Lead 裁定记录在 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report06.md`。

## 等价 · D02 边缘提示

1. 选择正文 `Anchor sentence to discuss.`，点击气泡评论按钮。
2. 输入 `Compare **bold** detail.` 并提交。
3. 两端均显示一个「打开评论」。点击后打开对应线程，按钮名称变为「关闭评论」。Huhu 另以两个选区验证了目标线程、键盘和 1100 像素详情栏开关时的可点击位置。

[OK 边缘按钮](comments/ok-edge-marker.png) · [Huhu 边缘按钮](comments/huhu-edge-marker.png) · [窄窗详情打开](comments/narrow-detail-open.png) · [窄窗详情关闭](comments/narrow-detail-closed.png)

## 等价 · D02 评论 Markdown 内容

提交 `Compare **bold** detail.` 并打开线程。两端都显示字面 `**bold**`，正文没有 `<strong>`。按 Lead 裁定登记为等价。

[OK 线程正文](comments/ok-open-thread-and-render-markdown.png) · [Huhu 线程正文](comments/huhu-open-thread-and-render-markdown.png)

## 已登记差异 · D02 本地线程操作

创建带选区的评论并打开线程。Huhu 提供回复、手动解决、过滤已解决项与重开。OK 当前活动线程没有相同的手动回复和解决入口，因此同操作无法进入已解决状态。对同一个活动线程执行删除时，OK 立即删除，Huhu 需要确认。Lead 已确认 Huhu 的入口满足 D02。

[OK 回复步骤](comments/ok-reply.png) · [Huhu 回复](comments/huhu-reply.png) · [Huhu 过滤](comments/huhu-filter-resolved.png) · [OK 删除结果](comments/ok-delete-confirmation.png) · [Huhu 删除确认](comments/huhu-delete-confirmation.png)

## 等价 · 富文本 Mod+K

打开包含 `[Edit link](https://example.com/old)` 的笔记，选中 `Edit link`。两端按 Mod+K 都聚焦气泡工具栏中的 URL 输入。Huhu 的源码模式和富文本编辑器外继续打开命令面板，按 Lead 决定保留。

[OK 快捷键](link/ok-shortcut.png) · [Huhu 快捷键](link/huhu-shortcut.png)
