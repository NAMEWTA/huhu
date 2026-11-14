# 07 文件查看器与固定图标（S7）

规格：F01–F06、F10（查看器部分）；设计：[design.md](../design.md) §11；决定：OP-D07 / D08 / D09 / D13。
交付：用户角度——`.json` / `.txt` 可编辑并保存，JSON 有语法高亮与诊断，无效 JSON 不会被清空；`.pdf` 内嵌浏览 / 查找 / 缩放 / 选择；`.html` 整页隔离渲染并可切源码；图片 / 未知文件按分派处理；全应用图标按扩展名固定一致。
依赖：S1（分派、会话 `kind`、`vault.readRange` 契约）。
边界：写 `plugins/notes/src/ui/viewers/`、`plugins/notes/src/vendor/orca/pdf/`、`packages/editor/src/plain/`、`apps/desktop` 的预览协议 / 隔离视图与 `vault.readRange` 的实现；**`FileIcon` 由 S1 交付，这里只消费**；依赖（`pdfjs-dist`、构建插件、补丁）由 S2a 统一引入；`NotesModule` 接线由 S6 负责，S7 提交接线请求。

## 当前代码指针

`plugins/notes/src/ui/FileCard.tsx`（`TEXT_EXT :12-24`、预览 `:73-95`、HTML 源码展示 `:119-133`、`kind:"none"` `:157`）；`packages/kernel/src/capabilities/vault.ts`（`readBinary`、`MAX_READ_BYTES`）；ORCA `components/editor/{PdfViewer,PdfFind,pdf-document-loader,pdf-viewer-session,pdf-view-position,pdf-scale-preference,pdf-js-document-options,pdf-orca-media-range-transport}.ts(x)`、`config/patches/pdfjs-dist@6.3.289.patch`、`config/build-plugins/pdfjs-viewer-assets.ts`、`open-editor-html-preview.ts`（仅借鉴思路）；主进程入口文件：未核实。

## 实施要点

7.1 `dispatch.ts`（design §11.1 的表）；扩展名映射表与 `FileIcon` 共用。
7.2 `PlainTextEditor`（CM6，现成扩展装配）：`.txt` 与 `.json`（高亮 + 诊断；格式化是显式按钮）；编码 / BOM / 换行保留；非 UTF-8 只读 + 显式转换；大文件门槛。
7.3 PDF：摘取 ORCA 最小闭包（不复制 `viewer-zoom-request.ts`），`readPreviewRange` → `vault.readRange`；缩放命令接 Huhu 快捷键；状态 `(vaultId, path, tab)` 隔离；清理 worker / observer / Object URL；加密 / 损坏 / 超限 / 外部修改反馈。
7.4 HTML（**先做 SP-7**）：读 ORCA `doc-preview-protocol.ts` 与 Huhu `huhu-app` 协议处理评估复用；在“`huhu-preview` 协议 + `sandbox="allow-scripts"` iframe”与“独立分区的 `WebContentsView`”间，用 F05 完整安全用例集（含 iframe 自导航、`window.open`、WebRTC、下载、权限请求、CORS 模块脚本、dev / prod 源差异、受保护目录）选一个（OP-D08）；`registerSchemesAsPrivileged` 与现有 `huhu-app` 合并为同一次调用（`apps/desktop/src/main/index.ts:31` 附近）；nonce、路径守卫、CSP、`will-frame-navigate` + `setWindowOpenHandler`；预览 = 已确认缓冲；工具条（预览 / 源码、刷新、在浏览器打开、已拦截计数）。
7.5 图片 / SVG / 未知：沿用现有可用能力并接入分派；`UnknownView` 元信息 + 适用操作。
7.6 图标一致性验收：消费 S1 的共享 `FileIcon`，核对树 / 标签 / `@` / 搜索 / 详情同源、与 pierre sprite 的 lucide 转换同源；补全 S1 未覆盖的扩展名映射（只改映射表）。
7.7 PDF / HTML 对 `vault.readRange` 与协议的权限：与 `vault.readFile` 同级；`exposable:false`。

## 验收

- [ ] F01：JSON / TXT 实际编辑后写回原文件，重开一致；JSON 语法错误不导致内容清空；格式化为显式行为（e2e）。
- [ ] F02：编码异常、大文件、BOM / 换行、外部修改 / 冲突有真实结果，不把未知文件当 UTF-8 自动覆盖（单测 + e2e）。
- [ ] F03：PDF 浏览 / 查找 / 缩放 / 选择；> 10 MiB 样本经 `vault.readRange` 分段读取；加密 / 损坏 / 超限有明确反馈；无空白“假成功”（e2e + 样本）。
- [ ] F04：HTML 的 head / style / body、相对 CSS / 图片、代表性脚本页面真实渲染；源码修改保存后预览更新且不被迟到请求抢占（e2e）。
- [ ] F05：恶意 HTML / 链接无法取得 Node、Engine 凭据、工作台桥接或越界文件；`fetch` / `XHR` / 外部 `import()` / `postMessage` / `top` 导航 / iframe 自导航 / `window.open` / WebRTC / 下载 / 权限请求 / `file://` / 路径穿越 / 符号链接逃逸 / 受保护目录全部被拦（安全用例集）；dev 与 prod 模式各跑一遍。
- [ ] F06：扩展名大小写、无扩展名、未知格式和目录图标稳定；树 / 标签 / `@` / 搜索一致；无在线图标请求（网络断言）。
- [ ] F10（查看器部分）：反复打开 / 关闭 PDF / HTML 200 次后，worker / observer / Object URL / iframe 无持续增长。

## 完成证据

`evidence/s7/`（e2e 与安全用例报告、样本清单、泄漏计数）；`PATCHES.md`（ORCA 目录）；`ledger.md` 的 ORCA 条目。
