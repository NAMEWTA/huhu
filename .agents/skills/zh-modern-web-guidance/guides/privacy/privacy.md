<a id="web-privacy-guidelines-for-developers"></a>

# 面向开发者的 Web 隐私指南

Web 应用开发者必须把隐私视为架构的基础要求，而不仅是法律合规的勾选项。Web 生态正在从被动跟踪转向明确、经用户同意的交互，因此构建保护隐私的应用，对用户信任和安全至关重要。

本文为 Web 开发者提供总体原则，以及带代码示例的详细、可执行指南。

<a id="high-level-overview"></a>

## 总体概览

以下核心主题应指导 Web 开发中的隐私处理：

1. **自动化不对称与隐私劳动**：不要把保护隐私的负担转嫁给用户，即让用户承担“隐私劳动”。避免用复杂同意对话框让用户不堪重负，这属于自动化不对称。用户的时间和注意力有限，把隐私选择全部交给他们往往无效，还会导致疲劳。系统应默认保护隐私。
2. **数据最小化**：“没有持有的数据，就不会从你这里泄露。”只收集当前任务必需的最少数据。减少存储的数据可以降低泄露风险，并建立用户信任。
3. **目的限制**：为某一目的收集的数据，未经重新同意不能用于其他目的。没有明确约定就改变数据用途，会破坏与用户的信任关系。
4. **默认透明**：诚实、清晰地说明为什么收集数据、数据流向哪里，以及保留多久。透明度能建立信任，也可以成为应用的独特优势。
5. **值得信赖的代理角色**：将应用视为代表用户最佳利益行事的代理。这意味着保护用户免受侵扰行为和不必要的数据暴露，忠实履行对用户的受托责任，而不是服务第三方利益。

<a id="detailed-guidelines"></a>

## 详细指南

<a id="1-data-minimization-and-purpose-limitation"></a>

### 1. 数据最小化与目的限制

减少收集的数据量，并严格限制用途，是保护用户隐私最有效的方式。

<a id="dos"></a>

#### 应当做的事：

* **应当**按照必要的最低精细程度收集数据。如果只需要知道用户是否处于某年龄段，例如 18–34 岁，就询问年龄段，而不是准确出生日期。
* **应当**为电商提供游客结账，避免强制注册账号，从而减少数据收集和购物车放弃。
* **应当**在收集目的达到后尽快删除数据。
* **应当**在收集聚合统计时采用模糊化或添加噪声等技术，例如差分隐私。

<a id="donts"></a>

#### 不要做的事：

* **不要**仅因为未来“可能有用”而预先收集数据。
* **不要**未经用户明确同意，将为一种目的收集的数据，例如安全验证，用于另一种目的，例如营销。

<a id="code-examples"></a>

#### 代码示例：

**模糊化数据收集（HTML/JS）**
不要询问准确年龄，而应采用：
```html
<label for="age-bracket">Age Bracket:</label>
<select id="age-bracket" name="age-bracket">
  <option value="18-34">18-34</option>
  <option value="35-49">35-49</option>
  <option value="50+">50+</option>
</select>
```

<a id="2-transparency-and-trust"></a>

### 2. 透明与信任

公开说明数据处理方式，并让用户轻松控制自己的数据，以建立信任。

<a id="dos-1"></a>

#### 应当做的事：

* **应当**就地解释为什么请求某项数据，将说明直接放在输入框旁。
* **应当**在请求摄像头、位置等高权限浏览器能力*之前*，清晰说明原因与上下文。
* **应当**在受支持时考虑使用**页面内嵌权限控件（PEPC）** `<permission>` 元素，使权限请求具有声明式、用户主动发起的特点，并发挥数据中介作用。
* **应当**在用户退出登录时使用 `Clear-Site-Data` 响应头，确保浏览器中不残留数据。
* **应当**让退出选择或删除账号与注册一样容易。

<a id="donts-1"></a>

#### 不要做的事：

* **不要**把数据收集说明埋进冗长、复杂的隐私政策。
* **不要**使用欺骗性设计模式，即 dark patterns，诱使用户同意。

<a id="code-examples-1"></a>

#### 代码示例：

**就地透明说明（HTML）**
```html
<div>
  <label for="phone">Phone Number (Optional)</label>
  <input id="phone" type="tel" name="phone">
  <a href="#phone-help">Why do we ask for this?</a>
  <aside id="phone-help">
    We only use your phone number to send two-factor authentication codes for account security.
  </aside>
</div>
```

**退出登录时使用 Clear-Site-Data（HTTP 响应）**
```http
HTTP/1.1 200 OK
Clear-Site-Data: "*"
```
*注意：如果要清除缓存，避免在主要导航页面返回该响应头，以免在较慢设备上阻塞 UI 渲染；应通过子资源触发。*

**页面内嵌权限控件（HTML）**
```html
<!-- Declarative permission element with fallback -->
<permission type="geolocation" onpromptdismiss="updateMap()">
  <!-- Fallback for unsupported browsers -->
  <button onclick="navigator.geolocation.getCurrentPosition(updateMap)">
    Use my location
  </button>
</permission>
```

<a id="3-security-and-data-handling-for-privacy"></a>

### 3. 支撑隐私的安全与数据处理

隐私依赖安全编码基础。应用漏洞或不安全存储会直接造成隐私侵害。

<a id="dos-2"></a>

#### 应当做的事：

* **应当**从应用日志中清理个人身份信息（PII），对邮箱、令牌和 ID 进行自动脱敏。
* **应当**为保存会话标识符的 Cookie 设置 `HttpOnly`，防止其他脚本访问。
* **应当**对用户搜索、个人资料查看等敏感端点实施限流，防止批量抓取数据。
* **应当**为不在顶级站点之间共享状态的一对一嵌入，添加 `Partitioned` 属性，使用 **CHIPS（具有独立分区状态的 Cookie）**。

<a id="donts-2"></a>

#### 不要做的事：

* **不要**把敏感令牌或 PII 保存在 `localStorage`，因为任何嵌入脚本都可以访问它。
* **不要**依赖未分区的 `SameSite=None` Cookie。

<a id="code-examples-2"></a>

#### 代码示例：

**安全会话 Cookie（HTTP）**
```http
Set-Cookie: session_id=xyz123; Secure; HttpOnly; SameSite=Lax
```

**CHIPS Cookie（HTTP）**
```http
Set-Cookie: theme_pref=dark; SameSite=None; Secure; Path=/; Partitioned; HttpOnly
```

<a id="4-third-party-audits-and-mitigations"></a>

### 4. 第三方审计与缓解措施

第三方脚本与资源是隐私泄露的常见来源。你需要对引入应用的第三方负责。

<a id="dos-3"></a>

#### 应当做的事：

* **应当**定期通过 DevTools 或 HAR 文件对网络请求进行技术审计，识别第三方正在收集哪些数据。
* **应当**为 YouTube、TikTok 等大型嵌入采用**外观模式（Façade Pattern）**：先显示静态缩略图，仅在用户点击后才加载可交互 iframe。
* **应当**在可用时使用保护隐私的嵌入选项，例如 `youtube-nocookie.com`。
* **应当**用简单、不跟踪用户的静态 HTML 链接，替代庞大的社交分享 SDK。
* **应当**通过**联合凭据管理 API（FedCM）**原生协调登录流程，防止身份提供方（IdP）在用户同意之前跟踪依赖方。

<a id="donts-3"></a>

#### 不要做的事：

* **不要**仅因为第三方流行，就认定它对隐私安全。
* **不要**在处理结账或健康信息等敏感数据的页面加载第三方脚本，除非确有必要。

<a id="code-examples-3"></a>

#### 代码示例：

**保护隐私的社交分享（HTML）**
```html
<!-- No JS SDK required -->
<a href="https://x.com/intent/tweet?text=Check%20this%20out&url=https%3A%2F%2Fexample.com" 
   rel="noopener" target="_blank">
   Share on X
</a>
```

**视频外观模式（HTML/JS）**
```html
<div id="video-container" data-video-id="abc123">
  <img src="https://img.youtube.com/vi/abc123/maxresdefault.jpg" alt="Play Video" id="play-btn">
</div>

<script>
document.getElementById('play-btn').addEventListener('click', function() {
  const container = document.getElementById('video-container');
  const videoId = container.dataset.videoId;
  container.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" allowfullscreen></iframe>`;
});
</script>
```

**FedCM 登录（JavaScript）**
```javascript
try {
  const credential = await navigator.credentials.get({
    identity: {
      providers: [{
        configURL: "https://idp.example/fedcm.json",
        clientId: "rp-client-id-123",
        nonce: "a_secure_random_nonce_value"
      }]
    }
  });
  authenticateWithBackend(credential.token);
} catch (error) {
  // Handle FedCM login failure
}
```

<a id="5-privacy-preserving-headers"></a>

### 5. 保护隐私的响应头

使用标准 HTTP 响应头，指示浏览器执行隐私边界。

<a id="dos-4"></a>

#### 应当做的事：

* **应当**通过 `Permissions-Policy` 默认禁用摄像头、麦克风、地理位置等高权限特性，仅在需要的位置启用。
* **应当**设置严格的 `Referrer-Policy`，防止敏感 URL 参数泄露给第三方。

<a id="code-examples-4"></a>

#### 代码示例：

**严格的 Referrer Policy（HTTP）**
```http
Referrer-Policy: strict-origin-when-cross-origin
```

**防御性的 Permissions Policy（HTTP）**
默认对所有源禁用高权限特性。
```http
Permissions-Policy: geolocation=(), camera=(), microphone=(), accelerometer=()
```

<a id="6-fingerprinting-and-user-agent-reduction"></a>

### 6. 指纹识别与 User-Agent 精简

避免根据设备配置秘密识别唯一用户的技术。指纹识别依赖不易变化的特征，而且在用户不知情时发生，让用户无法退出或清除标识符，因此剥夺了用户控制权。

<a id="dos-5"></a>

#### 应当做的事：

* **应当**通过**特性检测**判断浏览器能力，而不是嗅探 User-Agent。
* **应当**在确实需要针对特定设备时，使用浏览器支持的 **User-Agent Client Hints（UA-CH）**。

<a id="donts-4"></a>

#### 不要做的事：

* **不要**利用 canvas 渲染、字体列表或音视频设备枚举来构建设备指纹。
* **不要**依赖传统 `navigator.userAgent` 字符串中的全部精细信息。

<a id="code-examples-5"></a>

#### 代码示例：

**特性检测（JavaScript）**
```javascript
// GOOD: Check if the API exists
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(...);
} else {
  // Fallback
}

// BAD: Sniffing UA
// if (navigator.userAgent.includes("Chrome/100")) ...
```

**User-Agent Client Hints（JavaScript）**
```javascript
if (navigator.userAgentData) {
  navigator.userAgentData.getHighEntropyValues(["platformVersion", "architecture"])
    .then(ua => {
      console.log(ua.platformVersion);
    });
}
```

<a id="7-data-rights-and-user-control"></a>

### 7. 数据权利与用户控制

让用户能够行使对个人数据的权利。

<a id="dos-6"></a>

#### 应当做的事：

* **应当**提供清晰机制，让用户**访问**你收集的全部个人数据。
* **应当**实现自动化或简单的手动**数据删除**流程。
* **应当**允许用户更正与其身份相关的不准确信息。

<a id="donts-5"></a>

#### 不要做的事：

* **不要**让删除过程变得困难；如果注册是自动完成的，就不要要求用户联系支持才能删除。
* **不要**通过拒绝提供不依赖这些数据的服务，惩罚行使数据权利的用户。
