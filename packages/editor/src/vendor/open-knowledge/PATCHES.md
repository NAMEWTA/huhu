# vendor 补丁登记

规则：每个与上游不同的文件都登记一行（路径用反引号，`node scripts/ok-patches.mjs --check` 逐一比对，不一致即失败）。S2a 基线（S2c 起改动 +1）：**改动 5 / 删除 4 / 新增 26（server-bridge 11 个上游文件的复制 + 9 个替身；app 的 CSS / 声明 / 目录 7 个）**，远低于阈值 150（decisions OP-D02）。

## 改动（上游文件被改写或替换）

- P-S2a-02 `app/src/editor/DocumentContext.tsx`：上游 1868 行（标签 / 分屏 / 协作连接 / 会话恢复）→ 再导出 Huhu 宿主版 `packages/editor/src/host/document-context.tsx`（只保留 vendor 组件实际读取的 17 个成员）。
- P-S2a-03 `app/src/lib/config-provider.tsx`：上游 346 行（经协作配置文档同步）→ 只保留 `useConfigContext` 再导出；提供者见 `host/config-provider.tsx`。
- P-S2a-04 `app/src/lib/activate-locale.ts`、`app/src/lib/i18n.ts`、`app/src/lib/dev-pseudo-locale.ts`：只发布 en / zh-Hans（OP-D06），目录由 `@lingui/vite-plugin` 直接编译 `.po`；其余 locale 回退 en；pseudo 伪本地化不发布。

- P-S2c-01 `app/src/editor/editor-cache.ts`：`mountTiptapEditor` 的缓存闸门对 `compact-` 前缀的 docName 一律拒绝缓存（紧凑变体同时挂载几十个实例；不改会让超过 MAX_CACHE 的在屏实例被 LRU 驱逐销毁）。1 处、3 行。

## S4 评论（P-S4-xx）

- P-S4-01 `core/src/schemas/api/comments.ts`：`CommentThreadMetaSchema` 加可选 `scope`（body / file / property）与 `messages`（Huhu 线程是消息列表，OK 只有 `latestComment`；整篇笔记批注是 Huhu 的 `target:"file"`）。
- P-S4-02 `app/src/comments/types.ts`：`CommentThread` 加可选 `scope` / `messages`。
- P-S4-03 `app/src/comments/store.ts`、`app/src/comments/comments-client.ts`：`toThread` 携带 scope / messages；新增 `createFileThread` / `replyToThread` / `resolveThread`（对应 `/api/comment` 的 `reply` / `resolve` 动作与 `wholeFile` 创建参数）。
- P-S4-04 `app/src/comments/CommentListPanel.tsx`：不渲染 `CommentSendFooter`（AI 派发发送栏，Q2 不接）。
- P-S4-05 `app/src/comments/ThreadCard.tsx`（含 e2e 用的 data-testid：comment-thread / comment-orphaned / thread-*）：去掉“发送”勾选与点击卡片切换发送；铅笔编辑入口换成“标记为已解决”（Huhu 的消息是追加式记录，没有编辑）；回复列表与回复输入；删除两步确认；整篇笔记批注的标签。
- P-S4-06 `app/src/comments/store.ts`：`setCommentsReadOnly` / `useCommentsReadOnly`（宿主只读时隐藏写操作入口，批注仍可查看 / 定位）。
- P-S4-07 `app/src/locales/en/messages.po`、`app/src/locales/zh-Hans/messages.po`：新增上面补丁用到的 9 条消息（`zh-Hans` 译文）。
- P-S4-08 上游 app 非 dom 测试迁入（22 个，原样复制自上游 app 的 comments 目录，与被测源码同目录；`test:vendor` 经 `vitest.vendor.config.ts` 的 Lingui 宏管线与 `test/vendor-setup.ts`（激活 en）运行）：（逐文件清单见 evidence/tests-manifest.json，与上游 SHA-256 逐一相同）、、、、、、、、、、、、、、、、、、、、、。

## 删除

- P-S2a-01 `app/src/editor/provider-pool.ts`（2121 行，Hocuspocus 连接池）、`app/src/editor/branch-invalidation.ts`、`app/src/lib/auth-token.ts`、`app/src/lib/server-info-refresh.ts`：协作 / 服务器专属；由 `host/hocuspocus-provider.ts`（LocalDocProvider）取代。

## 新增（非 closure 的上游文件或 Huhu 替身）

- P-S2a-05 上游资源拷贝：`app/src/globals.css`、app/src/cmd-f.css、app/src/color-themes.generated.css（由 `scripts/ok-css-build.mjs` 生成 `packages/editor/src/ok/ok-globals.css`）、`app/src/env.d.ts`、app/src/fontsource.d.ts、`app/src/locales/en/messages.po`、`app/src/locales/zh-Hans/messages.po`。
- P-S2a-srv 上游 server 文件原样复制：`server-bridge/server-observers.ts`、`server-bridge/map-driven-splice.ts`、`server-bridge/bridge-watchdog.ts`、`server-bridge/bridge-quiescence.ts`、`server-bridge/pre-drain-discriminator.ts`、`server-bridge/bridge-intake.ts`、`server-bridge/bridge-loss-detector.ts`、`server-bridge/doc-extensions.ts`、`server-bridge/md-manager.ts`。
- P-S2a-srv 上游 server 文件裁剪 / 替身（Huhu 本地宿主不需要 OTel、日志、影子仓库、AI 会话）：`server-bridge/agent-activity.ts`（只留 `walkYTextItems` 与类型）、`server-bridge/cc1-broadcast.ts`（只留 `isSystemDoc` / `isConfigDoc`）、`server-bridge/metrics.ts`、`server-bridge/logger.ts`、`server-bridge/telemetry.ts`、`server-bridge/shadow-repo.ts`、`server-bridge/loss-capture.ts`、`server-bridge/frontmatter-telemetry.ts`、`server-bridge/server-workload-telemetry.ts`、`server-bridge/agent-sessions.ts`（均为同名同签名的空实现 / 类型）。

## 构建期替换（不改 vendor 文件，tsconfig.vendor.json paths + `build/aliases.mjs` 同源）

- `@hocuspocus/provider` → `host/hocuspocus-provider.ts`（LocalDocProvider；`HocuspocusProvider` 为其别名）
- `@hocuspocus/server`（仅类型）→ `host/hocuspocus-server.ts`
- `@inkeep/open-knowledge-core`（根入口）→ `host/core-barrel.ts`（`scripts/ok-barrel-gen.mjs` 生成的精确子集）

## 依赖补丁（pnpm patchedDependencies，原样复制自上游 `patches/`）

`@handlewithcare/remark-prosemirror@0.1.5`、`@lingui/core@6.5.0`、`@pierre/trees@1.0.0-beta.4`、`@radix-ui/react-tooltip@1.2.8`、`@tiptap/extension-drag-handle@3.22.3`、`@tiptap/y-tiptap@3.0.3`、`cmdk@1.1.1`、`react-medium-image-zoom@5.4.3`、`y-indexeddb@9.0.12`。未登记：`@hocuspocus/provider`（不引入）、`y-prosemirror`（Huhu 不安装）、`react-resizable-panels`、`@pierre/diffs`（未进入闭包）。另有 `pnpm-workspace.yaml` 的 `overrides: mdast-util-mdx-jsx: 3.2.0`（模块增强要求单一实例）。

## S5（文件树 / 右键菜单 / 隐藏）补丁

- P-S5-01 `app/src/components/FileTree.tsx`：“隐藏”不再写 `.okignore`，改为调用宿主注册的 `hiddenPaths` 偏好（`app/src/lib/host-hidden.ts`，新增）；未注册时入口禁用，不静默写 `.okignore`。非 Markdown 文件同样可隐藏。
- P-S5-02 `app/src/components/FileTree.tsx`：移除“Open with AI”子菜单（`OpenInAgentContextSubmenu` 的 import 与 `openWithAi` 属性）——Q2 登记不适用。
- P-S5-03 `app/src/components/FileTree.tsx`：移除“Import as template”（`/api/template/import` 无 Huhu 对应能力）；“New from template”仍显示，但 `/api/templates` 返回 NOT_AVAILABLE 时没有模板项（待 S3 后评估是否映射 Huhu 模板）。
- P-S5-04 `app/src/components/FileTargetMenuItems.tsx`、`app/src/components/FileTree.tsx`、`app/src/lib/host-hidden.ts`：宿主可追加菜单项（`setHostMenuExtras`），用于 Huhu 既有的“移动到…”“星标”“保存版本…”。
- 新增（非上游）：`app/src/lib/host-hidden.ts`；宿主侧 `host/routes/files.ts`、`host/explorer.tsx`、`host/ok-explorer.d.ts`、`harness/tree.{html,tsx}`。
- P-S5-05 `app/src/components/ui/alert-dialog.tsx`、`app/src/components/ui/dialog.tsx`、`app/src/components/ui/dropdown-menu.tsx`、`app/src/components/ui/popover.tsx`、`app/src/components/ui/select.tsx`、`app/src/components/ui/tooltip.tsx`、`app/src/lib/ok-portal.ts`（新增）：Radix Portal 统一挂到 `#ok-portal-root.ok-root`（design §12“所有 OK 渲染的根与 portal 容器都挂 .ok-root”）；否则 body 上的浮层没有作用域化的 Tailwind 工具类，菜单宽度为 0。

## S3（编辑行为对等与性能 F09）补丁

- P-S3-01（宿主，非 vendor 文件）大文档源码优先打开：`host/hocuspocus-provider.ts`（`lazyRich` / `ensureRich()` / `settleNow()`）、`host/provider-pool.ts`、`rich/RichMarkdownEditor.tsx`。源码模式只装载 `Y.Text('source')`；解析 + `Y.XmlFragment` + 桥观察者延后到切换富文本时。1 MiB 文档打开：5.4 s → 约 0.45 s。
- P-S3-02 `server-bridge/server-observers.ts`：桥结算自适应推迟——上一次结算超过 12 ms 时把后续结算合并到停顿之后（150–1500 ms，最长连续推迟 3 s）；小文档仍同步，与上游一致。返回的 dispose 函数新增 `settleNow()`；所有读取 `Y.Text` 的出口（flush / 切源码 / 卸载）先结算。原因：上游这套桥跑在服务端进程，本地模式在渲染进程主线程，5000 段文档每次按键同步整篇序列化约 1 s。
- P-S3-03 `app/src/editor/extensions/chunk-wrapper-decoration.ts`、`app/src/globals.css`：不再给每个顶层块建 `Decoration.node`（5000 段 = 5000 个装饰，约 90 ms/键）；`content-visibility:auto` 改由 CSS 子选择器 `.ProseMirror > :where(:not(...))` 匹配，装饰只留给 `jsxComponent`（跳过）与选区所在块（`data-ok-selection-block`）。5000 段输入延迟 p95 ≈ 80 ms → ≈ 13 ms。
- P-S3-04 `core/src/frontmatter/yaml-codec.ts`、`core/src/bridge/frontmatter-region.ts`：带前导零的数字样文本（`007`）按文本读写并原样保留（上游 `yaml` core schema 读成整数 7，改别的键时被悄悄改写）；显式加引号的 `"007"` 保持引号。spec C02。
- P-S3-05（宿主）`host/explorer.tsx`：OK 对超过 512 KiB 的文档给出 `large-file` 导航目标（不进编辑器）；Huhu 把它当普通文件打开，由 `plugins/notes/src/ui/viewers/dispatch.ts` 决定上限（Markdown 笔记 16 MiB，其它文本 1 MiB）。

- P-T-01 `core/src/y-prosemirror-patch.test.ts`（测试适配）：Huhu 不安装独立 `y-prosemirror`（`@tiptap/y-tiptap` 自带同源实现，补丁登记在 pnpm-workspace.yaml）：`REPO_ROOT` 改为向上找 `pnpm-workspace.yaml`；`import.meta.resolve` 换成 `createRequire(...).resolve`（vite-node 没有它）；去掉 `y-prosemirror` 的 4 个断言与补丁文件存在性检查，只校验 `@tiptap/y-tiptap` 的两份 bundle 与补丁文件、依赖树不变量（`reachedPackages` 只要求 `y-tiptap`）。
- P-D-01 依赖对齐（无源文件改动）：编辑器行为以上游 pnpm-lock.yaml 解析的版本为基线。`pnpm-workspace.yaml` 的 `overrides` 把 tiptap 全系、`@tiptap/pm`、ProseMirror 全系、`mdast-util-gfm-*`、`mdast-util-find-and-replace`、`hast-util-*`、`hastscript`、`lib0`、`linkifyjs`、`unist-util-visit-parents`、`vfile-location` 钉到上游版本（`micromark-factory-space` 钉 2.0.1 会让 `micromark-core-commonmark` 缺 `factorySpaceMinMax`，故不钉）；`katex` 从 0.16.22 升到上游的 0.16.47（旧预览已删除，无其它消费者）。发现方式：上游 `list.test.ts` 在 `mdast-util-gfm-task-list-item@2.0.1` 下把任务项序列化成 `- [ ] [ ] x`。
- P-D-02 `pdfjs-dist` 统一为 6.3.289（`plugins/notes` 的 PDF 查看器已用，带 ORCA 局部渲染补丁 `patches/pdfjs-dist@6.3.289.patch`），上游 6.2.108 仅被 app/src/editor/components/Pdf.tsx（PDF 嵌入块）使用；`tsconfig.vendor.json` typecheck 通过。`ok-align-deps.mjs` 的 KEEP 集合跳过该依赖。
