# 链接编辑 · 矩阵 141

选择已有链接的文字 `Edit link`，按 `Ctrl+K`。两端均聚焦气泡工具栏的「链接 URL」输入。按 Escape 后重新选择文字，通过气泡工具栏的插入链接按钮进入输入框，旧 URL 未预填。输入新地址并按 Enter 后，磁盘中的目标更新为 `https://example.com/new`，链接文案不变。

Huhu 快捷键（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/link/huhu-shortcut.png`） · Huhu 更新后（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/link/huhu-edit-existing-destination.png`） · DOM（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/link/huhu.json`） · [最终 Markdown](link/huhu.md)

| 对照项 | 分类 | OK 与 Huhu |
| --- | --- | --- |
| 选区内按 Mod+K | 等价 | 两端把焦点移到气泡工具栏的「链接 URL」，本样本 URL 初值为空。Huhu 光标位于链接中时，也能用同一输入更新目标并保存。 |
| 源码模式和编辑器外 | 已登记差异 | 按 Lead 决定，Huhu 保留全局命令面板。Electron 用例验证源码不被改写。 |
| 气泡工具栏更新 URL | 等价 | 重新选中链接文字并从气泡按钮进入时，两边都显示空 URL 输入。输入新值并提交后，链接文案和磁盘最终 Markdown 一致。 |

OK 快捷键（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/link/ok-shortcut.png`） · OK 更新后（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/link/ok-edit-existing-destination.png`） · DOM（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/link/ok.json`） · [最终 Markdown](link/ok.md)
