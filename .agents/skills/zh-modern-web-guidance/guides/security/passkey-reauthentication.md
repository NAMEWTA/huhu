<a id="passkey-reauthentication"></a>
# 使用通行密钥再次验证身份

本指南重点说明与普通流程的差异：如何在已登录用户执行敏感账户操作（例如修改密码、转账）之前，实施加强身份验证或再次核验。

<a id="delta-flow-architecture"></a>
## 流程架构的差异

与普通认证不同，通行密钥再次验证会将对话框严格限制为当前登录用户已注册的凭据，防止活动会话中出现账户混用或通行密钥冒用。

<a id="server-side"></a>
## 服务器端

<a id="options-generation-delta"></a>
### 生成选项的差异

创建一个端点，专门为当前已知的活动用户填充允许的凭据参数：

**限制凭据：** 将当前登录用户所有已注册凭据 ID 映射为具体的 `PublicKeyCredentialDescriptor` 记录，填入 `allowCredentials` 数组。如果留空或省略，就会退回可发现凭据，破坏会话安全性。

```javascript
// Node.js step-up options generation example
router.post("/api/reauth/options", enforceActiveSession, async (req, res) => {
  const userPasskeys = await db.findCredentialsByUserId(req.user.id);

  const options = {
    challenge: serverGeneratedBase64UrlChallenge, // Random challenge stored in user session
    rpId: "example.com",
    // Enforce allowance strictly limited to the user's credentials list
    allowCredentials: userPasskeys.map((cred) => ({
      type: "public-key",
      id: cred.id,
      transports: cred.transports, // Speeds up resolution by indicating platform transports
    })),
  };
  return res.json(options);
});
```

<a id="verification-endpoint-delta"></a>
### 验证端点的差异

验证客户端返回的断言：

**核验账户归属：** 验证端点**必须**明确检查客户端返回并成功认证的凭据 ID，其对应的存储记录所关联的用户 ID，是否严格等于当前登录用户（`storedCredential.passkeyUserId === req.user.id`）。如果返回的是*另一位*用户的有效通行密钥，**必须**立即拒绝认证。

<a id="client-side-flow-deltas"></a>
## 客户端流程的差异

应用根据交易界面从两种再次验证界面中选择：

<a id="a-button-flow-no-input-fields"></a>
### A. 按钮流程（无输入字段）

用户点击“验证身份”或“继续交易”按钮时触发再次认证。收到 HTTP `404` 后报告未知凭据时，始终传入服务器请求选项中的 `rpId: publicKey.rpId`；**不要**在客户端从 `window.location.hostname` 推导 `rpId`。

```html
<button id="reauth-btn" data-testid="reauth-button">Confirm Transaction</button>
```

```javascript
let reauthAbortController = new AbortController();

async function triggerButtonReauth() {
  // Abort any background suggestion flows to avoid passkey prompt collisions
  reauthAbortController.abort();
  reauthAbortController = new AbortController();

  const optionsResponse = await fetch("/api/reauth/options", {
    method: "POST",
  });
  const optionsJSON = await optionsResponse.json();
  const publicKey =
    PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON);

  try {
    const credential = await navigator.credentials.get({
      publicKey,
      signal: reauthAbortController.signal,
    });

    if (credential) {
      const encodedCredential = credential.toJSON();
      const verifyResponse = await fetch("/api/reauth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encodedCredential),
      });

      if (verifyResponse.ok) {
        showTransactionSuccessUI();
      } else if (verifyResponse.status === 404 && PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId: publicKey.rpId, // Always use the server-provided rpId; DO NOT use window.location.hostname
          credentialId: encodedCredential.id
        });
      }
    }
  } catch (err) {
    if (err.name === "NotAllowedError") {
      console.log("User cancelled reauthentication.");
    }
  }
}

document
  .getElementById("reauth-btn")
  .addEventListener("click", triggerButtonReauth);
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
