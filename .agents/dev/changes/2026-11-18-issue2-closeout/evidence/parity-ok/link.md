# 链接编辑 · 矩阵 141

选择已有链接的文字 `Edit link`，按 `Ctrl+K`。Huhu 打开全局搜索。按 Escape 后重新选择文字，通过气泡工具栏的插入链接按钮进入输入框，旧 URL 未预填。输入新地址并按 Enter 后，磁盘中的目标更新为 `https://example.com/new`，链接文案不变。

[Huhu 快捷键](link/huhu-shortcut.png) · [Huhu 更新后](link/huhu-edit-existing-destination.png) · [DOM](link/huhu.json) · [最终 Markdown](link/huhu.md)

| 对照项 | 分类 | OK 与 Huhu |
| --- | --- | --- |
| 选区内已有链接时按 Ctrl+K | 未对齐 | OK 将焦点移到气泡工具栏的「链接 URL」输入，所测轮次未预填 URL。Huhu 打开「搜索与命令」。 |
| 气泡工具栏更新 URL | 等价 | 重新选中链接文字并从气泡按钮进入时，两边都显示空 URL 输入。输入新值并提交后，链接文案和磁盘最终 Markdown 一致。 |

[OK 快捷键](link/ok-shortcut.png) · [OK 更新后](link/ok-edit-existing-destination.png) · [DOM](link/ok.json) · [最终 Markdown](link/ok.md)
