<a id="quick-sign-ins-with-immediate-ui-mode"></a>
# 使用即时 UI 模式快速登录

当未登录用户点击“登录”链接、开始结账、收藏商品或遇到文章付费墙时，将其跳转到专门的登录页会使用户丢失当前上下文，并增加流失。即时 UI 模式（`navigator.credentials.get()` 中的 `uiMode: 'immediate'`）可在设备上存在本地通行密钥（`publicKey`）或已保存密码（`password: true`）时，立即呈现统一的浏览器账户选择器，支持在当前上下文中快速登录。

标准的模态 WebAuthn 提示始终会显示浏览器界面，并回退到跨设备二维码或外部安全密钥；即时 UI 模式则在设备上没有符合条件的本地凭据时，立即以 `NotAllowedError` 失败。这样，应用既可让回访用户轻点一下便就地完成身份验证，也可将没有本地凭据的用户平稳引导至标准登录页、访客结账页或内嵌登录表单。

<a id="recommended-ux-patterns-and-anti-patterns"></a>
## 推荐的用户体验模式与应避免的做法

在用户意图明确、**即将**离开当前页面的时刻，于用户发起的事件处理器中触发即时 UI 模式（需要瞬时用户激活）。如果即时身份验证成功，立即完成用户原本的操作，可以就地更新当前页，也可以直接前往用户已登录后的目的地。如果以 `NotAllowedError` 失败，显示登录或注册流程，并提供在完成后继续原操作的路径。

可能的使用场景：

- **拦截页头的登录链接或按钮**：拦截全局“登录”链接的点击（`event.preventDefault()`），立即为回访用户验证身份；遇到 `NotAllowedError` 时则继续前往专用登录页。
- **结账前动态登录**：当回访买家点击“前往结账”时，让其轻点一下完成身份验证，直接进入配送和付款步骤；回退时则进入标准登录或访客结账界面。
- **为微操作内嵌登录（收藏、点赞、书签、保存）**：当未登录用户点击微操作按钮时，就地验证身份并立即完成操作，例如切换为 `aria-pressed="true"`；回退时则打开登录模态框，或前往带返回 URL 参数的登录页。
- **文章中的软付费墙**：当读者点击付费墙横幅中的“使用账户继续阅读”时，就地完成身份验证；回退时则展开内嵌的登录或注册表单。

应避免的做法：

- **不要在专用登录页使用即时 UI 模式**：绝不要把 `uiMode: 'immediate'` 附加到最终登录目的页的主“登录”或“使用通行密钥登录”按钮上。用户来到专用登录页，往往正是因为当前设备没有本地凭据，或他们打算使用跨设备通行密钥（用手机扫描二维码）或外部硬件安全密钥。由于 `uiMode: 'immediate'` 会隐藏跨设备二维码和安全密钥选项，并在没有本地凭据时立即抛出 `NotAllowedError`，在专用登录页使用它会使用户陷入点击按钮却毫无进展的死胡同。在专用登录页，应在表单输入框上使用条件式 UI（`mediation: 'conditional'` 配合 `autocomplete="username webauthn"`），并搭配标准的模态 `navigator.credentials.get({ publicKey })` 按钮，参见 `passkey-authentication`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-authentication"` 获取）。
- **不要用即时 UI 模式进行加强型重新身份验证**：在已登录用户执行敏感操作前，例如更改密码、更新收货地址、编辑已保存的付款方式或添加新通行密钥，绝不要用 `uiMode: 'immediate'` 进行重新身份验证。重新身份验证必须通过非空 `allowCredentials` 列表，将提示限制在当前已登录用户的凭据范围内；即时 UI 模式会用 `NotAllowedError` 拒绝这样的列表，而省略 `allowCredentials` 又可能使用户误选另一个账户。对于加强型重新身份验证，请遵循 `passkey-reauthentication`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-reauthentication"` 获取）。

<a id="privacy-and-security-constraints"></a>
## 隐私与安全约束

请求 `uiMode: 'immediate'` 时，浏览器会强制实施严格的隐私与安全规则：

- **需要瞬时用户激活**：必须在用户发起的事件处理器中调用 `navigator.credentials.get({ uiMode: 'immediate' })`，例如 `<button>` 或 `<a>` 元素的 `click` 监听器，以防止静默探测凭据。绝不要在页面加载时（`DOMContentLoaded`）自动调用。调用该 API 不会消耗瞬时激活。
- **不要传入非空 `allowCredentials` 列表**：指定 `uiMode: 'immediate'` 时，**不要**填充 `publicKey.allowCredentials`。对于任何带非空 `allowCredentials` 列表的即时 UI 模式请求，浏览器都会立即抛出 `NotAllowedError` 并拒绝，避免依赖方通过探测特定凭据 ID 推断此前的访问行为或跨会话追踪用户。
- **不要传入 `AbortSignal`（`signal`）**：指定 `uiMode: 'immediate'` 时，**不要**在 `navigator.credentials.get()` 上设置 `signal` 属性，因为浏览器不允许程序化关闭即时登录对话框。如果页面同时运行后台条件式 UI（`mediation: 'conditional'`）请求，先对该条件式 UI 的 `AbortController` 调用 `abort()`，再启动即时 UI 模式，并在即时请求本身中省略 `signal`。
- **无痕和隐私浏览会话**：在无痕或隐私浏览窗口中发出的请求，始终以 `NotAllowedError` 拒绝，使隐私会话无法与没有本地凭据的会话区分。

<a id="server-side-setup"></a>
## 服务器端设置

<a id="options-generation-endpoint"></a>
### 生成选项的端点

提供一个端点，为尚未登录的访问者生成可发现的 WebAuthn 请求选项：

1. **包含服务器预定义的 `rpId`**：在请求选项中显式设置 `rpId`，与注册通行密钥时使用的 RP ID 一致，让客户端可直接将 `publicKey.rpId` 传给 Signal API。
2. **生成与会话绑定的质询**：创建使用密码学安全随机数生成的质询缓冲区，将其存入服务器会话，并编码为 Base64URL。
3. **持久化用户验证偏好**：设置 `userVerification: 'preferred'`，并在会话中保存 `expectedUserVerification: 'preferred'`。
4. **省略 `allowCredentials`**：不要在即时 UI 模式的选项中包含非空 `allowCredentials` 列表，因为浏览器会以 `NotAllowedError` 拒绝非空白名单。

```javascript
// Server-side options generation example (/api/login/options)
router.post('/api/login/options', (req, res) => {
  const options = {
    challenge: serverGeneratedBase64UrlChallenge, // High-entropy random challenge stored in session
    rpId: 'example.com',
    userVerification: 'preferred',
  };

  req.session.challenge = options.challenge;
  req.session.expectedUserVerification = 'preferred';
  return res.json(options);
});
```

<a id="dual-credential-verification-endpoints"></a>
### 两种凭据的验证端点

由于 `navigator.credentials.get({ password: true, publicKey, uiMode: 'immediate' })` 的成功结果可能是通行密钥（`PublicKeyCredential`），也可能是已保存的密码（`PasswordCredential`），因此应为两种凭据类型都提供验证处理器：

1. **WebAuthn 断言验证（`/api/login/verify`）**：使用会话质询和已存储的公钥验证断言。如果数据库中找不到该凭据 ID，返回 HTTP 状态 `404`，使客户端可以通过 `PublicKeyCredential.signalUnknownCredential()` 通知密码管理器。
2. **密码验证（`/api/login/password`）**：使用用户数据库验证 `username`（`cred.id`）和 `password`（`cred.password`），并建立已验证身份的会话。

<a id="client-side-implementation"></a>
## 客户端实现

<a id="unified-credential-request"></a>
### 统一凭据请求

1. **同时请求通行密钥和密码**：使用 `PublicKeyCredential.parseRequestOptionsFromJSON()` 解码服务器选项，在用户发起的点击处理器中调用 `navigator.credentials.get()`，传入 `password: true`、`publicKey` 和 `uiMode: 'immediate'`，不要传入 `signal`。
2. **根据 `cred.type` 分支验证**：
   - 如果 `cred.type === 'public-key'`，用 `cred.toJSON()` 序列化断言，并 POST 到 WebAuthn 验证端点。服务器返回 HTTP `404` 时，调用 `PublicKeyCredential.signalUnknownCredential({ rpId: publicKey.rpId, credentialId: encoded.id })`。始终使用来自服务器请求选项的 `publicKey.rpId`，**不要**在客户端推导或回退到 `window.location.hostname`；服务器配置的 RP ID 可能是可注册的父域（例如在 `shop.example.com` 上使用 `example.com`），也可能使用关联源请求。
   - 如果 `cred.type === 'password'`，将 `{ username: cred.id, password: cred.password }` POST 到密码验证端点。
3. **处理没有本地凭据时的 `NotAllowedError`**：捕获 `NotAllowedError`，它会在设备上没有本地通行密钥或已保存密码，或用户关闭选择器时立即抛出，然后转入标准登录流程，例如打开内嵌登录对话框，或前往带返回 URL 的 `/signin`。在当前页面显示回退用的内嵌登录表单或对话框时，将焦点移到其第一个交互控件，并通过礼貌级别的实时区域（`role="status"`）播报状态变化。
4. **恢复焦点并播报就地登录完成**：当就地身份验证或回退表单提交后，登录触发器或内嵌表单被隐藏时，将焦点恢复到最初的操作控件，或页头中仍存在的已登录控件，避免键盘焦点掉到 `document.body`；同时在状态实时区域（`role="status"`）播报已登录状态。

```javascript
let isAuthenticating = false;

async function authenticateWithImmediateUi() {
  const optionsResponse = await fetch('/api/login/options', { method: 'POST' });
  if (!optionsResponse.ok) {
    throw new Error('Failed to fetch authentication options');
  }
  const optionsJSON = await optionsResponse.json();
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON);

  // MANDATORY: Request both password and publicKey with uiMode: 'immediate' and NO signal parameter
  const cred = await navigator.credentials.get({
    password: true,
    publicKey,
    uiMode: 'immediate',
  });

  if (!cred) {
    throw new DOMException('No credential returned', 'NotAllowedError');
  }

  if (cred.type === 'public-key') {
    const encoded = cred.toJSON();
    const verifyResponse = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encoded),
    });

    if (verifyResponse.status === 404) {
      if (PublicKeyCredential.signalUnknownCredential) {
        await PublicKeyCredential.signalUnknownCredential({
          rpId: publicKey.rpId, // Always use the server-provided rpId; DO NOT use window.location.hostname
          credentialId: encoded.id, // Base64URL-encoded credential ID string
        });
      }
      throw new Error('Passkey credential is no longer recognized by the server');
    }

    if (!verifyResponse.ok) {
      throw new Error('Passkey verification failed');
    }
    return await verifyResponse.json();
  }

  if (cred.type === 'password') {
    const verifyResponse = await fetch('/api/login/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cred.id,
        password: cred.password,
      }),
    });

    if (!verifyResponse.ok) {
      throw new Error('Password verification failed');
    }
    return await verifyResponse.json();
  }

  throw new Error(`Unsupported credential type: ${cred.type}`);
}

// Example: Intercepting an inline micro-action (Favorite button) or Header Sign-in click
const favoriteButton = document.getElementById('favorite-btn');

favoriteButton.addEventListener('click', async (event) => {
  event.preventDefault();
  if (isAuthenticating) return;

  // If already signed in, toggle the micro-action state immediately
  if (document.body.dataset.signedIn === 'true') {
    const nextPressed = favoriteButton.getAttribute('aria-pressed') !== 'true';
    favoriteButton.setAttribute('aria-pressed', String(nextPressed));
    return;
  }

  isAuthenticating = true;
  try {
    const user = await authenticateWithImmediateUi();
    // Complete the user's intended action immediately, restore focus so hiding
    // sign-in UI does not drop focus to document.body, and announce status
    document.body.dataset.signedIn = 'true';
    favoriteButton.setAttribute('aria-pressed', 'true');
    updateHeaderUserState(user);
    favoriteButton.focus();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      // No local credentials available or user dismissed dialog:
      // reveal fallback sign-in UI (moving focus to its first input) or redirect with return URL
      showFallbackSignInUi({ returnAction: 'favorite', returnFocusEl: favoriteButton });
      return;
    }
    console.error('Authentication error:', err);
  } finally {
    isAuthenticating = false;
  }
});
```

<a id="fallback-strategies"></a>
## 回退策略

<a id="immediate-ui-mode-fallback"></a>
### 即时 UI 模式的回退

- **渐进增强体验**：将 `uiMode: 'immediate'` 视为渐进增强能力。不要通过浏览器名称或版本推断支持情况；唯一可靠的支持信号，是通过 `PublicKeyCredential.getClientCapabilities()` 在运行时检查 `capabilities.immediateGet`。**强制要求**：在调用 `navigator.credentials.get({ uiMode: 'immediate' })` 前，始终检查 `capabilities.immediateGet`；无法识别 `uiMode: 'immediate'` 的浏览器会忽略这个未知字典键，并打开阻塞式的通行密钥和二维码模态对话框。当 `capabilities.immediateGet` 为假值，或 `navigator.credentials.get()` 以 `NotAllowedError` 拒绝时，回退到应用的标准登录体验，例如打开内嵌登录模态框，或前往带返回 URL 参数的专用登录页，让不支持此能力的浏览器继续呈现现有登录流程：

```javascript
async function isImmediateUiSupported() {
  if (!window.PublicKeyCredential || !PublicKeyCredential.getClientCapabilities) {
    return false;
  }
  try {
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    return Boolean(capabilities?.immediateGet);
  } catch {
    return false;
  }
}

async function authenticateWithImmediateUi() {
  // MANDATORY: Check immediateGet support so unsupported browsers do not open a modal QR dialog
  const supported = await isImmediateUiSupported();
  if (!supported) {
    // Throw NotAllowedError so the caller's single catch path treats "unsupported" like "no local credentials"
    throw new DOMException('Immediate UI mode is not supported', 'NotAllowedError');
  }
  // Proceed with fetching options and calling navigator.credentials.get({ password: true, publicKey, uiMode: 'immediate' })
}
```

<a id="client-capabilities-detection-fallback"></a>
### 客户端能力检测的回退

api.PublicKeyCredential.getClientCapabilities_static 能力的 Baseline 状态：新近可用。自 2025-02-06 起纳入 Baseline。
支持的浏览器：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）、Firefox 135（2025 年 2 月）和 Safari 17.4（2024 年 3 月）。

始终安装 `'webauthn-polyfills'` 并在客户端模块中导入，让所有支持 `PublicKeyCredential` 的环境都能使用 `PublicKeyCredential.getClientCapabilities()`：

```javascript
import 'webauthn-polyfills';
```

<a id="password-credentials-fallback"></a>
### 密码凭据的回退

密码凭据的浏览器支持情况：支持有限。
支持的浏览器：Chrome 60（2017 年 7 月）和 Edge 79（2020 年 1 月）。
不支持的浏览器：Firefox 和 Safari。

在 `navigator.credentials.get()` 中将 `password: true` 与 `publicKey` 一起传入，可以让支持此功能的浏览器在统一的即时账户选择器中，包含浏览器密码管理器保存的密码。

- **回退体验**：不支持 `PasswordCredential` 的浏览器会忽略 `password: true` 选项，或通过 `capabilities.immediateGet` 特性检查回退到标准登录表单；在该表单中，`<input autocomplete="username webauthn">` 和 `<input type="password" autocomplete="current-password">` 提供原生密码自动填充。

<a id="easy-json-serialization-fallback"></a>
### 简便 JSON 序列化的回退

api.PublicKeyCredential.parseRequestOptionsFromJSON_static 能力的 Baseline 状态：新近可用。自 2025-03-31 起纳入 Baseline。
支持的浏览器：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）、Firefox 119（2023 年 10 月）和 Safari 18.4（2025 年 3 月）。

始终安装 `'webauthn-polyfills'` 并在客户端打包产物中导入，让所有支持 `PublicKeyCredential` 的浏览器都能一致地使用 `PublicKeyCredential.parseRequestOptionsFromJSON()` 和 `PublicKeyCredential.prototype.toJSON()`：

```javascript
import 'webauthn-polyfills';
```

<a id="signal-api-synchronization-fallback"></a>
### Signal API 同步的回退

Web 身份验证信号方法的浏览器支持情况：支持有限。
支持的浏览器：Chrome 132（2025 年 1 月）、Edge 132（2025 年 1 月）和 Safari 26（2025 年 9 月）。
不支持的浏览器：Firefox。

WebAuthn Signal API（`webauthn-signals`）是一项渐进增强能力，用于在服务器返回 HTTP `404` 时，从用户的密码管理器中移除失效的通行密钥。

- **回退体验**：通过 `if (PublicKeyCredential.signalUnknownCredential)` 控制调用。如果不支持，平稳跳过信号调用，并显示清晰的消息，引导用户使用其他方式登录。
