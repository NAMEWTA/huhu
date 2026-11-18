# S3 验证记录（分支 `worktree-agent-a2680725404d11c91`，2026-11-17/18，本机 Xvfb + 真实 Electron）

## F09 性能（`tests/e2e/perf.spec.ts`，实测）

| 指标 | S2b 末（改前） | S3（改后） | 目标 |
| --- | --- | --- | --- |
| 打开 1 MiB Markdown 到可编辑 | 5408–6566 ms | **451 ms**（多次落在 520–630 ms；最差一次 1115 ms 出现在多个 worktree 同时跑 e2e、load average 5–10 时） | ≤ 500 ms |
| 5,000 段文档输入延迟 | 每键 ≈ 1000 ms（用例 60 s 超时） | **p95 13.5–14.6 ms，最大 21 ms**（样本 80） | p95 ≤ 16 ms |

根因与做法（均有证据，见 PATCHES.md 的 P-S3-01～03）：
1. 1 MiB 文档默认已是源码模式（既有 `LARGE_DOC_CHARS`），但 Tiptap 仍被挂载并解析整篇（解析 ≈ 1.4–2.4 s、桥观察者 ≈ 0.5–0.8 s、Tiptap ≈ 1.2 s、CM 又 ≈ 1.1 s）。改为源码优先：只装载 `Y.Text`，富文本表示延后到切换时。
2. 每次按键同步跑整篇 PM→Markdown 序列化：上游这套桥在服务端进程，本地在主线程。改为自适应推迟结算（小文档不变），出口先 `settleNow()`。
3. 上游给每个顶层块建 `Decoration.node`（5000 个）：改 CSS 子选择器，装饰只留例外块与选区块。

另：NotesModule 出现时预载编辑器块。
**未做**：把桥放进 Web Worker（上游服务端 / 客户端分离的真正等价物）——会让推迟结算的窗口消失，但 flush 需要异步握手，复杂度高，登记为后续优化。

## e2e（真实 Electron，原文结果）

- `tests/e2e/knowledge`：**11 passed**（compact-cost、editor-s2b ×2、editor-s3-large ×2、editor-s3-menus、editor-s3-properties ×2、editor-s3-toolbar ×3）。
- `tests/e2e/shell.spec.ts tests/e2e/workflows -g "笔记|批注|草稿|冲突|知识库|外部修改"`：**26 passed**。
- `pnpm lint`、`pnpm typecheck`（全部包）、`pnpm knip`：通过；`vitest run packages/editor plugins/notes plugins/tasks`：198 passed / 1 skipped。
- 未经 `audit` 子代理（fork 不能派生子代理）；最终集成时需让 `audit` 重跑。

## 复刻矩阵项的验证（对应 parity-matrix.md）

- B03/B04 `/` 菜单：过滤（“/无序”）→ Enter 插入列表；Esc 关闭；列出 36 项（含 Mermaid / Excalidraw / Chart 等 OK 组件）。e2e 只覆盖前一组；组件类项的逐项行为**未逐个验证**。
- B05：气泡菜单出现 + 加粗（Ctrl+B）落盘为 `**…**`；一次 Ctrl+Z 只回退加粗、列表保留。
- B08：输入后立刻切文件 / 切源码，最后一个字符不丢（大文档与小文档各一条）。
- C01–C05：属性面板显示；只改属性保留正文与其它键；只改正文保留 frontmatter；未保存正文时改属性落同一文件；**前导零文本 `007` 原样保留**（修了上游行为，P-S3-04，另有 5 条单测）；坏 YAML 打开不改写、源码里原文保留。**未做**：坏 YAML 在面板里的诊断文案与“修复入口”的断言（面板渲染了，没有逐字核对）。
- F07：窗口 1440 / 1100 / 900 px、超长中文标题：工具栏单行（高度 < 64 px）、不溢出、核心按钮可达。**未做**：800 / 480 px 与 125–200% 缩放（窗口 < 900 px 时壳层另有收纳规则，未测）。

## 偏差与发现

- S7 的 `TEXT_LIMIT = 1 MiB`（ACC-KN-10）被应用到了 Markdown 笔记，会让 ≥ 1 MiB 的笔记打不开；改为 Markdown 用 `NOTE_LIMIT = 16 MiB`，非 Markdown 文本仍 1 MiB（`viewers/dispatch.ts` + 单测）。
- OK 的文件树对 > 512 KiB 的文档给 `large-file` 导航目标，S5 的宿主没映射，点击无反应；已映射为普通打开（`host/explorer.tsx`，登记 P-S3-05）。
- 工具栏合并为一行（撤销 / 重做 / 导出在容器 ≤ 640 px 时收起，CSS 容器查询）；旧的 ≤ 1100 px 换行规则已删。
- 顶部属性面板接入 `RichMarkdownEditor`（document 变体默认开，read 模式隐藏）。
- 选区 / 上下行 / IME（B06/B07）：**未做对照**——没有在 rc.4 上复现用户报告的问题（S0 未完成），新编辑器上的并排对照未做；B06 保持开放。
- 复刻矩阵“待定”12 项与 Q10（分屏 / pane）未处理。
