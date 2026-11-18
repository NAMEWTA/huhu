<a id="passkey-registration"></a>
# 通行密钥注册

本指南详细说明如何让用户为账户注册通行密钥，提供高安全性、可抵御钓鱼的无密码登录方式。

<a id="database-requirements"></a>
## 数据库要求

为支持通行密钥注册，数据库的凭据表必须存储以下字段：

```typescript
export interface StoredPasskeyCredential {
  id: string; // Base64URL-encoded credential ID (unique lookup key)
  passkeyUserId: string; // Associated application user ID
  credentialPublicKey: string; // Base64URL-encoded public key used to verify assertion signatures
  credentialType: "public-key";
  credentialDeviceType: "singleDevice" | "multiDevice"; // Helps distinguish device-bound vs cloud-synced passkeys
  credentialBackedUp: boolean; // Boolean backup state reported by the authenticator
  aaguid: string; // Authenticator Attestation GUID
  providerIcon?: string; // Provider icon derived from the AAGUID registry (dark or light theme URLs)
  name: string; // Provider name derived from AAGUID registry
  transports: string[]; // Array of transport names (e.g. 'internal', 'hybrid') necessary for exclusion options
  lastUsedAt?: number; // Optional epoch timestamp of last sign-in
  registeredAt: number; // Registration epoch timestamp
  counter: number; // Authenticator sign-in signature counter used to prevent replay attacks
}
```

<a id="server-side"></a>
## 服务器端

<a id="options-generation"></a>
### 生成选项

创建一个生成 WebAuthn 创建参数的端点。遵循本分类规范，依赖经过审查的库，不要自行实现密码学。

1. **使用预定义的 RP ID：** 将预先配置的正确 RP ID 作为常量字符串放到 `rp.id` 中，使客户端可以直接将 `publicKey.rp.id` 传给 Signal API。
2. **创建安全质询：** 在服务器生成高熵、密码学安全的随机缓冲区，安全保存在用户会话中，并以 Base64URL 编码后随选项返回。
3. **避免重复通行密钥：** 将用户已有的预注册凭据 ID 映射到 `excludeCredentials` 选项数组，防止认证器在同一个通行密钥提供方账户中注册重复凭据。
4. **强制使用可发现凭据：** 在 `authenticatorSelection` 中设置 `requireResidentKey: true` 和 `residentKey: "required"`，请求可发现凭据，这是可发现式登录的必要条件。
5. **配置用户验证：** 指定 `userVerification: "preferred"` 或 `userVerification: "required"`。金融、医疗等许多合规场景需要 `'required'`，以便创建时强制进行用户验证。
6. **确定认证器连接范围：**
    - **引导流程：** 在标准密码登录后或注册后的推广流程中建议创建通行密钥时，设置 `authenticatorAttachment: "platform"`，强制使用平台认证器，并绕过外部安全密钥提示。
    - **管理流程：** 从专门的设置或安全面板调用，且同时支持平台认证器及外部安全密钥时，完全省略 `authenticatorAttachment` 属性。
    - *提示：* 可以接收 `promotion: boolean` 请求标志，用一个端点按条件处理这两类流程。

```javascript
// Options generation example
const options = {
  challenge: serverGeneratedBase64UrlChallenge, // Cryptographically random challenge
  rp: { id: "example.com", name: "Secure Application" },
  user: {
    id: userBase64UrlId, // Unique base64url string identifying the account
    name: "user@example.com",
    displayName: "Jane Doe",
  },
  pubKeyCredParams: [
    {
      type: "public-key",
      alg: -7,
    },
    {
      type: "public-key",
      alg: -257,
    },
  ],
  excludeCredentials: userExistingCredentials.map((cred) => ({
    type: "public-key",
    id: cred.id,
    transports: cred.transports,
  })),
  authenticatorSelection: {
    residentKey: "required",
    requireResidentKey: true,
    userVerification: "preferred",
    ...(isPromotionFlow && { authenticatorAttachment: "platform" }),
  },
};
```

<a id="verification"></a>
### 验证

1. **验证质询：** 将返回的质询与预期的会话绑定质询进行安全核验。
2. **验证用户在场：**
    - 确保解析后的认证器数据中的 User Present（UP）标志为 `true`，确认创建时用户实际在场。
3. **针对 'preferred' 放宽验证：**
    - 创建选项指定 `userVerification: "preferred"` 时，服务器端验证调用**必须**配置 `requireUserVerification: false`。否则，未进行用户验证就完成注册的认证器，例如关闭了屏幕锁的设备，会触发不必要的服务器验证失败。

<a id="client-side-logic"></a>
## 客户端逻辑

1. **在页面加载时按能力控制界面：**
    - 页面加载时调用 `PublicKeyCredential.getClientCapabilities()`；如果 `conditionalGet` 或 `passkeyPlatformAuthenticator` 不可用，就**禁用“创建通行密钥”按钮**。
2. **调用创建并序列化：** 使用 `PublicKeyCredential.parseCreationOptionsFromJSON()` 解码服务器选项，再把配置传入 `navigator.credentials.create()`。
    - 调用验证端点之前，通过 `credential.toJSON()` 将 `AuthenticatorAttestationResponse` 编码为有效、可 JSON 序列化的对象。
3. **处理 WebAuthn 异常：**
    - `InvalidStateError`：匹配的通行密钥已存在，通过 `excludeCredentials` 匹配。
    - `NotAllowedError`：用户取消了通行密钥对话框，或操作超时。
    - `AbortError`：操作已中止。
    - `SecurityError`：安全来源（HTTPS）或 RP ID 不匹配等配置问题。
4. **单独处理 Signal API 的 try/catch：**
    - 用 try/catch 包裹服务器验证的 `fetch()` 调用。如果验证请求失败，包括任意 `response.ok === false` 状态或网络抛错，应调用 `PublicKeyCredential.signalUnknownCredential({ rpId: publicKey.rp.id, credentialId: encodedResponse.id })`，并先用 `if (PublicKeyCredential.signalUnknownCredential)` 检测能力。
    - 始终从服务器创建选项的 `publicKey.rp.id` 读取 `rpId`。**不要**在客户端根据 `window.location.hostname` 推导 `rpId`，因为服务器配置的 RP ID 可能是可注册父域名，例如 `accounts.example.com` 使用 `example.com`，也可能通过相关来源请求配置。

```javascript
// optionsFetch and registerVerifyFetch are app-defined HTTP methods
import { optionsFetch, registerVerifyFetch } from "./api.js";

async function registerPasskey(isPromotion = false) {
  // Verify passkey capability and conditional UI are available
  const capabilities = await PublicKeyCredential.getClientCapabilities();
  if (
    !capabilities.passkeyPlatformAuthenticator ||
    !capabilities.conditionalGet
  ) {
    // Hide "Create passkey" buttons and fall back to password flows instead
    showStandardPasswordFallbackUI();
    return;
  }

  const creationOptionsJSON = await optionsFetch({ promotion: isPromotion });
  const publicKey =
    PublicKeyCredential.parseCreationOptionsFromJSON(creationOptionsJSON);

  let credential;
  try {
    // passkey prompt execution
    credential = await navigator.credentials.create({ publicKey });
  } catch (err) {
    if (err.name === "InvalidStateError") {
      console.log("A passkey already exists for this account.");
      alert("A passkey already exists for this account.");
    } else if (err.name === "SecurityError") {
      console.error("Configuration RP ID or Secure Context error.");
      alert("Configuration RP ID or Secure Context error.");
    } else if (err.name === "NotAllowedError") {
      console.log("User cancelled the passkey dialog.");
    } else if (err.name === "AbortError") {
      console.log("The creation operation has been aborted.");
    }
    return; // Safe API exit, do not signal unknown for standard WebAuthn cancels
  }

  // Server Verification phase (Segregated Try/Catch)
  const encodedResponse = credential.toJSON();
  try {
    const response = await registerVerifyFetch(encodedResponse);
    if (!response.ok && PublicKeyCredential.signalUnknownCredential) {
      // Server verification failed to verify/authenticate the credential (orphaned)
      await PublicKeyCredential.signalUnknownCredential({
        rpId: publicKey.rp.id, // Always use the server-provided rp.id; DO NOT use window.location.hostname
        credentialId: encodedResponse.id, // Base64URL-encoded credential ID
      });
    }
  } catch (serverErr) {
    console.error("Server verification network failure:", serverErr);
    if (PublicKeyCredential.signalUnknownCredential) {
      await PublicKeyCredential.signalUnknownCredential({
        rpId: publicKey.rp.id, // Always use the server-provided rp.id; DO NOT use window.location.hostname
        credentialId: encodedResponse.id, // Base64URL-encoded credential ID
      });
    }
  }
}
```

<a id="fallback-strategies"></a>
## 回退策略

<a id="signal-api-synchronization-fallback"></a>
### Signal API 同步回退

Web authentication signal methods 的浏览器支持：可用性有限。
支持：Chrome 132（2025 年 1 月）、Edge 132（2025 年 1 月）和 Safari 26（2025 年 9 月）。
不支持：Firefox。

WebAuthn Signal API（`webauthn-signals`）属于渐进优化，用于让密码管理器与服务器的凭据状态保持同步。

- **回退体验：** 如果浏览器不支持 `PublicKeyCredential.signalUnknownCredential`，**必须**通过特性检测（`if (PublicKeyCredential.signalUnknownCredential)`）安全跳过调用；服务器端验证只记录失败，不触发密码管理器更新。

<a id="easy-json-serialization-fallback"></a>
### 便捷 JSON 序列化回退

api.PublicKeyCredential.parseCreationOptionsFromJSON_static 能力的 Baseline 状态：新近可用。自 2025-03-31 起达到 Baseline。
支持：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）、Firefox 119（2023 年 10 月）和 Safari 18.4（2025 年 3 月）。

加载 `webauthn-polyfills`，让支持 `PublicKeyCredential` 的浏览器同时可使用 `PublicKeyCredential.parseCreationOptionsFromJSON()` 和 `PublicKeyCredential.prototype.toJSON()`：

```js
// With a bundler (`npm install webauthn-polyfills`):
import 'webauthn-polyfills';
```

如果没有打包器，可从自身来源提供该包，或从 `https://esm.sh/webauthn-polyfills@0.1.7` 等 CDN 导入，并固定确切版本。第三方 URL 应添加子资源完整性校验：为 `<script>` 标签设置 `integrity`，或在使用 `import` 语句时设置 import map 的 `integrity` 字段。
