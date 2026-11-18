<a id="secure-external-subresources-with-subresource-integrity-cors-and-referrer-policy"></a>
# 使用子资源完整性、CORS 和 Referrer Policy 保护外部子资源

从第三方 CDN 或外部源加载脚本、样式表、字体或图片时，应通过子资源完整性校验验证其密码学完整性（HTML 中的 `integrity` 和 CSS `url()` 中的 `integrity()`），配置跨源凭据处理（`crossorigin` 和 `cross-origin()`），并限制出站 `Referer` 标头（`referrerpolicy` 和 `referrer-policy()`）。关于文档级内容安全策略和出站连接白名单，参见 `security`（通过 `npx -y modern-web-guidance@latest retrieve "security"` 获取）和 `restrict-outbound-connections`（通过 `npx -y modern-web-guidance@latest retrieve "restrict-outbound-connections"` 获取）。

<a id="1-generate-cryptographic-integrity-digests-for-immutable-assets"></a>
## 1. 为不可变资源生成密码学完整性摘要

子资源完整性（SRI）确保只有当外部资源字节与应用声明的密码学哈希匹配时，浏览器才会执行或呈现该资源。

- **在构建或发布时计算摘要，绝不要根据实时的不可信响应计算**：在构建或发布步骤中，根据已知可靠的本地资源字节生成完整性哈希，或复制包作者发布的官方摘要，然后将其硬编码到 HTML、CSS 或 JavaScript 中。绝不要在浏览器运行时获取第三方 URL，再计算其自身的 `integrity` 哈希；这等于信任远程服务器返回的任意字节，会使 SRI 失去意义。
- **默认使用 `sha384-`**：将完整性元数据格式化为 `<algorithm>-<base64-digest>`，使用 `sha384-`（推荐默认值）、`sha512-` 或 `sha256-`。
- **将外部子资源固定到不可变、带版本的 URL**：始终使用不可变、固定版本或按内容寻址的 URL 引用第三方资源，例如 `https://cdn.example.com/ui@2.4.0/app.min.js`，不要使用可变的浮动 URL，如 `latest/app.min.js`。后者会让网站面临静默的供应链变更，并在远程文件更新时立即破坏 SRI。如果必须加载会原地更新的可变第三方脚本，例如厂商分析标签，则省略该 URL 上的 `integrity`，改用内容安全策略（`strict-dynamic` / nonce）或 iframe 沙箱限制它。
- **当端点可能提供多种有效载荷时，用空格分隔多个摘要**：所有支持 SRI 的浏览器都实现了 `sha256-`、`sha384-` 和 `sha512-`。如果某个 URL 合法地可能返回多种已知可靠载荷之一，例如 A/B 测试、分阶段 CDN 发布或内容协商构建，将同一算法的多个摘要用空白分隔列出，例如 `integrity="sha384-variantA... sha384-variantB..."`。只要响应匹配所列最强算法的*任一*摘要，浏览器就会接受它。
- **为跨源子资源提供 CORS 标头**：只有跨源响应可通过 CORS 读取时，浏览器才能验证其完整性。匿名请求使用 `Access-Control-Allow-Origin: *`；携带凭据的请求则返回精确的请求源，并设置 `Access-Control-Allow-Credentials: true`。

```bash
# Generate a sha384- SRI hash at build time from a known-good local file
printf "sha384-%s\n" "$(openssl dgst -sha384 -binary app.min.js | openssl base64 -A)"
```

```javascript
// Build-time / tooling helper (Node.js 19+, Deno, Bun) to compute an SRI string from known-good local bytes
export async function computeIntegrityMetadata(bytes) {
  const rawBytes =
    typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const digestBuffer = await crypto.subtle.digest('SHA-384', rawBytes);
  const binary = Array.from(new Uint8Array(digestBuffer), (b) =>
    String.fromCharCode(b),
  ).join('');
  return `sha384-${btoa(binary)}`;
}
```

<a id="2-secure-html-scripts-stylesheets-and-preloads"></a>
## 2. 保护 HTML 脚本、样式表和预加载资源

将文档级 `Referrer-Policy: strict-origin-when-cross-origin` HTTP 响应标头设为基础默认策略，或在 `<head>` 中包含 `<meta name="referrer" content="strict-origin-when-cross-origin">`。这样，任何未设置单次请求来源修饰符的子资源或 CSS `url()`，仍会在跨源请求中移除敏感路径和查询参数。

然后，在外部 `<script>`、`<link rel="stylesheet">`、`<link rel="preload">` 和 `<link rel="modulepreload">` 元素上，始终同时设置 `integrity`、`crossorigin` 和 `referrerpolicy`：

- **`integrity="sha384-..."`**：如果响应字节与预期摘要不符，阻止资源执行或应用。对于被阻止的 `<link rel="stylesheet">`，`linkElement.sheet` 保持为 `null`，并触发 `error` 事件。
- **`crossorigin="anonymous"`**（公共 CDN 资源的推荐默认值）或 **`crossorigin="use-credentials"`**：只要在跨源资源上设置了 `integrity`，就必须设置此属性。省略 `crossorigin` 会使浏览器以 `no-cors` 模式获取资源，产生无法进行哈希校验的不透明响应，并阻止该资源。
- **`referrerpolicy="no-referrer"`**（第三方 CDN 的推荐默认值）或 **`referrerpolicy="strict-origin-when-cross-origin"`**：覆盖文档的来源策略，防止通过发送给第三方主机的 `Referer` 请求标头泄露源或路径信息。

```html
<!-- Document-level baseline referrer policy in <head> (or via Referrer-Policy HTTP header) -->
<meta name="referrer" content="strict-origin-when-cross-origin" />

<!-- External stylesheet with SRI, anonymous CORS, and no referrer -->
<link
  rel="stylesheet"
  href="https://cdn.example.com/ui@2.4.0/styles.css"
  integrity="sha384-bs0EksOYBbU/g0IAHMXbSyH1Mgw83GKn+EZlSI+VE+zVchXmSbLwhVLrPzsOWnc5"
  crossorigin="anonymous"
  referrerpolicy="no-referrer"
/>

<!-- External script with SRI, anonymous CORS, and no referrer -->
<script
  src="https://cdn.example.com/ui@2.4.0/bundle.min.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  crossorigin="anonymous"
  referrerpolicy="no-referrer"
></script>
```

通过 `fetch()` 以编程方式获取外部子资源时，传入匹配的 `integrity`、`mode`、`credentials` 和 `referrerPolicy` 选项；摘要不匹配会使 promise 以 `TypeError` 拒绝：

```javascript
const response = await fetch('https://cdn.example.com/ui@2.4.0/manifest.json', {
  integrity: 'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC',
  mode: 'cors',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
});
```

<a id="3-secure-css-images-fonts-and-imported-stylesheets-with-url-modifiers"></a>
## 3. 使用 `url()` 修饰符保护 CSS 图片、字体和导入的样式表

CSS `url()` 请求修饰符（`cross-origin()`、`referrer-policy()` 和 `integrity()`）可直接在 CSS 中控制 CSS 加载资源的获取模式、来源标头和子资源完整性校验。这些资源包括 `background-image`、`content`、`mask-image`、`border-image-source`、`filter`、`@font-face` 的 `src`，以及 `@import` 规则：

| 修饰符函数 | 参数语法与允许值 | 用途 |
|---|---|---|
| `cross-origin(<ident>)` | **不加引号的关键字**：`anonymous`（推荐默认值）或 `use-credentials` | 使用 CORS 获取 CSS 资源，并控制是否发送凭据。对跨源 CSS 资源，始终与 `integrity()` 一起使用。 |
| `referrer-policy(<ident>)` | **不加引号的关键字**：`no-referrer`（第三方资源的推荐默认值）、`strict-origin-when-cross-origin`、`origin`、`same-origin`、`strict-origin`、`origin-when-cross-origin`、`no-referrer-when-downgrade` 或 `unsafe-url` | 为这个特定的 CSS 请求覆盖文档来源策略。 |
| `integrity("<string>")` | **带引号的字符串**：`"sha384-<base64>"`，或以空格分隔的摘要 `"sha384-... sha384-..."` | 在呈现或应用获取到的 CSS 资源之前，根据预期的密码学摘要验证它。 |

编写 `url()` 修饰符时，遵循以下 CSS 语法和安全规则：

- **给 `url("...")` 内的 URL 字符串加引号**：只有当 `url(...)` 中的 URL 是带引号的 `<string>` 时，请求修饰符才有效；未加引号的 URL 不能使用修饰符。
- **每个 `url()` 中每种修饰符最多指定一次**：可以在 `url("..." ...)` 内以任意顺序组合 `cross-origin()`、`referrer-policy()` 和 `integrity()`，但同一种修饰符重复两次无效，例如两个 `integrity()`。要提供多个哈希，在单个 `integrity("sha384-... sha384-...")` 字符串内用空格分隔它们。
- **始终将跨源 `integrity()` 与 `cross-origin(anonymous)` 配对**：虽然 `@font-face` 的 `src` 和 `mask-image` 默认已采用匿名 `cors` 模式获取资源，但 `background-image`、`content`、`border-image-source` 和 `@import` 默认为 `no-cors` 模式，会产生无法进行哈希校验的不透明响应；外部 SVG `filter` 则默认为 `same-origin` 模式，会直接阻止跨源 URL。添加 `cross-origin(anonymous)` 或 `cross-origin(use-credentials)`，可确保各个 CSS 属性都一致地进行 CORS 校验。
- **在 `@import` 和 `@font-face` 规则中，将修饰符放在 `url("...")` 内**：将 `cross-origin()`、`referrer-policy()` 和 `integrity()` 保留在 `url("..." ...)` 内，而将 `format("woff2")` 和 `tech(...)` 等字体描述符保留在 `url(...)` 外。

```css
@import url(
  "https://cdn.example.com/theme@1.2.0/tokens.css"
  cross-origin(anonymous)
  referrer-policy(no-referrer)
  integrity("sha384-bs0EksOYBbU/g0IAHMXbSyH1Mgw83GKn+EZlSI+VE+zVchXmSbLwhVLrPzsOWnc5")
);

@font-face {
  font-family: "BrandSans";
  src: url(
    "https://cdn.example.com/fonts@1.0.0/brand-sans.woff2"
    cross-origin(anonymous)
    referrer-policy(no-referrer)
    integrity("sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC")
  ) format("woff2");
  font-display: swap;
}

.verified-graphic {
  background-image: url(
    "https://cdn.example.com/media@1.0.0/badge.svg"
    cross-origin(anonymous)
    referrer-policy(no-referrer)
    integrity("sha384-Iw/0p59dP96nGTzHvf2XIfqcBwBW7RM6JfOij8uZxyg5azfNaOOUW8SQy6H/hU91")
  );
}
```

<a id="fallback-strategies"></a>
## 回退策略

用于 url() 的 cross-origin() 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 150（2026 年 6 月）、Edge 150（2026 年 7 月）和 Safari 26.2（2025 年 12 月）。
不支持的浏览器：Firefox。

用于 url() 的 referrer-policy() 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 150（2026 年 6 月）、Edge 150（2026 年 7 月）和 Safari 26.2（2025 年 12 月）。
不支持的浏览器：Firefox。

用于 url() 的 integrity() 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

如果你的 Baseline 目标尚不支持 CSS `url()` 请求修饰符（`cross-origin()`、`referrer-policy()` 或 `integrity()`），应结合文档级策略与层叠 CSS 声明，让子资源保持可用并受到保护：

1. **需要跨浏览器 SRI 时，优先使用 HTML `<link rel="stylesheet">`，而非 CSS `@import`**：由于 `<link rel="stylesheet">` 上的 `subresource-integrity` 和 `referrer-policy` 已在所有浏览器中广泛可用，只要必须在每个浏览器中强制实施完整性验证，就使用 `<link rel="stylesheet" href="..." integrity="sha384-..." crossorigin="anonymous" referrerpolicy="no-referrer">` 加载外部样式表，而不是使用 `@import`。
2. **依靠第 2 步的文档级 `Referrer-Policy` 标头或 `<meta name="referrer">`**：在不支持 CSS `url()` 中的 `referrer-policy()` 的浏览器里，文档级 `Referrer-Policy: strict-origin-when-cross-origin` 标头或 `<meta name="referrer" content="strict-origin-when-cross-origin">` 元素，会自动移除跨源 CSS 请求中的敏感路径和查询参数。
3. **通过单独的 CSS 声明层叠实现渐进增强**：如果浏览器不识别 `url("..." ...)` 内的某个修饰符，就会在 CSS 解析时丢弃整条声明。先声明普通的 `url("...")`，再声明带 `cross-origin()` 和 `referrer-policy()` 的版本，供支持这两种修饰符但不支持 `integrity()` 的浏览器使用，最后声明包含 `integrity("sha384-...")` 的完整版本：
   - **绝不要在同一个逗号分隔的 `@font-face` `src` 列表中放入未经验证的 `url()`**：在单个 `src` 描述符中写 `src: url("font.woff2" cross-origin(anonymous) integrity("sha384-...")), url("font.woff2");` 会在运行时绕过子资源完整性校验。如果 CDN 提供了遭篡改的字体，导致 `integrity()` 检查失败，浏览器会将其视为加载失败，并自动回退到逗号后第二个 `url("font.woff2")`。使用**分开的** `src:` 声明，可以确保支持此能力的浏览器在 CSS 解析时覆盖未验证的声明，并在运行时阻止遭篡改的字体。

```css
@font-face {
  font-family: "BrandSans";
  /* 1. Parse-time fallback for browsers without url() modifier support */
  src: url("https://cdn.example.com/fonts@1.0.0/brand-sans.woff2") format("woff2");
  /* 2. Parse-time fallback for browsers supporting cross-origin() and referrer-policy() */
  src: url(
    "https://cdn.example.com/fonts@1.0.0/brand-sans.woff2"
    cross-origin(anonymous)
    referrer-policy(no-referrer)
  ) format("woff2");
  /* 3. Full protection in browsers supporting cross-origin(), referrer-policy(), and integrity() */
  src: url(
    "https://cdn.example.com/fonts@1.0.0/brand-sans.woff2"
    cross-origin(anonymous)
    referrer-policy(no-referrer)
    integrity("sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC")
  ) format("woff2");
  font-display: swap;
}

.verified-graphic {
  background-image: url("https://cdn.example.com/media@1.0.0/badge.svg");
  background-image: url(
    "https://cdn.example.com/media@1.0.0/badge.svg"
    cross-origin(anonymous)
    referrer-policy(no-referrer)
  );
  background-image: url(
    "https://cdn.example.com/media@1.0.0/badge.svg"
    cross-origin(anonymous)
    referrer-policy(no-referrer)
    integrity("sha384-Iw/0p59dP96nGTzHvf2XIfqcBwBW7RM6JfOij8uZxyg5azfNaOOUW8SQy6H/hU91")
  );
}
```

4. **在 JavaScript 中使用 `CSS.supports()` 检测 CSS `url()` 修饰符支持情况**：

```javascript
export function getCssUrlModifierSupport() {
  const supportsCrossOriginAndReferrer =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports(
      'background-image',
      'url("https://example.com/a.svg" cross-origin(anonymous) referrer-policy(no-referrer))',
    );

  const supportsUrlIntegrity =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports(
      'background-image',
      'url("https://example.com/a.svg" cross-origin(anonymous) referrer-policy(no-referrer) integrity("sha384-Iw/0p59dP96nGTzHvf2XIfqcBwBW7RM6JfOij8uZxyg5azfNaOOUW8SQy6H/hU91"))',
    );

  return { supportsCrossOriginAndReferrer, supportsUrlIntegrity };
}
```
