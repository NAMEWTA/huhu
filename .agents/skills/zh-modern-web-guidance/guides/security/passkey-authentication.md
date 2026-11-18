<a id="passkey-authentication"></a>
# 通行密钥身份验证

本指南详细说明如何使用可发现凭据验证回访用户，既包含显式按钮触发，也包含浏览器自动填充建议带来的无缝体验（Conditional UI）。

<a id="server-side"></a>
## 服务器端

<a id="options-generation"></a>
### 生成选项

创建一个端点，使用符合规范、经过审查的库生成 WebAuthn 请求参数。

1. **使用预定义的 RP ID：** 将预先配置的正确 RP ID 作为常量字符串，以 `rpId` 返回在请求选项中，使客户端能直接将 `publicKey.rpId` 传入 Signal API。
2. **生成质询：** 生成高熵、密码学安全的随机缓冲区，安全保存到用户会话中，并编码为 Base64URL。
3. **可发现凭据配置：** 将 `allowCredentials` 设为空数组 `[]`，请求可发现凭据。用户无需先输入用户名，通行密钥提供方会展示可用账户。
4. **用户验证级别：** 设置 `userVerification: "preferred"`；如果企业合规政策明确要求，则设为 `"required"`。
    - 选项端点**必须**将请求的 `userVerification` 约束级别保存到服务器会话记录中，不要通过查询字符串从客户端回传。这让验证端点能够安全执行严格匹配的约束，避免客户端操纵。

```javascript
// Options generation example (discoverable flow)
const options = {
  challenge: serverGeneratedBase64UrlChallenge, // High-entropy random challenge stored in session
  rpId: "example.com",
  allowCredentials: [], // Request discoverable passkeys
  userVerification: "preferred",
};

// Persist expected UV level to user session
req.session.expectedUserVerification = "preferred";
```

<a id="verification-endpoint"></a>
### 验证端点

安全验证客户端返回的断言，以认证用户：

1. **校验会话质询：** 强制要求客户端响应中的质询，严格匹配会话内保存的预期质询。
2. **执行 UV 偏好：**
    - 如果会话的 `expectedUserVerification` 请求了 `"preferred"`，向服务器验证库传入 `requireUserVerification: false`，允许不执行 UV 的认证器，例如关闭了屏幕锁的设备。如果请求了 `"required"`，则严格要求生物识别或 PIN 验证。
3. **明确的服务器 404 错误：** 如果数据库中找不到客户端返回的凭据 ID，应明确返回 HTTP `404`，让客户端能够触发 Signal API。

<a id="client-side-logic"></a>
## 客户端逻辑

<a id="html-form-annotation"></a>
### HTML 表单标注

为用户名和密码输入框添加标注，原生使用 Conditional UI。Autocomplete 标记与 webauthn 规范参数组合使用。

在专门的登录页面和登录对话框中使用 `autofocus`，让自动填充选项立即显示。非专用登录表单的页面或对话框不要使用 `autofocus`；嵌入在较大页面中的登录表单也不要使用 `autofocus`。专门的登录页或对话框采用 `autofocus` 时，应确保页面具有简洁但描述明确的标题，对话框具有简洁但描述明确的无障碍名称。

在带 `autofocus` 的元素上使用 `aria-describedby`，向屏幕阅读器用户提供说明和上下文。

```html
<h1 id="signin-passkey">Sign In with Passkey</h1>
<!-- Autocomplete tokens must contain webauthn space-separated -->
<form id="signin-form">
  <input
    type="text"
    name="username"
    aria-describedby="signin-passkey" 
    autocomplete="username webauthn"
    autofocus
    data-testid="username-field"
  />
  <input type="password" name="password" autocomplete="current-password" />
  <button type="submit">Sign in</button>
</form>
```

<a id="explicit-button-flow"></a>
### 显式按钮流程

用户点击“使用通行密钥登录”按钮时触发验证。在调用通行密钥提示框之前，应中止任何正在进行的表单自动填充（Conditional Get）调用。

<a id="conditional-mediation-flow-form-autofill"></a>
### 条件式介入流程（表单自动填充）

页面加载时激活表单自动填充建议，让用户聚焦登录字段时原生获得通行密钥验证选项：

1. **特性检测：** 页面加载时调用 `PublicKeyCredential.getClientCapabilities()`；如果 `conditionalGet` 不可用，则**跳过通行密钥登录**。
2. **解码选项：** 使用 `PublicKeyCredential.parseRequestOptionsFromJSON()` 解码获取到的凭据 JSON 对象。
3. **调用 Conditional Get：** 以 `mediation: "conditional"` 调用 `navigator.credentials.get()`，并传入 `AbortController` 信号。这会静默注册自动填充，不显示通行密钥对话框。
4. **分别处理 try/catch 异常：** 用 try/catch 包裹 `navigator.credentials.get`：
    - `NotAllowedError`：用户取消了通行密钥登录提示，或提示超时。
    - `AbortError`：验证请求被程序主动取消。
5. **调用 Signal API：** 用 try/catch 包裹服务器验证 `fetch()`：
    - 显示错误消息，让用户知道发生了什么。
    - **只有**服务器明确返回 HTTP `404`（找不到凭据），且用户尚未通过认证时，才调用 `signalUnknownCredential()`。
    - 始终传入服务器请求选项中的 `rpId: publicKey.rpId`。**不要**在客户端由 `window.location.hostname` 推导 `rpId`；服务器配置的 RP ID 可能是可注册父域名，例如 `login.example.com` 使用 `example.com`，也可能使用相关来源请求。
    - 传给 `signalUnknownCredential()` 的 `credentialId` **必须**是经过 Base64URL 编码的凭据 ID 字符串，例如 `encoded.id`，**不能**是原始 ArrayBuffer 对象 `credential.rawId`。
6. **编码响应：** 使用 `.toJSON()` 编码凭据的 `AuthenticatorAssertionResponse`，再发送到服务器验证。

```javascript
// optionsFetch and loginVerifyFetch are app-defined HTTP methods
import { optionsFetch, loginVerifyFetch } from "./api.js";

let autofillAbortController = new AbortController();

async function initializeConditionalAutofill() {
  // Feature detect Conditional Get autofill support
  const capabilities = await PublicKeyCredential.getClientCapabilities();
  if (capabilities.conditionalGet === true) {
    const loginOptionsJSON = await optionsFetch();
    const publicKey =
      PublicKeyCredential.parseRequestOptionsFromJSON(loginOptionsJSON);

    try {
      // Initiate Conditional UI form autofill suggestions
      const credential = await navigator.credentials.get({
        publicKey,
        signal: autofillAbortController.signal,
        mediation: "conditional",
      });

      // Segregated verification fetch
      const encoded = credential.toJSON();
      const response = await loginVerifyFetch(encoded);
      if (!response.ok && response.status === 404) {
        // Note: this code path runs pre-authentication, satisfying the unauth precondition
        if (PublicKeyCredential.signalUnknownCredential) {
          await PublicKeyCredential.signalUnknownCredential({
            rpId: publicKey.rpId, // Always use the server-provided rpId; DO NOT use window.location.hostname
            credentialId: encoded.id,
          });
        }
      }
    } catch (err) {
      // Silently swallow expected client WebAuthn exceptions
      if (["NotAllowedError", "AbortError"].includes(err.name)) {
        return;
      }
      console.error("Unexpected conditional get error:", err);
    }
  }
}

async function triggerButtonAuthentication() {
  // Abort any pending Conditional Get call to prevent passkey prompt collisions
  autofillAbortController.abort();
  autofillAbortController = new AbortController(); // Reset controller for next triggers

  const loginOptionsJSON = await optionsFetch();
  const publicKey =
    PublicKeyCredential.parseRequestOptionsFromJSON(loginOptionsJSON);

  let credential;
  try {
    // Passkey explicit prompt trigger
    credential = await navigator.credentials.get({
      publicKey,
      signal: autofillAbortController.signal,
    });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      console.log("User cancelled passkey login.");
    } else if (err.name === "AbortError") {
      console.log("The authentication operation was aborted.");
    }
    // Re-arm Conditional autofill Suggestions after cancelled explicit button prompts
    initializeConditionalAutofill();
    return; // Safe exit
  }

  // Segregated verification try/catch (HTTP 404 trigger)
  const encoded = credential.toJSON();
  try {
    const response = await loginVerifyFetch(encoded);
    if (!response.ok && response.status === 404) {
      // Note: this code path runs pre-authentication, satisfying the unauth precondition
      if (PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId: publicKey.rpId, // Always use the server-provided rpId; DO NOT use window.location.hostname
          credentialId: encoded.id, // Base64URL-encoded credential ID
        });
      }
    }
  } catch (serverErr) {
    console.error("Verification request error:", serverErr);
  }
}

// Trigger Conditional Get on load
window.addEventListener("DOMContentLoaded", initializeConditionalAutofill);
```

<a id="fallback-strategies"></a>
## 回退策略

<a id="passkey-feature-detection-fallback"></a>
### 通行密钥特性检测回退

api.PublicKeyCredential.getClientCapabilities_static 能力的 Baseline 状态：新近可用。自 2025-02-06 起达到 Baseline。
支持：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）、Firefox 135（2025 年 2 月）和 Safari 17.4（2024 年 3 月）。

加载 `webauthn-polyfills`，让支持 `PublicKeyCredential` 的浏览器也能使用 `PublicKeyCredential.getClientCapabilities()`：

```js
// With a bundler (`npm install webauthn-polyfills`):
import 'webauthn-polyfills';
```

如果没有打包器，可从自身来源提供该包，或从 `https://esm.sh/webauthn-polyfills@0.1.7` 等 CDN 导入，并固定确切版本。第三方 URL 应添加子资源完整性校验：为 `<script>` 标签设置 `integrity`，或在使用 `import` 语句时设置 import map 的 `integrity` 字段。

<a id="signal-api-synchronization-fallback"></a>
### Signal API 同步回退

Web authentication signal methods 的浏览器支持：可用性有限。
支持：Chrome 132（2025 年 1 月）、Edge 132（2025 年 1 月）和 Safari 26（2025 年 9 月）。
不支持：Firefox。

WebAuthn Signal API（`webauthn-signals`）属于渐进优化，用于让密码管理器与服务器的凭据状态保持同步。

- **回退体验：** 通过 `if (PublicKeyCredential.signalUnknownCredential)` 限定调用；不支持时平稳跳过后台验证同步，不抛出浏览器异常。

<a id="easy-json-serialization-fallback"></a>
### 便捷 JSON 序列化回退

api.PublicKeyCredential.parseRequestOptionsFromJSON_static 能力的 Baseline 状态：新近可用。自 2025-03-31 起达到 Baseline。
支持：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）、Firefox 119（2023 年 10 月）和 Safari 18.4（2025 年 3 月）。

加载 `webauthn-polyfills`，让支持 `PublicKeyCredential` 的浏览器同时可使用 `PublicKeyCredential.parseRequestOptionsFromJSON()` 和 `PublicKeyCredential.prototype.toJSON()`：

```js
// With a bundler (`npm install webauthn-polyfills`):
import 'webauthn-polyfills';
```

如果没有打包器，可从自身来源提供该包，或从 `https://esm.sh/webauthn-polyfills@0.1.7` 等 CDN 导入，并固定确切版本。第三方 URL 应添加子资源完整性校验：为 `<script>` 标签设置 `integrity`，或在使用 `import` 语句时设置 import map 的 `integrity` 字段。
