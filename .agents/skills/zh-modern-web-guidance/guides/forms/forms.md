<a id="forms"></a>
# 表单

<a id="1-semantic-structure-and-form-element"></a>
## 1. 语义结构与 Form 元素

<a id="guidelines"></a>
### 准则

- **应当**使用 `<form>` 包裹用于采集数据的交互控件。
- **应当**将搜索表单和筛选控件包裹在 `<search>` 元素中。
- 页面存在多个表单时，**应当**通过指向表单标题的 `aria-labelledby`，为各 `<form>` 提供无障碍名称。
- 敏感数据和状态变更**应当**使用 `method="POST"`；幂等请求（例如搜索）使用 `method="GET"`。
- **应当**通过 `action` 属性指定目标 URL。
- **应当**为每个表单控件指定 `name`，用于在提交时识别数据。
- **应当**使用 `<button type="submit">`、`<textarea>`、`<select>` 和具体类型的 `<input>` 等语义标签。
- **应当**为次要或辅助按钮明确设置 `type="button"`，避免它们默认成为 type="submit"。
- **应当**用 `<fieldset>` 与 `<legend>` 将相关控件分组，`<legend>` 必须是第一个子元素。**不要**只为视觉样式使用没有 `<legend>` 的 `<fieldset>`。
- 提交按钮**应当**使用明确的动作文字，例如“保存更改”。

- **不要**在 `<form>` 中嵌套另一个 `<form>`。
- **不要**用 `GET` 传递敏感数据，否则数据会暴露在历史记录或日志中。
- **不要**用通用的 `<div>`、`<span>` 或 `<a>` 元素代替表单控件。
- **不要**为主要提交按钮设置 `type="button"`。
- **不要**在没有替代布局方案时禁用 textarea 的尺寸调整功能。
- **不要**用 CSS 让表单控件的视觉顺序偏离 DOM 顺序或键盘 `Tab` 顺序。
- 用户更改 `<select>`、单选按钮或复选框时，如果没有明确提交操作，**不要**自动提交表单。

<a id="code-example"></a>
### 代码示例

```html
<search>
  <form action="/search" method="GET">
    <label for="q">Search query</label>
    <input type="search" id="q" name="q">
  
    <fieldset>
      <legend>Search filters</legend>
      <input type="checkbox" id="exact" name="exact" value="true">
      <label for="exact">Exact match only</label>
      <input type="checkbox" id="archived" name="archived" value="true">
      <label for="archived">Include archived results</label>
    </fieldset>

    <button type="submit">Search</button>
  </form>
</search>
```

<a id="selection-control-decision-matrix"></a>
### 选择控件决策表

| 选项数量 | 选择类型 | 推荐元素 | 易用性与无障碍依据 |
| :--- | :--- | :--- | :--- |
| **1** | 二元开关（是/否） | `<input type="checkbox">` | **状态可逆：** 可以用空格选中和取消；单选按钮一旦选中，就不能通过同样操作取消。 |
| **2–5** | 单选（互斥） | `<input type="radio">` | **无需点击即可浏览：** 所有选项立即可见，扫描更快。 |
| **6+** | 单选（互斥） | `<select>` | **节省空间：** 仅在垂直空间宝贵或列表较长时使用。 |
| **10+ / 动态** | 单选（互斥） | `<input list="id">`（`<datalist>`） | **模糊搜索：** 避免在国家等大量选项中反复滚动。 |
| **2+** | 多选 | `<input type="checkbox">` | **标准语义：** 原生的非互斥切换控件。 |

**一句话理解：** “少于六个选项时，将 2 到 5 个互斥选项显示为可见单选按钮；仅在空间受限或列表较长时使用 `<select>`。”

<a id="2-accessible-labeling-and-state"></a>
## 2. 无障碍标签与状态

<a id="guidelines-1"></a>
### 准则

- **应当**始终通过 `for` 和 `id` 将 `<label>` 与对应输入控件关联。
- **应当**在 DOM 中将 `<label>` 放在文本输入框、`<textarea>` 和 `<select>` 之前，并在视觉上放到控件上方，便于快速浏览。
- **应当**将 `<label>` 紧接在 `<input type="checkbox">` 和 `<input type="radio">` 后面同行显示，以保持一致的对齐方式。
- **应当**使用可见标签，并将关键格式要求（例如 `3-12 characters`）放在标签或持续可见的辅助文字中，不要只依赖 `placeholder`。
- **应当**确保标签与输入框之间的垂直间距，小于不同表单组之间的间距（**格式塔接近原则**）。
- 对未通过自定义校验的控件，**应当**设置 `aria-invalid="true"`，解决后再清除。
- **应当**用 `aria-describedby` 将输入框与帮助文本或错误消息关联。
- **应当**在 `<html>` 上声明 `lang`，便于设备正确处理翻译。
- **应当**使用图标、文字等不只依赖颜色的视觉线索表达状态。
- **应当**在标签中明确显示必填要求，并通过 `required` 属性在程序上声明。
- **应当**使用 `aria-live` 宣布动态错误。

- 能使用可见 `<label>` 时，**不要**改用 `aria-label`，也不要使用与可见文字不一致的 `aria-label` 覆盖它。

<a id="code-example-1"></a>
### 代码示例

```html
<div class="field">
  <label for="username">Username: <span aria-hidden="true">*</span></label>
  <input type="text" id="username" name="username" aria-describedby="user-help" required>
  <span id="user-help" class="hint">3-12 characters.</span>
</div>

<style>
  .field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  margin-block-end: 1.5rem;
  }

  input:focus-visible {
    outline: 3px solid #0b57d0;
    outline-offset: 2px;
  }
</style>
```

<a id="3-autofill-and-input-hints"></a>
## 3. 自动填充与输入提示

<a id="guidelines-2"></a>
### 准则

- **应当**使用 `autocomplete` 指定预期数据，例如 `email`、`tel`、`current-password` 和 `new-password`。
- **应当**使用 `inputmode` 优化屏幕键盘，例如 PIN 使用 `inputmode="numeric"`。
- **应当**使用 `enterkeyhint` 设置回车键标签，例如 `next`、`done`。
- 对保存标识符而不是普通文章的字段，**应当**关闭文本纠正：为用户名、电子邮件、URL、代码和搜索框设置 `autocorrect="off"`，并配合 `autocapitalize="none"` 与 `spellcheck="false"`。消息、评论等自由文本字段保留默认设置。
- 信用卡号、电话号码等复杂数字**应当**使用单个输入框，便于自动填充。
- 短信一次性验证码验证**应当**使用单个 `<input type="text" inputmode="numeric" autocomplete="one-time-code">` 与 WebOTP API。参见 `sms-otp-form`，通过 `npx -y modern-web-guidance@latest retrieve "sms-otp-form"` 获取。

- 信用卡号、邮政编码和一次性验证码**不要**使用 `type="number"`，它会引起界面滚动问题，并移除前导零。
- **不要**把一个值，例如六位 OTP、电话号码或信用卡号，拆到多个按键后自动跳焦的 `<input>` 中。应使用 `type="text"` 配合 `inputmode="numeric"`，因为 `type=number` 会添加微调按钮。必要时，可以通过样式模拟分格外观；JS 可设置 `--value-length` CSS 变量，实现更精确的类似外观，同时避免原模式的易用性和无障碍问题。
- **不要**在密码、验证码或其他认证字段中阻止复制粘贴（`paste` 事件），也不要禁用 `autocomplete`。

<a id="code-example-2"></a>
### 代码示例

```html
<label for="zip">ZIP Code:</label>
<input type="text" id="zip" name="zip" autocomplete="postal-code" inputmode="numeric" pattern="\d{5}" enterkeyhint="next">

<label for="username">Username:</label>
<input type="text" id="username" name="username" autocomplete="username" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="done">
```

<a id="4-constraints-and-validation"></a>
## 4. 约束与校验

<a id="guidelines-3"></a>
### 准则

- **应当**使用原生约束：`required`、`minlength`、`maxlength`、`pattern`。
- **应当**使用 `:user-invalid` 等 CSS 伪类，提供不打扰用户的样式。
- **应当**使用 ValidityState API（`setCustomValidity`）自定义提示，并编写清楚说明如何解决问题的错误消息。
- 表单提交未通过校验时，**应当**将焦点移到第一个无效字段或错误摘要。

- **不要**仅用原始 `:invalid` CSS 伪类显示错误，以免用户尚未交互，空的必填字段就已被标为无效。
- **不要**通过禁用提交按钮来阻止校验；应允许提交并突出显示错误。不过，用户点击有效提交*之后*，**应当**禁用按钮，防止重复发送。
- 用户输入时，**不要**每按一个键就触发校验错误或 `aria-live` 错误朗读；应在提交或 `blur` 时校验，并在用户通过 `input` 修正后清除错误。

<a id="code-example-3"></a>
### 代码示例

```html
<label for="code">Activation Code (4 digits):</label>
<input type="text" id="code" name="code" required pattern="\d{4}">

<script>
  const input = document.getElementById('code');
  input.addEventListener('invalid', () => {
    input.setCustomValidity('Please enter exactly 4 digits.');
  });
  input.addEventListener('input', () => {
    input.setCustomValidity('');
  });
</script>
```

<a id="validation-event-timing-matrix"></a>
### 校验事件时机表

| 触发事件 | 阶段 | 允许的操作 | 用户体验 / 无障碍依据 |
| :--- | :--- | :--- | :--- |
| **`input`** | 正在输入 | 仅**清除**已有错误。 | **不打扰：** 不要在用户尚未输入完时大声报错。 |
| **`blur` / `focusout`** | 离开字段 | 字段被修改时**运行**检查并显示错误。 | **结合上下文校验：** 用户表明已“完成”字段时再检查。 |
| **`submit`** | 最终尝试 | **拦截**并转移焦点。 | **最终关卡：** 拦截无效数据，将键盘与屏幕阅读器焦点移到第一个无效字段或错误摘要。 |

**一句话理解：** “在 `blur` 时校验已修改字段，避免输入中出现过早警告；用户修正值后，通过 `input` 立即重置错误状态，并在 `submit` 时将焦点移到首个错误或错误摘要。”

**安全与用户体验的边界：** 客户端校验服务于用户体验；服务器端校验服务于安全。绝不能把浏览器约束当作数据完整性的安全防线。

<a id="5-responsive-design-and-typography"></a>
## 5. 响应式设计与字体排版

<a id="guidelines-4"></a>
### 准则

- **应当**使用单列布局，便于浏览。
- **应当**为表单控件设置 `font: inherit` 和 `font-size: max(1rem, 1em)`，随更大容器缩放，同时至少保持 `1rem`（16px），防止 iOS 自动缩放。
- **应当**利用内边距技巧扩大移动设备的可点击区域。
- **应当**确保触摸目标至少为 `48px`。
- **应当**使用相对根元素的单位（`rem`）和无单位的 `line-height`。
- **应当**使用 CSS 逻辑属性，例如 `margin-inline-start`，支持 RTL。

<a id="code-example-4"></a>
### 代码示例

```css
.form-group {
  margin-block-end: 1.5rem;
}

/* Expand clickable tap area without layout shift */
label {
  display: inline-block;
  padding: 10px 0;
  margin: -10px 0;
}

input {
  font: inherit;
  font-size: max(1rem, 1em);
  padding: 0.75rem;
  min-height: 48px;
  box-sizing: border-box;
}

@media (pointer: coarse) {
  input {
    min-height: 52px;
  }
}
```

<a id="6-styling-form-controls"></a>
## 6. 表单控件样式

<a id="guidelines-5"></a>
### 准则

- **应当**使用 `accent-color`，快速为原生单选按钮和复选框应用品牌色。
- **应当**使用 `appearance: none` 自定义下拉箭头，同时保留语义。
- **应当**提供对比度足够的边框，让输入框清晰可见，例如白色背景上使用 `#767676` 或更深的颜色。
- **应当**为所有控件保留清晰的 `:focus-visible` 指示。没有提供高对比度替代样式时，绝不能关闭焦点轮廓（`outline:none`）。
- **应当**使用标准的 `.visually-hidden` 写法在视觉上隐藏输入框，即 `clip-path: inset(50%)` 配合 1px 尺寸；**不要**使用会将其移出无障碍树的 `display: none`。

<a id="code-example-5"></a>
### 代码示例

```html
<div class="checkbox-container">
  <input type="checkbox" id="sub" name="sub" class="visually-hidden">
  <label for="sub" class="checkbox-label">Subscribe</label>
</div>

<style>
  .visually-hidden {
    position: absolute;
    clip-path: inset(50%);
    overflow: hidden;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    white-space: nowrap;
  }
  .checkbox-label::before {
    content: "";
    display: inline-block;
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid #767676;
  }
  input:focus-visible + .checkbox-label::before {
    outline: 2px solid #0b57d0;
  }
</style>
```

<a id="7-javascript-and-ajax"></a>
## 7. JavaScript 与 AJAX

<a id="guidelines-6"></a>
### 准则

- 在聊天或文本输入框中将 `Enter` 视为提交操作之前，**应当**检查 `KeyboardEvent.isComposing`，避免打断 IME 组合输入。参见 `ime-safe-enter-submit`，通过 `npx -y modern-web-guidance@latest retrieve "ime-safe-enter-submit"` 获取。
- 使用 AJAX 提交表单时，**应当**通过 `e.preventDefault()` 阻止默认导航。
- **应当**使用 `ValidityState` 接口执行实时校验。
- **应当**通过 `role="status"` 或 `aria-live` 宣布 AJAX 提交结果。
- 动态展开界面内容时，**应当**使用 `aria-expanded` 与 `aria-controls`。

- JS 失败时，**不要**阻断页面提交，应确保存在服务器端回退路径。

<a id="code-example-6"></a>
### 代码示例

```js
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);
  // fetch('/submit', { method: 'POST', body: data });
});
```

<a id="8-identity-payments-and-advanced-security"></a>
## 8. 身份、支付与高级安全

<a id="guidelines-7"></a>
### 准则

- 注册时**应当**使用 `autocomplete="new-password"`，登录时使用 `autocomplete="current-password"`。
- **应当**允许向密码字段粘贴。
- **应当**提供带 `aria-pressed` 的无障碍切换按钮 `<button type="button">`，让用户查看未遮蔽的密码。
- 支付按钮**应当**显示准确金额，例如“支付 $100”。
- **应当**使用 `autocomplete="cc-number"`、`cc-exp` 和 `cc-csc`。
- 所有页面**应当**使用 HTTPS。
- 对修改状态的操作（POST/PUT/DELETE），**应当**实现密码学安全的防 CSRF 令牌。
- 将用户输入注入 DOM 之前，**应当**先进行清理，例如使用 DOMPurify，以防 XSS。
- 对开放表单，**应当**使用可访问的验证码，例如不可见 reCAPTCHA，或对辅助技术隐藏的蜜罐字段（`tabindex="-1"` 与 `aria-hidden="true"`），防止垃圾提交。

- 执行状态变更的端点**不要**使用 HTTP `GET`。
- **不要**在表单标记内直接使用内联 JavaScript，例如 `onclick="..."`，以满足严格的内容安全策略（CSP）。

<a id="code-example-7"></a>
### 代码示例

```html
<form method="post">
  <input type="hidden" name="csrf_token" value="secure_token_abc123">

  <h1>Sign up</h1>

  <div class="form-group">        
    <label for="name">Full name</label>
    <input id="name" name="name" autocomplete="name" required pattern="[\p{L}\.\- ]+">
  </div>

  <div class="form-group">        
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
  </div>

  <div class="form-group">
    <label for="password">Password</label>
    <button id="toggle-password" type="button" aria-pressed="false" aria-label="Show password" aria-describedby="toggle-warning">
      <img class="icon-eye" src="/icons/eye.svg" alt="" width="20" height="20">
      <img class="icon-eye-off" src="/icons/eye-off.svg" alt="" width="20" height="20">
    </button>
    <span id="toggle-warning" class="visually-hidden">Warning: this will display your password on the screen.</span>
    <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" aria-describedby="password-constraints" required>
    <div id="password-constraints">Eight or more characters.</div>
  </div>

  <button id="sign-up" type="submit">Sign up</button>
</form>
```


<a id="9-address-collection"></a>
## 9. 地址采集

<a id="guidelines-8"></a>
### 准则

- 姓名**应当**使用单个字段。
- **应当**使用 `autocomplete="street-address"`。
- 如果站点用户来自不同国家，地址**应当**使用 `<textarea>`，兼容不同地区的地址格式。如果表单将地址拆为街道、城市等独立输入框，**应当**使用 `address-line1`、`address-line2` 等 `autocomplete` 值。
- 邮政编码**应当**设为可选。
- 同时采集配送地址和账单地址时，**应当**提供“与配送地址相同”的复选框，并在 `<fieldset>` 内通过 `shipping` 或 `billing` 限定 `autocomplete` 范围。

- 面向全球用户时，**不要**把姓名输入拆成固定的“名”和“姓”变量。
- 姓名和用户名**不要**仅允许拉丁字符。

<a id="code-example-8"></a>
### 代码示例

```html
<!-- Accessible Address Form with Autofill -->
<form action="/save-address" method="POST">
  <div class="form-group">
    <label for="full-name">Full name</label>
    <input type="text" id="full-name" name="full_name" maxlength="100" required autocomplete="name">
  </div>

  <div class="form-group">
    <label for="address">Address</label>
    <textarea id="address" name="address" required autocomplete="street-address" maxlength="300"></textarea>
  </div>

  <button type="submit">Save Address</button>
</form>
```


<a id="10-usability-testing-and-analytics"></a>
## 10. 易用性测试与分析

<a id="guidelines-9"></a>
### 准则

- **应当**在多种设备、浏览器和屏幕尺寸上测试表单。
- **应当**测试仅用键盘的导航，包括 `Tab`、`Shift+Tab`、`Space`、`Enter` 和方向键，并验证可见焦点。
- **应当**使用浏览器工具模拟视觉、运动等不同障碍。
- **应当**利用分析数据监测表单完成率和跳出位置。
- **应当**跟踪字段聚焦、点击等离散事件，发现细微的操作阻力。

- **不要**仅依赖 Lighthouse 等自动化工具判断易用性，还应邀请真实用户测试。
- **不要**在标准事件标签中记录敏感个人数据。

<a id="code-example-9"></a>
### 代码示例

```html
<form action="/submit" method="POST" id="track-form">
  <label for="postal-code">ZIP or postal code</label>
  <input type="text" id="postal-code" name="postal-code" autocomplete="postal-code" maxlength="20" required>
  <button type="submit" id="submit-btn">Submit</button>
</form>

<script>
  const trackForm = document.getElementById('track-form');
  const trackBtn = document.getElementById('submit-btn');
  
  trackBtn.addEventListener('click', () => {
    console.log('Analytics Event: Submit clicked');
  });
</script>
```

<a id="11-multi-page-forms"></a>
## 11. 多页表单

<a id="guidelines-10"></a>
### 准则

- **应当**使用清楚的标签和无障碍进度指示器，例如 `aria-current="step"` 或 `<progress>`，明确展示多页表单的进度。
- **应当**允许用户在页面之间前进和后退，而不丢失已填写数据。
- 在不整页重新加载的动态步骤切换中，**应当**将焦点移到新步骤的标题（`tabindex="-1"`）或第一个输入框。
- **应当**使用符合上下文的 `enterkeyhint` 值，例如 `"previous"` 和 `"next"`，引导用户通过屏幕键盘导航。
- **应当**设计不会被移动键盘遮住输入框或按钮的布局，例如在聚焦时将它们放到视口上半部，或使用 CSS scroll-padding。

- **不要**让未激活的向导步骤继续保留在键盘 `Tab` 顺序或无障碍树中；应为其使用 `hidden`、`display: none` 或 `inert`。

<a id="code-example-10"></a>
### 代码示例

```html
<nav aria-label="Progress">
  <ol class="progress-tracker">
    <li class="step-done">Step 1: Account (completed)</li>
    <li class="step-active" aria-current="step">Step 2: Shipping</li>
    <li class="step-todo">Step 3: Payment</li>
  </ol>
</nav>

<button type="button" onclick="history.back()" enterkeyhint="previous">Previous</button>
<button type="submit" enterkeyhint="next">Next</button>
```
