# SP-6 运行时闸门（S2a，2026-11-15）——**通过**（harness 级；还不是 Huhu 应用内）

方法：`packages/editor/harness/`（最小页面：`LocalDocProvider` + 上游 `TiptapEditor` / `SourceEditor` + 内存文档源）经 `vite.harness.config.ts` 构建，`packages/editor/test/e2e/sp6.spec.ts`（Playwright `_electron`，真实 Electron 44.9.1）驱动。命令：`pnpm --filter @huhu/editor run build:harness && pnpm exec playwright test -c playwright.vendor.config.ts sp6`。

结果（原文）：`✓ SP-6：打开 / 无编辑不改源文本 / 输入 / 来回切 / 源码模式 / 撤销 (2.2s)`，`PAGE_ERRORS []`。断言覆盖：

1. 打开 A：`.ProseMirror` 渲染，**`Y.Text('source')` 与文件文本逐字节相等**（含 frontmatter、`Second   paragraph with *emphasis*.` 这种会被规范化的写法）——无编辑不改源文本成立；
2. 键入 `TYPED-ONE`：PM → Text 桥把输入写回 `Y.Text`（走 OK 的 server-observers，本地运行）；
3. A → B → A（`editor-cache` park / 重挂载）：B 的文本字节相等；回到 A 输入保留且 `Y.Text` 与切走前一致；
4. 源码模式：CodeMirror 显示同一份文本；在源码里键入 `SRC-TWO`，Text → PM 桥让富文本跟随；
5. 富文本里 `Ctrl+Z` 撤销最近输入；
6. 再打开 12 个文档（> `MAX_CACHE=10`，触发驱逐），回到 A 仍显示 `SRC-TWO`。

阈值：补丁 5 改 / 4 删（≤150 ✔）；Huhu 侧替换约 630 行（≤1200 ✔，见 sp-1.md）。

**发现的问题（已修）**：tiptap 版本浮动（3.34 vs 上游 3.22.3）会让第 3 步抛 `RangeError: Adding different instances of a keyed plugin (reactMobileEnter$)`，见 sp-1.md 发现 2。

**未验证（如实）**：真实输入法 / IME；“无编辑不写盘”在真实 Vault 上（这里没有接保存——保存与冲突是 DocumentSession 的职责，S1 / S2b）；“输入后立刻关闭不丢最后字符”的 flush（会话层，S1）；`LocalDocProvider` 挂入 Huhu 应用后的视觉与布局（harness 页面没有 OK 应用壳的布局，截图 `sp6-harness.png` 只证明样式与字体已应用）；Windows / macOS。
