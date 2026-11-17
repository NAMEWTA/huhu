# SP-7 HTML 预览隔离方案（2026-11-17）

## 结论

**选方案 (a)**：渲染进程 `<iframe sandbox="allow-scripts">` + 主进程 `huhu-preview` 协议。方案 (b)（独立 `WebContentsView`）没有实现，所以没有“两个候选都跑 F05”的对照数据；选择理由如下，是设计判断，不是实测对比。

## 先读了什么

- ORCA `src/main/browser/document-preview/doc-preview-protocol.ts`：独立 scheme + 独立 session 分区 + `webRequest.onBeforeRequest` 白名单 + 响应 CSP；注释里两条与我们相关：**Electron 43 的 DNS prefetch 绕过 request 钩子**、**Electron 43 忽略 WebRTC 的 CSP，要靠 IP 处理策略**。它的承载是浏览器标签页（guest webview），不可复制到 Huhu 的文档区。借鉴：协议 + CSP + 授权表 + 失败通知。
- Huhu `apps/desktop/src/main/index.ts`：`huhu-app` 协议只有一次 `registerSchemesAsPrivileged`（现与 `huhu-preview` 合并）；主窗口 `sandbox:true / contextIsolation:true`；渲染进程 CSP 是 `<meta>`。

## 为什么 (a)

1. 预览在文档区里，要和对话框 / 菜单 / 标签条叠放；`WebContentsView` 是原生视图，永远盖在 DOM 之上，需要在每次布局 / 切标签 / 弹层时同步 bounds 与显隐。iframe 没有这些问题。
2. F04/F05 都能在渲染层用 Playwright 直接进入 iframe 取证（`page.frameLocator`），(b) 需要另一套取证路径。
3. 安全性靠这几层叠加，每层都有对应测试：sandbox 属性（无 same-origin / top-navigation / popups / downloads / forms / modals）→ 响应 CSP（`default-src 'none'`、`connect-src 'none'`、`form-action 'none'`、`frame-src 'none'`、`frame-ancestors <工作台来源>`）→ 路径守卫（realpath、受保护目录、符号链接）→ 主进程会话钩子（`webRequest` 拦非 `huhu-preview:` 请求、权限请求/检查拒绝、`will-download` 取消、`will-frame-navigate` 拦预览框架的外部导航、`setWebRTCIPHandlingPolicy("disable_non_proxied_udp")`）。

## 实际实现

- 纯逻辑：`apps/desktop/src/main/preview-protocol.ts`（路径守卫、授权表 `PreviewGrants`、CSP、`handlePreviewRequest`）。单测 `apps/desktop/test/preview-protocol.test.ts`（12 条）。
- Electron 接线：`preview-session.ts`；`index.ts` 合并 scheme、创建控制器、窗口硬化、Vault 切换/关闭时 `revokeAll`。
- URL 模型：`huhu-preview://<nonce>/<Vault 相对路径>`（URL 根 = Vault 根，页面里的 `../` 自然留在 Vault 内）；nonce 16 字节随机，一次一页，标签关闭 / 换文件 / 保存后重新签发时撤销，授权表上限 200。
- 渲染进程：`ui/viewers/HtmlPreview.tsx`（预览 / 源码切换；切到预览前先 `session.flush()`；保存后 `baseVersion` 变化触发重新签发；迟到的签发结果立即撤销；“已拦截 N 次”来自主进程事件）。

## 发现并修复的既有问题

主窗口的 `did-fail-load` 处理对**子框架**失败也加载错误页：预览 iframe 里被拦截的外部导航（`ERR_BLOCKED_BY_CSP`）会把**整个工作台**换成“HUHU 无法加载界面”。已改为只处理主框架（`isMainFrame`）。回归用例：`viewers.spec.ts` 的“iframe 自导航到外部 URL”。

## 未验证 / 残余风险（如实）

- **DNS prefetch / preconnect**：`<link rel="dns-prefetch|preconnect" href="//attacker.example">` 可经 DNS 泄露主机名；ORCA 注释确认 request 钩子拦不到，CSP 也没有对应指令。本实现**没有**缓解也**没有**验证（沙箱里无法观察 DNS）。
- **dev 模式**（electron-vite 渲染进程开发服务器）在当前基线上无法端到端运行：① `packages/contracts/src/ids.ts` 的 `node:crypto` 被 Vite 外部化，工作台白屏；② Engine 的 CORS 只放行 `huhu-app://workbench`（`packages/kernel/src/server/ingress.ts` 的 `RENDERER_ORIGIN`）。两者与 S7 无关。dev 来源只影响 `frame-ancestors`，由单测覆盖该字符串；iframe 在 http 来源下的嵌入未实测。
- 预览与工作台共用默认 session（未用独立分区）。预览文档是 opaque origin（没有 allow-same-origin），不能访问工作台的 cookie / storage，但它请求的 `huhu-preview` 响应与工作台同一缓存 / 网络栈。
- Windows / macOS 与真实输入法未验证。
