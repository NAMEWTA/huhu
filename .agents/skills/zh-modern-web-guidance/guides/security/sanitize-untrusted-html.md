<a id="sanitizing-untrusted-html"></a>
# 净化不可信的 HTML

安全地显示用户生成的 HTML 是一项常见的安全挑战。原生 **Sanitizer API** 提供浏览器内置且经过优化的方式，可在内容进入 DOM 之前移除危险内容，例如 `<script>` 标签或 `on*` 属性。

客户端净化保护的是呈现内容的页面。如果同一份用户生成内容还会在其他地方呈现，例如其他客户端、服务器渲染的页面或邮件，也应在服务器上净化，作为纵深防御，并确保服务器与客户端的净化规则不冲突。

<a id="1-safely-inserting-html-with-sethtml"></a>
## 1. 使用 `setHTML()` 安全插入 HTML

使用 Sanitizer API 的主要方式，是调用任意 `Element` 上的 `setHTML()` 方法。此方法一次完成解析、净化和插入，确保针对内容即将插入的具体上下文进行净化。

```javascript
const untrustedHTML = `
  <p>Hello!</p>
  <script>alert('XSS')</script>
  <img src="x" onerror="alert('XSS')">
  <div onclick="doBadThing()">Click me</div>
`;

const container = document.getElementById('output');

// Sanitize and insert in one call
// The default sanitizer removes scripts and event handlers, plus other
// elements and attributes outside its built-in allowlist (such as style)
container.setHTML(untrustedHTML);
```

<a id="2-using-custom-sanitizer-configurations"></a>
## 2. 使用自定义 Sanitizer 配置

通过创建 `Sanitizer` 实例，可以自定义净化规则，精确定义特定使用场景允许的元素和属性。

使用 `Element.setHTML()` 和 `Document.parseHTML()` 时，默认的 `Sanitizer` 设置会移除所有存在 XSS 风险的元素和属性。你无法创建更宽松的 `Sanitizer` 来允许这些元素，但可以进一步收紧允许的范围。

```javascript
// Define a restrictive configuration that only allows the specified elements and attributes.
const config = {
  elements: ["p", "b", "i", "strong", "em"],
  attributes: ["class"],
  replaceWithChildrenElements: ['div']
};

const mySanitizer = new Sanitizer(config);

// Apply custom sanitization
container.setHTML(untrustedHTML, { sanitizer: mySanitizer });
```

不在 `elements` 中的元素会**连同其内容一起**移除。如果要保留某些包装元素中的文本，例如上面的 `div`，应将这些包装元素列入 `replaceWithChildrenElements`，这样会移除元素本身，但保留其子节点。

如果需要更宽松的 `Sanitizer`，允许某些存在 XSS 风险的元素或属性，可以将自定义 Sanitizer 与 `Element.setHTMLUnsafe()` 和 `Document.parseHTMLUnsafe()` 配合使用。

<a id="3-parsing-user-input-with-documentparsehtml"></a>
## 3. 使用 `Document.parseHTML()` 解析用户输入

如果需要解析不可信 HTML，但不想立即将其插入活动 DOM，使用 `Document.parseHTML()`。此方法返回一个按默认或自定义规则净化后的 `Document`，你可以在插入前检查或转换净化后的节点，例如构建预览或提取文本。

将得到的节点直接移动到页面中，不要将其序列化为字符串后再用 `innerHTML` 重新解析，否则可能重新引入变异型 XSS（mXSS）。

```javascript
const rawHTML = '<p>Hello <script>console.log("bad")</script></p>';

const doc = Document.parseHTML(rawHTML);
// doc.body now contains the sanitized nodes: <p>Hello </p>
preview.replaceChildren(...doc.body.childNodes);
```

<a id="fallbacks--browser-support-for-sanitizer-api"></a>
## Sanitizer API 的回退与浏览器支持

Sanitizer API 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 146（2026 年 3 月）、Edge 146（2026 年 3 月）和 Firefox 148（2026 年 2 月）。
不支持的浏览器：Safari。

如果目标浏览器不支持原生 Sanitizer API，仅在缺少原生支持时加载 **DOMPurify** 等库，避免向不需要它的浏览器分发。使用 `in` 进行特性检测，使检测本身也能在旧浏览器中工作。

```javascript
let domPurifyPromise;

function loadDOMPurify() {
  // Code-split with your bundler so DOMPurify is only downloaded when needed
  domPurifyPromise ??= import('dompurify').then((mod) => mod.default ?? mod);
  return domPurifyPromise;
}

export async function safeSetHTML(el, html) {
  const elements = ['p', 'b', 'i', 'strong', 'em'];
  const attributes = ['class'];

  if ('setHTML' in Element.prototype) {
    // setHTML() accepts a plain configuration object as the sanitizer
    el.setHTML(html, { sanitizer: { elements, attributes } });
  } else {
    const DOMPurify = await loadDOMPurify();
    el.innerHTML = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...elements, '#text'],
      ALLOWED_ATTR: attributes,
      // Match the native Sanitizer: strip aria-*/data-* and disallowed element content
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: false
    });
  }
}
```

默认情况下，DOMPurify 会保留 `aria-*` 和 `data-*` 属性，即使指定了 `ALLOWED_ATTR` 也是如此，同时还会保留被移除元素的文本内容；原生 Sanitizer 则移除 `aria-*` 和 `data-*` 属性，并将不允许的元素及其内容一起移除。设置 `ALLOW_ARIA_ATTR: false`、`ALLOW_DATA_ATTR: false`、`KEEP_CONTENT: false` 并允许 `#text`，可使 DOMPurify 与原生行为一致。DOMPurify 没有与 `replaceWithChildrenElements` 等价的内置选项，因此需要一致回退行为的配置应避免使用该选项。

如果页面强制使用 Trusted Types（`require-trusted-types-for 'script'`），向 `innerHTML` 赋字符串会抛出异常。`setHTML()` 不需要 Trusted Types 策略，但回退实现需要：向 `DOMPurify.sanitize()` 传入 `RETURN_TRUSTED_TYPE: true`，并在 CSP 的 `trusted-types` 指令中允许其 `dompurify` 策略名称。
