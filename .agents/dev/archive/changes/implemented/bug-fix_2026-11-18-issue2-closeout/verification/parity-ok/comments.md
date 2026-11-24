# D02 · 选区评论

在 `Anchor sentence to discuss.` 上选择整行，通过气泡按钮提交 `Compare **bold** detail.`。依次检查边缘按钮、点击高亮打开线程、回复 `Follow-up **reply**.`、解决、过滤已解决、重开与删除。Huhu 正文有选区高亮，边缘按钮可打开对应线程。按 2026-11-20 用户决定，Huhu 将评论正文和回复渲染为 Markdown，支持引用块，磁盘评论仍保存原文。解决后活动线程隐藏，切换过滤显示 `resolved`，重开回到 `anchored`，确认删除后线程与高亮均为零。以下 Huhu 对照截图记录旧实现。现行正文、回复、引用块、内容安全与磁盘原文见 [D02 验收](../../../../../../../../tests/e2e/knowledge/comments-s4.spec.ts#L353)。

Huhu 高亮（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/huhu-create-and-highlight.png`） · Huhu 线程正文（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/huhu-open-thread-and-render-markdown.png`） · Huhu 删除确认（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/huhu-delete-confirmation.png`） · 全部步骤 DOM（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/huhu.json`） · [最终 Markdown](comments/huhu.md)

| 对照项 | 分类 | OK 与 Huhu |
| --- | --- | --- |
| 创建与正文高亮 | 等价 | 气泡按钮提交后两边均生成指向线程的正文高亮。 |
| 边缘提示 | 等价 | 两端均在选区旁出现「打开评论」。激活后显示同一条线程内容，按钮名称变为「关闭评论」。Huhu 窄窗详情浮层占用右侧留白时，按钮移到左侧留白。 |
| 打开线程 | 等价 | 点击高亮后均可看到原评论正文。 |
| Markdown 内容 | 用户确认差异 | 固定 OK 在本样本显示字面星号。Huhu 按规格 §8.1 渲染强调与引用块，评论文件保存原始 Markdown。 |
| 回复与手动解决 | 已登记差异 | Huhu 有回复输入与解决按钮，并完成相应动作。OK 所测文档线程只提供编辑和删除等操作，未出现手动回复或解决入口。 |
| 过滤与重开 | 已登记差异 | Huhu 可过滤已解决项并重开。由于上一步无法在 OK 通过同样的手动操作把新线程变为已解决，本轮的同操作链在 OK 无法验证过滤与重开。固定源的过滤按钮只在已有已解决线程时显示，重开只在 `thread.status === 'resolved'` 的卡片显示。对应路径见 [CommentListPanel](https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/comments/CommentListPanel.tsx#L182) 和 [ThreadCard](https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/comments/ThreadCard.tsx#L250)。 |
| 删除确认 | 已登记差异 | Huhu 显示确认并在确认前保留一个线程。OK 按删除即移除，线程计数变为 0，未显示确认。 |
| 删除结果与文档 | 等价 | 两边最终均无高亮和线程。两边的磁盘 Markdown 都保留原文，评论独立存放。 |

OK 高亮（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/ok-create-and-highlight.png`） · OK 边缘按钮打开线程（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/ok-edge-marker.png`） · OK 线程正文（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/ok-open-thread-and-render-markdown.png`） · OK 删除后（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/ok-delete-confirmation.png`） · 全部步骤 DOM（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/ok.json`） · [最终 Markdown](comments/ok.md)

Huhu 边缘按钮打开线程（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/huhu-edge-marker.png`） · 窄窗详情打开（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/narrow-detail-open.png`） · 窄窗详情关闭（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/narrow-detail-closed.png`）
