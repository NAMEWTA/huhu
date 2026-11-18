<a id="flicker-free-client-side-ab-testing"></a>

# 无闪烁的客户端 A/B 测试

<a id="the-problem"></a>

## 问题

客户端 A/B 测试工具会加载脚本，在浏览器已经开始构建页面后修改 DOM。如果不采取措施，用户会先短暂看到原始内容，随后内容闪烁或跳变为实验版本。测试平台过去通常通过“防闪烁片段”绕过问题：使用 `opacity: 0` 隐藏整个页面，直到实验脚本完成，或任意设定的超时期限到达，通常为 4 秒。这种方式牺牲了渐进渲染，可能让用户误点不可见内容，还会增加不必要的绘制周期。

<a id="the-solution"></a>

## 解决方案

位于 `<head>` 中的 `<script>` 或 `<link>` 元素可以通过 `blocking=render` 属性阻塞渲染，但不会阻塞解析，直到资源获取并执行完成。这让实验脚本具备样式表默认具有的渲染阻塞行为，确保实验版本应用之前，浏览器不会绘制页面。无需透明度技巧，无需任意超时，也不会闪烁。

<a id="implementation-strategy"></a>

### 实现策略

1. **必须**：将实验脚本放在文档 `<head>` 中，并添加 `blocking="render"`。
2. **必须**：确保脚本使用 `type="module"`，内联脚本优先采用此方式；或者使用 `async`，有 `src` 值的外部脚本优先采用此方式。
3. **应当**让实验脚本保持精简、快速。因为渲染会被阻塞到脚本执行完毕，大型或缓慢的脚本会直接延迟首次绘制。
4. **不要**为无需在首次绘制前运行的脚本使用 `blocking="render"`。它仅适用于输出必须在初次渲染中可见的脚本。
5. **不要**在 `<head>` 之外的脚本上使用 `blocking="render"`。只有 `<head>` 中的脚本可以阻塞渲染。

<a id="implementation-guide"></a>

## 实现指南

<a id="basic-setup"></a>

### 基本设置

必须：加载实验脚本时，同时设置 `async` 和 `blocking="render"`。`async` 确保脚本不会阻塞 HTML 解析，浏览器在获取脚本期间可以继续构建 DOM。`blocking="render"` 则确保脚本执行之前，浏览器不会进行任何绘制。

```html
<head>
  <!--
    MANDATORY: Both `async` and `blocking="render"` are required.
    - `async`: Prevents parser-blocking, so the DOM is built in parallel.
    - `blocking="render"`: Holds rendering until the script executes,
      ensuring experiment changes are applied before the user sees anything.
  -->
  <script
    src="https://cdn.example.com/experiment-sdk.js"
    async
    blocking="render"
  ></script>
</head>
```

<a id="loading-experiment-specific-styles"></a>

### 加载实验专用样式

如果实验需要变体样式表，在 `<link>` 元素上使用 `blocking="render"`。`<head>` 中的样式表默认就会阻塞渲染，但动态注入或通过脚本添加的样式表不会。动态添加样式表时，或者希望明确表达意图时，应显式设置 `blocking="render"`。

```html
<head>
  <!--
    DO: Use blocking="render" on experiment stylesheets that are
    dynamically inserted or conditionally loaded by the experiment SDK.
    This ensures variant styles are applied before first paint.
  -->
  <link
    rel="stylesheet"
    href="https://cdn.example.com/experiment-variant-b.css"
    blocking="render"
  >
</head>
```

<a id="inline-experiment-script"></a>

### 内联实验脚本

如果实验逻辑足够轻量，可以内联，使用带 `blocking="render"` 的内联模块脚本。这适用于实验逻辑需要获取配置并直接修改 DOM 的情况。

```html
<head>
  <!--
    DO: Use an inline module script when the experiment logic is small.
    Module scripts are deferred by default (non-parser-blocking),
    and blocking="render" ensures rendering waits for execution.
  -->
  <script type="module" blocking="render">
    // Fetch the experiment configuration from your testing platform.
    const config = await fetch('/api/experiment?id=homepage-cta')
      .then(res => res.json());

    // Apply the variant by setting a data attribute on <html>.
    // CSS rules keyed to this attribute will style the variant.
    document.documentElement.dataset.variant = config.variant;
  </script>

  <style>
    /* Default styles (control group) */
    .cta-button {
      background-color: blue;
    }

    /* Variant B styles, activated by the data attribute */
    [data-variant="b"] .cta-button {
      background-color: green;
    }
  </style>
</head>
```

<a id="best-practices"></a>

## 最佳实践

- **必须**：实验脚本**必须**快速执行。缓慢脚本会延迟所有渲染。为阻塞渲染的脚本设定性能预算，例如执行时间低于 100ms。
- **应当**将繁重实验逻辑与阻塞渲染的脚本拆开。先加载一个精简的、阻塞渲染的引导脚本来应用变体，再使用 `async` 或 `defer` 单独加载较重的跟踪或分析脚本，不设置 `blocking="render"`。
- **应当**在 `<html>` 或 `<body>` 上使用数据属性标明当前变体，再通过匹配该属性的 CSS 选择器设置变体样式。这样可以避免在阻塞渲染的脚本中直接操作 DOM。
- **不要**为分析、跟踪或其他非视觉脚本设置 `blocking="render"`。只有必须改变用户首次绘制时所见内容的脚本才应该阻塞渲染。
- **不要**将 `blocking="render"` 与旧式防闪烁片段结合使用。两者解决的是同一个问题，同时使用会造成不必要的延迟。

<a id="fallback-strategies"></a>

## 回退策略

blocking="render" 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）和 Safari 18.2（2024 年 12 月）。
不支持的浏览器：Firefox。

并非所有浏览器都支持 `blocking` 属性。不支持时会忽略该属性，脚本按默认行为加载，上面的示例中为 `async`，因此仍可能闪烁。要在不支持的浏览器中防止闪烁，需要回退方案。

<a id="fallback-anti-flicker-snippet"></a>

### 回退：防闪烁片段

应当：仅在不支持 `blocking="render"` 时，使用轻量的防闪烁片段作为回退。先检测支持情况，在原生支持的浏览器中跳过该回退。

```html
<head>
  <!--
    DO: Load the experiment script with blocking="render" for
    browsers that support it. This is the preferred approach.
  -->
  <script
    src="https://cdn.example.com/experiment-sdk.js"
    async
    blocking="render"
  ></script>

  <script>
    // DO: Only apply the anti-flicker fallback in browsers
    // that do not support blocking="render".
    if (!Object.hasOwn(HTMLScriptElement.prototype, 'blocking')) {
      // Hide the page until the experiment script runs.
      document.documentElement.classList.add('ab-loading');

      // DO: Set a timeout to reveal the page if the experiment
      // script takes too long. This prevents an indefinitely
      // blank page on slow connections. Adjust the timeout
      // to match your experiment SDK's expected load time.
      setTimeout(() => {
        document.documentElement.classList.remove('ab-loading');
      }, 4000);
    }
  </script>

  <style>
    /*
      DO: Use opacity to hide content during experiment loading.
      This is only applied when blocking="render" is unsupported.
    */
    .ab-loading {
      opacity: 0 !important;
    }
  </style>
</head>
```

```javascript
// DO: In your experiment SDK's initialization callback,
// remove the fallback class to reveal the page.
function onExperimentReady() {
  document.documentElement.classList.remove('ab-loading');
}
```

<a id="other-considerations"></a>

## 其他考虑

1. **性能影响**：`blocking="render"` 以首次绘制速度换取视觉正确性。监控最大内容绘制（LCP）和首次内容绘制（FCP），确保实验脚本没有引入过多延迟。
2. **第三方脚本可靠性**：如果实验 SDK 托管在第三方 CDN，CDN 故障可能完全阻塞渲染。浏览器有自己的超时启发式规则，可能超过 4 秒，但开发者无法控制 `blocking="render"` 的超时。应确保第三方提供商具有可靠的可用性保障。
3. **服务端替代方案**：对于性能关键页面，应考虑服务端 A/B 测试，由服务器直接渲染正确变体，替代客户端测试。服务端方式可以完全消除闪烁，没有任何渲染阻塞成本。仅在服务端测试不可行时，才使用客户端 `blocking="render"`。
