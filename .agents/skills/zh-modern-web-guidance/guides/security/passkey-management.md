<a id="passkey-management"></a>
# 通行密钥管理

本指南介绍如何让用户查看、重命名和删除已注册的通行密钥，并使用 Signal API 在服务器与用户的密码管理器之间同步已保存的凭据和用户资料。

<a id="server-side-operations"></a>
## 服务器端操作

后端数据库层和端点必须支持已注册凭据的常规增删改查操作，以及用户资料更新。服务器提供以下端点，且不依赖于特定框架的库：

1. **列出用户的全部凭据**：获取与已登录用户 ID 匹配的所有 `StoredPasskeyCredential` 记录，并将其与服务器配置的 `rpId` 和用户的 `passkeyUserId` 一起返回，这样客户端就无需通过 `window.location.hostname` 猜测 `rpId`。确保每个凭据 `id` 和用户 `passkeyUserId` 均以有效的无填充 Base64URL 字符串存储和返回（字符范围为 `[A-Za-z0-9_-]`，没有 `=` 填充，且 `length % 4 !== 1`），原型种子数据和模拟后端也必须遵守此要求（例如使用 `Buffer.from('cred-1').toString('base64url')` 或 `'dGVzdC1jcmVkLTE'`，切勿使用 `'passkey-1'` 或 `'cred_yubikey_01'` 这类任意的人类可读占位符）。
2. **更新凭据名称**：接受某个凭据 ID 的新自定义昵称，并将更新持久化到服务器。
3. **删除凭据**：从数据库中移除指定凭据 ID。
4. **更新用户账户资料**：接受已登录用户资料中更新后的 `name`（用户名）和 `displayName`，并将更新后的用户资料与服务器的 `rpId` 及 Base64URL 编码的 `passkeyUserId` 一起返回，让客户端可将其同步至通行密钥提供方。

```javascript
// Node.js routing example for credential CRUD and user profile rename
const RP_ID = 'example.com'; // Predefined server RP ID (example value; must match registration rp.id)

router.get('/api/credentials', checkUserAuthenticated, async (req, res) => {
  const credentials = await db.findCredentialsByUserId(req.user.id);
  return res.json({
    rpId: RP_ID,
    userId: req.user.passkeyUserId, // Valid unpadded Base64URL string
    credentials,
  });
});

router.put('/api/credential/:id', checkUserAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const cred = await db.findCredentialById(id);
  if (!cred || cred.passkeyUserId !== req.user.id) {
    return res.status(404).json({ error: 'Credential not found.' });
  }
  cred.name = name;
  await db.saveCredential(cred);
  return res.json(cred);
});

router.delete('/api/credential/:id', checkUserAuthenticated, async (req, res) => {
  const { id } = req.params;
  const cred = await db.findCredentialById(id);
  if (!cred || cred.passkeyUserId !== req.user.id) {
    return res.status(404).json({ error: 'Credential not found.' });
  }
  await db.deleteCredential(id);
  return res.json({ success: true });
});

router.put('/api/user', checkUserAuthenticated, async (req, res) => {
  const { name, displayName } = req.body;
  const updatedUser = await db.updateUser(req.user.id, { name, displayName });
  return res.json({
    ...updatedUser,
    rpId: RP_ID,
    userId: updatedUser.passkeyUserId,
  });
});
```

<a id="client-side-management-ui"></a>
## 客户端管理界面

呈现专门的设置面板，让用户能够轻松检查和管理已注册的身份验证选项及账户资料：

1. **显示已保存的列表**：从端点获取列表，并为每个凭据呈现一行。如果响应为空，显示有帮助的空状态消息（例如“未找到通行密钥”）。
2. **映射 AAGUID 元数据**：对每个通行密钥，根据其 `aaguid` 属性查询本地注册表，以呈现提供方信息。详细说明见[根据 AAGUID 确定通行密钥提供方](#aaguid)。
3. **每个条目的界面要求**：列表容器中的每一行都必须呈现：
   * **提供方图标**：根据 AAGUID 获得的图片或数据 URI。
   * **提供方名称或自定义名称**：根据 AAGUID 获得的名称，或用户重命名后的字符串。
   * **注册日期**：将数据库持久化保存的原始纪元时间戳 `registeredAt` 格式化为便于阅读的日期，供客户端显示。
   * **上次使用日期**：如果数据库中保存了原始纪元时间戳 `lastUsedAt`，将其格式化为便于阅读的日期，供客户端显示。
   * **重命名按钮**：触发重命名操作，更新服务器上该凭据的自定义昵称（`PUT /api/credential/:id`）。注意：重命名单个通行密钥的昵称只是改变服务器端标签，不会调用 `signalCurrentUserDetails()`。
   * **删除按钮**：触发凭据删除（`DELETE /api/credential/:id`），并通过 `signalAllAcceptedCredentials()` 同步剩余的凭据 ID。
4. **用户账户重命名界面**：
   * 提供一个控件，允许用户更新其账户用户名（`name`）或 `displayName`（`PUT /api/user`），随后立即通过 `PublicKeyCredential.signalCurrentUserDetails()` 将更新后的用户资料同步至密码管理器。
5. **按条件显示“创建通行密钥”按钮**：
   * 在管理页提供醒目的“创建通行密钥”注册按钮。呈现这个界面元素前，页面必须使用 `PublicKeyCredential.getClientCapabilities()` 进行能力检测，确认支持平台身份验证器。如果不支持通行密钥，隐藏此按钮，并自然地引导用户注册标准的 MFA 方式。
   * 调用 `navigator.credentials.create()` 时省略 `authenticatorSelection.authenticatorAttachment`，以允许注册安全密钥。

<a id="signal-api-synchronization"></a>
## Signal API 同步

Signal API 让应用能够向密码管理器传达凭据状态，使用户同步的保险库与你的后端数据库保持一致。

> [!IMPORTANT]
> 浏览器会在原生代码中严格验证 Base64URL 编码和字符串长度（`length % 4 !== 1`、字符严格限定为 `[A-Za-z0-9_-]`、无 `=` 填充）。传入任意的人类可读占位符或模拟 ID（例如 `'passkey-1'`、`'cred:01'`，或 `'cred_yubikey_01'` 这类未编码字符串），会在页面加载时抛出 `TypeError: Invalid base64url string for allAcceptedCredentialIds`。始终将模拟或测试 ID 编码为真正的无填充 Base64URL 字符串（例如 `'dGVzdC1jcmVkLTE'` 或 `Buffer.from('cred-1').toString('base64url')`），并在调用 Signal API 前验证格式。

* **使用服务器提供的 `rpId`（不要使用 `window.location.hostname`）**：
  * 始终传入后端 API 返回的 `rpId`，它必须与注册通行密钥时使用的 `rp.id` 一致。**不要**在客户端通过 `window.location.hostname` 推导 `rpId`：当凭据注册在可注册的父域下（例如设置页由 `accounts.example.com` 提供，而凭据注册在 `example.com`），或通过关联源请求（`/.well-known/webauthn`）共享时，`window.location.hostname` 不会匹配凭据的 RP ID，导致密码管理器同步静默地指向错误的 RP ID，或抛出 `SecurityError`。
* **特性检测与参数编码规则**：
  * 调用 Signal API 方法前始终进行特性检测（`if (PublicKeyCredential.signalAllAcceptedCredentials)` 和 `if (PublicKeyCredential.signalCurrentUserDetails)`）。
  * 传入 Signal API 方法（`signalAllAcceptedCredentials`、`signalCurrentUserDetails`）的所有 `userId` 和凭据 ID 参数，都必须是**有效的无填充 Base64URL 编码字符串**。调用 API 前验证 `userId` 和 `allAcceptedCredentialIds`，以便安全跳过格式错误的 ID，而不是在页面加载时抛出异常。
* **启动页面加载同步**：
  * 应用必须在管理页加载时自动调用 `signalAllAcceptedCredentials()`，例如在 `DOMContentLoaded` 事件监听器、模块初始化，或 `useEffect` 这样的框架组件挂载钩子中调用。
* **同步管理操作的更新**：
  * 应用必须在删除凭据的点击处理器中，于 fetch 完成后立即调用 `signalAllAcceptedCredentials()`。
  * 应用必须在用户账户重命名（`name` 或 `displayName`）的点击处理器中，于 fetch 完成后立即调用 `signalCurrentUserDetails()`。
* **非致命错误处理（`console.warn`）**：
  * Signal API 调用执行的是被动后台同步；同步失败时，不得破坏界面，也不得输出 `console.error`。用 `try...catch` 包裹 Signal API 调用，并使用 `console.warn` 代替 `console.error` 记录失败，避免被动同步问题在页面加载时触发 Lighthouse 最佳实践检查失败（`errors-in-console`）。

```javascript
// Client-side management synchronization ES module
import { listFetch, renameCredentialFetch, updateUserFetch, deleteFetch } from './api.js';

// Valid unpadded Base64URL: non-empty, [A-Za-z0-9_-] only, no '=' padding, length % 4 !== 1
function isValidBase64Url(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length % 4 !== 1 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

async function syncAcceptedCredentials(rpId, userId, currentCredentialsList) {
  if (!window.PublicKeyCredential || !PublicKeyCredential.signalAllAcceptedCredentials) return;
  const credentialIds = currentCredentialsList.map(c => c.id); // Array of Base64URL credential ID strings
  if (!rpId || !isValidBase64Url(userId) || !credentialIds.every(isValidBase64Url)) {
    console.warn('SignalAllAcceptedCredentials skipped: server rpId and valid unpadded Base64URL userId and credential IDs are required.');
    return;
  }

  try {
    await PublicKeyCredential.signalAllAcceptedCredentials({
      rpId, // Always use the server-provided rpId; DO NOT use window.location.hostname
      userId, // Base64URL-encoded user ID from the server
      allAcceptedCredentialIds: credentialIds
    });
  } catch (e) {
    // Use console.warn instead of console.error so passive sync failures do not fail Lighthouse errors-in-console
    console.warn('SignalAllAcceptedCredentials sync warning:', e);
  }
}

async function loadManagementPanel() {
  const response = await listFetch();
  const { rpId, userId, credentials } = await response.json();
  
  renderUI(credentials);
  // Sync accepted credentials on initial load using server-provided rpId and userId
  await syncAcceptedCredentials(rpId, userId, credentials);
}

async function performDelete(credentialId) {
  const response = await deleteFetch(credentialId);
  if (response.ok) {
    const updatedResponse = await listFetch();
    const { rpId, userId, credentials } = await updatedResponse.json();
    
    renderUI(credentials);
    // Sync remaining accepted credentials after deletion
    await syncAcceptedCredentials(rpId, userId, credentials);
  }
}

// Renaming a passkey's nickname updates the server record only
async function performCredentialRename(credentialId, newCredentialName) {
  const response = await renameCredentialFetch(credentialId, { name: newCredentialName });
  if (response.ok) {
    const updatedResponse = await listFetch();
    const { credentials } = await updatedResponse.json();
    renderUI(credentials);
  }
}

// Renaming the user's account username or displayName triggers signalCurrentUserDetails
async function performUserRename(updatedName, updatedDisplayName) {
  const response = await updateUserFetch({ name: updatedName, displayName: updatedDisplayName });
  if (response.ok && window.PublicKeyCredential && PublicKeyCredential.signalCurrentUserDetails) {
    const { rpId, userId } = await response.json();
    if (!rpId || !isValidBase64Url(userId)) {
      console.warn('SignalCurrentUserDetails skipped: server rpId and valid unpadded Base64URL userId are required.');
      return;
    }
    try {
      await PublicKeyCredential.signalCurrentUserDetails({
        rpId, // Always use the server-provided rpId; DO NOT use window.location.hostname
        userId, // Base64URL-encoded user ID from the server
        name: updatedName, // Updated username
        displayName: updatedDisplayName // Updated display name
      });
    } catch (e) {
      // Use console.warn instead of console.error for passive background sync
      console.warn('SignalCurrentUserDetails sync warning:', e);
    }
  }
}

window.addEventListener('DOMContentLoaded', loadManagementPanel);
```

<a id="determine-the-passkey-provider-from-aaguid--aaguid-"></a>
<a id="aaguid"></a>
## 根据 AAGUID 确定通行密钥提供方 {: #aaguid }

AAGUID（身份验证器证明全局唯一标识符）是一个 128 位标识符，表示身份验证器的型号，而非某个具体实例。它包含在通行密钥注册时的身份验证器数据中，可用来确定是哪个通行密钥提供方（例如 Google 密码管理器、iCloud 钥匙串或 1Password）创建了凭据。

AAGUID 应仅用于帮助用户管理通行密钥。除非经过加密证明，否则它可以被修改，而平台通行密钥目前不支持这种证明。

<a id="1-aaguid-registry"></a>
### 1. AAGUID 注册表

社区维护的 JSON 映射表将 AAGUID 对应到提供方名称和图标，地址如下：

```
https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/refs/heads/main/combined_aaguid.json
```

每个条目使用以下模式：

```json
{
  "<aaguid-uuid>": {
    "name": "Provider Name",
    "icon_light": "data:image/png;base64,...",
    "icon_dark": "data:image/png;base64,..."
  }
}
```

<a id="2-using-aaguid-after-registration"></a>
### 2. 注册后使用 AAGUID

验证注册响应后，从注册结果中读取 `aaguid`，并在注册表中查询它，以填充凭据的 `name` 和 `providerIcon`：

在注册表中查询 AAGUID 前，先检查它是否等于 `'00000000-0000-0000-0000-000000000000'`。如果是，则跳过查询，将 `name` 设为回退名称（例如来自 user-agent 的设备名称，或“未知通行密钥提供方”），并将 `providerIcon` 设为 `undefined`。只有非全零的 AAGUID 才查询注册表。

```javascript
import aaguids from './aaguids.json' with { type: 'json' };

const { aaguid } = registrationInfo;
if (aaguid === '00000000-0000-0000-0000-000000000000') {
  // use the device name as the passkey provider based on
  // the information derived from the user agent string,
  // or just say "Unknown passkey provider"
} else {
  const provider = aaguids[aaguid];
  const credential = {
    // ...other fields
    aaguid,
    name: provider?.name || 'Unknown passkey provider',
    providerIcon: provider?.icon_light,
  };
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

呈现“创建通行密钥”按钮前，调用 `PublicKeyCredential.getClientCapabilities()` 验证平台身份验证器支持情况；如果不支持，就隐藏按钮：

```javascript
async function isPasskeySupported() {
  if (!window.PublicKeyCredential || !PublicKeyCredential.getClientCapabilities) {
    return false;
  }
  try {
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    return Boolean(capabilities.passkeyPlatformAuthenticator);
  } catch {
    return false;
  }
}

const createButton = document.getElementById('create-passkey');
if (!(await isPasskeySupported())) {
  createButton.hidden = true;
}
``` 

<a id="signal-api-synchronization-fallback"></a>
### Signal API 同步的回退

Web 身份验证信号方法的浏览器支持情况：支持有限。
支持的浏览器：Chrome 132（2025 年 1 月）、Edge 132（2025 年 1 月）和 Safari 26（2025 年 9 月）。
不支持的浏览器：Firefox。

WebAuthn Signal API（`webauthn-signals`）是一项渐进增强能力，用于将服务器端凭据删除和账户资料更新同步至用户的密码管理器。由于同步会直接与浏览器或操作系统的通行密钥提供方通信，如果你的 Baseline 目标不支持 `webauthn-signals`，就没有可用的 polyfill。通过检查 `PublicKeyCredential` 上的静态特性来控制调用，让不支持的浏览器安全跳过后台同步，同时服务器端的通行密钥列表、重命名、删除和用户资料更新仍正常工作，不会抛出浏览器异常：

```javascript
if (window.PublicKeyCredential && PublicKeyCredential.signalAllAcceptedCredentials) {
  try {
    await PublicKeyCredential.signalAllAcceptedCredentials({
      rpId, // Server-provided RP ID (never window.location.hostname)
      userId, // Valid unpadded Base64URL user ID
      allAcceptedCredentialIds: credentialIds, // Valid unpadded Base64URL credential IDs
    });
  } catch (e) {
    console.warn('SignalAllAcceptedCredentials sync warning:', e);
  }
}

if (window.PublicKeyCredential && PublicKeyCredential.signalCurrentUserDetails) {
  try {
    await PublicKeyCredential.signalCurrentUserDetails({
      rpId, // Server-provided RP ID (never window.location.hostname)
      userId, // Valid unpadded Base64URL user ID
      name: updatedName,
      displayName: updatedDisplayName,
    });
  } catch (e) {
    console.warn('SignalCurrentUserDetails sync warning:', e);
  }
}
```
