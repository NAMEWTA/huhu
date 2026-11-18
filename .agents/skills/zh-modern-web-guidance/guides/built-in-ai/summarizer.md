<a id="summarizer"></a>

# 摘要生成器

**Summarizer API** 让 Web 开发者使用 **Chrome 中的 Gemini Nano 或 Edge 中的 Phi**，直接在浏览器内提供由 AI 支持的本地文本提炼。该 API 支持要点、标题和 TL;DR 等格式，全部在设备上运行，保障用户隐私。

---

<a id="getting-started"></a>

## 开始使用

Summarizer API 从 **Chrome 和 Edge 138** 开始可用。分别需要一次性下载 Gemini Nano 或 Phi 模型。

<a id="hardware--software-requirements"></a>

### 硬件与软件要求

- **操作系统**：Windows 10/11、macOS 13+、Linux 或 ChromeOS（Chromebook Plus）。
- **存储**：配置文件所在卷上有 22 GB 可用空间。
- **RAM／CPU**：至少 16 GB RAM 和 4 个 CPU 核心。
- **显存**：使用 GPU 时至少 4 GB。

<a id="model-download-and-availability"></a>

### 模型下载与可用性

检查模型是否已就绪、需要下载，或不可用。

**必须传递选项：**必须向 `Summarizer.availability(options)` 和 `Summarizer.create(options)` 传入完全相同的配置选项对象。不要使用已弃用的 `window.ai.summarizer` API 接口。

**必须监测进度：**必须为 `Summarizer.create()` 提供 `monitor(m)` 回调，并监听 `downloadprogress` 事件，实现模型下载进度监测。

**用户手势要求：**当 `availability` 为 `'downloadable'` 或 `'downloading'` 时，通过 `Summarizer.create()` 触发实际下载需要用户手势（如用户点击）。必须将创建调用放入事件监听器中，而不是在页面加载时无条件调用，以防出现 `NotAllowedError`。

```javascript
const options = {
  type: 'key-points',
  format: 'plain-text',
  length: 'medium'
};

const availability = await Summarizer.availability(options);

if (availability === 'available') {
  const summarizer = await Summarizer.create(options);
  // Ready to use immediately
} else if (availability === 'downloadable') {
  // A user gesture is strictly required to start the download
  document.getElementById('start-download-btn').addEventListener('click', async () => {
    const summarizer = await Summarizer.create({
      ...options,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`Downloaded ${Math.round((e.loaded / e.total) * 100)}%`);
        });
      },
    });
  });
}
```


<a id="api-functions--configuration"></a>

## API 函数与配置

通过 `Summarizer.create(options)` 创建摘要生成器时，可以定制输出：

| 参数 | 选项 | 描述 |
| :----------- | :----------------------------------------- | :-------------------------------------- |
| `type` | `key-points`、`tldr`、`teaser`、`headline` | 定义摘要策略。 |
| `format` | `markdown`、`plain-text` | 输出语法风格。 |
| `length` | `short`、`medium`、`long` | 目标长度（例如 1 句或 5 句）。 |
| `preference` | `auto`、`speed`、`capability` | 权衡延迟与质量。 |

<a id="example-configuration"></a>

### 配置示例

```javascript
const options = {
  sharedContext: 'This is a scientific article',
  type: 'key-points',
  format: 'markdown',
  length: 'medium',
};

if (navigator.userActivation.isActive) {
  const summarizer = await Summarizer.create(options);
}
```


<a id="language-support"></a>

### 语言支持

可以指定预期语言，确保浏览器能够处理具体摘要请求。

```javascript
const summarizer = await Summarizer.create({
  type: 'key-points',
  expectedInputLanguages: ['en', 'ja'],
  outputLanguage: 'es',
});
```


**必须遵守：**如果输出语言不同于页面整体语言，必须为摘要的容器元素设置 `lang` 属性，且其值要与 `outputLanguage` 属性所设的 BCP 47 语言代码一致。

<a id="summarization-methods"></a>

## 摘要生成方法

<a id="1-batch-summarization"></a>

### 1. 批量摘要

一次性处理全文并返回结果。

```javascript
const longText = document.querySelector('article').innerText;
const summary = await summarizer.summarize(longText, {
  context: 'This article is intended for a tech-savvy audience.',
});
console.log(summary);
```


<a id="2-stream-summarization"></a>

### 2. 流式摘要

在模型生成内容时实时返回结果，让 UI 响应更及时。

```javascript
const stream = summarizer.summarizeStreaming(longText);
for await (const chunk of stream) {
  console.log(chunk);
}
```


<a id="security-and-permissions"></a>

## 安全与权限

- **数据隐私**：不会向 Google 发送数据；处理发生在本地设备。
- **跨源**：可以通过 Permission Policy 授予 iframe 访问权限。

  ```html
  <iframe src="https://example.com/" allow="summarizer"></iframe>
  ```


- **Web Worker**：目前不支持。

<a id="fallback-strategy"></a>

## 回退策略

Summarizer 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 138（2025 年 6 月）和 Edge 138（2025 年 6 月）。
不支持：Firefox 和 Safari。

初始化或查询可用性之前，检查浏览器是否支持 `Summarizer` API：

```javascript
if ('Summarizer' in self) {
  // The Summarizer API is supported.
} else {
  // Execute fallback strategy
}
```


如果不支持 `Summarizer` API，或可用性检查返回 `'unavailable'`，必须平稳回退。

推荐方案：

1. **远程 API 回退**：将文本提炼请求发送到服务器端点或远程 API（如 Vertex AI Gemini API），让用户仍能得到摘要。
2. **优雅降级**：在 UI 中以视觉方式禁用摘要控件，或隐藏按钮并显示友好提示（例如 `"Local summarization is currently unsupported in this browser"`）。不要让交互触发通用的未处理运行时异常。
3. **Polyfill 回退**：可以使用社区维护的 polyfill，如 `built-in-ai-task-apis-polyfills` 或 `prompt-api-polyfill`，通过云端模型的远程服务或本地模型的设备端推理模拟 API 接口。

> **隐私与成本影响：**这些 polyfill 可能把请求代理到远程服务器（例如云端 Gemini API）。这会完全失去原生 Built-in AI API 的设备端隐私保障，并产生服务器端 API 使用费用。
