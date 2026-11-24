# HTML 代码块预览

关联 issue #2、矩阵第 93 行。基线为 `closeout/issue2-layout` 的 `212f1cd`。

## 空白原因

上游 Open Knowledge 的 `PreviewFrame` 在 iframe 加载后用 `postMessage` 传入正文。其 `preview-iframe-header.ts` 指向 `BASE_URL + assets/preview-frame.html`，接收脚本来自上游 `packages/app/public/assets/preview-frame.html`。Huhu 的 vendor 闭包未收录上游 public 目录，electron-vite 也从自己的 `apps/desktop/src/renderer` 构建。基线产物缺少 `apps/desktop/out/renderer/assets/preview-frame.html`，桌面工作台 CSP 的 `frame-src huhu-preview:` 还会阻止来自普通工作台资产 URL 的 iframe 导航。基线 Electron 已显示代码块及 iframe，但 12 秒内找不到 iframe 中的 `#hello`。

## 内页和隔离

- 将上游接收脚本纳入显式构建依赖。Web 资源以独立 HTML 发出，浏览器入口按同源父窗口校验消息。桌面主进程从构建产物内提供 `huhu-preview://editor/preview-frame.html`。生产构建的渲染资产也输出带哈希的浏览器内页。
- 静态入口不申请 Vault 授权，由响应的 `frame-ancestors` 限定工作台来源。内页同时验证消息的父窗口、父窗口来源和正文类型。代码块与编辑弹窗沿用同一个 `PreviewFrame`，源文本变化后重新加载内页。
- iframe 继续使用 `sandbox="allow-scripts"`。桌面响应 CSP 与正文的 CSP 共用策略，`connect-src 'none'` 并拒绝外链资源和子框架，保留起始模板需要的内联脚本、样式和嵌入媒体。Electron 额外阻止代码块预览发起的网络请求和自导航。F05 文件预览的随机授权、相对资源与原有文件级 CSP 仍由原处理函数提供。

## 生产端行为

Electron 44.9.1 / Chromium 152.0.7977.167 用真实编辑器插入手写 HTML 和五种起始模板（空白 HTML、图表、指标卡、自定义 SVG、交互控件）。逐份验证 iframe 内文、编辑弹窗中的实时更新、保存后原位更新、Markdown 写盘以及关闭并重开后的内容。图表脚本生成五根柱，交互控件的键盘操作即时改变金额。每轮均确认 iframe 的来源是 `null`，不能读取父文档，也没有 Node 全局或 `huhuHost`。手写样本中的图片和 `fetch` 指向本地监听器，`fetch` 被拒绝，监听器五轮均计到 0。浏览器验证构建另外在 Chromium 158.0.8127.18 上加载了带哈希的内页，得到相同的不透明来源和 0 次探测请求。

## F04 对照

规定的合并命令中 F04 提前退出，随后单独复跑也复现。初次预览的正文、相对 CSS、图片和脚本均已断言通过。失败发生在切回预览后，旧用例在 `expect.poll` 内直接调用 `elementHandle().contentFrame()`，得到 `null` 就抛错，轮询未等待新的子框架挂载完成。

保持生产渲染器和 preload 相同，将 `212f1cd` 版协议会话代码编入临时生产主进程。基线与修复版各运行三次，交替执行。只观察原单次获取是否为空，随后用 Playwright `FrameLocator` 等待并复用 F04 同一组行为断言。基线单次获取有 1/3 为空，修复版有 3/3 为空。两套构建的页面、相对资源、脚本、沙箱、保存及切回预览后的最终内容均为 3/3 通过。F04 原用例需要补上对子框架挂载的等待。F05 两个原用例均通过合并执行和三轮复跑。F04 对照输出（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task04-f04-diagnostic.txt`）
