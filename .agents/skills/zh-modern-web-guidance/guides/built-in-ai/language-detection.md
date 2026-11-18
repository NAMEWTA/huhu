<a id="language-detection"></a>

# 语言检测

**Language Detector API** 是客户端 Web API，用于识别给定文本字符串的语言。它在浏览器本地执行检测，增强用户隐私保护，并减少对大型外部库或昂贵服务器调用的需求。

<a id="key-use-cases"></a>

## 主要用途

- **翻译准备：**将文本交给翻译器前，识别源语言。
- **安全与过滤：**为毒性内容检测等任务加载特定模型。
- **无障碍：**为内容标注正确的 `lang` 属性，供屏幕阅读器使用。
- **UI 本地化：**根据用户输入的语言调整应用界面。

<a id="hardware--system-requirements"></a>

## 硬件与系统要求

- **操作系统：**Windows 10/11、macOS 13+、Linux 或 Chromebook Plus。
- **存储：**22 GB 可用空间（空间低于 10 GB 时会移除模型）。
- **RAM／CPU：**16 GB RAM 和至少 4 个 CPU 核心。
- **显存：**使用 GPU 时需要至少 4 GB。

<a id="implementation-guide"></a>

## 实现指南

<a id="1-model-management--user-activation"></a>

### 1. 模型管理与用户激活

尝试实例化检测器或触发下载前，先检查模型可用性。

**必须遵守：**通过 `LanguageDetector.create()` 实例化语言检测器或触发模型下载时，必须由用户手势（如点击按钮）发起，防止模型处于 `downloadable` 或 `downloading` 状态时出现 `NotAllowedError`。

```javascript
// Check if the model is available or downloadable
const availability = await LanguageDetector.availability();

if (availability !== 'unavailable') {
  button.addEventListener('click', async () => {
    const detector = await LanguageDetector.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${e.loaded * 100}%`);
        });
      },
    });
  });
}
```


<a id="2-running-detection"></a>

### 2. 执行检测

API 返回按可能性排序的语言列表，每种语言带有 `0.0` 到 `1.0` 之间的置信度分数。

```javascript
const someUserText = 'Hallo und herzlich willkommen!';
const results = await detector.detect(someUserText);

for (const result of results) {
  // result.detectedLanguage (e.g., 'de')
  // result.confidence (e.g., 0.999)
  console.log(result.detectedLanguage, result.confidence);
}
```


避免对非常短的短语或单个词使用检测器，因为准确率会显著下降。

<a id="security-and-environment"></a>

## 安全与运行环境

- **Iframe：**跨源 iframe 需要显式 Permissions Policy，才能访问 API。

  ```html
  <iframe
    src="https://cross-origin.example.com/"
    allow="language-detector"
  ></iframe>
  ```


- **Web Worker：**由于 Permission Policy 的复杂性，该 API 目前**无法**在 Web Worker 中使用。
- **隐私：**检测期间不会向 Google 或第三方发送任何数据。

<a id="fallback-strategy"></a>

## 回退策略

Language detector 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 138（2025 年 6 月）和 Edge 148（2026 年 5 月）。
不支持：Firefox 和 Safari。

使用前，检查全局作用域中是否存在 `LanguageDetector` 对象：

```javascript
if ('LanguageDetector' in self) {
  // The Language Detector API is supported.
} else {
  // Execute fallback strategy
}
```


如果不支持 `LanguageDetector` API，或可用性检查返回 `'unavailable'`，必须平稳回退：

1. **远程 API 回退**：将检测请求转发到服务器端点或云 API（如 Vertex AI Gemini API）识别语言。
2. **优雅降级**：禁用语言检测元素／按钮，告知用户当前浏览器不支持客户端检测，避免任何未处理异常或崩溃。
