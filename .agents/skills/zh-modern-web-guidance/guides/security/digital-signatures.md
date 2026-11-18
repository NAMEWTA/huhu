<a id="sign-and-verify-data-with-webcrypto"></a>
# 使用 WebCrypto 对数据签名和验签

使用 Web Cryptography API（`crypto.subtle`），通过抗量子攻击的非对称密钥（ML-DSA）或经典非对称密钥（`'Ed25519'`、`'ECDSA'`），在浏览器中对消息、令牌或产物进行签名和验证。数字签名无需共享秘密密钥，即可保证数据完整性和签名者真实性。关于建立共享秘密并加密机密载荷，参见 `client-side-encryption`（通过 `npx -y modern-web-guidance@latest retrieve "client-side-encryption"` 获取）。

<a id="1-choose-an-algorithm-and-generate-a-key-pair"></a>
## 1. 选择算法并生成密钥对

ML-DSA（基于模格的数字签名算法，由 NIST FIPS 204 标准化）提供基于格的后量子数字签名，能够抵御经典计算机和量子计算机的攻击。

通用签名默认使用 **`'ML-DSA-65'`**。在带宽受限的通道中，如果需要更小的公钥与签名，且 128 位安全性已足够，选择 `'ML-DSA-44'`；如果安全策略要求符合 NIST 第 5 类（CNSA 2.0），选择 `'ML-DSA-87'`。

| 算法名称 | 安全级别与使用场景 | 公钥（`'raw-public'`） | 签名大小 |
|---|---|---|---|
| `'ML-DSA-44'` | NIST 第 2 类（约 128 位安全性）；最小的密钥与签名 | 1312 字节 | 2420 字节 |
| **`'ML-DSA-65'`** | **NIST 第 3 类（约 192 位安全性）；推荐的默认选择** | 1952 字节 | 3309 字节 |
| `'ML-DSA-87'` | NIST 第 5 类（约 256 位安全性）；最高安全余量 | 2592 字节 | 4627 字节 |

- 将 `'ML-DSA-44'`、`'ML-DSA-65'` 或 `'ML-DSA-87'` 作为算法名传入；标准化之前的名称，如 `'Dilithium'` 或 `'CRYSTALS-Dilithium'`，会抛出 `NotSupportedError`。
- ML-DSA 和 `'Ed25519'` 均不接受 `hash` 参数。
- 使用 `generateKey()` 生成密钥对时，传入 `['sign', 'verify']`：

```javascript
const signerKeyPair = await crypto.subtle.generateKey(
  'ML-DSA-65',
  false,
  ['sign', 'verify'],
);
```

<a id="2-export-and-import-keys"></a>
## 2. 导出和导入密钥

`'ML-DSA-44'`、`'ML-DSA-65'` 和 `'ML-DSA-87'` 在 `importKey()` 和 `exportKey()` 中会**拒绝旧的 `'raw'` 格式**，并抛出 `NotSupportedError`。始终使用明确的格式导出或导入密钥：

- **`'raw-public'`**：公钥字节（`1312`、`1952` 或 `2592` 字节）。导入公钥时，将 `['verify']` 作为密钥用途传入。
- **`'raw-seed'`**：三种 ML-DSA 算法都使用 32 字节私钥种子。ML-DSA 的 `'raw'` 和 `'raw-private'` 都会抛出 `NotSupportedError`，应使用 `'raw-seed'`、`'pkcs8'`（54 字节）或 `'jwk'`（`kty: 'AKP'`）存储或传输私钥。导入私钥时，将 `['sign']` 作为密钥用途传入；向 `importKey()` 传入 `['sign', 'verify']` 会抛出 `SyntaxError`。
- **`'spki'`、`'pkcs8'` 和 `'jwk'`**：三种 ML-DSA 算法均支持。

始终使用 `'raw-public'` 导出验签公钥，以便序列化公钥字节或将其分享给验证方：

```javascript
// Export the public key bytes on the signer
const publicKeyBytes = await crypto.subtle.exportKey(
  'raw-public',
  signerKeyPair.publicKey,
);

// Import the public key bytes on the verifier (usage must be ['verify'] only)
const verifierPublicKey = await crypto.subtle.importKey(
  'raw-public',
  publicKeyBytes,
  'ML-DSA-65',
  true,
  ['verify'],
);
```

如果你只持有一个签名私钥 `CryptoKey`（即使其 `extractable: false`），但需要对应的公钥 `CryptoKey`，调用 `crypto.subtle.getPublicKey()` 并传入 `['verify']`：

```javascript
const publicKey = await crypto.subtle.getPublicKey(
  signerKeyPair.privateKey,
  ['verify'],
);
```

<a id="3-sign-and-verify-payloads"></a>
## 3. 对载荷签名和验签

使用私钥调用 `crypto.subtle.sign()` 生成签名，使用公钥调用 `crypto.subtle.verify()` 检查签名：

```javascript
const payloadBytes = new TextEncoder().encode(
  '{"artifact":"release-v2.4.0.tar.gz","sha256":"9f86d08..."}',
);

const signatureBuffer = await crypto.subtle.sign(
  'ML-DSA-65',
  signerKeyPair.privateKey,
  payloadBytes,
);

const isValid = await crypto.subtle.verify(
  'ML-DSA-65',
  verifierPublicKey,
  signatureBuffer,
  payloadBytes,
);
```

<a id="domain-separation-with-contextparams"></a>
### 使用 `ContextParams` 进行域分离

为防止针对某个用途创建的签名，在应用或协议中共享同一密钥对的其他部分被重放，应将签名绑定到用于域分离的 `context`。

向 `sign()` 和 `verify()` 传入 `ContextParams` 字典（`{ name, context }`），而不是仅传入算法名称字符串。其中 `context` 是一个 `BufferSource`，可以是 `Uint8Array` 或 `ArrayBuffer`：

```javascript
const contextBytes = new TextEncoder().encode('release-manifest-v1');

const signatureBuffer = await crypto.subtle.sign(
  {
    name: 'ML-DSA-65',
    context: contextBytes,
  },
  signerKeyPair.privateKey,
  payloadBytes,
);

const isValid = await crypto.subtle.verify(
  {
    name: 'ML-DSA-65',
    context: contextBytes,
  },
  verifierPublicKey,
  signatureBuffer,
  payloadBytes,
);
```

- **255 字节限制**：`context` 接受 `0` 至 `255` 字节，省略 `context` 等同于传入空的 `new Uint8Array(0)`。传入超过 `255` 字节的内容会以 `OperationError` 拒绝。
- **必须完全匹配**：只有验证方传入与 `crypto.subtle.sign()` 时完全相同的 `context` 字节，`crypto.subtle.verify()` 才会返回 `true`。

<a id="fallback-strategies"></a>
## 回退策略

Web Cryptography 的 Baseline 状态：广泛可用。自 2017-09-19 起纳入 Baseline。
支持的浏览器：Chrome 37（2014 年 8 月）、Edge 12（2015 年 7 月）、Firefox 34（2014 年 12 月）和 Safari 11（2017 年 9 月）。

api.SubtleCrypto.sign.ed25519 能力的 Baseline 状态：新近可用。自 2025-05-29 起纳入 Baseline。
支持的浏览器：Chrome 137（2025 年 5 月）、Edge 137（2025 年 5 月）、Firefox 129（2024 年 8 月）和 Safari 17（2023 年 9 月）。

如果你的 Baseline 目标尚不支持 `SubtleCrypto.supports()` 或 ML-DSA，使用**静态** `SubtleCrypto.supports()` 方法检测支持情况，并回退到经典的 `'Ed25519'`；如果目标浏览器早于 `'Ed25519'` 支持版本，则使用 `'ECDSA'` 配合 `'P-256'` 和 `'SHA-256'`。

- **在 `SubtleCrypto` 构造函数上调用 `SubtleCrypto.supports()`，而不是在 `crypto.subtle` 上调用**：`globalThis.SubtleCrypto?.supports?.('sign', 'ML-DSA-65')` 是返回布尔值的同步静态方法，`crypto.subtle.supports` 为 `undefined`。可以探测 `'sign'`、`'verify'`、`'generateKey'`、`'importKey'`、`'exportKey'` 或 `'getPublicKey'`，也可传入 `ContextParams` 字典，例如 `SubtleCrypto.supports('sign', { name: 'ML-DSA-65', context })`。
- **回退路径中的密钥格式（`'raw'`）**：虽然支持现代 WebCrypto 的浏览器也接受 `'Ed25519'` 和 `'ECDSA'` 的 `'raw-public'` 格式，但面向旧浏览器的回退路径应使用 `'raw'`。
- **回退路径中的域分离**：经典 WebCrypto 算法（`'Ed25519'` 和 `'ECDSA'`）不会从算法字典读取 `context` 属性，WebIDL 会静默忽略 `Algorithm` 和 `EcdsaParams` 中未知的字典属性。在回退路径中，将带长度前缀的 `context` 头部添加到载荷前，使两套算法的域分离行为保持一致。

```javascript
const ML_DSA_PUBLIC_KEY_ALGORITHMS = {
  1312: 'ML-DSA-44',
  1952: 'ML-DSA-65',
  2592: 'ML-DSA-87',
};

export function supportsPostQuantumSignatures() {
  return (
    typeof globalThis.SubtleCrypto?.supports === 'function' &&
    SubtleCrypto.supports('sign', 'ML-DSA-65')
  );
}

export async function generateSigningKeyPair() {
  if (supportsPostQuantumSignatures()) {
    const keyPair = await crypto.subtle.generateKey('ML-DSA-65', false, ['sign', 'verify']);
    const publicKeyBytes = new Uint8Array(
      await crypto.subtle.exportKey('raw-public', keyPair.publicKey),
    );
    return {
      suite: 'ML-DSA-65',
      keyFormat: 'raw-public',
      keyPair,
      publicKeyBytes,
    };
  }

  // Classical fallback: Ed25519
  const keyPair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
  const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  return {
    suite: 'Ed25519',
    keyFormat: 'raw',
    keyPair,
    publicKeyBytes,
  };
}

function frameFallbackInput(payloadBytes, contextBytes) {
  if (contextBytes.byteLength > 255) {
    throw new DOMException('Context must not exceed 255 bytes', 'OperationError');
  }
  const framed = new Uint8Array(1 + contextBytes.byteLength + payloadBytes.byteLength);
  framed[0] = contextBytes.byteLength;
  framed.set(contextBytes, 1);
  framed.set(payloadBytes, 1 + contextBytes.byteLength);
  return framed;
}

export async function signPayload(
  privateKey,
  payloadBytes,
  contextBytes = new Uint8Array(0),
) {
  if (privateKey.algorithm.name.startsWith('ML-DSA')) {
    const sig = await crypto.subtle.sign(
      { name: privateKey.algorithm.name, context: contextBytes },
      privateKey,
      payloadBytes,
    );
    return new Uint8Array(sig);
  }

  const framed = frameFallbackInput(payloadBytes, contextBytes);
  const sig = await crypto.subtle.sign('Ed25519', privateKey, framed);
  return new Uint8Array(sig);
}

export async function verifyPayload(
  publicKeyOrBytes,
  signatureBytes,
  payloadBytes,
  contextBytes = new Uint8Array(0),
) {
  const publicKey =
    publicKeyOrBytes instanceof CryptoKey
      ? publicKeyOrBytes
      : await (() => {
          const bytes =
            publicKeyOrBytes instanceof Uint8Array
              ? publicKeyOrBytes
              : new Uint8Array(publicKeyOrBytes);
          const mlDsaName = ML_DSA_PUBLIC_KEY_ALGORITHMS[bytes.byteLength];
          return mlDsaName
            ? crypto.subtle.importKey('raw-public', bytes, mlDsaName, true, ['verify'])
            : crypto.subtle.importKey('raw', bytes, 'Ed25519', true, ['verify']);
        })();

  if (publicKey.algorithm.name.startsWith('ML-DSA')) {
    return crypto.subtle.verify(
      { name: publicKey.algorithm.name, context: contextBytes },
      publicKey,
      signatureBytes,
      payloadBytes,
    );
  }

  const framed = frameFallbackInput(payloadBytes, contextBytes);
  return crypto.subtle.verify('Ed25519', publicKey, signatureBytes, framed);
}
```
