<a id="local-network-access"></a>
# 本地网络访问

当由 `public` 源或内网 `local` 源提供的 Web 应用，连接用户的私有本地网络（例如位于 `192.168.1.x` 或 `device.local` 的局域网打印机、物联网集线器或路由器），或连接用户机器上运行的本地配套服务（`127.0.0.1`、`[::1]` 或 `localhost`）时，浏览器会通过**本地网络访问（LNA）**权限提示控制连接。

本地网络访问根据 IP 地址空间的层级关系（`public` → `local` → `loopback`），将访问分为两种细粒度权限及 `Permissions-Policy` 令牌，**仅在**请求从*私密程度较低*的地址空间跨入*私密程度较高*的地址空间时进行检查：
- **`local-network`**：从 `public` 源连接 `local` 地址空间时需要此权限，包括 RFC 1918 私有 IPv4 范围 `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`，链路本地范围 `169.254.0.0/16` / `fe80::/10`，IPv6 唯一本地地址 `fc00::/7`，以及 `.local` mDNS 主机名。
- **`loopback-network`**：从 `public` 或 `local` 源连接 `loopback` 地址空间（`127.0.0.0/8`、`::1/128` 或 `localhost`）时需要此权限。

由于 `localhost`（`127.0.0.1` 和 `[::1]`）已经位于私密程度最高的 `loopback` 地址空间，本地开发期间从 `http://localhost` 提供 Web 应用，默认**不会**触发 LNA 检查。若要在不部署至公共服务器的情况下本地测试 LNA 提示和权限状态，可以使用 Chromium 参数 `--ip-address-space-overrides=127.0.0.1:8080=public,[::1]:8080=public`，将本地开发服务器的 IPv4 和 IPv6 地址空间覆盖为 `public`；也可以在浏览器的**网站设置**中，手动将 **Local network（本地网络）**和 **Loopback network（回环网络）**在 `Ask`、`Allow`、`Block`（询问、允许、阻止）之间切换。

**强制要求：**任何发起本地网络或回环网络请求的 Web 应用，都必须从**安全上下文（`https://`）**提供。在不安全的 `http://` 顶层上下文中，本地网络访问权限会被自动拒绝。

**不要**依赖已弃用的私有网络访问（PNA）预检标头（`Access-Control-Request-Private-Network: true` / `Access-Control-Allow-Private-Network: true`）。本地网络访问通过客户端用户权限提示（`local-network` 和 `loopback-network`）实施访问控制，读取跨源响应时再配合标准 CORS 标头（`Access-Control-Allow-Origin`）。PNA 预检从未作为阻断性要求强制实施，也不需要作为回退手段。已经返回 `Access-Control-Allow-Private-Network: true` 的现有服务器或设备固件可以继续保留它，不会造成问题，但新代码不应再添加 PNA 处理。

<a id="implementation-steps"></a>
## 实施步骤

<a id="1-pre-check-granular-permission-state-and-gate-on-user-gesture"></a>
### 1. 预先检查细粒度权限状态，并由用户手势触发

当权限状态为 `'prompt'` 时，绝不要在页面加载（`DOMContentLoaded`）时无条件发起本地网络或回环请求，也绝不要从 **Service Worker** 或 **Shared Worker** 发起第一次会触发权限提示的请求；它们没有关联的 `Document`，如果权限尚未为 `'granted'`，请求会立即失败。

应先调用 `navigator.permissions.query()`，查询 `'local-network'` 或 `'loopback-network'`：
- 如果 `state === 'granted'`，自动连接。
- 如果 `state === 'prompt'`，显示清晰的界面，解释应用为何需要访问本地设备或配套应用，并通过明确的用户手势（例如点击按钮）触发请求。
- 如果 `state === 'denied'`，显示可操作的修复提示，说明如何在浏览器网站设置中重新启用本地网络或回环访问。

```javascript
/**
 * Queries the granular Local Network Access permission for the target space.
 * @param {'local-network' | 'loopback-network'} permissionName
 */
export async function checkNetworkPermission(permissionName) {
  const status = await navigator.permissions.query({ name: permissionName });

  // Keep UI synchronized if the user changes permission in browser site settings
  status.addEventListener('change', () => {
    updatePermissionUI(permissionName, status.state);
  });

  updatePermissionUI(permissionName, status.state);
  return status.state;
}

function updatePermissionUI(permissionName, state) {
  const statusBadge = document.querySelector(`[data-permission-status="${permissionName}"]`);
  const remediationBox = document.querySelector(`[data-remediation="${permissionName}"]`);
  if (statusBadge) {
    statusBadge.textContent = state;
  }
  if (remediationBox) {
    // Show remediation instructions whenever permission is explicitly denied
    remediationBox.hidden = state !== 'denied';
  }
}
```

<a id="2-declare-targetaddressspace-in-fetch-and-request"></a>
### 2. 在 `fetch()` 和 `Request` 中声明 `targetAddressSpace`

当 `https://` 页面请求本地网络或回环接口上的 `http://` 端点时，在 `fetch()` 或 `Request` 选项中指定 `targetAddressSpace: 'local'` 或 `targetAddressSpace: 'loopback'`。

显式设置 `targetAddressSpace` 有两个关键作用：
1. **豁免混合内容检查**：混合内容检查在 DNS 解析*之前*运行。声明 `targetAddressSpace: 'local'` 或 `'loopback'`，会在 DNS 解析前告知浏览器，该 `http://` URL 指向本地或回环端点，包括解析为本地 IP 的自定义 DNS 主机名，因此在用户授权后，应豁免混合内容阻止。
2. **验证地址空间**：DNS 解析后，浏览器会验证解析出的 IP 地址确实属于声明的 `targetAddressSpace`。如果设置了 `targetAddressSpace: 'local'` 的主机名意外解析为 `public` IP 地址，浏览器会立即以 `TypeError` 网络错误中止请求。

```javascript
/**
 * Connects to a local network device (e.g., LAN printer or IoT hub) over HTTP.
 * Example endpoint URL is illustrative; replace with your device's address.
 */
export async function fetchLocalDeviceStatus(deviceUrl = 'http://192.168.1.100:8080/api/status') {
  const request = new Request(deviceUrl, {
    method: 'GET',
    mode: 'cors',
    // MANDATORY: Declare 'local' when targeting RFC 1918 / .local LAN addresses
    targetAddressSpace: 'local',
  });

  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`Device responded with HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Connects to a local companion daemon running on the user's loopback interface.
 * Example loopback port is illustrative; replace with your service's port.
 */
export async function fetchLoopbackDaemon(daemonUrl = 'http://127.0.0.1:45678/health') {
  const request = new Request(daemonUrl, {
    method: 'GET',
    mode: 'cors',
    // MANDATORY: Declare 'loopback' when targeting 127.0.0.1, [::1], or localhost
    targetAddressSpace: 'loopback',
  });

  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`Companion app responded with HTTP ${response.status}`);
  }
  return response.json();
}
```

<a id="3-real-time-connections-with-websocket-and-webtransport"></a>
### 3. 使用 `WebSocket` 和 `WebTransport` 建立实时连接

本地网络访问限制同样适用于 `WebSocket` 和 `WebTransport` 连接：

- **`WebSocket`**：`WebSocket(url, protocols)` 构造函数的第二个参数只接受子协议字符串或数组，**不要**传入 `{ targetAddressSpace }` 选项对象，否则会抛出 `SyntaxError`。浏览器会在 DNS 解析之前检查 `WebSocket` URL：当 URL 的主机在语法上可识别为本地或回环地址时，从 `https://` 页面发起的 `ws://` 连接可豁免混合内容阻止，并受 `local-network` 或 `loopback-network` 权限提示控制。这些主机具体包括私有或回环 IP 字面量（`ws://192.168.1.100:8080`、`ws://127.0.0.1:8080`、`ws://[::1]:8080`）、`localhost`（`*.localhost`），以及 `.local` mDNS 主机名（`ws://device.local:8080`）。如果本地端点使用自定义的非 `.local` DNS 主机名寻址，应通过 `wss://` 连接。
- **`WebTransport`**：由于 `WebTransport` 严格要求 `https://`，即通过 QUIC 和 TLS 使用 HTTP/3，或对本地自签名证书使用 `serverCertificateHashes`，它不会触发混合内容阻止，也不接受 `targetAddressSpace` 选项。浏览器会自动验证解析后的 IP 地址空间，并通过 `local-network` 或 `loopback-network` 权限提示控制 `transport.ready` promise。

```javascript
/**
 * Opens a WebSocket connection to a local network device (IP literal, .local, or localhost).
 */
export function openLocalWebSocket(wsUrl = 'ws://192.168.1.100:8080/stream') {
  // Pass only subprotocol string(s) as the second argument (never an options object).
  // Browsers exempt ws:// from Mixed Content when the host is a local/loopback IP literal,
  // .local, or localhost, and gate the connection on 'local-network' or 'loopback-network'.
  const socket = new WebSocket(wsUrl, ['v1.telemetry']);
  return socket;
}

/**
 * Opens a WebTransport session to a local network endpoint using a pinned self-signed certificate hash.
 */
export async function openLocalWebTransport(wtUrl = 'https://192.168.1.100:4433/wt', certSha256Bytes) {
  const transport = new WebTransport(wtUrl, {
    serverCertificateHashes: [
      {
        algorithm: 'sha-256',
        value: certSha256Bytes,
      },
    ],
  });

  // transport.ready resolves only after the user grants the 'local-network' permission
  // and rejects with WebTransportError if the permission is denied.
  await transport.ready;
  return transport;
}
```

<a id="4-delegate-access-to-cross-origin-iframes-via-permissions-policy"></a>
### 4. 通过 `Permissions-Policy` 向跨源 iframe 委派访问权限

默认情况下，`local-network` 和 `loopback-network` 的白名单为 `'self'`，会阻止跨源 `<iframe>` 嵌入内容发起本地或回环请求。要允许嵌入的跨源 `<iframe>`，例如硬件设置组件或与本地代理通信的 SSO 框架，发起本地或回环请求，应通过 `allow` 属性和/或 HTTP `Permissions-Policy` 标头，显式委派细粒度权限：

```html
<!-- Delegate granular local-network and loopback-network permissions to the embedded iframe -->
<iframe
  src="https://setup.partner.example.com/device-bridge"
  allow="local-network; loopback-network"
  title="Local Device Bridge">
</iframe>
```

在**顶层嵌入文档**的响应中发送 `Permissions-Policy` 标头，而不是在 iframe 的响应中发送：

```http
Permissions-Policy: local-network=(self "https://setup.partner.example.com"), loopback-network=(self "https://setup.partner.example.com")
```

<a id="fallback-strategies"></a>
## 回退策略

本地网络访问的浏览器支持情况：支持有限。
支持的浏览器：Chrome 145（2026 年 2 月）和 Edge 145（2026 年 2 月）。
不支持的浏览器：Firefox 和 Safari。

如果你的 Baseline 目标不支持本地网络访问权限和 `targetAddressSpace` 选项，应采用**特性检测与渐进式回退**：

1. **权限查询回退**：用 `try / catch` 包裹 `navigator.permissions.query({ name: permissionName })`。如果浏览器因为不识别 `'local-network'` 或 `'loopback-network'` 这个 `PermissionName` 而抛出 `TypeError`，将状态视为 `'prompt'`，让请求仍由明确的用户点击触发；在支持 LNA 的环境中，连接尝试本身会触发浏览器提示。
2. **不要**查询旧的合并权限名称 `{ name: 'local-network-access' }`。在旧版 Chrome 中，此查询会使渲染进程崩溃，且 `try / catch` 无法阻止。较新版 Chrome 仅将 `'local-network-access'` 作为细粒度权限的旧别名处理。
3. **妥善处理拒绝**：始终为 `fetch()`、`WebSocket` 错误事件和 `transport.ready` 设置错误处理器，捕获 `TypeError` 或连接失败，并呈现清晰的修复步骤，例如检查本地设备是否开机、是否连接同一网络，以及浏览器权限是否允许访问。

```javascript
/**
 * Cross-browser permission check for the granular LNA permissions.
 * Never falls back to querying 'local-network-access', which crashes older Chrome versions.
 * @param {'local-network' | 'loopback-network'} permissionName
 */
export async function queryLnaPermissionSafe(permissionName) {
  if (!navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const status = await navigator.permissions.query({ name: permissionName });
    return status.state;
  } catch {
    // Unrecognized permission name; proceed on user gesture
    return 'prompt';
  }
}
```
