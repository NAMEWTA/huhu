# S4 评论：验证记录（2026-11-17）

实施者在自己的 worktree 里直接运行（fork 不能派生 `audit` 子代理；整合时由主会话让 `audit` 重跑）。

## 实现范围

- 引擎：`comments.create` / `comments.relocate` 新增 `quote / prefix / suffix` 输入（`resolveRange`，移植 OK `findAllPassages`）；偏移输入仍接受（源码模式 / 旧调用方）。
- 宿主：`packages/editor/src/host/routes/comments.ts`（hostFetch 路由）、`rich/comments.tsx`（`CommentsPanelHost`、`startComment`、`onCommentPosted`、`notifyCommentsChanged`）；`plugins/notes/src/ui/comments/{commentAdapter,useCommentsBridge,CommentsHost,CommentsPanelSurface}`。
- vendor 补丁 P-S4-01..08（`PATCHES.md`）。旧 `CommentsPanel.tsx`、`CommentComposer` 对话框、`RichEditorPort.getSourceSelection / setSourceSelection`（富文本选区→源码偏移近似）已删除。
- 顺带修复一个 S2b 遗留 bug：没有 `poolKey` 的 `OkRoot`（详情栏批注页）挂载时会 `resetProviderPool()`，销毁正在编辑的编辑器（批注高亮 5 秒内不出现的根因）。

## 命令与结果（原文摘要）

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run plugins/notes packages/editor` | 11 个文件通过、1 个跳过；130 通过、1 跳过（含新增 `comments.test.ts` 引用文字 5 条、`comment-adapter.test.ts` 2 条、`comment-routes.test.ts` 10 条） |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts src/vendor/open-knowledge/app/src/comments` | **22 个文件 / 190 个用例全部通过**（上游非 dom 评论测试，需 Lingui 宏管线与 `test/vendor-setup.ts`） |
| `pnpm --filter @huhu/editor run test:vendor`（全量） | 73 个文件失败 / 165 通过；18 个用例失败 / 4148 通过（失败集合与 S2a 的 73 / 18 相同——core 测试依赖上游仓库布局；本次新增 22 个文件全通过，无回归） |
| `pnpm typecheck` | 全包 Done，无错误 |
| `pnpm --filter @huhu/editor exec tsc -p tsconfig.vendor.json` | 0 错误（含补丁） |
| `pnpm lint` | 通过（oxlint + 5 项 CSS / 颜色 / 规则检查） |
| `pnpm knip` | 通过（`packages/editor` 加 `paths: {"@/*": …}` 后 `@/` 导入可解析；剩余 17 个仅被 vendor 使用的依赖登记在 `ignoreDependencies`） |
| `pnpm build` | 通过 |
| `xvfb-run -a npx playwright test tests/e2e/knowledge tests/e2e/workflows/write-and-restore.spec.ts tests/e2e/shell.spec.ts -g "批注\|S2b\|S4\|D0\|写作与恢复\|紧凑"` | **9 passed (49.1s)**（真实 Electron） |

## 验收对照

| 项 | 证据 | 状态 |
| --- | --- | --- |
| D01 选区 / 整篇 / 属性评论进同一真实存储；取消不留伪线程或高亮 | e2e `comments-s4.spec.ts` D01/D02（Esc 取消后 `Comments/` 0 个文件、无 composer；整篇批注写入 `target: file`）；属性评论：路由 + 引擎单测 `属性批注创建`（`comment-routes.test.ts`、`comments.test.ts`）——**属性面板里的“属性评论”按钮由 S3 的属性区接入，S4 未做 UI 层验证** | 选区 / 整篇 ✓；属性评论 UI 未验证 |
| D02 高亮、线程、回复、解决 / 重开、过滤、删除确认 | e2e D01/D02：高亮 `[data-comment-thread]`、回复、解决（列表隐藏）→ 显示已解决 → 重新打开、删除两步确认、正文不变；对照见 `evidence/parity/comments.md` | ✓（边缘提示 / margin rail 来自上游 `CommentMarginRail`，未单独截图对照） |
| D03 点正文定位线程 / 点线程定位正文；无焦点劫持 | e2e D03：点线程引用 → 正文高亮可见。**点正文高亮定位线程、切标签 / 模式后无遗留浮层**：未单独写用例 | 部分 |
| D04 前插内容 / 格式变化 / 表格 / 链接 / 重复段落；歧义、删除原文显示孤立不吸附 | 引擎单测 5 条（越过加粗 / 链接语法、frontmatter 不命中、重复段落上下文判优、仍并列报错、表格单元格）+ 既有 refind 单测；e2e D03（重复句子第二处锚点正确、前插后跟随、删除后 `state: orphaned` 且正文无高亮） | ✓ |
| D05 发表后异步 flush 期间继续编辑，锚点对应正确缓冲；适配层不用 PM 坐标 | `comment-routes.test.ts`：创建请求不含 start/end，且先 flush；`comment-adapter.test.ts` 断言输入不含 `start/end`；e2e D03：发表后立刻在文首输入，保存后锚点仍在第二处。引用文字在**已保存文本**上解析，期间被删除则报错、不创建 | ✓ |
| D06 重命名 / 移动 / 回收站恢复 / 档案视图不丢评论；任务评论无回归 | e2e D06：重命名后评论仍锚定同一笔记（`documentPath` 同步）；`tasks.comments.*` 与笔记评论无共享代码，既有任务 e2e 本次未重跑（**未验证**）；移动 / 回收站恢复 / 档案视图由引擎既有单测（`moveDocuments`、`syncPath`）覆盖，**无新增 e2e** | 部分 |
| `test:vendor` 评论上游测试入表 | 见 `evidence/parity/comments.md` | ✓ |

## 偏差与未完成

1. 评论编辑（OK 的铅笔）不接：Huhu 的消息是追加式记录；入口换成“标记为已解决”。AI 派发 / 队列 / 发送栏不接（Q2）。登记于 `comment-field-map.md`。
2. 属性评论只存顶层属性键（`path` 固定 `[]`），属性值内引用文字锚点不接；UI 入口等 S3 属性区。
3. 上游 19 个 dom 评论测试（需 jsdom 预加载与 test-support）未迁入，延续 S2a 的“app dom 测试未迁”。
4. `ok-patches.mjs --check` 仍因 S2a 迁入的 core 测试文件未登记而失败（255 个未登记；本次新增的 22 个测试已登记），属 S2a 遗留，S8 前处理。
5. 重命名后详情栏会收起 / 文档需重新点击打开（e2e D06 重新点击 `新名.md`）：这是重命名后的既有表现，非 S4 引入，未处理。
6. 没做：真实输入法、Windows / macOS、`e2e:packaged`、全量 e2e。
