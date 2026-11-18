<a id="encrypt-data-client-side-with-webcrypto"></a>
# 使用 WebCrypto 在客户端加密数据

使用 Web Cryptography API（`crypto.subtle`），通过抗量子攻击的密钥封装机制（KEM）或经典密钥协商，在不可信网络上建立共享秘密，并通过带关联数据的认证加密（AEAD）在浏览器中加密敏感数据。如果需要对消息或产物进行签名和验证而不加密，参见 `digital-signatures`（通过 `npx -y modern-web-guidance@latest retrieve "digital-signatures"` 获取）。

端到端信封加密流程分为两个阶段：

- **接收方的一次性设置（第 1–2 步）**：接收方生成密钥对，将 `CryptoKeyPair` 持久化至 IndexedDB 以供后续会话使用，并导出公钥（`'raw-public'`）分享给发送方。
- **逐条消息加密（第 3–4 步）**：对于每个载荷，发送方导入接收方公钥，调用 `encapsulateKey()` 生成全新的一次性共享密钥和密文胶囊，使用全新的 12 字节 IV 加密载荷，然后将 `{ capsule, iv, ciphertext }` 发送给接收方。

<a id="1-choose-a-kem-algorithm-and-generate-a-recipient-key-pair"></a>
## 1. 选择 KEM 算法并生成接收方密钥对

Diffie-Hellman 密钥协商（`deriveKey()`）由双方结合各自的密钥；密钥封装机制（KEM）则使用接收方公钥，在一次 `encapsulateKey()` 调用中同时生成随机共享秘密和密文胶囊。接收方使用 `decapsulateKey()` 从密文胶囊恢复出相同的共享密钥。

默认使用 **`'MLKEM768-X25519'`**：它结合了后量子 ML-KEM（由 NIST FIPS 203 标准化）与经典 `'X25519'`，只要其中任一算法仍然安全，共享秘密就保持安全。当策略要求纯 FIPS 203 输出、不带混合组件时，选择独立的 `'ML-KEM-768'`；当策略要求符合 NIST 第 5 类（CNSA 2.0）时，选择 `'ML-KEM-1024'`。

| 算法名称 | 安全级别与使用场景 | 公钥（`'raw-public'`） | 私钥种子（`'raw-seed'`） | 密文大小 |
|---|---|---|---|---|
| **`'MLKEM768-X25519'`** | **混合后量子（`'ML-KEM-768'`）与经典算法（`'X25519'`）；推荐的默认选择** | 1216 字节 | 32 字节 | 1120 字节 |
| `'ML-KEM-768'` | NIST 第 3 类（约 192 位安全性）；独立的后量子 KEM | 1184 字节 | 64 字节 | 1088 字节 |
| `'ML-KEM-1024'` | NIST 第 5 类（约 256 位安全性）；最高安全余量 | 1568 字节 | 64 字节 | 1568 字节 |

- 将 `'MLKEM768-X25519'`、`'ML-KEM-768'` 或 `'ML-KEM-1024'` 作为算法名传入；`'X-Wing'` 或 `'X25519MLKEM768'` 等别名，以及 `'ML-KEM-512'`，都会抛出 `NotSupportedError`。
- 生成 KEM 密钥对时，传入 `extractable: false` 和 `['encapsulateKey', 'decapsulateKey']`，或 `['encapsulateBits', 'decapsulateBits']`。不可导出的 `CryptoKey` 和 `CryptoKeyPair` 对象，可通过结构化克隆直接在 IndexedDB 中跨会话持久化（`objectStore.put(recipientKeyPair, 'recipient-kem-key')`），无需导出私钥字节：

```javascript
const recipientKeyPair = await crypto.subtle.generateKey(
  'MLKEM768-X25519',
  false,
  ['encapsulateKey', 'decapsulateKey'],
);
```

<a id="2-export-and-import-keys"></a>
## 2. 导出和导入密钥

现代 WebCrypto 算法（`'MLKEM768-X25519'`、`'ML-KEM-768'`、`'ML-KEM-1024'` 和 `'ChaCha20-Poly1305'`）在 `importKey()` 和 `exportKey()` 中会**拒绝旧的 `'raw'` 格式**，并抛出 `NotSupportedError`。始终显式指定密钥格式：

- **`'raw-public'`**：公钥字节（`1216`、`1184` 或 `1568` 字节）。导入 KEM 公钥时传入 `['encapsulateKey']` 或 `['encapsulateBits']`。
- **`'raw-seed'`**：私钥种子字节（`'MLKEM768-X25519'` 为 `32` 字节；`'ML-KEM-768'` 和 `'ML-KEM-1024'` 为 `64` 字节）。导入 KEM 私钥时，传入 `['decapsulateKey']` 或 `['decapsulateBits']`；向 `importKey()` 或 `getPublicKey()` 传入 `['encapsulateKey', 'decapsulateKey']` 会抛出 `SyntaxError`。对于 KEM 私钥，`'raw'` 和 `'raw-private'` 都会抛出 `NotSupportedError`。注意，`'MLKEM768-X25519'` 只支持 `'raw-public'`、`'raw-seed'` 和 `'jwk'`，**不支持** `'spki'` 或 `'pkcs8'`。
- **`'raw-secret'`**：对称秘密密钥字节，用于 `'ChaCha20-Poly1305'`，也可用于 `'AES-GCM'` 和 `'HKDF'`。

使用 `'raw-public'` 导出接收方公钥，以便将公钥字节序列化，例如通过 `new Uint8Array(recipientPublicKeyBytes).toBase64()` 编码为 Base64，或编码为十六进制，再分享给发送方：

```javascript
// Export the recipient's public key bytes
const recipientPublicKeyBytes = await crypto.subtle.exportKey(
  'raw-public',
  recipientKeyPair.publicKey,
);

// Import the recipient's public key on the sender (usage must be ['encapsulateKey'])
const importedPublicKey = await crypto.subtle.importKey(
  'raw-public',
  recipientPublicKeyBytes,
  'MLKEM768-X25519',
  true,
  ['encapsulateKey'],
);
```

如果你只持有一个私钥 `CryptoKey`（即使其 `extractable: false`），但需要对应的公钥 `CryptoKey`，调用 `crypto.subtle.getPublicKey()`：

```javascript
const publicKey = await crypto.subtle.getPublicKey(
  recipientKeyPair.privateKey,
  ['encapsulateKey'],
);
```

<a id="3-encapsulate-and-decapsulate-a-shared-key"></a>
## 3. 封装和解封装共享密钥

`encapsulateKey()` 和 `decapsulateKey()` 会使用 `sharedKeyAlgorithm` 指定的算法，以 `'raw-secret'` 格式将 32 字节（256 位）的 KEM 共享秘密导入为 `CryptoKey`。直接传入 `'ChaCha20-Poly1305'` 或 `'AES-GCM'` 即可生成 AEAD 加密密钥：

```javascript
// Sender encapsulates a 256-bit AEAD key and produces a ciphertext capsule
const { sharedKey: senderKey, ciphertext: encapsulatedCiphertext } =
  await crypto.subtle.encapsulateKey(
    'MLKEM768-X25519',
    importedPublicKey,
    'ChaCha20-Poly1305', // Or 'AES-GCM'
    false,
    ['encrypt', 'decrypt'],
  );

// Recipient decapsulates the ciphertext capsule to recover the identical AEAD key
const recipientKey = await crypto.subtle.decapsulateKey(
  'MLKEM768-X25519',
  recipientKeyPair.privateKey,
  encapsulatedCiphertext,
  'ChaCha20-Poly1305',
  false,
  ['encrypt', 'decrypt'],
);
```

<a id="domain-separation-with-hkdf"></a>
### 使用 `'HKDF'` 进行域分离

要将共享密钥绑定到特定协议上下文（`info` 和 `salt`），或从一次封装派生多个子密钥，将 `'HKDF'` 作为 `sharedKeyAlgorithm` 传入，指定 `['deriveKey']` 用途，然后调用 `crypto.subtle.deriveKey()`：

```javascript
const { sharedKey: hkdfBaseKey, ciphertext } = await crypto.subtle.encapsulateKey(
  'MLKEM768-X25519',
  importedPublicKey,
  'HKDF',
  false,
  ['deriveKey'],
);

const aeadKey = await crypto.subtle.deriveKey(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(32),
    info: new TextEncoder().encode('envelope-v1'),
  },
  hkdfBaseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);
```

<a id="4-encrypt-and-decrypt-payloads-chacha20-poly1305-and-aes-gcm"></a>
## 4. 加密和解密载荷（`'ChaCha20-Poly1305'` 和 `'AES-GCM'`）

使用 AEAD 算法（`'ChaCha20-Poly1305'` 或 `'AES-GCM'`）加密载荷数据，每次加密操作都使用全新的、密码学安全随机的 **12 字节（96 位）初始化向量（`iv`）**。绝不要重复使用 `(iv, key)` 组合。如果设备没有专用 AES 硬件加速，而且需要跨设备一致的常数时间性能，选择 `'ChaCha20-Poly1305'`；如果需要与现有 WebCrypto 或 FIPS 140 部署互操作，选择 `'AES-GCM'`。

- **`'ChaCha20-Poly1305'`**：使用固定的 256 位（32 字节）密钥。`generateKey('ChaCha20-Poly1305', extractable, ['encrypt', 'decrypt'])` 接受字符串或 `{ name: 'ChaCha20-Poly1305' }`，**不带 `length` 属性**。`iv` 必须恰好为 12 字节，128 位 Poly1305 认证标签会追加在密文末尾。
- **`'AES-GCM'`**：调用 `generateKey()` 或 `deriveKey()` 时传入 `{ name: 'AES-GCM', length: 256 }`；调用 `encrypt()` 和 `decrypt()` 时传入 12 字节的 `iv`。
- **`additionalData`（AAD）**：通过 `additionalData`，将未加密的元数据（例如记录 ID、接收方 ID 或协议版本）绑定到认证标签，使密文或元数据被篡改时，`decrypt()` 都会以 `OperationError` 拒绝。

```javascript
/**
 * Encrypts UTF-8 text with an AEAD CryptoKey ('ChaCha20-Poly1305' or 'AES-GCM').
 * @param {CryptoKey} key
 * @param {string} plaintext
 * @param {Uint8Array} [additionalData]
 */
export async function encryptMessage(key, plaintext, additionalData = new Uint8Array(0)) {
  // Always generate a fresh 12-byte (96-bit) IV per message
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: key.algorithm.name,
      iv,
      additionalData,
    },
    key,
    encoded,
  );

  return { iv, ciphertext: new Uint8Array(ciphertextBuffer) };
}

/**
 * Decrypts and authenticates an AEAD payload. Throws OperationError if tampered.
 * @param {CryptoKey} key
 * @param {Uint8Array} iv
 * @param {Uint8Array} ciphertext
 * @param {Uint8Array} [additionalData]
 */
export async function decryptMessage(key, iv, ciphertext, additionalData = new Uint8Array(0)) {
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: key.algorithm.name,
      iv,
      additionalData,
    },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintextBuffer);
}
```

<a id="fallback-strategies"></a>
## 回退策略

Web Cryptography 的 Baseline 状态：广泛可用。自 2017-09-19 起纳入 Baseline。
支持的浏览器：Chrome 37（2014 年 8 月）、Edge 12（2015 年 7 月）、Firefox 34（2014 年 12 月）和 Safari 11（2017 年 9 月）。

api.SubtleCrypto.deriveBits.x25519 能力的 Baseline 状态：新近可用。自 2025-02-06 起纳入 Baseline。
支持的浏览器：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）、Firefox 130（2024 年 9 月）和 Safari 17（2023 年 9 月）。

如果你的 Baseline 目标尚不支持 `SubtleCrypto.supports()`、`encapsulateKey()` 或 `'ChaCha20-Poly1305'`，使用**静态** `SubtleCrypto.supports()` 方法检测支持情况，并回退到临时—静态 Diffie-Hellman 密钥协商：`'X25519'` + `'HKDF'` + `'AES-GCM'`；如果目标浏览器早于 `'X25519'` 支持版本，则使用 `'ECDH'` 配合 `'P-256'`。

- **在 `SubtleCrypto` 构造函数上调用 `SubtleCrypto.supports()`，而不是在 `crypto.subtle` 上调用**：`globalThis.SubtleCrypto?.supports?.('encapsulateKey', 'MLKEM768-X25519', 'ChaCha20-Poly1305')` 是返回布尔值的同步静态方法，`crypto.subtle.supports` 为 `undefined`。注意，`SubtleCrypto.supports()` 会验证各操作特有的参数：对 `'encapsulateKey'`、`'decapsulateKey'`、`'generateKey'`、`'importKey'`、`'exportKey'` 和 `'getPublicKey'`，可以直接使用算法名称字符串；而直接探测 `'encrypt'` 或 `'decrypt'` 时必须提供 `iv`，例如 `SubtleCrypto.supports('encrypt', { name: 'ChaCha20-Poly1305', iv: new Uint8Array(12) })`。
- **回退路径中的密钥格式（`'raw'`）**：虽然支持现代 WebCrypto 的浏览器也接受 `'X25519'` 和 `'ECDH'` 的 `'raw-public'` 格式，但面向旧浏览器的回退路径应使用 `'raw'`。
- **经典算法回退（`'X25519'` + `'HKDF'` + `'AES-GCM'`）**：当 `SubtleCrypto.supports()` 不可用或返回 `false` 时，为发送方生成临时 `'X25519'` 密钥对，将临时公钥导出为胶囊字节，通过 `deriveBits({ name: 'X25519', public: peerPublicKey }, privateKey, 256)` 派生 256 位，再通过 `'HKDF'`（`'SHA-256'`）处理这些位，派生出 256 位的 `'AES-GCM'` 密钥。

```javascript
const KEM_PUBLIC_KEY_ALGORITHMS = {
  1184: 'ML-KEM-768',
  1216: 'MLKEM768-X25519',
  1568: 'ML-KEM-1024',
};

export function supportsPostQuantumEnvelope() {
  return (
    typeof globalThis.SubtleCrypto?.supports === 'function' &&
    SubtleCrypto.supports('encapsulateKey', 'MLKEM768-X25519', 'ChaCha20-Poly1305')
  );
}

export async function generateRecipientKeys() {
  if (supportsPostQuantumEnvelope()) {
    const keyPair = await crypto.subtle.generateKey(
      'MLKEM768-X25519',
      false,
      ['encapsulateKey', 'decapsulateKey'],
    );
    const publicKeyBytes = new Uint8Array(
      await crypto.subtle.exportKey('raw-public', keyPair.publicKey),
    );
    return { suite: 'MLKEM768-X25519+ChaCha20-Poly1305', keyPair, publicKeyBytes };
  }

  // Classical fallback: X25519 key agreement + HKDF + AES-GCM
  const keyPair = await crypto.subtle.generateKey('X25519', false, ['deriveBits']);
  const publicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', keyPair.publicKey),
  );
  return { suite: 'X25519+HKDF+AES-GCM', keyPair, publicKeyBytes };
}

async function deriveFallbackAesKey(privateKey, peerPublicKey, infoBytes = new Uint8Array(0)) {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'X25519', public: peerPublicKey },
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: infoBytes,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encapsulateEnvelopeKey(
  recipientPublicKeyOrBytes,
  infoBytes = new Uint8Array(0),
) {
  const pubKey =
    recipientPublicKeyOrBytes instanceof CryptoKey
      ? recipientPublicKeyOrBytes
      : await (() => {
          const bytes =
            recipientPublicKeyOrBytes instanceof Uint8Array
              ? recipientPublicKeyOrBytes
              : new Uint8Array(recipientPublicKeyOrBytes);
          const kemName = KEM_PUBLIC_KEY_ALGORITHMS[bytes.byteLength];
          return kemName
            ? crypto.subtle.importKey('raw-public', bytes, kemName, true, ['encapsulateKey'])
            : crypto.subtle.importKey('raw', bytes, 'X25519', true, []);
        })();

  if (pubKey.algorithm.name !== 'X25519') {
    const { sharedKey, ciphertext } = await crypto.subtle.encapsulateKey(
      pubKey.algorithm.name,
      pubKey,
      'ChaCha20-Poly1305',
      false,
      ['encrypt', 'decrypt'],
    );
    return { sharedKey, capsuleBytes: new Uint8Array(ciphertext) };
  }

  // Classical fallback: generate ephemeral X25519 key pair and send ephemeral public key as capsule
  const ephemeral = await crypto.subtle.generateKey('X25519', false, ['deriveBits']);
  const capsuleBytes = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const sharedKey = await deriveFallbackAesKey(ephemeral.privateKey, pubKey, infoBytes);
  return { sharedKey, capsuleBytes };
}

export async function decapsulateEnvelopeKey(
  recipientPrivateKey,
  capsuleBytes,
  infoBytes = new Uint8Array(0),
) {
  if (recipientPrivateKey.algorithm.name !== 'X25519') {
    return crypto.subtle.decapsulateKey(
      recipientPrivateKey.algorithm.name,
      recipientPrivateKey,
      capsuleBytes,
      'ChaCha20-Poly1305',
      false,
      ['encrypt', 'decrypt'],
    );
  }

  const ephemeralPubKey = await crypto.subtle.importKey('raw', capsuleBytes, 'X25519', true, []);
  return deriveFallbackAesKey(recipientPrivateKey, ephemeralPubKey, infoBytes);
}
```
