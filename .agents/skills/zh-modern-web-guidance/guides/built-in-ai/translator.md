<a id="translator"></a>

# 翻译器

**Translator API** 让开发者使用 Chrome 和 Edge 内置的 AI 模型执行客户端文本翻译。对临时内容而言，这种方式无需云端翻译服务，可以降低成本，并通过让数据留在用户设备上来增强隐私保护。

<a id="prerequisites--requirements"></a>

## 前置条件与要求

<a id="api-surface--global-scope"></a>

### API 接口与全局作用域

- **必须**仅通过全局 `Translator` 接口（`window.Translator` / `self.Translator`）访问 Translator API。
- **不要**使用或检查已弃用的 `window.ai.translator` 命名空间。

<a id="browser-support"></a>

### 浏览器支持

- **Chrome：**138+ 版本（仅桌面）。
- **Edge：**148+ 版本（仅桌面）。
- **不支持：**移动设备（Android／iOS）、Firefox、Safari。

<a id="hardware-requirements"></a>

### 硬件要求

运行 Gemini Nano 及关联模型，系统需要：

- **操作系统：**Windows 10/11、macOS 13+、Linux 或 ChromeOS（Chromebook Plus）。
- **存储：**配置文件所在卷至少有 **22 GB** 可用空间。
- **内存／CPU：**至少 16 GB RAM 和 4 个 CPU 核心。
- **GPU：**至少 4 GB 显存（使用音频的 Prompt API 必须满足）。
- **网络：**仅初次下载语言包／模型时需要。

<a id="implementation--code-samples"></a>

## 实现与代码示例

<a id="1-checking-availability--model-management"></a>

### 1. 检查可用性与管理模型

**必须传递选项：**必须向 `Translator.availability(options)` 和 `Translator.create(options)` 传入完全相同的配置选项对象，其中包含 `sourceLanguage` 和 `targetLanguage`。

**建议监测进度：**应为 `Translator.create()` 提供 `monitor(m)` 回调，并添加 `downloadprogress` 事件监听器，以监测模型下载进度，让用户看到进展。

**用户手势要求：**调用 `availability(options)` 返回 `'downloadable'` 或 `'downloading'` 时，`Translator.create()` 会触发语言包下载，且**严格要求用户手势**（例如点击按钮），以避免 `NotAllowedError`。

`Translator.availability(options)` 返回以下四种字符串状态之一：

- `'available'`：语言对模型已下载到设备，可立即翻译。
- `'downloadable'`：支持该语言对，但模型需要下载。发起 `Translator.create()` 需要用户手势。
- `'downloading'`：语言包正在下载。带用户手势调用 `Translator.create()` 会连接到该下载过程。
- `'unavailable'`：不支持该语言对或设备。执行回退策略。

```javascript
// Language pair options passed to both availability() and create()
const options = {
  sourceLanguage: 'es', // Example BCP 47 language code
  targetLanguage: 'fr', // Example BCP 47 language code
};

// 1. Check availability for the language pair
const availability = await Translator.availability(options);

if (availability === 'available') {
  // Model is ready immediately on device
  const translator = await Translator.create(options);
} else if (availability === 'downloadable' || availability === 'downloading') {
  // User gesture is strictly required before create() triggers or attaches to download
  document.getElementById('start-translation-btn').addEventListener('click', async () => {
    const translator = await Translator.create({
      ...options,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${Math.round(e.loaded * 100)}%`);
        });
      },
    });
  });
} else if (availability === 'unavailable') {
  // Language pair or hardware unsupported; execute fallback
  console.warn('Translation model is unavailable on this device.');
}
```


<a id="2-executing-translations"></a>

### 2. 执行翻译

API 同时支持一次性和流式响应。实例化翻译器时，始终加入下载进度监测。

**标准翻译：**

```javascript
// Default to including a progress monitor when creating translator
const translator = await Translator.create({
  sourceLanguage: 'en',
  targetLanguage: 'fr',
  monitor(m) {
    m.addEventListener('downloadprogress', (e) => {
      console.log(`Downloaded ${Math.round(e.loaded * 100)}%`);
    });
  },
});

const result = await translator.translate(
  'Where is the next bus stop, please?',
);
console.log(result);
// Output: "Où est le prochain arrêt de bus, s'il vous plaît ?"
```


**流式翻译（适用于长文本）：**

```javascript
const stream = translator.translateStreaming(longText);
for await (const chunk of stream) {
  console.log(chunk);
}
```


<a id="supported-languages"></a>

## 支持的语言

API 支持多种 BCP 47 语言代码。以下是 Chrome 的 Translator API 实现所支持的语言：

- **ar**：阿拉伯语
- **bg**：保加利亚语
- **bn**：孟加拉语
- **cs**：捷克语
- **da**：丹麦语
- **de**：德语
- **el**：希腊语
- **en**：英语
- **es**：西班牙语
- **fi**：芬兰语
- **fr**：法语
- **hi**：印地语
- **hr**：克罗地亚语
- **hu**：匈牙利语
- **id**：印度尼西亚语
- **it**：意大利语
- **he**：希伯来语
- **ja**：日语
- **kn**：卡纳达语
- **ko**：韩语
- **lt**：立陶宛语
- **mr**：马拉地语
- **nl**：荷兰语
- **no**：挪威语
- **pl**：波兰语
- **pt**：葡萄牙语
- **ro**：罗马尼亚语
- **ru**：俄语
- **sk**：斯洛伐克语
- **sl**：斯洛文尼亚语
- **sv**：瑞典语
- **ta**：泰米尔语
- **te**：泰卢固语
- **th**：泰语
- **tr**：土耳其语
- **uk**：乌克兰语
- **vi**：越南语
- **zh**：中文
- **zh-Hant**：中文（繁体）

<a id="accessibility-considerations"></a>

## 无障碍注意事项

**必须**为翻译内容的容器元素设置 `lang` 属性，确保其值与目标语言的 BCP 47 语言代码一致，例如西班牙语使用 `lang="es"`。

<a id="security--performance"></a>

## 安全与性能

- **Permissions Policy：**跨源 iframe 需要明确授权。

  ```html
  <iframe src="https://example.com/" allow="translator"></iframe>
  ```


- **Web Worker：**由于 Permission Policy 的复杂性，目前**不支持**。
- **隐私：**模型下载完成后，翻译过程不会向 Google 服务器发送任何数据。

<a id="fallback-strategy"></a>

## 回退策略

Translator 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 138（2025 年 6 月）和 Edge 148（2026 年 5 月）。
不支持：Firefox 和 Safari。

使用前，检查全局作用域中是否存在 `Translator` 对象：

```javascript
if ('Translator' in self) {
  // The Translator API is supported.
} else {
  // Execute fallback strategy (do not fall back to window.ai.translator).
}
```


如果不支持 `Translator` API，或可用性检查返回 `'unavailable'`，必须平稳回退。

推荐方案：

1. **远程 API 回退**：将翻译请求转发到服务器端点或云端远程 API（如 Vertex AI Gemini API），提供翻译功能。
2. **优雅降级**：从视觉上禁用翻译控件或按钮，同时显示面向最终用户的友好说明（例如 `"Client-side translation is currently unsupported in this browser"`）。不要留下未处理异常。
3. **Polyfill 回退**：可以使用社区维护的 polyfill，如 `built-in-ai-task-apis-polyfills` 或 `prompt-api-polyfill`，通过远程服务模拟 API 接口。

> **隐私与成本影响：**这些 polyfill 可能把请求代理到远程服务器（例如云端 Gemini API），但也可以选择本地处理。远程处理会完全失去原生 Built-in AI API 的设备端隐私保障，并且通常会产生服务器端 API 使用费用。
