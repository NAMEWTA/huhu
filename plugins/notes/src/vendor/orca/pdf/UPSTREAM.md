# ORCA PDF 查看器（摘取）

- 上游：ORCA（Lovecast Inc.），本地副本 `temp/sources/orca`；固定提交 `7041ea022826ec19d627cd3a129b665822e7bf0a`（冻结，不升级）。
- 许可证：MIT，本目录 `LICENSE`（版权行 Copyright (c) 2026 Lovecast Inc.，取自上游 `git show HEAD:LICENSE`；上游工作区的 LICENSE 文件被删除）。
- 范围：`src/renderer/src/components/editor/` 里 PDF 查看器的**会话 / 加载 / 缩放 / 位置**模块（约 0.9k 行）；`PdfViewer.tsx` / `PdfFind.tsx` 的外壳依赖 ORCA 的 Tailwind、store、i18n、快捷键路由，**没有复制**，由 `plugins/notes/src/ui/viewers/PdfView.tsx` 按 Huhu 的组件与 token 重写（保留同一套 PDF.js 事件接线）。
- 同时摘取：`config/patches/pdfjs-dist@6.3.289.patch` → `patches/pdfjs-dist@6.3.289.patch`（pnpm `patchedDependencies`）；`config/build-plugins/pdfjs-viewer-assets.ts` → `apps/desktop/scripts/pdfjs-viewer-assets.ts`（cmaps / standard_fonts / wasm 本地打包，不联网）。
- `use-pdf-viewer-find-shortcut.ts` 适配到 Huhu 知识库当前分栏及既有 Find 绑定；查找栏和按钮仍由 Huhu 外壳渲染。
- 2026-11-20 OP-D09 经用户批准采用等价适配，保留 Huhu 的 PDF 外壳和 Vault 分段读取。查找、缩放、计数和高亮使用 ORCA 会话与 PDF.js；同词重开时先订阅再派发，清空或关闭时结束订阅。同步缓存和晚旧回执由 `plugins/notes/test/orca-pdf-find.test.tsx` 覆盖，桌面端在 `tests/e2e/workflows/viewers.spec.ts` 验证前后导航、活动高亮所在文本、关闭后清除高亮和重开。
- 不复制：`viewer-zoom-request.ts`、`pdf-export-error-copy.ts`、编辑器命令所有权上下文。
- 迁入的上游测试：`plugins/notes/test/orca-pdf-{scale-preference,view-position,range-transport}.test.ts`。
