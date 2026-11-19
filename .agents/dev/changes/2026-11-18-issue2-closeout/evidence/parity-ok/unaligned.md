# 未对齐项与复现

在[运行说明](README.md)所列两端打开同一 Markdown 样本，使用简体中文界面。差异根据真实操作和可见状态登记。

## D02 · Huhu 缺少边缘提示

1. 选择正文 `Anchor sentence to discuss.`，点击气泡评论按钮。
2. 输入 `Compare **bold** detail.`，按 Enter。
3. 查找高亮段落旁的「打开评论」。OK 的边缘按钮能打开线程，Huhu 显示高亮但没有该按钮。Huhu 点正文高亮仍能打开线程。

[OK 边缘按钮](comments/ok-edge-marker.png) · [Huhu 相同步骤](comments/huhu-edge-marker.png)

## D02 · 评论 Markdown 内容按纯文本显示

1. 用同样步骤提交 `Compare **bold** detail.`，点击正文高亮打开线程。
2. 两端都显示字面 `**bold**`，线程正文没有 `<strong>`。Huhu 再提交 `Follow-up **reply**.`，回复正文继续显示字面星号。

[OK 线程正文](comments/ok-open-thread-and-render-markdown.png) · [Huhu 线程正文](comments/huhu-open-thread-and-render-markdown.png) · [Huhu 回复](comments/huhu-reply.png)

## D02 · 新线程的回复、解决、过滤和重开

1. 创建带选区的评论后，点击高亮打开线程。
2. 查找回复和手动解决控件。Huhu 可提交回复并把线程标为已解决。OK 在此线程未提供这两个入口。
3. 尝试过滤已解决项并重开。Huhu 能完成，OK 的同操作链阻断在手动解决。上游有已解决项过滤与重开控件，当前证据只覆盖从新建活动选区线程开始的路径。

[OK 回复步骤](comments/ok-reply.png) · [Huhu 回复](comments/huhu-reply.png) · [OK 过滤步骤](comments/ok-filter-resolved.png) · [Huhu 过滤](comments/huhu-filter-resolved.png) · [Huhu 重开](comments/huhu-reopen.png)

## D02 · 删除确认

1. 打开活动选区线程，聚焦删除控件，按 Enter。
2. OK 立即移除线程和高亮。Huhu 在确认前保留线程，点击确认后才移除。

[OK 删除结果](comments/ok-delete-confirmation.png) · [Huhu 删除前的确认](comments/huhu-delete-confirmation.png)

## 链接编辑 · Ctrl+K

1. 打开包含 `[Edit link](https://example.com/old)` 的笔记，选中 `Edit link`，按 `Ctrl+K`。
2. OK 在最终复跑打开气泡工具栏的空 URL 输入。Huhu 打开工作台「搜索与命令」。两端均可按 Escape 后从气泡按钮更新 URL 并保存。

[OK 快捷键](link/ok-shortcut.png) · [Huhu 快捷键](link/huhu-shortcut.png)
