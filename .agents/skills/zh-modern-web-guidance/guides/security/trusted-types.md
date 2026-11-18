<a id="prevent-dom-based-xss-attacks-with-trusted-types"></a>
# 使用 Trusted Types 防止基于 DOM 的 XSS 攻击

Trusted Types 是一项安全特性，要求传入“危险”浏览器 API（称为接收点，sink）的数据，先转换为 `TrustedHTML` 等特定类型，从而帮助防止基于 DOM 的跨站脚本攻击（DOM XSS）。

默认情况下，许多 DOM API，例如 `innerHTML` 或 `document.write`，接受原始字符串。如果字符串包含来自不可信来源的恶意脚本，脚本就可能被执行。Trusted Types 会改变这一行为：通过 CSP 启用后，这些接收点只接受由获准策略创建的 `TrustedHTML` 对象。

<a id="key-implementation-details"></a>
## 关键实现细节

使用 Trusted Types 主要分四步：

1. 定义安全策略，指定如何净化或转换字符串。
2. 使用该策略，将原始字符串转换为 Trusted Type 对象。
3. 向 DOM 接收点写入时使用 Trusted Type 对象。
4. 通过内容安全策略（CSP）强制实施 Trusted Types。

<a id="1-creating-a-policy"></a>
### 1. 创建策略

策略是一组净化内容的规则。通过 `trustedTypes.createPolicy()` 创建策略，通常将具体处理交给 DOMPurify 等净化库，或应用自身的 HTML 转义规则：

```javascript
import DOMPurify from 'dompurify';

const myPolicy = trustedTypes.createPolicy('sanitize-html', {
  createHTML: (input) =>
    // Return a sanitized string; createPolicy() wraps it in a TrustedHTML object.
    // Example using DOMPurify:
    DOMPurify.sanitize(input, { RETURN_TRUSTED_TYPE: false }),
});

// Example using HTML escaping (for environments without third-party sanitizers):
const escapePolicy = trustedTypes.createPolicy('escape-html', {
  createHTML: (input) =>
    String(input)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;'),
});
```

> [!WARNING]
> 字符级 HTML 转义（`escapePolicy`）会将所有标记转换为纯文本，它**不是**能够理解上下文的 HTML 净化器。如果只需要纯文本，优先使用 `element.textContent`，它不是 Trusted Types 接收点。绝不要将 `escapePolicy.createHTML()` 的输出插值到另一个 HTML 模板字符串中，例如未加引号的属性（`<img src=${escaped}>`），或 URL 属性（`<a href="${escaped}">`，其中的 `javascript:` URL 不会因实体转义而失效）。只要接受 HTML 标记或属性，就使用完整的 HTML 净化器，如 `DOMPurify` 或 `element.setHTML()`；它们在 `sanitize-untrusted-html` 中介绍，可通过 `npx -y modern-web-guidance@latest retrieve "sanitize-untrusted-html"` 获取。

<a id="2-using-the-policy"></a>
### 2. 使用策略

调用策略的创建方法，而不是直接将字符串传给接收点。

```javascript
const untrustedInput = '<p>Hello, <strong>world</strong>!</p><img src="x" onerror="alert(1)">';

// In an enforced environment, this would throw a TypeError:
// element.innerHTML = untrustedInput;

// This returns a TrustedHTML object with unsafe elements and attributes removed:
const cleanHTML = myPolicy.createHTML(untrustedInput);
// Result: "<p>Hello, <strong>world</strong>!</p><img src=\"x\">"
```

<a id="3-transitioning-sinks-to-use-trusted-types"></a>
### 3. 将接收点迁移为使用 Trusted Types

更新每一处向接收点写入的位置，先将数据转换为 Trusted Type 对象。为帮助定位需要更新的代码，可以定义临时的 `default` 策略，在接收点被写入字符串而不是 TrustedType 时记录日志。

```javascript
trustedTypes.createPolicy("default", {
  createHTML(value) {
    console.warn("String passed instead of Trusted Type.");
    return DOMPurify.sanitize(value, { RETURN_TRUSTED_TYPE: false });
  },
});
```

支持 Trusted Types 的常见接收点包括：
- **HTML：**`element.innerHTML`、`element.outerHTML`、`document.write()`、`element.setHTMLUnsafe()`、`Document.parseHTMLUnsafe()`
- **Script：**`<script>` 文本内容、`eval()`
- **ScriptURL：**`<script src>`、`Worker()`、`SharedWorker()`

```javascript
// Assign the TrustedHTML object.
element.innerHTML = cleanHTML;
```

注意，“安全”的 HTML 净化方法，即 `element.setHTML()` 和 `Document.parseHTML()`，不需要 Trusted Types 策略，因为它们始终通过原生实现净化潜在的 XSS 攻击。这些方法在 `sanitize-untrusted-html` 中介绍，可通过 `npx -y modern-web-guidance@latest retrieve "sanitize-untrusted-html"` 获取。

<a id="4-enforcing-trusted-types-with-csp"></a>
### 4. 使用 CSP 强制实施 Trusted Types

Trusted Types 应逐步上线，以免破坏应用。完全强制实施提供最强的保护，但如果尚未迁移所有接收点写入操作，就有使网站功能失效的风险。

<a id="prerequisites"></a>
#### 前置条件

- **框架配合**：如果应用框架，或任何会向 DOM 接收点写入的第三方库，不生成 `TrustedHTML` 或 `TrustedScript` 值，就无法在不破坏这些代码的情况下强制实施 Trusted Types。开始上线前应审计框架支持情况。
- **重构接收点**：确保已识别并重构危险接收点，使其使用你的 Trusted Types 策略。

<a id="rollout-strategy"></a>
#### 上线策略

1. **仅报告**：首先使用 `Content-Security-Policy-Report-Only` 标头上线。它会将违规记录到报告端点，但不会实际阻止写入。
    ```http
    Content-Security-Policy-Report-Only: require-trusted-types-for 'script';
    ```
2. **强制实施**：完成策略集成，且违规报告降至零后，再转为完全强制实施。

    ```http
    Content-Security-Policy: require-trusted-types-for 'script';
    ```

你还可以限制允许创建哪些策略：列出自己的策略名称，例如 `sanitize-html` 或 `escape-html`；如果策略委托给 `DOMPurify.sanitize()`，应包含 `dompurify`，因为它会在内部创建一个 `dompurify` 策略；如果迁移期间注册了默认策略，也应包含 `default`。

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types sanitize-html escape-html dompurify;
```

启用此 CSP 后，任何未使用 Trusted Types 的接收点写入都会抛出错误。此外，尝试创建名称未列入 `trusted-types` 的 Trusted Type 策略，也会抛出错误。

也可以将此 CSP 作为 `<meta>` 标签放在文档的 `<head>` 中，不过这种方式的安全性可能较低。

```html
<!-- First child of `<head>`, as earlier tags will not enforce this CSP. -->
<meta
  http-equiv="Content-Security-Policy"
  content="require-trusted-types-for 'script'; trusted-types sanitize-html escape-html dompurify;"
/>
```

<a id="fallback-strategies"></a>
## 回退策略

Trusted Types 的 Baseline 状态：新近可用。自 2026-02-24 起纳入 Baseline。
支持的浏览器：Chrome 83（2020 年 5 月）、Edge 83（2020 年 5 月）、Firefox 148（2026 年 2 月）和 Safari 26（2025 年 9 月）。

对于尚不支持 Trusted Types 的浏览器，可以使用极小的 “tinyfill”，在仍提供净化的同时，确保代码不会出错。

```javascript
if (!window.trustedTypes) {
  window.trustedTypes = {
    createPolicy: (name, rules) => rules,
  };
}
```

这样，你现在就可以按照 Trusted Types 模式编写代码。支持的浏览器会强制检查类型，较旧的浏览器则仍通过模拟策略执行净化逻辑。

如果浏览器不支持 Trusted Types，在使用 tinyfill 时，它只会将 `TrustedHTML` 对象视为字符串，或不会在接收点层面进行强制检查。
