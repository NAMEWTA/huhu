<a id="passkeys-orientation"></a>
# 通行密钥导读

本指南以高信息密度、面向实际操作的方式，说明如何在现代 Web 应用中实现安全、与框架无关的通行密钥身份验证及凭据管理。

<a id="1-core-prerequisites-for-passkeys"></a>
## 1. 通行密钥的核心前提

通行密钥依赖 Web Authentication API（WebAuthn）。它具有严格且贯穿各层的安全约束，开始实现之前必须满足：
* **安全上下文：** WebAuthn 方法（`navigator.credentials.create` 与 `navigator.credentials.get`）严格限定在安全上下文中。应用在生产环境**必须**使用 `https://`，本地开发可使用 `http://localhost`。
* **依赖方（RP）ID：** 每个凭据都绑定一个 RP ID，本质上是应用的域名。服务器选项中的 RP ID **必须**等于当前来源域名，或是其有效可注册域名后缀，例如 `example.com` 可用于 `login.example.com`；也可以通过相关来源请求（`/.well-known/webauthn`）获得授权。不匹配会在客户端引发 `SecurityError`。**不要**在客户端从 `window.location.hostname` 推导 `rpId`，例如调用 WebAuthn Signal API 时也不能这样做，因为 `window.location.hostname` 无法匹配服务器配置的父域名或相关来源 RP ID。始终从服务器提供的 WebAuthn 选项（`publicKey.rp.id` 或 `publicKey.rpId`）或后端 API 响应读取 `rpId`。

<a id="2-the-aaguid-ux-caveat"></a>
## 2. AAGUID 的用户体验限制

认证器证明全局唯一标识符（AAGUID）是注册证明数据中返回的 128 位标识符，用于表示认证器的型号或提供方，例如 Google Password Manager、iCloud Keychain、1Password。
* **仅用于体验提示：** 依赖方**必须**仅将 AAGUID 用于用户体验提示，例如在管理列表中展示通行密钥提供方的名称和图标，帮助用户辨认。
* **不得作为安全依据：** 应用**不得**将 AAGUID 用于密码学安全或访问决策。目前，平台通行密钥不会为其 AAGUID 提供密码学证明，因此用户代理可以修改或模拟它。

<a id="3-decoupled-library-recommendations"></a>
## 3. 解耦的库推荐

生成后端 FIDO2/WebAuthn 选项及验证签名时，开发者**必须**采用各语言中经过审查的开源库，而不是自行实现密码学：
* **JavaScript/TypeScript：** SimpleWebAuthn（github.com/MasterKale/SimpleWebAuthn）
* **Python：** py_webauthn（github.com/duo-labs/py_webauthn）
* **Java：** Java WebAuthn Server（github.com/Yubico/java-webauthn-server）、WebAuthn4J（github.com/webauthn4j/webauthn4j）
* **.NET：** .NET library for FIDO2（github.com/abergs/fido2-net-lib）
* **Go：** WebAuthn Go Library（github.com/go-webauthn/webauthn）
* **Ruby：** WebAuthn Ruby（github.com/cedarcode/webauthn-ruby）
* **PHP：** WebAuthn Framework（github.com/web-auth/webauthn-framework）

<a id="4-use-case-reference-matrix"></a>
## 4. 使用场景参考表

从下文确定对应场景，并检索其完整实现指南。每个场景都涉及关键 API，例如 `PublicKeyCredential.parseCreationOptionsFromJSON`、`parseRequestOptionsFromJSON`、`signalAllAcceptedCredentials`、`signalCurrentUserDetails`、`signalUnknownCredential`、条件式介入和 AAGUID 处理，这些内容仅在对应场景指南中详述。**不要**跳过检索步骤，也**不要**在客户端以第三方库包装器（如 SimpleWebAuthn 的 `startAuthentication`/`startRegistration`）替代实现；应直接调用浏览器原生 WebAuthn API。第 3 节推荐的库仅适用于**服务器端**，即后端 FIDO2 验证。

具体的通行密钥与 WebAuthn 实现对应以下指南：
* **通行密钥注册：** `passkey-registration`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-registration"` 获取）——提供新的通行密钥注册和引导入口。
* **条件式创建通行密钥：** `passkey-conditional-create`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-conditional-create"` 获取）——密码登录成功后立即静默注册通行密钥。
* **通行密钥身份验证：** `passkey-authentication`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-authentication"` 获取）——可发现凭据自动填充与按钮登录。
* **快速登录：** `quick-sign-ins`（通过 `npx -y modern-web-guidance@latest retrieve "quick-sign-ins"` 获取）——在页面跳转之前，利用本地通行密钥和已保存密码进行符合上下文的原地登录。
* **通行密钥管理：** `passkey-management`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-management"` 获取）——与密码管理器同步列表、重命名和删除。
* **通行密钥再次身份验证：** `passkey-reauthentication`（通过 `npx -y modern-web-guidance@latest retrieve "passkey-reauthentication"` 获取）——已登录用户执行敏感步骤前再次核验身份。
