<a id="web-security"></a>
# Web 安全

关于如何在 Web 上安全、渐进地实施预防性安全措施的指南。

**注意**：此技能涵盖标准 Web 平台防御措施，主要侧重浏览器。应用仍然需要全面的服务器端安全、授权模型和输入验证。

<a id="table-of-contents"></a>
## 目录

- 何时应用此技能
- 阶段 1：快速改进与明显应避免的做法
  - 1.1 安全上下文
  - 1.2 避免危险的 DOM 接收点
  - 1.3 安全 Cookie
  - 1.4 点击劫持防护（Frame-Ancestors 与 X-Frame-Options）
  - 1.5 安全的窗口消息通信（postMessage）
- 阶段 2：发现与数据收集（前置条件）
  - 2.1 检查应用
  - 2.2 部署仅报告策略
  - 2.3 报告的数据卫生
  - 2.4 通过浏览器 API 和 DevTools 自动发现问题
- 阶段 3：解释结果与强制实施
  - 核心强制防护
    - 3.1 分析 CSP 报告
    - 3.2 强制实施内容安全策略（CSP）
    - 3.3 强制实施 Trusted Types
    - 3.4 跨源打开者策略（COOP）
    - 3.5 跨源资源策略（CORP）
    - 3.6 跨源隔离
    - 3.7 Fetch Metadata（资源隔离）
  - 配套策略（并行部署）
    - HTTP 严格传输安全（HSTS）
    - X-Content-Type-Options
    - Referrer Policy
    - Permissions Policy
    - 子资源完整性（SRI）
    - 跨源资源共享（CORS）
    - Clear-Site-Data（退出登录）

<a id="when-to-apply-this-skill"></a>
## 何时应用此技能

合适的起点取决于应用本身，以及你能否直接更新代码库：

- **直接审计和加固代码库**：落实阶段 1 的代码卫生，接入阶段 2 的报告（`Reporting-Endpoints` 和 `report-to`），并在同一轮更新中直接修改 `<script>` 标签、cookie 和服务器中间件，实施阶段 3 的标头。这些标头包括带 nonce 或哈希的 `Content-Security-Policy`、`'strict-dynamic'`、`'report-sample'`、`object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'` 或 `'self'`，以及 `require-trusted-types-for 'script'`，再配合 COOP、CORP、Fetch Metadata、HSTS、`X-Content-Type-Options`、`Referrer-Policy` 和 `Permissions-Policy`。
- **在第三方依赖未知的大型生产网站上分阶段上线**：先实施阶段 1 的快速改进，同时部署阶段 2 的仅报告标头与已强制实施的配套策略，在收集违规遥测后，再将仅报告策略提升为阶段 3 的强制实施策略。
- **全新应用、SaaS 模板或框架默认设置**：默认提供阶段 1 的卫生措施和阶段 3 的强制实施策略，同时配置阶段 2 的报告，以便立即捕获回归。

**将精力集中在影响最大的措施上**：阶段 1 和 2 建立基础卫生和违规可见性，阶段 3 的核心强制防护则是安全工作中收益最高的部分。具体而言，通过强制实施 CSP（§3.2）和 Trusted Types（§3.3）缓解注入与 XSS，可应对实际中最大的威胁；配套策略和隔离防御则提供重要的纵深防御。

<a id="phase-1-quick-wins--obvious-anti-patterns"></a>
## 阶段 1：快速改进与明显应避免的做法

在尝试部署全局安全策略之前，先关注代码层面的卫生，以及不会带来应用损坏风险的即时修复。

<a id="11-secure-contexts"></a>
### 1.1 安全上下文
- **应当**：通过 HTTPS 提供资源，防范被动和主动的网络攻击者。
- **应当**：提供 `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` 这样的标头，尽可能强制使用 HTTPS。
- **提示**：生产上线时，先使用较短的 `max-age`，例如 300 秒，再逐步增加到 1 年。配置错误且 max-age 很长的 HSTS，可能使所有曾接收它的浏览器持续无法访问网站，直到各自缓存过期。

<a id="12-avoid-dangerous-dom-sinks"></a>
### 1.2 避免危险的 DOM 接收点
- **应当**：设置文本内容时，优先使用 `textContent` 或 `innerText`，而不是 `innerHTML`。
- **应当**：在可用时使用 Sanitizer API 的 `setHTML()`，安全插入不可信 HTML，无需经过 `innerHTML`。参见 `sanitize-untrusted-html`，可通过 `npx -y modern-web-guidance@latest retrieve "sanitize-untrusted-html"` 获取。
- **不要**：将不可信或未经净化的输入交给 `innerHTML` 或 `setHTMLUnsafe`。
- **应当**：使用 DOMParser，或通过 `document.createElement` 以编程方式创建元素，而不是拼接 HTML 字符串。

**应搜索的危险接收点**：`innerHTML`、`outerHTML`、`document.write`、`eval`、接收字符串参数的 `setTimeout`、`script.src`。

**代码模式：**
```javascript
// Unsafe
element.innerHTML = `Hello, ${untrustedName}!`;

// Safe
element.textContent = `Hello, ${untrustedName}!`;
```

Trusted Types 可以阻止向危险接收点赋字符串，从而在运行时强制执行这一模式。部署它属于 CSP 强制实施步骤，存在实际的功能损坏风险，见 §3.3。

<a id="13-secure-cookies"></a>
### 1.3 安全 Cookie
确保会话和应用 cookie 默认采用安全配置，无论它们通过 `Set-Cookie` 标头设置，还是通过框架会话配置设置，例如 Astro 或 Express 会话中间件。
- **应当**：当第一方会话 cookie 仅用于单个域时，以 `__Host-` 前缀命名（`name: '__Host-session'`）。这要求设置 `Secure`（`secure: true`）、`Path=/`（`path: '/'`），并省略 `Domain` 属性，可防御同站和网络攻击者。
- **应当**：当 `__Host-` 不合适时，优先使用 `__Secure-` 前缀命名 cookie。它要求 `Secure` 属性，可防御网络攻击者。
- **应当**：为会话和身份验证 cookie 设置 `HttpOnly`（`httpOnly: true`），使注入的客户端脚本无法读取它们；并为标准第一方 cookie 显式设置 `SameSite=Lax`（`sameSite: 'lax'`）。
- **应当**：如果应用会作为 iframe 嵌入第三方上下文，使用 `SameSite=None; Secure; Partitioned`。
- **不要**：依赖未分区的 `SameSite=None`，这类 cookie 正因防追踪措施而被系统性阻止。

```http
Set-Cookie: __Host-session_id=value; SameSite=Lax; HttpOnly; Secure; Path=/
Set-Cookie: third_party_var=value; SameSite=None; Secure; Partitioned
```

<a id="14-clickjacking-protection-frame-ancestors--x-frame-options"></a>
### 1.4 点击劫持防护（Frame-Ancestors 与 X-Frame-Options）
点击劫持防护易于部署，破坏合法功能的风险极低，并能立即抵御恶意界面伪装。根据嵌入需求选择策略级别：
- **应当（默认：无需嵌入）**：如果页面从不需要嵌入 iframe，同时设置 `Content-Security-Policy: frame-ancestors 'none'` 和 `X-Frame-Options: DENY`。
- **应当（仅允许同源嵌入）**：如果应用在同源 iframe 中嵌入自己的页面，同时设置 `Content-Security-Policy: frame-ancestors 'self'` 和 `X-Frame-Options: SAMEORIGIN`。
- **应当（需要特定跨源嵌入）**：设置 `Content-Security-Policy: frame-ancestors 'self' https://trusted-partner.com`，并**省略 `X-Frame-Options`**。`X-Frame-Options` 无法表达跨源白名单，`ALLOW-FROM` 已废弃且不受支持；对于只判断 `X-Frame-Options` 而不处理 `frame-ancestors` 的客户端，`DENY` 或 `SAMEORIGIN` 会阻止嵌入。
- **应当（明确需要任意嵌入）**：只有在专门设计为可公开嵌入组件的路由上，才同时省略 `frame-ancestors` 和 `X-Frame-Options`。

```http
# Default (never framed):
Content-Security-Policy: frame-ancestors 'none';
X-Frame-Options: DENY

# Same-origin framing allowed:
Content-Security-Policy: frame-ancestors 'self';
X-Frame-Options: SAMEORIGIN

# Specific cross-origin framing allowed (omit X-Frame-Options):
Content-Security-Policy: frame-ancestors 'self' https://trusted-partner.com;
```

<a id="15-secure-window-messaging-postmessage"></a>
### 1.5 安全的窗口消息通信（postMessage）
如果应用使用 `window.postMessage` 与其他源通信，必须严格验证发送方和接收方。
- **应当**：始终在接收端对传入消息的 `event.origin` 与可信源列表进行严格相等验证；如果需要与 URL 或元素比较、检查考虑协议的同站关系，或区分沙箱 iframe 的不透明源，则使用 `Origin` API，参见 `validate-origins`，可通过 `npx -y modern-web-guidance@latest retrieve "validate-origins"` 获取。**不要**信任通配符 `*`、子串检查或未经验证的载荷。
- **应当**：调用 `postMessage` 发送敏感数据时，始终指定目标源，而不是通配符 `*`，确保只有预期源能够收到数据。
- **应当**：在执行操作或将传入消息载荷写入 DOM 接收点之前，验证并净化其属性。无需手动进行 JSON 序列化，因为 `postMessage` 会在内部处理对象克隆。

```javascript
// Receiver (Safe - traditional string check)
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://trusted-origin.com') return;
  const data = event.data;
  if (data && data.action === 'update') {
    // Process data safely
  }
});

// Sender (Safe)
targetWindow.postMessage({ action: 'update' }, 'https://trusted-origin.com');
```

<a id="phase-2-discovery--data-collection-prerequisites"></a>
## 阶段 2：发现与数据收集（前置条件）

不要盲目地向现有应用应用严格策略。必须先通过数据收集了解应用的约束。

<a id="21-inspect-the-application"></a>
### 2.1 检查应用
启用任何措施前，先收集事实：
- **搜索现有安全标头**：检查服务器配置、中间件、CDN 或边缘配置及 meta 标签中的 `Content-Security-Policy`、`Strict-Transport-Security`、`X-Frame-Options`、`X-Content-Type-Options`、`Permissions-Policy`、`Cross-Origin-*`、`Access-Control-*`、`Timing-Allow-Origin`、`Reporting-Endpoints`。
- **列举内联脚本和样式**：检查服务器渲染模板和静态 HTML；它们需要 nonce、哈希或重构。
- **列出第三方脚本源**：包括应用加载的分析、广告、标签管理器和 CDN。它们决定 `script-src` 必须允许哪些内容，以及 `'strict-dynamic'` 是否可行。
- **识别依赖弹窗的流程**：例如 OAuth、支付网关和 SSO，它们会限制 COOP 的选择。
- **识别跨源嵌入内容和嵌入方**：包括应用加载的 iframe，以及嵌入应用的网站。它们会限制 COEP、CORP 和 `frame-ancestors`。
- **列举必需的浏览器功能**：列出应用或嵌入式第三方组件使用的功能，例如摄像头、地理定位、麦克风、全屏，为配置 `Permissions-Policy` 提供依据。
- **识别动态依赖**：检查第三方脚本是否有版本，还是会静默更新，以决定能否使用 `SRI`。
- **梳理跨站集成**：列出所有传入 Webhook、跨站 API 或 SSO 重定向端点，避免 `Fetch Metadata` 资源隔离策略破坏它们。

<a id="22-deploy-report-only-policies"></a>
### 2.2 部署仅报告策略
使用“仅报告”标头，在实际损坏发生前发现潜在问题。
- **应当**：使用仅报告标头进行策略试运行，而不强制实施。标准的仅报告标头包括：
  - 用于 CSP 规则的 `Content-Security-Policy-Report-Only`。
  - 用于 COOP 隔离的 `Cross-Origin-Opener-Policy-Report-Only`。
  - 用于 COEP 隔离的 `Cross-Origin-Embedder-Policy-Report-Only`。
  - 用于文档特性的 `Document-Policy-Report-Only`。
- **应当**：定义 `Reporting-Endpoints` 标头，为违规报告提供接收位置，并通过 `report-to` 引用其名称。建议设置名为 `default` 的端点，它会自动捕获弃用和崩溃报告。
- **应当**：让仅报告模式运行足够长时间，覆盖真实流量模式，通常为数天至数周，不能只依靠合成测试。

**标头示例：**
```http
Reporting-Endpoints: default="https://reports.example/default", main-endpoint="https://reports.example/main"
Content-Security-Policy-Report-Only: script-src 'nonce-{RANDOM}' 'strict-dynamic' 'report-sample'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; report-to main-endpoint;
```

`'strict-dynamic'`、`https:` 和 `'unsafe-inline'` 共同构成向后兼容阶梯：现代浏览器遵循可传播 nonce 信任的 `'strict-dynamic'`，忽略其余两个；较旧的浏览器回退到 `https:`；很旧的浏览器回退到 `'unsafe-inline'`。在支持更严格令牌的浏览器上，这些回退不会造成影响。

**处理报告误报**：报告端点会收到大量由客户端中间件、干预较强的浏览器扩展、非常旧的浏览器、网络爬虫或杀毒扫描器引起的误报。分析仅报告日志时，应关注现代 user-agent 的高频模式，并在做出部署决定之前过滤噪声。具体而言：
- **过滤噪声**：忽略由存在已知错误的旧浏览器发送的虚假违规报告、已知由常见浏览器扩展或客户端中间件注入的标记所触发的报告，例如在许多不同应用中出现的相同报告，以及缺乏足够调试信息的报告。
- **忽略低频报告**：策略部署后，低违规量通常意味着可安全忽略的误报。
- **使用 `'report-sample'`**：始终在 `script-src` 指令中包含 `'report-sample'`。它指示浏览器在违规报告中包含违规脚本或内联代码片段的前 40 个字符，大幅简化调试。

<a id="23-data-hygiene-for-reports"></a>
### 2.3 报告的数据卫生
- **不要**：在日志或违规报告中包含敏感数据，例如个人身份信息（PII）、身份验证令牌、会话标识符或含机密的查询字符串。在它们到达报告端点之前，于边缘层遮蔽或省略这些内容。

<a id="24-automated-discovery-via-browser-apis-and-devtools"></a>
### 2.4 通过浏览器 API 和 DevTools 自动发现问题
- **Reporting API**：将 `Reporting-Endpoints` 与仅报告标头，如 `Content-Security-Policy-Report-Only`、`Document-Policy-Report-Only` 配合使用，让浏览器自动将违规报告提交到服务器。
- **浏览器 DevTools**：使用现代浏览器的 **Issues（问题）标签页**，例如 Chrome DevTools。它会自动显示被阻止的资源、混合内容、第三方 cookie 弃用警告和功能策略违规，无需你手动遍历代码库。

<a id="phase-3-interpreting-results--enforcement"></a>
## 阶段 3：解释结果与强制实施

检查应用或收集仅报告数据后，强制实施安全策略。阶段 3 有两条同时实施的路线：

- **核心强制防护**：高收益的 XSS 和隔离防御，包括 `Content-Security-Policy`、Trusted Types、COOP、CORP 和 Fetch Metadata。
- **配套策略（并行部署）**：风险较低的标头，包括 `Strict-Transport-Security`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 和 `Clear-Site-Data`，应始终与核心强制防护一起启用。

<a id="core-enforcement"></a>
### 核心强制防护

<a id="31-analyzing-csp-reports"></a>
#### 3.1 分析 CSP 报告

审查 CSP 违规报告时，先按照 §2.2，将噪声与实际的应用问题分开。对于看起来由应用不兼容导致的违规，通常是 “Sample” 或 “Blocked URI” 看起来像标记中可能存在的合法脚本或资源，应采取以下步骤：
- **代码搜索**：在代码库中搜索违规的脚本源、URL 或哈希，确认它是否存在于代码、动态服务器模板或静态 HTML 文件中。
- **控制台审计**：使用相同浏览器打开触发违规的页面，即报告中的 “Document URI”，尽可能操作应用的各种功能，同时在开发者工具或控制台中检查 CSP 违规；某些违规只在特定用户交互时触发。

完成过滤和分诊后，根据以下常见场景分析报告：

- **场景**：出现大量内联脚本违规。
  - **条件**：应用所用框架依赖内联脚本。
  - **决定**：强制实施前，先为服务器渲染实现 nonce，或为静态内容实现哈希。
- **场景**：第三方分析脚本出现违规。
  - **条件**：这些脚本是必需的。
  - **决定**：使用 `'strict-dynamic'` 配合每次请求的 nonce，使分析加载器能够附加其依赖。**不要**将分析源加入 URL 白名单；域白名单可通过开放重定向、JSONP，以及白名单源上的依赖注入绕过。
- **场景**：特定接收点出现 Trusted Types 违规。
  - **条件**：旧代码路径仍向 `innerHTML` 等位置写入字符串。
  - **决定**：强制实施前，按 §1.2 重构这些接收点，或使其经过 Trusted Types 策略（§3.3）。

<a id="32-enforcing-content-security-policy-csp"></a>
#### 3.2 强制实施内容安全策略（CSP）
强制实施 `Content-Security-Policy` 时，始终保持强制实施标头上的 `Reporting-Endpoints` 和 `report-to` 已接通，让任何回归仍然可见。

**必须设置的指令：**
- `script-src 'nonce-{RANDOM}' 'strict-dynamic' 'report-sample'`，静态 HTML 可改用 SHA-256/384/512 脚本哈希；这是任何 CSP 的核心指令，也是防止 XSS 的主要机制。
- `object-src 'none'`：阻止基于插件的代码执行（`<object>`、`<embed>`）。
- `base-uri 'none'`：阻止 `<base>` 标签劫持相对 URL。
- `frame-ancestors 'none'`，需要同源嵌入时使用 `'self'`：配合 `X-Frame-Options: DENY` 或 `SAMEORIGIN` 防止点击劫持，见 §1.4。
- `require-trusted-types-for 'script'`：对 DOM XSS 接收点强制执行 Trusted Types 运行时检查，见 §3.3。
- `report-to <endpoint>`：将违规报告发送到 `Reporting-Endpoints` 中定义的端点。
- *可选*：`form-action 'self'`，防止表单提交到攻击者控制的源。

**强制实施标头示例（带报告的 CSP）：**
```http
Reporting-Endpoints: main-endpoint="https://reports.example/main"
Content-Security-Policy: script-src 'nonce-{RANDOM}' 'strict-dynamic' 'report-sample'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; report-to main-endpoint;
```

基于 nonce 的 CSP 所用 HTML：
```html
<script nonce="{RANDOM}" src="https://example.com/script.js"></script>
```

**服务器或中间件为每次请求生成 nonce：**
在服务器渲染或 SSR 中间件中，例如 Node.js、Express 或 Astro 中间件，为每次请求生成全新的密码学 nonce，将其附加到 `Content-Security-Policy`，并传入模板或 SSR 渲染上下文，确保只有可信模板中的 `<script>` 标签能够获得它：

```javascript
const bytes = new Uint8Array(16);
crypto.getRandomValues(bytes);
const nonce = btoa(String.fromCharCode(...bytes));

const csp = [
  `script-src 'nonce-${nonce}' 'strict-dynamic' 'report-sample'`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'", // or "frame-ancestors 'self'" if same-origin framing is needed
  "require-trusted-types-for 'script'",
  'report-to main-endpoint',
].join('; ');

headers.set('Reporting-Endpoints', 'main-endpoint="https://reports.example/main"');
headers.set('Content-Security-Policy', csp);

// Pass the per-request nonce into your template/SSR rendering context (or replace an
// explicit placeholder token in a static template before interpolating any user data):
res.locals.nonce = nonce; // e.g., <script nonce="<%= nonce %>" src="/app.js"></script>
```

对于无法为每个响应生成 nonce 的静态或缓存 HTML（SPA），使用基于哈希的 CSP：计算每个脚本的 `sha256-` 哈希，并在 `script-src` 中将这些哈希与 `'strict-dynamic' 'report-sample'` 一起列出。

**避免：**
- 将宽泛的协议或域白名单作为 `script-src` 的主要保护，例如仅使用 `https:`，或使用不带 `'strict-dynamic'` 的 `script-src https://cdn.example.com`；它们容易被允许源上的开放重定向、JSONP 端点和依赖注入绕过。
- 通过正则表达式重写已经渲染好的 HTML，例如 `html.replace(/<script\b.../gi, ...)`，为每个 `<script>` 标签打上 CSP nonce。对已渲染 HTML 的后处理，无法区分开发者编写的 `<script>` 标签与反射型或存储型 HTML 注入引入的不可信 `<script>` 标签，结果会在 `script-src 'nonce-...'` 下授权攻击者注入的脚本。

<a id="33-trusted-types-enforcement"></a>
#### 3.3 强制实施 Trusted Types
Trusted Types 在运行时强制执行源代码层面的指导原则：除非经过命名策略，否则阻止将原始字符串赋给危险的 DOM XSS 接收点，包括 `innerHTML`、`outerHTML`、`document.write`、`script.src` 和 `script.textContent`。

- **应当**：在 `Content-Security-Policy` 标头中包含 `require-trusted-types-for 'script'` 指令，以强制实施 Trusted Types。
- **应当**：通过命名的 `trustedTypes.createPolicy(...)` 实例净化所有 HTML 接收点赋值，而不是赋入原始字符串；也可以优先直接使用 `element.setHTML()`，它无需 Trusted Types 策略即可净化 HTML。
- **不要**：创建 `createHTML: (s) => s` 这样的直通策略，将未经净化的输入原样返回，因为这会抵消 Trusted Types 的保护。
- **应当**：查阅专门的 `trusted-types` 指南，了解完整实现细节，包括 `trusted-types` 策略白名单和上线策略；可通过 `npx -y modern-web-guidance@latest retrieve "trusted-types"` 获取。

```javascript
const htmlPolicy = window.trustedTypes?.createPolicy('app-html', {
  createHTML(input) {
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
});
```

<a id="34-cross-origin-opener-policy-coop"></a>
#### 3.4 跨源打开者策略（COOP）

这是三者中风险最低的策略。如果应用**不是** OAuth 提供方、支付处理方，也不预期被其他打开者窗口访问，就可以部署。

- **应当**：使用 `Cross-Origin-Opener-Policy: same-origin-allow-popups`，防止恶意打开者实施 XS-leaks 攻击，同时仍允许*应用自身*发起的 OAuth 和支付流程。
- **不要**：直接启用 `same-origin`，除非已经明确验证没有任何集成依赖跨源 `window.opener` 访问。

<a id="35-cross-origin-resource-policy-corp"></a>
#### 3.5 跨源资源策略（CORP）

根据响应是否应允许在其他上下文中嵌入，为每个响应显式设置 CORP。它有两个核心好处：保护资源免遭恶意跨源读取，并确保在页面请求更强客户端隔离时保持兼容。

- **应当**：应用内部响应默认采用 `Cross-Origin-Resource-Policy: same-origin`，例如 HTML 文档、内部端点、已验证身份的数据、用户会话 JSON 和受限内部脚本。
- **应当**：对于同一 eTLD+1 下跨子域使用的端点，采用 `same-site`。
- **应当**：只有为通用嵌入或广泛缓存分发而创建的资源，才提供 `cross-origin`，例如共享静态资源或公共 CDN。

<a id="36-cross-origin-isolation"></a>
#### 3.6 跨源隔离

这是部署时功能损坏风险最高的策略。只有应用需要依赖 `SharedArrayBuffer` 的功能，例如 WebAssembly 多线程或共享内存架构时，才需要部署这一基础设施。如果不需要，跳过此策略组。

- **首选路径（Chromium 环境）**：启用 `Document-Isolation-Policy: isolate-and-credentialless`。它提供与 COEP 类似的客户端隔离，同时指示浏览器从非 CORS 跨源资源请求中移除 cookie 和身份验证凭据，而不是直接阻止这些请求。注意，它主要由 Chrome 142 及更高版本支持，其他厂商尚未表现出兴趣，因此应根据目标用户谨慎评估。如果应用需要*阻止*没有显式 CORP 许可的跨源资源，而不是移除凭据后加载，可以改用 `isolate-and-require-corp`。该方式更严格、更难部署，需要进行与下方跨浏览器路径相同的子资源审计。
- **跨浏览器路径（复杂的强制实施）**：要求 `Cross-Origin-Opener-Policy: same-origin` 配合 `Cross-Origin-Embedder-Policy: require-corp`。每个嵌入的子资源，例如图片、样式和外部媒体，都必须提供显式的 `Cross-Origin-Resource-Policy` 标头，否则浏览器会阻止加载。

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

<a id="37-fetch-metadata-resource-isolation"></a>
#### 3.7 Fetch Metadata（资源隔离）
这是使用 `Sec-Fetch-*` 请求标头拒绝可疑跨站请求的服务器端强制防护。实施前必须完成 §2.1 的跨站集成梳理。

- **应当**：实现服务器端资源隔离策略，检查 `Sec-Fetch-*` 标头，并对非导航端点拒绝 `cross-site` 请求。
- **应当**：在身份验证或授权检查*之前*拒绝不允许的请求，避免响应通过时间信息泄露资源或会话是否存在。
- **应当**：包含 `Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site`，防止中间缓存（CDN）将缓存响应提供给攻击者。
- **注意**：`same-site` 会信任 eTLD+1 下的每一个子域。如果任何子域托管用户生成内容、旧应用或其他不可信代码，应从白名单中移除 `same-site`，只接受 `same-origin` 和 `none`。
- **注意**：这些检查若配置错误，会阻止来自跨站集成、SSO 处理器或 Webhook 的合法 API 请求。务必事先记录并测试 `Sec-Fetch-*` 约束。

```javascript
app.use((req, res, next) => {
  res.setHeader('Vary', 'Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site');

  const site = req.get('Sec-Fetch-Site');
  const mode = req.get('Sec-Fetch-Mode');
  const dest = req.get('Sec-Fetch-Dest');

  if (!site) return next(); // Fallback for legacy browsers

  if (['same-origin', 'same-site', 'none'].includes(site)) return next();

  // Allow standard navigate GET requests (link clicks)
  if (site === 'cross-site' && mode === 'navigate' && req.method === 'GET' && !['object', 'embed'].includes(dest)) {
    return next();
  }

  res.status(403).send('Forbidden');
});
```

<a id="companion-policies-deploy-in-parallel"></a>
### 配套策略（并行部署）

这些策略的功能损坏风险显著低于核心强制防护路线，可与 CSP 和隔离策略同时部署，也可以先行部署。

<a id="http-strict-transport-security-hsts"></a>
#### HTTP 严格传输安全（HSTS）
- **应当**：使用 `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` 强制 HTTPS。
- **提示**：生产上线时，先使用较短的 `max-age`，例如 300 秒，再逐步增加到 1 年。配置错误且 max-age 很长的 HSTS，可能使所有曾接收它的浏览器持续无法访问网站，直到各自缓存过期。

<a id="x-content-type-options"></a>
#### X-Content-Type-Options
- **应当**：设置 `X-Content-Type-Options: nosniff`，阻止 MIME 类型嗅探。
- **应当**：确保服务器为全部资源提供正确的 `Content-Type` 标头，例如脚本使用 `application/javascript`，API 使用 `application/json`，文档使用 `text/html`，让浏览器能严格实施 `nosniff` 约束。

<a id="referrer-policy"></a>
#### Referrer Policy
- **应当**：使用 `Referrer-Policy: strict-origin-when-cross-origin` 作为安全默认值。

<a id="permissions-policy"></a>
#### Permissions Policy
- **应当**：使用结构化字段语法，为页面和 iframe 禁用未使用的浏览器功能，例如摄像头、地理定位和麦克风。
- **应当**：为第三方 iframe 禁用 `focus-without-user-activation`，防止抢夺焦点。
- **应当**：向 iframe 委派功能时，*除了*标头外，还要使用 HTML 的 `allow` 属性。
- **注意**：无意中阻止已委派的功能，会使第三方组件静默失败，例如嵌入式视频播放器或支付网关。阻止之前应审计第三方依赖。

```http
Permissions-Policy: camera=(), geolocation=(), microphone=(), focus-without-user-activation=()
```

```html
<iframe src="https://trusted-video.com/player" allow="fullscreen; camera; focus-without-user-activation 'none'"></iframe>
```

<a id="subresource-integrity-sri"></a>
#### 子资源完整性（SRI）
- **应当**：加载第三方脚本和样式表时，使用带密码学哈希的 `integrity` 属性，优先选择 `sha384`、`sha512` 或 `sha256`，并配合 `crossorigin="anonymous"`。关于通过 SRI、CORS 和 Referrer Policy 保护 HTML 与 CSS 子资源，参见 `secure-external-subresources`，可通过 `npx -y modern-web-guidance@latest retrieve "secure-external-subresources"` 获取。
- **应当**：确保服务器或 CDN 发送合适的 `Access-Control-Allow-Origin` 标头，让浏览器能够计算哈希。
- **不要**：对动态或未版本化的资源使用 SRI，静默更新会使脚本执行失败。SRI 严格适用于不可变、带版本的资源。

```html
<script src="https://cdn.example.com/lib@1.0.0.js" integrity="sha384-oqVu...Y8wC" crossorigin="anonymous"></script>
```

<a id="cross-origin-resource-sharing-cors"></a>
#### 跨源资源共享（CORS）
CORS 是权限授予机制，而不是防御机制；它告诉浏览器允许哪些跨源读取。风险在于将它误配置得过于宽松。

- **应当**：在服务器上验证 `Origin` 标头，并将 `Access-Control-Allow-Origin` 动态设置为具体的源，而不是通配符 `*`。
- **不要**：在需要 `Access-Control-Allow-Credentials: true` 时，将 `Access-Control-Allow-Origin` 设为通配符 `*`，否则浏览器会拒绝响应。
- **应当**：在处理数据之前返回适当标头，以处理预检（`OPTIONS`）请求。

```http
Access-Control-Allow-Origin: https://trusted-app.com
Access-Control-Allow-Credentials: true
```

<a id="clear-site-data-logout"></a>
#### Clear-Site-Data（退出登录）
- **应当**：在退出登录端点发送 `Clear-Site-Data: "cookies", "storage", "cache"`，确保彻底终止会话；省略任何一个指令，都会留下有效的会话 cookie、Web Storage 状态或缓存的已登录页面。

```http
Clear-Site-Data: "cookies", "storage", "cache"
```
