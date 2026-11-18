<a id="compare-and-validate-web-origins-and-sites"></a>
# 比较与验证 Web 源和站点

将 `event.origin` 与经过端口规范化的固定字符串字面量比较，例如 `event.origin === 'https://app.example.com'`，适用于简单白名单；但在验证任意 URL、DOM 链接元素、跨子域重定向或沙箱消息时，手动字符串比较和正则表达式容易失效：

- **前缀和子串伪装：**`url.startsWith('https://app.example.com')` 检查可被 `'https://app.example.com.attacker.example'` 绕过。
- **未经规范化的 URL：**包含路径、查询字符串或显式默认端口的完整 URL，例如 `'https://app.example.com:443/path'`，如果不先解析和规范化，就无法通过字符串相等比较匹配 `'https://app.example.com'`。
- **公共后缀列表处理错误：**通过 `.` 拆分主机名来检查同站关系，会在 `.co.uk` 等多标签公共后缀，或 `.github.io` 等共享托管域上出错，也会忽略协议不匹配（`http:` 与 `https:`）。
- **不透明 `"null"` 源冲突：**沙箱 iframe（`<iframe sandbox="allow-scripts">`）和 `data:` URL 会将 `event.origin` 序列化为字面字符串 `"null"`。使用 `originA === originB` 比较两个序列化后的运行时源，会错误地将两个无关的不透明上下文视为相同（`"null" === "null"`）。

**`Origin` API**（`Origin.from()`、`isSameOrigin()`、`isSameSite()` 和 `opaque`）基于浏览器的 URL 解析器与公共后缀列表，提供结构化、符合规范的源比较，以及考虑协议的同站比较。

<a id="choosing-the-right-comparison-for-your-scenario"></a>
## 为你的场景选择正确的比较方式

- **使用 `isSameOrigin()` 建立严格的权限边界：**处理跨窗口 `postMessage` 命令，例如嵌入式结账或身份验证弹窗，或决定是否附加凭据时，要求 `(scheme, host, port)` 完全匹配。即使只是子域不同，如 `https://blog.example.com` 与 `https://app.example.com`，也是不同源，必须拒绝，以防一个子域的漏洞控制另一个子域。
- **使用 `isSameSite()` 处理跨子域导航和链接分类：**验证登录后的重定向 URL，例如 `?returnTo=https://billing.example.co.uk/orders`，或区分内部与外部链接时，可以允许共享相同协议和可注册域的任意子域或端口。`isSameSite()` 会拒绝降级到 `http:`，也会拒绝共享公共后缀（`.co.uk`、`.github.io`）下的其他租户。
- **对不透明或沙箱上下文使用 `origin.opaque` 和 `Origin.from(event)`：**拒绝将 `data:` URL 用作重定向目标（`origin.opaque === true`）；或者，当与特定的 `<iframe sandbox="allow-scripts">` 组件通信，而其序列化 `event.origin` 为 `"null"` 时，固定通过 `Origin.from(event)` 提取的不透明 `Origin`。

<a id="1-verify-exact-origins-for-privileged-actions-originfrom-and-issameorigin"></a>
## 1. 对特权操作验证精确源（`Origin.from()` 和 `isSameOrigin()`）

使用 `Origin.from()` 提取 `Origin` 对象，并通过 `isSameOrigin()` 与可信 `Origin` 比较：

- **两边都必须是 `Origin` 实例：**`isSameOrigin(other)` 和 `isSameSite(other)` 只接受 `Origin` 对象；传入原始字符串会抛出 `TypeError`。
- **`Origin.from()` 支持的输入：**
  - 序列化的 URL 字符串，例如 `'https://app.example.com:443/path'`。注意，任何无效 URL 字符串，例如 `'example'`，或不透明源的 `event.origin` 序列化得到的 `'null'` 字符串，都会使 `Origin.from()` 抛出 `TypeError`。
  - 在 HTML 规范中定义了源提取步骤的平台对象：`Origin`、`URL`、`HTMLAnchorElement`（`<a>`）、`HTMLAreaElement`（`<area>`）、同源 `Window` 或 `WorkerGlobalScope`（`Origin.from(self)`），以及浏览器派发的 `MessageEvent` 实例（`Origin.from(event)`）。
  - `Location`、`WorkerLocation`、`Document`、`Request` 和 `Response` 等对象**没有**定义源提取步骤，直接传给 `Origin.from()` 会抛出 `TypeError`；应改传 `self` 以表示当前上下文，或传入 `request.url` / `response.url`。
- **同时处理浏览器派发和合成的 `MessageEvent` 实例：**真实的浏览器 `postMessage` 事件携带内部源，可由 `Origin.from(event)` 提取；单元测试中通过 `new MessageEvent('message', { origin })` 创建的合成事件，只填充 `event.origin` 字符串，调用 `Origin.from(event)` 会抛出异常。在 `try...catch` 中回退到 `Origin.from(event.origin)`，可妥善兼容两者，同时继续拒绝无效字符串和 `"null"`。

```javascript
// Replace with your application's trusted origin(s)
const TRUSTED_ORIGIN = Origin.from('https://app.example.com');

function extractOrigin(candidate) {
  try {
    return Origin.from(candidate);
  } catch (err) {
    // Synthetic new MessageEvent('message', { origin }) objects in tests lack an
    // internal browser origin; fall back to parsing candidate.origin if it is a URL.
    if (typeof MessageEvent !== 'undefined' && candidate instanceof MessageEvent) {
      return Origin.from(candidate.origin);
    }
    throw err;
  }
}

export function isTrustedSameOrigin(candidate) {
  try {
    return extractOrigin(candidate).isSameOrigin(TRUSTED_ORIGIN);
  } catch {
    // Rejects invalid URLs, "null" strings, or unsupported objects
    return false;
  }
}

window.addEventListener('message', (event) => {
  if (!isTrustedSameOrigin(event)) return;

  // Safe to process privileged commands from the verified origin
});
```

<a id="2-validate-cross-subdomain-redirects-and-links-issamesite"></a>
## 2. 验证跨子域重定向和链接（`isSameSite()`）

验证重定向目标（例如 `?returnTo=` 参数），或同一可注册域不同子域之间的内部链接，例如 `https://app.example.co.uk` 和 `https://billing.example.co.uk:8443` 时，使用 `isSameSite()`：

- `isSameSite()` 执行**考虑协议的同站**比较：`https://sub.example.com` 和 `http://sub.example.com` **不同站**，因为协议不同。
- `isSameSite()` 使用浏览器内置的**公共后缀列表**，因此对于共享公共后缀下的不同租户，例如 `https://tenant-a.github.io` 与 `https://tenant-b.github.io`，或 `https://a.co.uk` 与 `https://b.co.uk`，计算结果为 `false`。

```javascript
// Replace with your application's primary origin
const APP_ORIGIN = Origin.from('https://app.example.co.uk');

export function isAllowedSameSiteUrl(candidateUrlOrElement) {
  try {
    return extractOrigin(candidateUrlOrElement).isSameSite(APP_ORIGIN);
  } catch {
    return false;
  }
}

// true: same scheme (https) and same registrable domain (example.co.uk)
isAllowedSameSiteUrl('https://billing.example.co.uk:8443/checkout');

// false: scheme downgrade (http vs. https) is rejected by schemeful same-site
isAllowedSameSiteUrl('http://billing.example.co.uk/checkout');
```

<a id="3-distinguish-and-pin-opaque-origins-originopaque-and-originfromevent"></a>
## 3. 区分并固定不透明源（`origin.opaque` 和 `Origin.from(event)`）

沙箱 iframe（`<iframe sandbox="allow-scripts">`）、`data:` URL 和 `new Origin()` 会产生**不透明源**（`origin.opaque === true`）。虽然它们的字符串序列化结果始终是 `"null"`，但 `Origin.from(event)` 能从浏览器派发的 `MessageEvent` 中提取发送方实际的底层不透明源：

- 来自**同一个**沙箱 iframe 的两条消息，会产生彼此满足 `isSameOrigin()` 的 `Origin` 对象，结果为 `true`。
- 来自**不同**沙箱 iframe 的消息，或分别调用 `Origin.from('data:...')` / `new Origin()` 得到的结果，会产生不同的不透明源，`isSameOrigin()` 为 `false`，从而防止在无关不透明上下文间利用 `"null" === "null"` 伪装。
- `new Origin()` 创建全新且唯一的不透明源，除自身外不匹配任何源，可用作默认拒绝全部的哨兵值，直到初始化时一次性固定预期对端的源。

```javascript
// Initialize with a unique opaque sentinel that matches no other origin
let pinnedSandboxOrigin = new Origin();
let isSandboxPinned = false;

export function handleSandboxedWidgetMessage(event, expectedWidgetWindow) {
  try {
    const senderOrigin = Origin.from(event);

    // Pin the opaque origin only once on initialization from the expected sandboxed iframe
    if (!isSandboxPinned && event.source === expectedWidgetWindow && event.data?.type === 'init') {
      pinnedSandboxOrigin = senderOrigin;
      isSandboxPinned = true;
    }

    // Subsequent messages from the SAME sandboxed iframe match pinnedSandboxOrigin;
    // messages from any other sandboxed iframe (also event.origin === "null") return false.
    return senderOrigin.isSameOrigin(pinnedSandboxOrigin);
  } catch {
    return false;
  }
}
```

<a id="best-practices"></a>
## 最佳实践

- **应当**在调用 `isSameOrigin(other)` 或 `isSameSite(other)` 前，通过 `Origin.from()` 将比较两边都转换为 `Origin` 实例。
- **应当**在需要保留不透明源身份时，将浏览器派发的 `MessageEvent` 直接传给 `Origin.from(event)`；使用 `Origin.from(self)` 获取当前执行上下文的 `Origin`，不要传入会抛出 `TypeError` 的 `Location` 或 `Document`。
- **应当**用 `try...catch` 包裹对不可信或运行时输入的 `Origin.from()` 调用，使无效 URL、`"null"` 字符串或不支持的对象安全返回 `false`，而不是抛出未捕获的 `TypeError`。
- **不要**在未先排除 `"null"`（`origin !== 'null'`）的情况下，直接比较两个运行时 `event.origin` 或 `url.origin` 字符串，因为两个无关的不透明源都会序列化为 `"null"`。
- **不要**使用 `startsWith()`、`includes()`、`endsWith()` 或简单的 `.split('.')` 主机名切分来验证源或站点。

<a id="fallback-strategy"></a>
## 回退策略

Origin 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 145（2026 年 2 月）、Edge 145（2026 年 2 月）和 Safari 26.5（2026 年 5 月）。
不支持的浏览器：Firefox。

如果你的 Baseline 目标包含尚不支持 `Origin` 接口的浏览器，通过 `'Origin' in globalThis` 进行特性检测，并回退到 `new URL()` 解析 URL：

- **同源回退（元组源）：**提取 URL 字符串，对 `MessageEvent` 对象使用 `event.origin`，对链接元素使用 `candidate.href`；用 `new URL()` 解析候选 URL 和可信 URL，拒绝 `"null"` 不透明源（`candidateUrl.origin !== 'null'`），再比较 `candidateUrl.origin === trustedUrl.origin`。由于不透明源绝不与 `'https://app.example.com'` 这样的元组源同源，立即拒绝 `'null'` 与 `Origin.isSameOrigin()` 的行为一致。
- **同站回退（注意事项）：**`URL` 接口不公开浏览器的公共后缀列表。在没有 `Origin` 的浏览器中，只能针对你控制的、明确已知的私有可注册域进行后缀匹配，同时验证 `protocol` 及完全匹配或带点前缀的 `hostname`；也可以使用持续维护的公共后缀列表库。
- **不透明源或沙箱 iframe 的回退：**没有 `Origin` 的浏览器，不会在 `MessageEvent` 上公开各自不同的不透明源身份，`event.origin` 始终为 `"null"`。如果你有意接受来自已知沙箱 `<iframe sandbox="allow-scripts">` 的消息，应验证 `event.source === expectedWidgetWindow`，或通过初始化时传入 iframe 的专用 `MessageChannel` `MessagePort` 通信，而不是比较 `event.origin`。

```javascript
// Replace with your trusted reference URL and known registrable domain
const TRUSTED_URL = 'https://app.example.com';
const TRUSTED_SITE_DOMAIN = 'example.com';

function extractUrlString(candidate) {
  if (typeof candidate === 'string') return candidate;
  if (typeof MessageEvent !== 'undefined' && candidate instanceof MessageEvent) {
    return candidate.origin;
  }
  if (candidate === globalThis) {
    return globalThis.location?.href ?? '';
  }
  return candidate?.href ?? '';
}

function extractOrigin(candidate) {
  try {
    return Origin.from(candidate);
  } catch (err) {
    if (typeof MessageEvent !== 'undefined' && candidate instanceof MessageEvent) {
      return Origin.from(candidate.origin);
    }
    throw err;
  }
}

export function checkSameOriginWithFallback(candidate) {
  try {
    if ('Origin' in globalThis) {
      return extractOrigin(candidate).isSameOrigin(Origin.from(TRUSTED_URL));
    }
    const candidateUrl = new URL(extractUrlString(candidate));
    const trustedUrl = new URL(TRUSTED_URL);
    return candidateUrl.origin !== 'null' && candidateUrl.origin === trustedUrl.origin;
  } catch {
    return false;
  }
}

export function checkSameSiteWithFallback(candidate) {
  try {
    if ('Origin' in globalThis) {
      return extractOrigin(candidate).isSameSite(Origin.from(TRUSTED_URL));
    }
    const candidateUrl = new URL(extractUrlString(candidate));
    const trustedUrl = new URL(TRUSTED_URL);
    return (
      candidateUrl.origin !== 'null' &&
      candidateUrl.protocol === trustedUrl.protocol &&
      (candidateUrl.hostname === TRUSTED_SITE_DOMAIN ||
        candidateUrl.hostname.endsWith(`.${TRUSTED_SITE_DOMAIN}`))
    );
  } catch {
    return false;
  }
}
```
