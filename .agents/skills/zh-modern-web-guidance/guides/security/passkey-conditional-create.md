<a id="passkey-conditional-create-post-login-promotion"></a>
# 通行密钥条件式创建（登录后引导）

本指南介绍如何在用户使用密码成功登录后，立即为其自动、静默地注册通行密钥，从而减少操作阻碍并提高通行密钥的采用率。

<a id="the-right-trigger-moment"></a>
## 正确的触发时机

自动创建通行密钥（也称为条件式创建或登录后静默引导）**只能在包含密码验证的完整登录成功后立即触发**。
* 不要在无密码流程中尝试条件式创建，例如魔法链接、短信一次性密码或身份联合登录。
* 如果要求多因素身份验证，必须等待所有验证因素均成功后，再启动条件式创建。
* 向创建端点发出请求前，确保用户已有有效且通过身份验证的会话。

<a id="implementation-steps"></a>
## 实施步骤

<a id="1-abort-prior-autofill-actions"></a>
### 1. 中止之前的自动填充操作
如果登录页使用表单自动填充（条件式 UI/Get），必须中止当前的凭据获取调用，避免浏览器发生冲突。
* 调用 `navigator.credentials.create()` 前，对待处理的 `navigator.credentials.get()` 自动填充请求所附加的 `AbortController` 调用 `abortController.abort()`。

<a id="2-feature-detection"></a>
### 2. 特性检测
通过 `PublicKeyCredential.getClientCapabilities()` 检查 `conditionalCreate`，判断是否支持条件式创建。

```javascript
const capabilities = await PublicKeyCredential.getClientCapabilities();
if (capabilities.conditionalCreate) {
  // Conditional create is available
}
```

<a id="3-create-a-passkey-with-conditional-create"></a>
### 3. 使用条件式创建来创建通行密钥
* 确保服务器的注册选项端点在 `rp.id` 中提供预定义的 RP ID，以便第 6 步运行 `PublicKeyCredential.signalUnknownCredential()` 时，`publicKey.rp.id` 已有值；在 WebAuthn 创建选项中省略 `rp.id`，会导致客户端的 `publicKey.rp.id` 为 undefined。
* 将用户现有通行密钥的凭据 ID 填入 `excludeCredentials`，避免重复注册密钥。
* 在 `navigator.credentials.create()` 的选项中传入 `mediation: 'conditional'`。这会通知浏览器在后台静默处理通行密钥创建流程，或根据当前上下文处理，而不弹出打断用户的模态对话框。

<a id="4-silent-error-handling"></a>
### 4. 静默处理错误
* 用 try/catch 包裹通行密钥创建提示（`navigator.credentials.create`）。必须捕获并静默忽略常见的用户交互异常（`InvalidStateError`、`NotAllowedError`、`AbortError`），不要向用户展示错误界面。

<a id="5-server-side-user-presence-verification"></a>
### 5. 在服务器端验证用户在场
* 服务器端验证端点**仅在**验证由条件式创建触发产生的凭据时，才可放宽用户在场（UP）要求（`requireUserPresence: false`）。对于标准的显式创建，必须继续严格验证用户在场。

<a id="6-handle-failed-server-verification-gracefully"></a>
### 6. 妥善处理服务器验证失败
* 如果 `navigator.credentials.create()` 成功，但服务器验证请求返回不良响应（例如签名验证失败），调用 `PublicKeyCredential.signalUnknownCredential({ rpId: publicKey.rp.id, credentialId: encodedResponse.id })`，避免孤立凭据留在通行密钥提供方。始终从服务器创建选项的 `publicKey.rp.id` 读取 `rpId`；**不要**在客户端根据 `window.location.hostname` 推导 `rpId`，它可能与父域或关联源使用的 RP ID 不一致。

<a id="code-example"></a>
## 代码示例

```javascript
// optionsFetch and registerVerifyFetch are app-defined server endpoint requests
import { optionsFetch, registerVerifyFetch } from './api.js';

async function triggerConditionalCreate(loginAbortController) {
  const capabilities = await PublicKeyCredential.getClientCapabilities();
  if (capabilities.conditionalCreate !== true) {
    return; // Platform does not support conditional creation
  }

  // 1. Abort any active autofill conditional-get controllers to clear the WebAuthn pipeline
  loginAbortController.abort();

  // 2. Fetch creation options signaling the backend that this is a conditional request (server options must include rp.id)
  const creationOptionsJSON = await optionsFetch({ conditional: true });
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(creationOptionsJSON);

  let credential;
  try {
    // 3. Invoke silent credentials creation prompt
    credential = await navigator.credentials.create({ 
      publicKey,
      mediation: 'conditional' // Silent background creation mediation
    });
  } catch (e) {
    // 4. Silently swallow common WebAuthn browser exceptions
    if (['InvalidStateError', 'NotAllowedError', 'AbortError'].includes(e.name)) {
      return; 
    }
    console.error('Unexpected conditional create error:', e);
    return;
  }

  // 5. Server verification step using dedicated Try/Catch block
  let encodedResponse = credential.toJSON();
  try {
    const response = await registerVerifyFetch(encodedResponse);
    if (!response.ok) {
      // If the server verification fails, clean up using Signal API
      if (PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId: publicKey.rp.id, // Always use the server-provided rp.id; DO NOT use window.location.hostname
          credentialId: encodedResponse.id
        });
      }
    }
  } catch (serverErr) {
    console.error('Verification network failure:', serverErr);
    if (PublicKeyCredential.signalUnknownCredential) {
      await PublicKeyCredential.signalUnknownCredential({
        rpId: publicKey.rp.id, // Always use the server-provided rp.id; DO NOT use window.location.hostname
        credentialId: encodedResponse.id
      });
    }
  }
}
```

<a id="fallback-strategies"></a>
## 回退策略

<a id="passkey-feature-detection-fallback"></a>
### 通行密钥特性检测的回退

api.PublicKeyCredential.getClientCapabilities_static 能力的 Baseline 状态：新近可用。自 2025-02-06 起纳入 Baseline。
支持的浏览器：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）、Firefox 135（2025 年 2 月）和 Safari 17.4（2024 年 3 月）。

加载 `webauthn-polyfills`，让所有支持 `PublicKeyCredential` 的环境都能使用 `PublicKeyCredential.getClientCapabilities()`：

```js
// With a bundler (`npm install webauthn-polyfills`):
import 'webauthn-polyfills';
```

如果没有使用打包工具，从你自己的源提供该包，或从 `https://esm.sh/webauthn-polyfills@0.1.7` 等 CDN 导入（固定具体版本）。对于第三方 URL，添加子资源完整性校验：为 `<script>` 标签设置 `integrity` 属性，或为 `import` 语句在导入映射中设置 `integrity` 字段。

<a id="signal-api-synchronization-fallback"></a>
### Signal API 同步的回退

Web 身份验证信号方法的浏览器支持情况：支持有限。
支持的浏览器：Chrome 132（2025 年 1 月）、Edge 132（2025 年 1 月）和 Safari 26（2025 年 9 月）。
不支持的浏览器：Firefox。

WebAuthn Signal API（`webauthn-signals`）是一项渐进式优化，用来保持密码管理器与服务器凭据状态同步。
* **回退体验**：通过 `if (PublicKeyCredential.signalUnknownCredential)` 控制调用。如果不支持，就平稳跳过后台验证同步，不抛出浏览器异常。

<a id="easy-json-serialization-fallback"></a>
### 简便 JSON 序列化的回退

api.PublicKeyCredential.parseCreationOptionsFromJSON_static 能力的 Baseline 状态：新近可用。自 2025-03-31 起纳入 Baseline。
支持的浏览器：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）、Firefox 119（2023 年 10 月）和 Safari 18.4（2025 年 3 月）。

加载 `webauthn-polyfills`，让所有支持 `PublicKeyCredential` 的环境都能使用 `PublicKeyCredential.parseCreationOptionsFromJSON()` 和 `PublicKeyCredential.prototype.toJSON()`：

```js
// With a bundler (`npm install webauthn-polyfills`):
import 'webauthn-polyfills';
```

如果没有使用打包工具，从你自己的源提供该包，或从 `https://esm.sh/webauthn-polyfills@0.1.7` 等 CDN 导入（固定具体版本）。对于第三方 URL，添加子资源完整性校验：为 `<script>` 标签设置 `integrity` 属性，或为 `import` 语句在导入映射中设置 `integrity` 字段。
