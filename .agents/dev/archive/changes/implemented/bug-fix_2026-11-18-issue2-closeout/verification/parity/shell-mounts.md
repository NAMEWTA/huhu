# 编辑器壳层挂载核对

上游固定在 `44a2e0a`。从 `packages/app/src/components/EditorPane.tsx` 的挂载点、事件监听器和菜单订阅出发，追到 `EditorArea.tsx`、`EditorWorkspace.tsx`、`EditorHeader.tsx`、`App.tsx`、`main.tsx` 和编辑器内的事件发送方。以下路径均相对相应仓库根目录。Huhu 用例位于 `tests/e2e/knowledge/`，上游迁入的 DOM 用例位于 `packages/editor/src/vendor/open-knowledge/app/src/`。

## 本地编辑入口

| 上游挂载点和触发方 | Huhu 结论与证据 |
| --- | --- |
| `EditorPane.tsx:1400` 的 `EmojiInsertPopover` 接收斜杠项派发的 `ok:emoji-picker-open` | 已补挂到可编辑富文本区，只处理本区编辑器。保留上游 Frimousse 与原样迁入的 `EmojiInsertPopover.dom.test.tsx`。`editor-parity-shell-mounts.spec.ts` 验证键盘和鼠标各插入一个表情、磁盘及重开后的正文、Escape 后焦点和零选择器网络请求。`editor-s3-matrix.spec.ts` 的表情项实际插入 🎉。 |
| `EditorPane.tsx:1399` 的 `TagDialog` 接收正文标签和 `PropertyWidgets` 芯片上的 `ok:tag-click` | 已补挂到文档编辑面，使用现成笔记标签索引，按标签及其子层级列出其他笔记。点击结果走 Huhu 的打开笔记回调。由 `editor-parity-shell-mounts.spec.ts` 验证正文标签、层级命中、排除相近前缀、Escape 焦点与打开目标笔记。 |
| `EditorPane.tsx:1257–1310` 接收气泡项的 `open-knowledge:view-in-source`，注册查看源码快捷键和桌面菜单 | 已补接气泡事件及富文本区的 查看源码快捷键（Linux Ctrl+Alt+E，macOS Cmd+Option+E），使用上游定位算法，标题栏切换沿用 Huhu 笔记模式。由 `editor-parity-shell-mounts.spec.ts` 分别点击气泡按钮和按 Ctrl+Alt+E，验证 CodeMirror 的焦点、目标行和磁盘内容。`editor-parity-closeout-remaining.spec.ts` 另验 Huhu 工具栏模式切换。OK 原生菜单命令由 Huhu 模式入口取代。 |
| `EditorPane.tsx:946–956` 的 `raw-mdx-nav` | 固定上游源码中只有定义、监听和类型引用，测试手动派发该事件。未知 MDX 的实际编辑入口是节点内 CodeMirror，`editor-parity-closeout.spec.ts` 验证进入、撤销、重做、保存重开。当前没有可达的壳层跳转入口。 |
| `main.tsx:161` 的 Sonner Toaster 接收上传、粘贴、JSX 等编辑器反馈 | 已挂到文档编辑面，使用 vendor 已在用的 Sonner 总线。`editor-parity-shell-mounts.spec.ts` 从斜杠菜单打开系统文件选择器，选取拒绝的附件，验证可见错误及正文无附件。 |
| `EditorArea.tsx:1571` 的 `FindReplaceController` 接收编辑器快捷键、处理匹配和替换 | 已挂在 Huhu `RichMarkdownEditor`。`editor-parity-closeout.spec.ts` 验证快捷键、下一匹配、替换保存。 |
| `EditorWorkspace.tsx:280–320` 的侧栏拖拽资源打开 | Huhu `OkRoot` 解析拖拽负载并交给 DocTab。`editor-parity-closeout-remaining.spec.ts` 验证拖入资源打开另一标签及外部图片仍保存为附件。 |
| `EditorArea.tsx:1335`、`:1633` 的文档侧栏请求与 `DocPanel`，以及 `comments/*` 的定位和评论入口 | Huhu 笔记有自己的大纲、链接、批注及属性入口。批注提交后由 `NotesModule` 的 `onCommentPosted` 订阅打开详情的批注页，正文选区由编辑器内批注组件处理。`comments-s4.spec.ts` 验证选区批注、整篇批注、回复、解决和重开。`host-routes.spec.ts` 验证切换源码和打开批注详情时宿主路由可用。OK 的队列、活动时间线、Problems、Graph 属其应用功能，见下节。 |
| `EditorHeader`、`EditorToolbar` 的属性入口和 `PropertyPanel` | Huhu 文档工具栏和编辑区顶部有自己的模式入口及复用的 YAML 面板。`editor-parity-closeout-remaining.spec.ts` 验证工具栏、模式和属性可达，`editor-s3-properties.spec.ts` 验证属性编辑保持正文。 |
| `PageHeaderWidgets` 的 Emoji 图标和封面选择 | Huhu 复用 `FrontmatterRow` 的 `icon`、`cover`／`banner` 属性 widget。源模式的属性图标也共享离线字典，`editor-parity-shell-mounts.spec.ts` 验证选取并保存 YAML 图标且保留正文。`editor/components/PropPanel.dom.test.tsx` 验证页面封面控件受文件预览模式约束。 |
| `TiptapEditorChrome` 的 `BubbleMenuBar`，链接编辑事件由其中的 `LinkEditPopover` 接收 | 已随 vendor 编辑器挂载。`editor/bubble-menu/LinkEditPopover.dom.test.tsx` 覆盖打开、编辑、应用和移除。`editor-s3-menus.spec.ts` 验证气泡菜单可用。`App.tsx` 的目标 hash 同步由 `OkRoot` 和笔记打开回调承担，编辑器自身继续监听重复锚点和大纲定位。 |
| `CodePreviewEditModal`、JSX `PropPanel`、图片和文件选择、建议菜单、表格操作 | 由代码块 NodeView、JSX NodeView、`FileHandler`／斜杠项、建议插件、表格气泡各自挂载。`editor-parity-closeout-remaining.spec.ts` 验证代码预览修改持久化、Callout 属性、图片对齐、文件下载。`attachments.spec.ts` 验证贴入及拖入图片落盘。`editor-parity-closeout.spec.ts` 验证标签／双链建议和表格拖动。 |
| `TiptapEditor` 内的资源右键插件调用 `okDesktop.shell.showAssetMenu` | Huhu 使用 ResourceTree 的资源菜单。沿用矩阵第 233 行的产品取舍。`editor-parity-closeout-remaining.spec.ts` 验证资源菜单复制相对路径和打开 DocTab。 |

## OK 特有的壳层入口

| 上游挂载点和监听器 | 适用范围 |
| --- | --- |
| `EditorPane` 中的 `AuthModal`、`AutoSyncOnboardingDialog` 与同步状态通知，`App` 中的连接、分支、分享和接收提示 | 上游账户、项目同步和分享流程。Huhu 本地笔记不接对应服务，见 OP-D19 Q2。 |
| `EditorPane` 的 `AgentThreadClientBinder`、`SessionsHost`、终端启动／命令和 Agent 线程请求、选区发送；`BottomComposer` 的 `openAskAiComposer` | 上游 agents／终端会话与 AI 组合栏。Huhu 的工作台与笔记编辑使用各自的 UI，笔记正文无这些命令入口。 |
| `EditorPane` 的 pane 可见性、dock 移动、焦点统计、原生菜单总线；`EditorArea` 的设置面板、面板快捷键及布局控制；`EditorWorkspace` 的窗口停放和会话恢复 | OK 应用窗格与窗口协议。Huhu 的工作台和 DocTab 已承载打开、切换、聚焦及关闭，由 `editor-parity-closeout-remaining.spec.ts` 验证。 |
| `App` 的全局命令面板、新建、设置、项目安装、问题上报、MCP 同意、独立笔记窗口消息；`CommentQueueShortcut`、`EditorArea` 的 Timeline／Graph／Problems | OK 应用级操作、评论发送队列或服务功能。Huhu 批注直接走本地存储。Lint、协作与时间线的能力开关见 `packages/editor/src/host/ok-host.ts` 的默认宿主配置及 OP-D19。 |

Frimousse 在上游与 Huhu 的锁文件均为 `0.3.0`。上游锁没有单列 Frimousse 通过 CDN 加载的字典，常规 npm 包的开发依赖声明 `emojibase-data: ^16.0.2`。本次锁定 `16.0.2`，随应用打包其英文数据和分组消息，通过 `hostFetch` 内存响应加载。Electron 用例记录整个选择器交互期间的页面请求并剔除 Vault 自身的回环 IPC，要求其余请求数为 0。
