# ORCA PDF 摘取补丁登记

每个与上游不同的文件一行。基线：摘取 9 个模块，改动 5 个，新增 1 个（`pdf-range-transport.ts` 取代上游 `pdf-orca-media-range-transport.ts`），不复制 2 个。

- P-S7-01 `pdf-range-transport.ts`（上游 `pdf-orca-media-range-transport.ts`）：`window.api.fs.readPreviewRange({url, offset, length})`（orca-media 的 IPC）改成注入的 `PdfRangeReader(offset, length)`；Huhu 侧由 `PdfView` 绑定到 `vault.readRange`（单次 ≤ 4 MiB）。函数名 `createOrcaMediaRangeTransport` → `createRangeTransport`；读循环、取消、短读与“提前结束”处理原样保留。
- P-S7-02 `pdf-document-loader.ts`：文档源从 `{url, length?}` 改为 `{read, length}`；`translate(...)` 调用换成中文常量（Huhu 的 i18n 方案不同）；其余加载 / 销毁 / 失败收敛逻辑原样。
- P-S7-03 `pdf-js-document-options.ts`：`MAX_FILE_RANGE_READ_BYTES` 来自 ORCA 的 shared 目录，改为本地常量 `PDF_RANGE_CHUNK_SIZE = 256 KiB`（同值）。
- P-S7-04 `pdf-scale-preference-storage.ts`：合并 ORCA 的 `file-view-preference-storage.ts` 读写部分；存储键前缀 `orca.` → `huhu.`；偏好键由 `{worktreeId,…}` 改为 `{vaultId, filePath}`。
- P-S7-05 `scroll-cache.ts`（来自 ORCA `lib/scroll-cache.ts`）：只保留 `setWithLRU`、`PdfViewPosition`、`pdfViewPositionCache`；`zoom-wheel.ts`（来自 `image-viewer-zoom.ts`）只保留滚轮缩放换算。
- 原样（仅文件头注释）：`pdf-scale-preference.ts`（导入路径 `./image-viewer-zoom` → `./zoom-wheel`）、`pdf-view-position.ts`（导入路径）、`pdf-viewer-session.ts`（导入路径）。
- 依赖补丁：`patches/pdfjs-dist@6.3.289.patch`（84 行，原样），登记在 `pnpm-workspace.yaml` 的 `patchedDependencies`。

## 版本说明
`pdfjs-dist` 在工作区里有两个版本：`6.3.289`（本目录，`plugins/notes`，带 ORCA 补丁）与 `6.2.108`（OK 编辑器的 PDF 嵌入块，`packages/editor`，OK 锁文件的版本）。合并为一个需要同时验证 OK 的嵌入块，记入 S8 的依赖清理。
