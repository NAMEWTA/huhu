# D02 · 选区评论

在 `Anchor sentence to discuss.` 上选择整行，通过气泡按钮提交 `Compare **bold** detail.`。依次检查边缘按钮、点击高亮打开线程、回复 `Follow-up **reply**.`、解决、过滤已解决、重开与删除。Huhu 正文有选区高亮，未出现边缘按钮。点击高亮打开线程后正文显示字面星号，回复同样保留字面星号。解决后活动线程隐藏，切换过滤显示 `resolved`，重开回到 `anchored`，确认删除后线程与高亮均为零，磁盘 Markdown 保持原文。

[Huhu 高亮](comments/huhu-create-and-highlight.png) · [Huhu 线程正文](comments/huhu-open-thread-and-render-markdown.png) · [Huhu 删除确认](comments/huhu-delete-confirmation.png) · [全部步骤 DOM](comments/huhu.json) · [最终 Markdown](comments/huhu.md)

| 对照项 | 分类 | OK 与 Huhu |
| --- | --- | --- |
| 创建与正文高亮 | 等价 | 气泡按钮提交后两边均生成指向线程的正文高亮。 |
| 边缘提示 | 未对齐 | OK 有一个「打开评论」按钮，可打开同一线程。Huhu 的选区已高亮，按钮计数为 0。 |
| 打开线程 | 等价 | 点击高亮后均可看到原评论正文。 |
| Markdown 渲染 | 未对齐 | 两边均显示 `Compare **bold** detail.`，正文下没有 `strong`。这次观察一致，Markdown 渲染的验收项仍未证实。Huhu 回复中的 `strong` 是作者「我」，回复正文保留星号。 |
| 回复与手动解决 | 未对齐 | Huhu 有回复输入与解决按钮，并完成相应动作。OK 所测文档线程只提供编辑和删除等操作，未出现手动回复或解决入口。 |
| 过滤与重开 | 未对齐 | Huhu 可过滤已解决项并重开。由于上一步无法在 OK 通过同样的手动操作把新线程变为已解决，本轮的同操作链在 OK 无法验证过滤与重开。上游 `CommentListPanel` 和 `ThreadCard` 有对应控件。 |
| 删除确认 | 未对齐 | Huhu 显示确认并在确认前保留一个线程。OK 按删除即移除，线程计数变为 0，未显示确认。 |
| 删除结果与文档 | 等价 | 两边最终均无高亮和线程。两边的磁盘 Markdown 都保留原文，评论独立存放。 |

[OK 高亮](comments/ok-create-and-highlight.png) · [OK 边缘按钮打开线程](comments/ok-edge-marker.png) · [OK 线程正文](comments/ok-open-thread-and-render-markdown.png) · [OK 删除后](comments/ok-delete-confirmation.png) · [全部步骤 DOM](comments/ok.json) · [最终 Markdown](comments/ok.md)
