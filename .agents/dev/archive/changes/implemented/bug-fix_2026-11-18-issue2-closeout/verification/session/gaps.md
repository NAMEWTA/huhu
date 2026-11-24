# Issue #2 会话、评论、资源和查看器补验

真实 UI 证据来自 Linux Playwright Electron、每条独立的临时 Vault。括号内为补验范围内的结果。完整命令和历史失败见 [runs.md](runs.md)。

| 验收 | 实际路径、断言与用例 | 发现和剩余范围 |
| --- | --- | --- |
| H01 | `packages/editor/test/golden-roundtrip.test.ts`「H01 保留源缓冲字节」「B05 以外部文件来源替换正文不产生撤销记录」经应用同源 Vite 别名加载真正的 `LocalDocProvider`，核对 `Y.Text('source')` 输出与输入字节。上游与 Huhu 样本合计由 122 个逐样断言和 1 个撤销用例覆盖（上游 119 个，Huhu 3 个）。`session-persistence.spec.ts`「H01 关闭无编辑笔记零次保存」监听真实 `notes.save`，读取磁盘及关闭重开后的正文。既有 `document-session.test.ts`「C06：保存在途时又有新输入」用延迟回执验证第一版落盘后第二版仍 dirty，随后第二版落盘。 | 单测与针对性 Electron 用例通过。超 256 Ki 字符时走桌面端默认源码装载，其余进行富文本 hydrate。撤销单测在宿主实际使用的 `FILE_LOAD_ORIGIN` 事务中调用 `replaceRawBody`，并验证随后用户编辑可以撤销且外部内容不回滚。每例要求字节完全相等。 |
| C05 | `session-persistence.spec.ts`「C05 坏 YAML 保留原文」看顶部属性诊断和文件树条目，点击源码标签核对原文与未损坏属性仍在，实际输入修好的 YAML，关闭后重开核对磁盘字节、键和正文。 | 通过。属性区诊断指向编辑模式里的「源码」标签。 |
| D01 | `comments-persistence.spec.ts`「D01 / D06 属性评论取消不落盘」点击属性行评论按钮，输入后取消，再真实发表。核对 `Comments/` 只有一个 `target: property` 线程且只含发表内容。关闭再打开笔记，从批注页看到同一线程。 | 通过。 |
| D06 | 同一用例经文件树「移动到…」、回收站删除、恢复、再开笔记逐步校验原线程文件名、`documentPath` 和批注页。另有 `archives-tabs.spec.ts`「D06 从档案视图重开同一笔记」核对从档案转 Markdown 重开后线程保留。 | 知识库用例通过。既有 `compact-cost.spec.ts` 的任务评论回归出现旧内容提交，另有实例数量未及 30 的运行。后续单独复跑 3/3，第二轮完整用例也通过。任务评论 UI 和编辑器内核属于本任务写入范围之外。 |
| A06 | `explorer-keyboard.spec.ts`「A06 行内、右键与 Shift+F10」点到视口底部行，按方向键进入复制路径子菜单，Enter 复制，再走右键与行内 Options 并读回相同的剪贴板相对路径。检查菜单矩形、Escape 和焦点恢复。 | 定向运行通过。覆盖底部节点，鼠标落在行尾动作按钮旁。 |
| A07 | `explorer-keyboard.spec.ts`「A07 拖到 Pierre 树空白处」用 ShadowRoot 命中测试找到滚动容器的树行之外的坐标，将同一个 `DataTransfer` 用于真实树行的 `dragstart`、滚动容器的 `dragover` 与 `drop`，断言根放置高亮和附件字节及路径。再经移动对话框触发重名和移入后代，检查报错与磁盘不变。 | 定向运行通过。UI 的目的地由 Vault 内目录下拉框提供，尚未取得越界操作的 UI 反馈证据。现有 `packages/vault/test/operations.test.ts` 「路径越界被拒」覆盖存储拒绝层。 |
| F03 | `viewers.spec.ts` 三个 F03 用例。读实际 PDF 页、缩放与搜索，对 11 MiB PDF 断言多次 `vault.readRange`、每次正长度且 ≤4 MiB，无整文件读取。密码与破损都呈错误，且页数为零。外部磁盘替换后有变动提示或呈新页面。 | 定向运行 3/3 通过，外部变动用例实际执行。夹具 `tests/fixtures/password-protected.pdf` 由 Ghostscript 生成。 |
| E05 | `archives-tabs.spec.ts`「E05 档案附件使用统一查看器」从记录页打开 PDF、HTML 和 PNG，断言公共 `file-card` 分派与标签完整路径。从实际附件上传入口上传 HTML，笔记中经 `@` 补全、保存并关闭，从档案反链打开该笔记，再由双链跳到实际 HTML 查看器。`plugins/notes/test/archives.test.ts`「E05 附件反链仅匹配档案内真实资源路径」另测同名和档案内部链接。 | 基线实际重现附件被当成 Markdown 打开。索引未及时更新时，从 Vault 父目录获取文件元数据并继续走 `FileViewer`。档案反链按附件完整路径匹配，并保留 Markdown 笔记既有别名。定向 Electron 和服务用例通过。 |
| E04 | `archives-tabs.spec.ts`「E04 同一 index.md 同一会话」「E04 在途 Markdown 保存完成后」。负载基线 4/20 失败，两轮修复后复跑均为 0/20。受控暂停中的真实保存请求，能回放两种写入顺序，再关两标签由档案入口重新打开 Markdown。 | 修复切换到档案前等待同一文件写盘、刷新该记录查询、会话未就绪时延后显示表单。详见 [e04-flake.md](e04-flake.md)。 |

## 黄金样本来源

上游 OpenKnowledge `44a2e0a6acce5952da0764746e3693fded5025b4` 的 `packages/core/src/markdown/fixtures/` 共 22 个文件，其中 10 个 Markdown 和 6 个 JSON 数据文件纳入测试夹具，其余是 4 个空目录占位和 2 个生成/加载脚本。JSON 中每个 Markdown 输入字段单独运行，JSON 容器按本仓库格式整理。Huhu 样本包括任务、档案以及带 UTF-8 BOM/CRLF 且无末尾换行的评论。评论字节以 Base64 保存，避免 Git 换行规则改变夹具。上游包声明许可证 GPL-3.0-or-later。

## Modern Web Guidance

检查了菜单的键盘和焦点、视口边缘定位及拖放。业务修复复用了现有文件树、档案表单与统一查看器，没有引入新的 Web 平台 API。Electron 按项目捆绑版本 44.9.1 实测。浏览器入口没有单独运行。
