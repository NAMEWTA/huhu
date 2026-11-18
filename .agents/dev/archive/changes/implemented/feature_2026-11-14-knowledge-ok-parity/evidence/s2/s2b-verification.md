# S2b / S2c 验证记录（2026-11-17，分支 `worktree-agent-ad25a040ec459880c`）

环境：Linux，xvfb-run + Playwright Electron，`pnpm build` 后对 `apps/desktop/out` 运行。多个 worktree 同时跑 e2e 会抢 Electron 单实例锁，已在 e2e 里加 `USER_DATA_ARG`（`tests/e2e/helpers/launch.ts`，每进程独立 userData）。本 worktree 没有 herdr 二进制，终端类用例用 `HUHU_HERDR_BIN=<主检出>/apps/desktop/resources/herdr/linux-x64/herdr-core` 运行。

## 整合点（S2b）

- `tests/e2e/knowledge/editor-s2b.spec.ts`（新增，真实 Electron）：2 passed——打开 → 无编辑停留 2.5 s 磁盘字节与 mtime 不变 → 输入 → 自动保存（frontmatter 保留）→ 输入后立刻切到另一篇磁盘含最后字符 → 源码 / 阅读 / 实时预览来回切 → 源码里输入后富文本跟随 → 撤销；以及“输入后不等自动保存直接关闭应用，退出 flush 落盘”。
- 既有知识库子集（`-g "S2b|笔记|批注|草稿|冲突|外部修改|拖|知识库|ACC-KN"`）：15 passed。`tests/e2e/shell.spec.ts` 全文件：40 passed / 5 skipped / 1 failed（失败的是 herdr 终端用例，带 herdr 二进制重跑通过）。
- `tests/e2e/workflows` + `states.spec.ts`：43 passed / 7 failed；其中 5 个与编辑器相关的已修（阅读区测试标识、`next-themes` 的 `<script>` 注入、Mermaid 选择器、IME 用例、档案双链点击经 hash 翻译）后重跑通过；W-C（SSH）与 Agent CLI 新建菜单为 herdr 缺失，带二进制重跑通过。

## S2c

- tasks（描述输入、评论输入、详情阅读、评论阅读、运行结果）与 inbox（正文阅读）全部改用紧凑 OK 编辑器；`@` 引用补全由 `rich/at-reference.ts`（`editor.registerPlugin`，不改 vendor）实现，插入 wikiLink 节点（序列化为 `[[路径]]`）。`ACC-TK-06` 通过。
- `tests/e2e/knowledge/compact-cost.spec.ts`：通过（含评论输入 → 撤销 → 提交）。
- 发现并修复：OK 的 `editor-cache` 在 mount 数超过 `MAX_CACHE=10` 时会驱逐**仍在屏**的编辑器——30 条评论只剩 9 个编辑器。补丁 P-S2c-01（`mountTiptapEditor` 对 `compact-` 前缀 docName 不缓存，3 行）后 30/30 实例都在。

### Q4 每实例成本（30 个紧凑阅读实例，本机）

| 指标 | 数据 |
| --- | --- |
| 渲染全部 30 条评论 | 约 1.4–1.7 s（三次：1386 / 1598 / 1469 ms） |
| JS 堆增量 | 34–38 MB（约 1.1–1.3 MB / 实例） |
| 判定 | 未设数值预算；评论区 30 条量级可接受，更大列表需要屏幕外延迟挂载（后续优化，不在 S2c 内）。**不回退到 PlainTextEditor + ReadonlyMarkdown**（没有超预算）。 |

## 未达标（如实）

`tests/e2e/perf.spec.ts`（F09 首测）：冷启动 1677 ms ✓、插件启停 ✓、任务列表滚动 ✓、scale-vault 打开 3550 ms ✓；**“打开 1 MiB Markdown 到可编辑 ≤ 500 ms”实测 6566 ms ✗**（大文档默认源码模式，OK 的 CodeMirror + y-codemirror 装载 1 MiB 慢）；**“输入延迟 p95 ≤ 16 ms（5,000 行）”用例 60 s 超时 ✗**（选择器已改到 `.ProseMirror`，实时预览下 5,000 行的 OK 编辑器未达标）。这两项属于 F09，需要 S3 / S8 做专项优化（OK 自己的 `cv-paint-lock` / 大文档策略 / `editor-cache` 的 size gate），S2b 不关闭 F09。

## 其它检查

- `pnpm lint` 全过（含 CSS 守护；`tiptap-editor` / `ProseMirror` 两个第三方类名按规则登记到 `css-class-exceptions.json`）。
- `pnpm typecheck`：各包 Done（后台运行；唯一报错是 `provider-pool.ts` 的 lint，已修）。
- `pnpm test`：748 passed / 2 failed（`@huhu/vault` 原生监听、`@huhu/engine` / `cli` 的增量索引用例）。单独重跑时 cli / engine 通过、`vault/test/watcher.test.ts` 的原生监听用例仍在多 worktree 同机并行时失败——本分支没有改 `packages/vault`，判断为 inotify 资源竞争，**未确认**；需要在单机空载时复核。
- `scripts/ok-patches.mjs --check`：改动 6（含 P-S2c-01）、多余登记 0；“未登记 255”是 S2a 迁入的上游测试文件，不是本次改动。
