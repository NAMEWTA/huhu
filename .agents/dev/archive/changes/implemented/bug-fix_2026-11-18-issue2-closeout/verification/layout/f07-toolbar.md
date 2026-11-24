# F07 笔记顶部工具栏

在 9f870c0 的 Electron 构建上复现。窗口宽 1280 px、缩放 100%，打开“文档详情”后，实时预览、源码、阅读、添加批注、收藏笔记、文档详情、笔记操作这七个控件的中心命中详情分区。原始 失败日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/f07-before.txt`） 和 修复前截图（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/shots/f07-before-1280.png`） 随本目录保存。

详情栏现在位于编辑区的布局容器内。窗口达到 1440 CSS px 时和编辑器并排，窄窗时覆盖编辑区。文档标签、工具栏和状态条在该容器外。工具栏按自己的文档容器宽度收纳。极窄时以原生下拉切换编辑模式，窄宽度下撤销、重做和导出仍可从“笔记操作”访问。

矩阵使用 Electron 44.9.1 / Chromium 152.0.7977.167。测试解除桌面窗口的 960 px 原生最小宽度以实际驱动 800 px。每个宽度测试准备两个标签和一个长中文标题，保持资源栏展开。在实际 CSS 视口中核对 100%、125%、150%、200% 四个 Zoom Factor。批注是详情分区的一个标签，关闭详情栏的两种用例分别保留属性、批注标签。每个组合用 `document.elementFromPoint` 核对各可见控制的中心，再发送真实鼠标点击并检查操作菜单和批注页出现。测试还断言工具栏单行、无横向溢出。

矩阵六个宽度、四档缩放、四种详情/批注组合共 96/96 通过。1280 px 专项及矩阵后紧跟着运行的宿主路由回归也通过。测试退出前把缩放值复位，避免污染同一个 Electron profile 后续用例。终轮矩阵日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/f07-matrix.txt`）

宽度分界截图见 1280 px（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/shots/f07-1280-100.png`）、1439 px（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/shots/f07-1439-100.png`）、1440 px（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/shots/f07-1440-100.png`） 和 1920 px（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/shots/f07-1920-100.png`）。

在 8168981 构建上再次执行 800 px 的 16 个组合，均通过。用 Electron 原生截图避免 Playwright 在高缩放时裁切画面。800 px / 200% 实际截图（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/shots/f07-800-200.png`） · 极窄重跑日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/f07-narrow-retry.txt`）
