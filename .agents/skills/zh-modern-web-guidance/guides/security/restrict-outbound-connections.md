<a id="restrict-outbound-network-connections-with-connection-allowlists"></a>
# 使用连接白名单限制出站网络连接

`Connection-Allowlist` HTTP 响应标头将文档或 worker 的通信目标限制为明确列出的网络端点。内容安全策略（CSP）要求分别维护各资源的指令（`connect-src`、`img-src`、`script-src`、`font-src`、`form-action`），且不管理 `<link rel="dns-prefetch">`、`<link rel="preconnect">` 或 WebRTC 等推测式或非 Fetch 网络通道；`Connection-Allowlist` 则通过单一的网络层白名单，约束上下文发起的**全部**出站连接，包括 `fetch()`、`XMLHttpRequest`、子资源、`navigator.sendBeacon()`、`<a ping>`、顶层与框架导航、资源提示、推测规则、`WebSocket`、`WebTransport` 和 WebRTC。

<a id="how-to-implement"></a>
## 实现方法

1. **将白名单序列化为 RFC 9651 内部列表 `(...)`**：将 `Connection-Allowlist` 或 `Connection-Allowlist-Report-Only` 格式化为单个带圆括号的列表，各项以空格分隔。包含不加引号的令牌 `response-origin`，允许访问文档或 worker 自己的源；随后为该上下文连接或导航到的每个合法外部端点添加带双引号的 `URLPattern` 字符串，包括 API、图片或字体 CDN，以及外部 `<a href>`、`<form action>`、OAuth 或支付重定向目标。根据配置或 `URL` 对象动态构造模式时，将 `ws:`/`wss:` 规范化为 `http:`/`https:`，并去掉仅包含源的 URL 末尾的斜杠，因为 `new URL('https://api.example.com').href` 会补上 `/`，导致 `URLPattern` 仅匹配根路径 `/`。
2. **通过 `Sec-Fetch-Dest` 限定中间件范围，并覆盖 worker**：浏览器仅在文档或导航响应及 worker 脚本响应中识别 `Connection-Allowlist`，对应的 `Sec-Fetch-Dest` 值为 `document`、`iframe`、`worker`、`sharedworker` 和 `serviceworker`。根据 `Sec-Fetch-Dest` 改变标头时，包含 `Vary: Sec-Fetch-Dest`，避免共享缓存提供缺少该标头的响应。为 Dedicated Worker 和 Shared Worker 脚本提供匹配的白名单，防止被攻陷的页面脚本通过 `worker.postMessage()` 外传数据。由于 Service Worker 会在缓存未命中和导航预加载时自行发起网络请求，其 `Connection-Allowlist` 应配置为它所控制的所有文档白名单的**超集**。
3. **始终配置违规报告（`Reporting-Endpoints` 和 `report-to`），并支持分阶段或双策略上线**：定义 `Reporting-Endpoints` 标头，并在每个 `Connection-Allowlist` 或 `Connection-Allowlist-Report-Only` 策略的结束 `)` 后追加不带引号的 `; report-to=<endpoint-name>` 参数，使被阻止的连接尝试可被观测。初次上线时可以仅发送 `Connection-Allowlist-Report-Only`；也可在同一响应中**同时**发送 `Connection-Allowlist`，用于强制实施基础白名单，和 `Connection-Allowlist-Report-Only`，用于审计更严格的候选白名单。违规报告包含 `"type": "connection-allowlist"`，正文为 `{ url, connection, allowlist, disposition }`；其中 `connection` 是被阻止的目标 URL 或 `"webrtc"`，`disposition` 为 `"enforce"` 或 `"report"`。
4. **考虑默认的重定向和 WebRTC 阻止行为，并处理客户端错误**：默认情况下，`Connection-Allowlist` 会阻止所有 `3xx` HTTP 重定向（`redirects=block`，即使是在白名单内或同源 URL 之间重定向），以及所有 `RTCPeerConnection` 流量（`webrtc=block`）。只有在可信端点需要服务器端重定向时，才追加 `; redirects=allow`，且初始请求仍须匹配白名单；需要 WebRTC 时才追加 `; webrtc=allow`。客户端应使用 `try...catch` 包裹出站 `fetch()` 调用，并处理 `WebSocket` 的 `error` 事件，让因 `TypeError`（`net::ERR_NETWORK_ACCESS_REVOKED`）而被拒绝的请求进入已处理的错误状态并更新界面状态，而不是产生未处理的拒绝。

<a id="example-code"></a>
## 示例代码

```http
Vary: Sec-Fetch-Dest
Reporting-Endpoints: conn-reports="https://app.example.com/api/security-reports"
Connection-Allowlist: (response-origin "https://api.example.com" "https://realtime.example.com" "https://*.cdn.example.com/*"); report-to=conn-reports
Connection-Allowlist-Report-Only: (response-origin "https://api.example.com/v2/*"); report-to=conn-reports
```

```javascript
const ALLOWLIST_DESTS = new Set(['document', 'iframe', 'worker', 'sharedworker', 'serviceworker']);

// Normalize a config URL or URLPattern string for Connection-Allowlist:
// - Rewrites ws:// and wss:// to http:// and https:// (WebSocket matching rule).
// - Strips a bare trailing slash on origin-only URLs (e.g. from new URL(...).href)
//   so all subpaths on the origin are permitted instead of only "/".
export function normalizeAllowlistPattern(rawPattern) {
  const trimmed = String(rawPattern).trim().replace(/^ws(s?):\/\//i, 'http$1://');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Pattern must include an http:// or https:// scheme: ${rawPattern}`);
  }
  if (/[\s,]/.test(trimmed)) {
    throw new Error(`Pattern must be a single URLPattern without spaces or commas: ${rawPattern}`);
  }
  if (/[()]/.test(trimmed)) {
    throw new Error(`Custom regex groups are rejected by Connection-Allowlist: ${rawPattern}`);
  }
  return trimmed.replace(/^(https?:\/\/[^/?#]+)\/$/i, '$1');
}

// Build an RFC 9651 Inner List value for Connection-Allowlist or Connection-Allowlist-Report-Only.
export function buildConnectionAllowlistHeader({
  allowSelf = true,
  patterns = [],
  reportTo,
  redirects = 'block',
  webrtc = 'block',
} = {}) {
  const items = allowSelf ? ['response-origin'] : [];
  for (const pattern of patterns) {
    const raw = String(pattern).trim();
    if (raw === 'response-origin') {
      if (!items.includes('response-origin')) items.push('response-origin');
      continue;
    }
    const normalized = normalizeAllowlistPattern(raw);
    items.push(`"${normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  let header = `(${items.join(' ')})`;
  if (redirects === 'allow') header += '; redirects=allow';
  if (webrtc === 'allow') header += '; webrtc=allow';
  if (reportTo) {
    const endpointToken = String(reportTo).trim().replace(/^"+|"+$/g, '');
    header += `; report-to=${endpointToken}`;
  }
  return header;
}

// Server or middleware helper applying Connection-Allowlist and Reporting-Endpoints
// on document and worker responses.
export function setConnectionAllowlistHeaders(res, options = {}) {
  const {
    secFetchDest = 'document',
    patterns = ['https://api.example.com', 'https://realtime.example.com', 'https://*.cdn.example.com/*'],
    reportOnlyPatterns,
    reportEndpointName = 'conn-reports',
    reportEndpointUrl = 'https://app.example.com/api/security-reports',
    redirects = 'block',
    webrtc = 'block',
    reportOnly = false,
  } = options;

  const setHeader = (name, value) =>
    typeof res.setHeader === 'function' ? res.setHeader(name, value) : res.headers.set(name, value);

  if (typeof res.appendHeader === 'function') {
    res.appendHeader('Vary', 'Sec-Fetch-Dest');
  } else if (typeof res.headers?.append === 'function') {
    res.headers.append('Vary', 'Sec-Fetch-Dest');
  } else {
    setHeader('Vary', 'Sec-Fetch-Dest');
  }
  if (secFetchDest && !ALLOWLIST_DESTS.has(String(secFetchDest).toLowerCase())) return;

  setHeader('Reporting-Endpoints', `${reportEndpointName}="${reportEndpointUrl}"`);
  setHeader(
    reportOnly ? 'Connection-Allowlist-Report-Only' : 'Connection-Allowlist',
    buildConnectionAllowlistHeader({ allowSelf: true, patterns, reportTo: reportEndpointName, redirects, webrtc }),
  );

  if (!reportOnly && Array.isArray(reportOnlyPatterns)) {
    setHeader(
      'Connection-Allowlist-Report-Only',
      buildConnectionAllowlistHeader({
        allowSelf: true,
        patterns: reportOnlyPatterns,
        reportTo: reportEndpointName,
        redirects,
        webrtc,
      }),
    );
  }
}

// Client-side helper that catches blocked outbound requests gracefully without unhandled rejections.
export async function fetchWithPolicyHandling(url, { statusElement, ...fetchOptions } = {}) {
  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (statusElement) {
      statusElement.textContent = `Allowed: Loaded ${url} (${body.length} bytes).`;
    }
    return { ok: true, body, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (statusElement) {
      statusElement.textContent = `Blocked: Request to ${url} was rejected by the outbound connection policy (${message}).`;
    }
    return { ok: false, body: null, error };
  }
}
```

<a id="best-practices"></a>
## 最佳实践

- **应当**将 `Connection-Allowlist` 格式化为单个 RFC 9651 内部列表 `(...)`，各项以空格分隔。如果非空的 `Connection-Allowlist` 标头未通过顶层结构化字段解析，例如省略 `(...)` 或使用单引号 `'...'`，浏览器会以空白名单采用封闭式失败，并阻止**所有**出站网络连接。如果你确实想在加载后撤销全部网络访问，使用 `Connection-Allowlist: ()`；本地协议 `data:`、`blob:`、`about:` 和 `filesystem:` 仍被允许。
- **应当**省略覆盖整个源的 URL 模式末尾的斜杠（`"https://api.example.com"`），或使用显式通配符（`"https://api.example.com/*"`），以允许 `/v1/users` 等子路径。序列化模式前，去掉 `new URL(origin).href` 添加的末尾斜杠。
- **应当**在 `Connection-Allowlist` 中使用 `"http://..."` 和 `"https://..."` 模式，将 `WebSocket`（`ws://` 和 `wss://`）端点加入白名单，因为浏览器会在匹配前将 WebSocket 协议规范化为 HTTP/HTTPS。
- **应当**将预期的外部导航目标（`<a href>`、`<form action>`、OAuth/SSO 提供方、支付结账页）加入受限文档的白名单；并记住，默认的 `redirects=block` 甚至会阻止同源 `3xx` 重定向，除非指定 `; redirects=allow`。
- **不要**为 `response-origin` 或内部列表参数值（`; report-to=conn-reports`、`; redirects=allow`、`; webrtc=allow`）加引号，也不要在 `(...)` 内用逗号分隔各项。
- **不要**在 URL 模式中使用 `(\d+)` 等自定义正则表达式分组，或 `"/api/*"` 等相对路径；浏览器的网络服务解析器会拒绝正则分组，以及缺少协议和主机名的模式。
- **不要**在生产环境中依赖实验性的 `<iframe connectionAllowlist="...">` 属性或 `Allow-Connection-Allowlist-From` 嵌入式强制执行标头，因为正式发布的浏览器尚未默认启用嵌入式强制执行。

<a id="fallback-strategy"></a>
## 回退策略

连接白名单的浏览器支持情况：支持有限。
支持的浏览器：Chrome 152（2026 年 8 月）和 Edge 152（2026 年 8 月）。
不支持的浏览器：Firefox 和 Safari。

由于 `Connection-Allowlist` 通过 HTTP 响应标头在浏览器网络层强制实施，无法用客户端 JavaScript 为其提供 polyfill。如果你的 Baseline 目标包含尚不支持 `Connection-Allowlist` 的浏览器，应**同时使用 `Connection-Allowlist` 与 `Content-Security-Policy`（CSP）标头**；如果无法配置 HTTP 响应标头，则使用 `<meta http-equiv="Content-Security-Policy">` 元素对文档级 fetch 和子资源实施限制。

- **叠加的纵深防御**：支持此功能的浏览器会同时实施两种策略。`Connection-Allowlist` 阻止 CSP 未覆盖的数据外传通道（`dns-prefetch`、`preconnect`、WebRTC 和重定向），而 CSP 在不支持 `Connection-Allowlist` 的浏览器中限制 `fetch()`、子资源和 `<form action>` 导航。
- **显式覆盖 `form-action` 和 `worker-src`**：在 CSP 中，`default-src` **不会**作为 `<form action>` 提交的回退指令，因此始终显式包含 `form-action`。同时包含 `worker-src 'self'`，且排除 `blob:`，防止受限页面创建 `blob:` SharedWorker 来绕过文档级限制。
- **将允许的源映射到各资源的 CSP 指令**：`Connection-Allowlist` 使用单个端点列表且不管理内联标记；CSP 的 `default-src 'self'` 则限制各类资源（`connect-src`、`img-src`、`style-src`、`font-src`、`script-src`），并阻止内联 `<style>` 和 `<script>` 块，除非通过哈希或 nonce 授权。
- **在 CSP `connect-src` 中包含 `wss://`**：虽然 `Connection-Allowlist` 将 `wss://` 连接与 `"https://..."` 模式匹配，但在跨浏览器环境中使用 WebSocket 时，应在 CSP `connect-src` 中显式列出 `wss://` 源。

```http
Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.example.com https://realtime.example.com wss://realtime.example.com; img-src 'self' https://*.cdn.example.com data: blob:; form-action 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; report-to conn-reports
```

```html
<!-- Document-level fallback when HTTP response headers cannot be set on static hosting -->
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; connect-src 'self' https://api.example.com https://realtime.example.com wss://realtime.example.com; img-src 'self' https://*.cdn.example.com data: blob:; form-action 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'"
/>
```
