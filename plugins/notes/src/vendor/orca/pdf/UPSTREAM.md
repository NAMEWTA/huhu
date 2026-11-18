# ORCA PDF 查看器（摘取）

- 上游：ORCA（Lovecast Inc.），本地副本 `temp/sources/orca`；固定提交 `7041ea022826ec19d627cd3a129b665822e7bf0a`（冻结，不升级）。
- 许可证：MIT，本目录 `LICENSE`（版权行 Copyright (c) 2026 Lovecast Inc.，取自上游 `git show HEAD:LICENSE`；上游工作区的 LICENSE 文件被删除）。
- 范围：`src/renderer/src/components/editor/` 里 PDF 查看器的**会话 / 加载 / 缩放 / 位置**模块（约 0.9k 行）；`PdfViewer.tsx` / `PdfFind.tsx` 的外壳依赖 ORCA 的 Tailwind、store、i18n、快捷键路由，**没有复制**，由 `plugins/notes/src/ui/viewers/PdfView.tsx` 按 Huhu 的组件与 token 重写（保留同一套 PDF.js 事件接线）。
- 同时摘取：`config/patches/pdfjs-dist@6.3.289.patch` → `patches/pdfjs-dist@6.3.289.patch`（pnpm `patchedDependencies`）；`config/build-plugins/pdfjs-viewer-assets.ts` → `apps/desktop/scripts/pdfjs-viewer-assets.ts`（cmaps / standard_fonts / wasm 本地打包，不联网）。
- 不复制：`viewer-zoom-request.ts`、`use-pdf-viewer-find-shortcut.ts`（ORCA 的全局键盘路由）、`pdf-export-error-copy.ts`、编辑器命令所有权上下文。
- 迁入的上游测试：`plugins/notes/test/orca-pdf-{scale-preference,view-position,range-transport}.test.ts`。
