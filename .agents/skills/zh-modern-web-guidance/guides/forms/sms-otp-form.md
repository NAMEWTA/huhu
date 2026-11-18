<a id="sms-otp-form-verification"></a>
# 短信一次性验证码表单验证

通过短信发送一次性验证码（OTP），常用于手机号验证、账户恢复、加强身份验证和支付确认。用户在浏览器与短信应用之间切换，以记住或复制粘贴多位验证码，会增加操作阻力和放弃率，也会使用户容易受到仿冒域名上的钓鱼攻击。

结合语义 `<form>` 标记、`<input autocomplete="one-time-code" inputmode="numeric">`、绑定来源的短信格式（`@domain #code`）以及 WebOTP API（`OTPCredential`），可以建立分层、渐进增强的验证流程：

1. **自动提取并提交：** 支持 WebOTP API 的浏览器会用短信中的 `@domain #code` 行校验来源，填入 `<input>`，并通过一次点击触发验证。
2. **绑定来源的键盘自动填充：** 支持 `autocomplete="one-time-code"` 的浏览器和操作系统，例如 iOS、iPadOS 和 macOS 上的 Safari，会解析 `@domain #code` 消息，并且仅在域名匹配时，在键盘自动填充栏中建议该验证码。
3. **顺畅的手动输入：** 从另一台设备读取验证码的用户，可以通过 `inputmode="numeric"` 使用数字虚拟键盘，而不必承受 `<input type="number">` 的易用性问题。

<a id="security-considerations"></a>
## 安全注意事项

短信 OTP 可以验证用户是否持有某个电话号码，并提供便捷的加强验证，但短信传输和电话号码可能遭遇 SIM 卡劫持、号码回收及拦截。客户端自动填充和 WebOTP API 应始终配合绑定来源的 `@domain #code` 短信格式，让浏览器及操作系统在建议或交付验证码前验证目标域名是否匹配。对于需要抵御钓鱼的主要身份验证，应优先选择通行密钥，而不是短信验证码（参见 `passkeys`，通过 `npx -y modern-web-guidance@latest retrieve "passkeys"` 获取）。

<a id="semantic-form-markup"></a>
## 语义化表单标记

将验证控件放在语义 `<form>` 元素中，使用 `method="POST"`，并提供明确的 `<button type="submit">`。始终使用单个 `<input>`，不要把每位数字拆到多个框中。

- **使用 `type="text"` 配合 `inputmode="numeric"`：** OTP 绝不能使用 `type="number"`。一次性验证码是可能带前导零的标识符字符串，例如 `012345`，不是可计数的数量。`type="number"` 会添加增减微调按钮，可能去掉前导零，还允许滚轮意外改变数值。也应避免使用 `type="tel"`，这是一种面向完整电话号码的旧式变通方案。将 `type="text"` 与 `inputmode="numeric"` 组合，即可在移动设备上提供纯数字虚拟键盘。
- **添加 `autocomplete="one-time-code"`：** 提示浏览器和操作系统在 `<input>` 聚焦时，在自动填充栏中建议收到的短信验证码。
- **把操作提示放在 `<input>` 上方：** 通过 `for` 和 `id` 关联一个可见 `<label>`，并将格式说明通过 `aria-describedby` 关联，在视觉上放在 `<input>` **上方**，避免自动填充弹出层和移动虚拟键盘遮挡说明。
- **不要将数字拆到多个 `<input>`：** 多框 OTP 模式，例如六个独立的 `maxlength="1"` 输入框，会破坏许多浏览器原生的 `autocomplete="one-time-code"` 自动填充，妨碍复制粘贴，并增加屏幕阅读器导航难度。如果需要分段视觉设计，请为单个 `<input>` 设置 `letter-spacing` 和等宽字体。

```html
<form id="otp-form" action="/verify-otp" method="POST">
  <div class="form-group">
    <label for="otp-input">Verification code</label>
    <!-- Place the hint above the input so autofill popovers and mobile keyboards do not obscure it -->
    <p id="otp-format-hint" class="field-hint">
      Enter the 6-digit code sent to your phone.
    </p>
    <!-- MANDATORY: Use a single input with type="text", inputmode="numeric", and autocomplete="one-time-code" -->
    <input
      type="text"
      id="otp-input"
      name="otp"
      inputmode="numeric"
      autocomplete="one-time-code"
      pattern="\d{6}"
      maxlength="6"
      aria-describedby="otp-format-hint"
      required>
  </div>
  <button type="submit">Verify code</button>
</form>
```

```css
/* Optional: Style a single input to visually space digits without splitting the DOM element */
#otp-input {
  font-family: ui-monospace, monospace;
  font-size: 1.25rem; /* Example value: must be at least 1rem (16px) to prevent mobile browser auto-zoom */
  letter-spacing: 0.35em;
  min-height: 48px;
  padding: 0.5rem 0.75rem;
  box-sizing: border-box;
}
```

<a id="origin-bound-sms-message-format"></a>
## 绑定来源的短信格式

要让 WebOTP API 和 Safari 的域名绑定 `autocomplete="one-time-code"` 自动填充，都能验证验证码属于你的站点，后端短信服务必须将短信的**最后一行**格式化为：来源域名前加 `@`，OTP 前加 `#`：

```text
Your verification code is 123456.

@example.com #123456
```

对发出的短信强制执行以下格式规则：

- **先放可读说明：** 短信始终以包含验证码的清晰自然语言句子开头，方便在另一台设备上手动输入的用户阅读。
- **将 `@<domain> #<otp>` 放在最后一行：** `@` 必须是最后一行的第一个字符，之后不能再有其他行或签名文本。
- **仅使用主机域名：** 不要在 `@domain` 标记中包含 URL 协议（`https://` 或 `http://`）、端口（`:8080`）或路径（`/verify`）。
- **标记之间只用一个空格：** 在 `@<domain>` 与 `#<otp>` 之间恰好放一个空格，域名内部以及 `#` 与验证码之间都不能出现空白。

<a id="integrating-the-webotp-api-into-your-verification-flow"></a>
## 将 WebOTP API 集成到验证流程

WebOTP API（`OTPCredential`）要求安全上下文，生产环境使用 `https://`，本地开发可使用 `http://localhost`。不要粘贴一段游离于界面生命周期之外、查询 DOM 后调用 `form.submit()` 的 `DOMContentLoaded` 脚本；应将 `navigator.credentials.get()` 直接集成到验证界面的生命周期和提交处理器中：

- **将请求生命周期绑定到当前 OTP 步骤：** 验证输入框完成渲染并处于活动状态时开始监听 OTP，例如用户请求短信验证码后挂载 OTP 步骤时，以及每次点击“重新发送验证码”时。
- **在所有退出路径中管理 `AbortController`：** 向 `navigator.credentials.get()` 传入 `AbortSignal`（`signal: ac.signal`）。以下情况都应调用 `ac.abort()`：
    - 用户手动提交表单，或提交通过 `autocomplete="one-time-code"` 填入的验证码。
    - 请求新短信验证码，即“重新发送验证码”；先中止旧 controller，再创建新的。
    - 验证组件、对话框或路由卸载。
- **触发应用的提交处理器（`form.requestSubmit()`）：** `navigator.credentials.get()` 返回 `otp` 后，设置 `otpInput.value = otp.code`，然后调用 `form.requestSubmit()`，或直接调用验证函数。**不要**调用 `form.submit()`，因为 `form.submit()` 会绕过 `submit` 事件监听器（`event.preventDefault()` / `fetch()` 处理器），也会跳过原生约束校验。

```javascript
const otpForm = document.getElementById('otp-form');
const otpInput = document.getElementById('otp-input');

let otpAbortController = null;

function stopSmsOtpListener() {
  if (otpAbortController) {
    otpAbortController.abort();
    otpAbortController = null;
  }
}

async function startSmsOtpListener() {
  // Feature-detect WebOTP support
  if (!otpInput || !('OTPCredential' in window)) {
    return;
  }

  // Cancel any previous pending WebOTP request (e.g., when re-sending an SMS code)
  stopSmsOtpListener();
  const ac = new AbortController();
  otpAbortController = ac;

  try {
    const otp = await navigator.credentials.get({
      otp: { transport: ['sms'] },
      signal: ac.signal,
    });

    if (!otp) return;
    otpInput.value = otp.code;

    // Trigger standard form submission so submit event listeners and validation run
    if (otpForm) {
      otpForm.requestSubmit();
    }
  } catch (err) {
    // Expected when aborted by manual submission, resend, unmount, or user dismissal
    if (err && err.name === 'AbortError') {
      return;
    }
    console.error('WebOTP verification error:', err);
  }
}

otpForm.addEventListener('submit', async (event) => {
  // MANDATORY: Abort any in-flight WebOTP request when the form is submitted
  stopSmsOtpListener();

  // Application-specific submission logic (e.g., AJAX fetch or native POST)
  event.preventDefault();
  const formData = new FormData(otpForm);
  // await fetch(otpForm.action, { method: 'POST', body: formData });
});

// Start listening when the OTP verification step becomes active
startSmsOtpListener();
```

<a id="cross-origin-iframe-verification"></a>
## 跨来源 iframe 验证

默认情况下，在跨来源 `<iframe>` 中接收短信 OTP 受到限制；它主要用于嵌入式支付确认流程，例如 `shop.example` 嵌入来自 `bank.example` 的发卡方质询，进行 3D Secure 验证。要在跨来源 `<iframe>` 内支持 WebOTP，需要协调三项配置：

1. **在短信最后一行绑定两个来源：** 先列出顶层嵌入域名（`@shop.example`），接着是 `#<otp>`，然后加一个空格与被嵌入 iframe 的域名（`@bank.example`）：

```text
Your verification code is 123456.

@shop.example #123456 @bank.example
```

2. **发送 `Permissions-Policy` HTTP 响应头：** 在父文档的 HTTP 头中，将 `otp-credentials` 权限委派给跨来源 iframe 的来源：

```http
Permissions-Policy: otp-credentials=(self "https://bank.example")
```

3. **为 `<iframe>` 添加 `allow="otp-credentials"`：** 在嵌入页面的 `<iframe>` 标签上明确授予权限策略，并添加描述性的 `title` 属性，帮助屏幕阅读器用户：

```html
<iframe
  src="https://bank.example/verify"
  allow="otp-credentials"
  title="Payment verification">
</iframe>
```

在 `https://bank.example` 提供的 `<iframe>` 文档内，使用与前文相同的 `<form>` 标记，以及 `navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ac.signal })` 验证生命周期。

<a id="fallback-strategies"></a>
## 回退策略

<a id="webotp-api-fallback"></a>
### WebOTP API 回退

WebOTP 的浏览器支持：可用性有限。
支持：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

如果目标浏览器不支持 WebOTP API（`OTPCredential`），不要加载第三方 JavaScript polyfill，因为读取收到的短信需要操作系统层面的集成。应依赖 `<input>` 标记内置的三级渐进增强：

- **渐进增强体验：** 使用 `if ('OTPCredential' in window)` 保护 `navigator.credentials.get({ otp: { transport: ['sms'] } })` 调用。当 `OTPCredential` 不可用时：
    1. 支持 `autocomplete="one-time-code"` 的浏览器，例如 iOS 14+、iPadOS 和启用 iCloud 短信转发的 macOS 上的 Safari，会解析 `@domain #code` 短信，并在 `<input>` 聚焦时，于系统键盘自动填充栏展示验证码。
    2. 其他浏览器全部回退为在单个 `<input type="text" inputmode="numeric" pattern="\d{6}" maxlength="6" required>` 中手动输入；移动设备显示数字键盘，并通过 `<button type="submit">` 提交。

<a id="permissions-policy-fallback"></a>
### 权限策略回退

Permissions policy 的浏览器支持：可用性有限。
支持：Chrome 108（2022 年 11 月）和 Edge 108（2022 年 12 月）。
不支持：Firefox 和 Safari。

如果浏览器不支持通过 `Permissions-Policy` 与 `<iframe allow="otp-credentials">` 委派 `otp-credentials`，跨来源 `<iframe>` 内嵌的验证 `<form>` 应平稳退回 `autocomplete="one-time-code"` 键盘建议和手动数字输入，不抛出未处理异常。

<a id="inputmode-and-abortcontroller-support"></a>
### Inputmode 和 AbortController 支持

inputmode 的 Baseline 状态：已广泛可用。自 2021-12-07 起达到 Baseline。
支持：Chrome 66（2018 年 4 月）、Edge 79（2020 年 1 月）、Firefox 95（2021 年 12 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

AbortController 和 AbortSignal 的 Baseline 状态：已广泛可用。自 2019-03-25 起达到 Baseline。
支持：Chrome 66（2018 年 4 月）、Edge 16（2017 年 10 月）、Firefox 57（2017 年 11 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

HTML `inputmode` 属性和 `AbortController`（`AbortSignal`）都已得到现代浏览器支持，不需要 polyfill 或回退代码。
