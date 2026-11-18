<a id="verify-email-address-ownership"></a>
# 验证电子邮件地址的所有权

在注册、登录、结账或账户恢复期间收集电子邮件地址时，传统的所有权验证需要通过站外渠道发送一次性验证码（OTP）或魔法链接。这迫使用户离开当前页面，等待邮件送达，再复制验证码，带来操作阻碍、用户流失和钓鱼风险，同时也会向邮件提供方透露用户正在访问哪个依赖方（RP）。

**Email Verification API**（客户端 HTML 扩展）和 **Email Verification Protocol（EVP）**（后端密码学协议），允许依赖方在不发送验证邮件的情况下，验证用户是否控制某个邮箱地址。浏览器在依赖方与用户的邮件提供方（签发方）之间充当中介：

1. 依赖方在与邮箱输入框相同的 `<form>` 中加入隐藏的 `<input>`，设置 `autocomplete="email-verification-token"`，并提供一次性密码学 `nonce`。
2. 当用户选择或输入邮箱地址时，浏览器查询该域的 `_email-verification.<domain>` DNS `TXT` 记录，确认用户与权威签发方之间存在有效会话，并请求**电子邮件验证令牌（EVT）**，同时不向签发方透露依赖方身份。
3. 浏览器通过临时浏览器密钥对签署的**密钥绑定 JWT（KB-JWT）**，将 EVT 绑定到依赖方的源和会话 `nonce`，形成 `EVT + KB-JWT`，填充隐藏输入框并提交表单。
4. 依赖方后端验证密码学链；若有效，则跳过邮件 OTP 或魔法链接步骤。

<a id="1-enable-the-origin-trial-and-render-the-verification-form"></a>
## 1. 启用 Origin Trial 并呈现验证表单

以验证网站（依赖方）身份参与时：

1. **提供 Origin Trial 令牌**：在承载表单的页面上，通过 `Origin-Trial` HTTP 响应标头或 `<meta http-equiv="origin-trial">` 元素提供令牌。
   - **第三方源试用：**嵌入式身份 SDK 可以注入第三方试用令牌，前提是 Origin Trial 注册者的源与签发方域匹配，即与签发方同站，例如 `https://issuer.example`。
2. **每次呈现表单都生成密码学随机 nonce**：至少具有 128 位熵，例如使用 `node:crypto` 的 `randomBytes(32).toString('base64url')`。将它存入**服务器端会话状态**，以带 `HttpOnly`、`Secure`、`SameSite=Lax` 的会话 ID cookie 为键；绝不要将预期 `nonce` 值直接存入客户端 cookie，因为攻击者可能同时重放 cookie 和令牌。将该值呈现到隐藏令牌输入框的 `nonce` 属性中。页面应通过 `Cache-Control: no-store` 提供，避免前进或后退导航复用已消耗的 nonce。
3. **添加隐藏令牌输入框**：将 `autocomplete="email-verification-token"` 的隐藏输入框，放入与邮箱输入框（`autocomplete="email"`）相同的 `<form>` 中。

```html
<!-- Serve with:
     Origin-Trial: <YOUR_ORIGIN_TRIAL_TOKEN>
     Cache-Control: no-store -->
<form method="POST" action="/api/verify-email">
  <label for="email">Email address:</label>
  <input
    type="email"
    id="email"
    name="email"
    autocomplete="email"
    required
  />

  <!-- MANDATORY: Must be in the same <form> as the email input.
       The nonce value must be freshly generated on the server per form render. -->
  <input
    type="hidden"
    name="token"
    nonce="SERVER_GENERATED_PER_FORM_NONCE"
    autocomplete="email-verification-token"
  />

  <button type="submit">Continue</button>
</form>
```

<a id="2-verify-the-submitted-token-on-the-server"></a>
## 2. 在服务器上验证提交的令牌

表单提交时，将 `token` 字段视为不可信输入。收到请求后，原子地从服务器端会话存储读取并删除预期的 `nonce`。如果 `token` 字段为空，例如浏览器不支持 EVP，或用户尚未登录邮件提供方，或验证失败，立即回退到标准邮件 OTP 或魔法链接流程：

```javascript
// Replace with your public relying-party origin
const RP_ORIGIN = 'https://rp.example.com';

export async function handleSignupSubmission(request) {
  const formData = await request.formData();
  const submittedEmail = String(formData.get('email') || '').trim();
  const rawToken = String(formData.get('token') || '').trim();
  // Atomically read and delete the single-use nonce from server-side session state
  const expectedNonce = await consumeSessionNonce(request);

  if (rawToken && expectedNonce) {
    try {
      await verifyEmailVerificationToken({
        rawToken,
        submittedEmail,
        expectedNonce,
        expectedAudience: RP_ORIGIN,
      });
      // Fast path: email ownership is cryptographically verified; skip OTP email.
      return completeAccountCreation(submittedEmail);
    } catch (err) {
      // Log token verification failures before falling back to standard email verification.
      console.error('Email verification token check failed:', err);
    }
  }

  // Fallback path: send standard OTP code or magic link email to submittedEmail.
  return sendTraditionalVerificationEmail(submittedEmail);
}
```

始终使用适合后端平台的成熟 SD-JWT 和 JOSE/JWT 库实现 `verifyEmailVerificationToken`，例如 Node.js 的 `@sd-jwt/core` 和 `jose`，Python 的 `sd-jwt-python` / `jwcrypto`，或 JVM 的 `sd-jwt-java` / Nimbus JOSE+JWT，不要自行编写 JWT 或 SD-JWT 解析代码。

<a id="step-1-parse-the-sd-jwt-claims-and-validate-the-email-address"></a>
### 第 1 步：解析 SD-JWT 声明并验证邮箱地址

从服务器端会话存储消耗一次性的 `expectedNonce` 后，解码 SD-JWT 呈现数据（`EVT + KB-JWT`），并验证：
- 签发方 JWT（`jwt`）和密钥绑定 JWT（`kbJwt`）均存在，且包含签发方声明（`iss`）。
- `evtPayload.email_verified === true`。
- 通过**不区分大小写的比较**（`toLowerCase()`），确认 `evtPayload.email` 与表单提交的邮箱地址匹配。

```javascript
import { createHash } from 'node:crypto';
import { decodeSdJwtSync } from '@sd-jwt/core';

const hasher = (data, alg) =>
  createHash(alg === 'sha-256' ? 'sha256' : alg).update(data).digest();

const decoded = decodeSdJwtSync(rawToken, hasher);
const evtPayload = decoded.jwt.payload;
const iss = evtPayload.iss;

if (!expectedNonce || !decoded.kbJwt || !iss || evtPayload.email_verified !== true) {
  throw new Error('Missing nonce, KB-JWT, issuer, or email_verified !== true.');
}
// MANDATORY: Compare email addresses case-insensitively
if (evtPayload.email?.toLowerCase() !== submittedEmail.toLowerCase()) {
  throw new Error('Submitted email does not match the EVT email claim.');
}
```

<a id="step-2-validate-dns-txt-delegation-and-load-the-issuer-jwks"></a>
### 第 2 步：验证 DNS TXT 委派并加载签发方 JWKS

向 `iss` 发出任何网络请求之前，验证所提交邮箱的域是否通过 `_email-verification.<domain>` DNS `TXT` 记录，将权限委派给这个精确的签发方。记录格式为 `iss=<issuer-host>`，对应 `https://<issuer-host>`，不带端口、路径或末尾斜杠。当 DNS 委派与 `iss` 逐字节一致后，通过 HTTPS 获取 `${iss}/.well-known/email-verification`，确认 `metadata.issuer === iss`，并加载签发方的 JSON Web Key Set（JWKS）。

> **关于 `kid` 处理的说明：**一些大型邮件提供方，例如 Gmail，会在 EVT 标头中省略 `kid`。如果缺少 `kid` 且 JWKS 包含多个密钥，`jose` 会抛出 `ERR_JWKS_MULTIPLE_MATCHING_KEYS`，它是匹配 `CryptoKey` 的 `AsyncIterable`；如第 3 步所示，通过 `for await (const publicKey of err)` 迭代，逐个尝试用每个密钥验签。

```javascript
import dns from 'node:dns/promises';
import { createRemoteJWKSet } from 'jose';

const domain = submittedEmail.split('@')[1];
const txtRecords = (await dns.resolveTxt(`_email-verification.${domain}`)).map((r) => r.join(''));
if (!txtRecords.some((txt) => txt.startsWith('iss=') && `https://${txt.slice(4).trim()}` === iss)) {
  throw new Error(`Issuer "${iss}" is not delegated via DNS for "${domain}".`);
}

const discoveryUrl = new URL('/.well-known/email-verification', iss);
if (discoveryUrl.protocol !== 'https:') throw new Error('Issuer must use HTTPS.');
const metadata = await (await fetch(discoveryUrl)).json();
if (metadata.issuer !== iss || !metadata.jwks_uri?.startsWith('https://')) {
  throw new Error('Invalid issuer metadata or non-HTTPS jwks_uri.');
}
const issuerJwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
```

<a id="step-3-verify-the-evt-signature-and-key-binding-jwt-kb-jwt"></a>
### 第 3 步：验证 EVT 签名与密钥绑定 JWT（`KB-JWT`）

最后，使用明确的非对称算法白名单（`['Ed25519', 'EdDSA', 'ES256']`），验证两个签名及两个令牌之间的密码学绑定：
1. **EVT 签名（`verifier`）：**使用 `issuerJwks` 验证；当省略 `kid` 时，捕获 `ERR_JWKS_MULTIPLE_MATCHING_KEYS` 并迭代候选密钥。同时强制检查 `iss` 和严格的新鲜度窗口（`maxTokenAge: '5m'`、`clockTolerance: '1m'`）。
2. **持有者绑定（`kbVerifier` 和 `sdJwt.verify` 选项）：**从 `evtPayload.cnf.jwk` 提取浏览器的临时公钥，确认 `cnf.jwk.alg` 和 `decoded.kbJwt.header.alg` 均在 `ALLOWED_ALGS` 中且彼此匹配；在 Origin Trial 实现向 RFC 9864 `'Ed25519'` 迁移期间，将 `'Ed25519'` 和 `'EdDSA'` 视为等价。使用 `typ: 'kb+jwt'` 验证 `KB-JWT` 签名。向 `sdJwt.verify()` 传入 `keyBindingNonce: expectedNonce`、`expectedKeyBindingAudience: expectedAudience` 和 `keyBindingMaxAgeSeconds: 300`；只有提供 `keyBindingNonce` 时，`@sd-jwt/core` 才会调用 `kbVerifier` 并验证 `nonce`、`aud`、`iat` 和 `sd_hash`。

```javascript
import { SDJwtInstance } from '@sd-jwt/core';
import { importJWK, jwtVerify } from 'jose';

// IETF draft-hardt-email-verification-02 (§3.3, §5.1.1) specifies RFC 9864 'Ed25519' and 'ES256'.
// TODO: Remove 'EdDSA' once live issuers (e.g. Gmail) and Chrome Origin Trial builds finish
// transitioning from 'EdDSA' (with crv: 'Ed25519') to 'Ed25519'.
const ALLOWED_ALGS = ['Ed25519', 'EdDSA', 'ES256'];
const normalizeAlg = (alg) => (alg === 'Ed25519' ? 'EdDSA' : alg);
const evtOptions = {
  typ: 'ev+sd-jwt',
  issuer: iss,
  algorithms: ALLOWED_ALGS,
  maxTokenAge: '5m',
  clockTolerance: '1m',
};

const sdJwt = new SDJwtInstance({
  hasher,
  verifier: async (data, sig) => {
    const compactEvt = `${data}.${sig}`;
    try {
      await jwtVerify(compactEvt, issuerJwks, evtOptions);
    } catch (err) {
      // When `kid` is omitted (e.g. Gmail) and multiple keys match in the JWKS,
      // jose throws JWKSMultipleMatchingKeys, which yields each matching CryptoKey.
      if (err?.code !== 'ERR_JWKS_MULTIPLE_MATCHING_KEYS') throw err;
      let matched = false;
      for await (const publicKey of err) {
        try {
          await jwtVerify(compactEvt, publicKey, evtOptions);
          matched = true;
          break;
        } catch {}
      }
      if (!matched) throw err;
    }
    return true;
  },
  kbVerifier: async (data, sig) => {
    const holderJwk = evtPayload.cnf?.jwk;
    const holderAlg = holderJwk?.alg;
    const kbAlg = decoded.kbJwt.header.alg;
    if (
      !holderAlg ||
      !kbAlg ||
      !ALLOWED_ALGS.includes(holderAlg) ||
      !ALLOWED_ALGS.includes(kbAlg) ||
      normalizeAlg(kbAlg) !== normalizeAlg(holderAlg)
    ) {
      throw new Error('Missing, disallowed, or mismatched KB-JWT algorithm.');
    }
    const holderKey = await importJWK(holderJwk, kbAlg);
    await jwtVerify(`${data}.${sig}`, holderKey, {
      typ: 'kb+jwt',
      audience: expectedAudience,
      algorithms: [kbAlg],
      maxTokenAge: '5m',
      clockTolerance: '1m',
    });
    return true;
  },
});

const verified = await sdJwt.verify(rawToken, {
  requiredClaimKeys: ['email', 'email_verified'],
  keyBindingNonce: expectedNonce,
  expectedKeyBindingAudience: expectedAudience,
  keyBindingMaxAgeSeconds: 300,
  skewSeconds: 60,
});
```

<a id="best-practices"></a>
## 最佳实践

- **应当**严格在服务器上执行全部令牌验证。**不要**在客户端 JavaScript 中验证令牌，也不要信任任何客户端验证状态；客户端检查很容易被绕过或伪造，无法为依赖方提供任何可信保证。
- **应当**使用适合后端平台的成熟 SD-JWT 和 JOSE/JWT 库，例如 Node.js 的 `@sd-jwt/core` 和 `jose`，解析并验证 `EVT~KB-JWT` 呈现数据，并向 `sdJwt.verify()` 传入 `keyBindingNonce`，防止密钥绑定验证被绕过。**不要**自行编写 JWT、SD-JWT 或 `sd_hash` 解析及签名验证程序。
- **应当**在服务器端为每次表单呈现生成全新的密码学 `nonce`，至少 128 位，例如 `randomBytes(32).toString('base64url')`，将其存入**服务器端会话状态**，而不是直接存入客户端 cookie，并通过 `Cache-Control: no-store` 提供表单页。
- **应当**在 `POST` 请求到达后立即原子地从服务器端会话存储读取并删除预期 `nonce`，防止截获的令牌被重放。
- **应当**对 `evtPayload.email` 与表单提交的邮箱地址进行**不区分大小写的比较**（`email.toLowerCase()`），同时保留提交的邮箱字符串。
- **应当**在 EVT 标头缺少 `kid` 时，逐一尝试签发方 JWKS 中的所有密钥进行验签；Gmail 等提供方会省略 `kid`。
- **应当**在信任 EVT 中的任何 `iss` 声明之前验证 DNS 委派（`_email-verification.<domain>`），并确认 `.well-known/email-verification` 响应中的 `metadata.issuer === iss`。
- **不要**将邮箱所有权验证视为邮件可投递性的证明。EVP 证明的是用户在权威提供方控制该邮箱账户；仍应正常发送事务性欢迎邮件并处理退信。
- **不要**在 `token` 为空或验证失败时阻止账户创建或登录；始终平稳降级到标准邮件 OTP 或魔法链接流程。

<a id="fallback-strategy"></a>
## 回退策略

电子邮件验证（`autocomplete="email-verification-token"`）被设计为传统站外邮箱验证（OTP 验证码或魔法链接）之上的**渐进增强**：

- **不支持的浏览器：**不支持 `autocomplete="email-verification-token"` 的浏览器会忽略隐藏输入框，并以空 `token` 值提交表单。
- **未登录或未参与的邮件域：**当用户输入的邮箱域未发布 `_email-verification` DNS `TXT` 记录，或用户在浏览器中没有与邮件提供方建立有效会话时，浏览器会以空 `token` 提交表单。
- **过期或无效令牌：**如果 `nonce` 已过期、已被消耗，或未通过 `handleSignupSubmission` 中 `verifyEmailVerificationToken` 的任一步骤，服务器会捕获错误并发送传统 OTP 或魔法链接邮件，不中断用户注册或登录流程。
