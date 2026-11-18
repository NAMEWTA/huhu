<a id="performance"></a>

# 性能

<a id="critical-rendering-path-crp-optimization"></a>

## 优化关键渲染路径（CRP）

关键渲染路径决定了浏览器把 HTML、CSS 和 JavaScript 转换成绘制像素的速度。

<a id="dos"></a>

### 应当做的事

* **应当内联关键 CSS**：提取首屏内容所需样式，直接注入 HTML 的 `<head>`，推迟其余样式表的加载。
* **应当为所有非关键脚本使用 `async` 或 `defer`**：避免 JavaScript 阻塞 DOM 解析器。依赖 DOM 或彼此依赖的脚本使用 `defer`，独立脚本使用 `async`。现代 JavaScript 优先使用 `type="module"`；模块默认延迟执行，无需显式 `defer`，独立模块脚本也可以设置 `async`。
* **应当按媒体查询拆分 CSS**：在 `<link>` 标签上使用 `media` 属性，让浏览器下载暂不使用的样式表时不阻塞渲染，例如打印样式或移动设备上的桌面样式。
* **应当使用资源提示**：为必要第三方域名，例如字体服务或 API 端点，添加 `preconnect` 或 `dns-prefetch`，提前建立 TLS 握手。

<a id="donts"></a>

### 不要做的事

* **不要在 CSS 中使用 `@import`**：它会产生串行请求链，延迟 CSS 对象模型（CSSOM）的构建。
* **不要在 `<head>` 中放置大型非关键 JavaScript**：这会暂停 DOM 构建，直到脚本下载、解析并执行完成。
* **不要加载不可见或无法到达的 CSS/JS**：确保构建工具执行 tree-shaking 和 CSS 压缩，在部署前删除不可达代码。

<a id="code-examples"></a>

### 代码示例

**HTML：推迟非关键 CSS 与脚本**
```html
<!-- Inline critical styles directly in head -->
<style>
  body { margin: 0; font-family: system-ui; }
  .hero { min-height: 100vh; }
</style>

<!-- Defer non-critical CSS -->
<link rel="preload" href="non-critical.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="non-critical.css"></noscript>

<!-- Load CSS conditionally based on viewport -->
<link rel="stylesheet" href="mobile.css" media="(max-width: 768px)">

<!-- Defer JavaScript execution -->
<script defer src="app-bundle.js"></script>
```

<a id="the-resource-hint-navigator"></a>

### 资源提示选择指南

| 提示 | 使用场景 | 示例 |
| :--- | :--- | :--- |
| `preconnect` | 为已知第三方 API 处理 TLS/DNS | API 端点、字体服务 |
| `dns-prefetch` | 非关键第三方源的轻量回退 | 广告服务器、分析回退服务 |
| `preload` | 渲染*当前*所需的同源资源 | 主视觉图片、阻塞渲染的字体 |
| `prefetch` | 下一页导航需要的资源 | 下一页代码包、详情视图 |

**一句话理解**：“域名用 Preconnect，视口内容用 Preload，未来内容用 Prefetch。”

<a id="largest-contentful-paint-lcp--resource-fetching"></a>

## 最大内容绘制（LCP）与资源获取

LCP 测量渲染视口内最大可见文本块或图片块所需的时间。通过优先处理可见元素并提前优化，改善 LCP。

<a id="dos-1"></a>

### 应当做的事

* **应当在标准 HTML 中声明 LCP 图片**：确保 LCP 图片出现在原始 HTML 响应中，让预加载扫描器立即发现。优先使用 `<img>`；如果图片由 JavaScript 或 CSS 加载，也可以使用 `<link rel="preload" as="image">`。不要让 JavaScript 或 CSS 成为图片资源的唯一来源。
* **应当为 LCP 图片设置 `fetchpriority="high"`**：浏览器初期会优先处理 CSS、JavaScript 等阻塞渲染资源，并通过布局确定图片是否在视口内，因此图片最初可能不下载。`fetchpriority="high"` 可以提示浏览器的启发式引擎更早开始下载 LCP 图片。应在 `<img>` 上设置，例如 `<img fetchpriority="high">`，也应在预加载上设置，例如 `<link rel="preload" as="image" fetchpriority="high">`。
* **应当使用 `fetchpriority="low"` 降低初始视口外竞争元素的优先级**：对于不是主要 LCP 元素、也不在初始视口内，但因接近视口或通过 CSS 隐藏仍可能下载的大图或轮播，应降低优先级，例如采用 `overflow:scroll` 的轮播。`fetchpriority="low"` 图片仍会下载，但会排在浏览器队列中更高优先级资源之后开始。
* **应当使用 `loading="lazy"` 避免加载远离初始视口的竞争元素**：距离视口很远的图片、iframe、视频和音频媒体应当懒加载，避免完全不必要的获取。`loading="lazy"` 图片远离视口时不会下载，进入或接近视口时才下载，具体取决于浏览器启发式规则和连接设置。

<a id="donts-1"></a>

### 不要做的事

* **不要懒加载 LCP 图片**：绝不要给首屏图片设置 `loading="lazy"`。这会有意将获取推迟到布局计算完成后，严重恶化 LCP。
* **不要过度使用 `fetchpriority="high"`**：优先级是一种零和机制。提升过多资源会制造网络争用，抵消收益。
* **不要为主视觉区域实现复杂 JavaScript 加载器**：在客户端渲染 LCP 元素会引入较长请求链：HTML → JS → 执行 → 图片请求。

<a id="code-examples-1"></a>

### 代码示例

**HTML：LCP 图片优化**
```html
<!-- Standard LCP Image -->
<img 
  src="/images/hero.webp" 
  alt="Hero Product" 
  fetchpriority="high" 
  width="1200" 
  height="600"
>

<!-- Preloading a CSS-based LCP background -->
<link rel="preload" as="image" href="/images/bg-hero.webp" fetchpriority="high" type="image/webp">

<!-- Demoting an offscreen non-LCP carousel image -->
<img src="/images/carousel-2.webp" fetchpriority="low" loading="lazy" alt="Slide 2">
```

<a id="interaction-to-next-paint-inp--main-thread-unblocking"></a>

## 交互到下一次绘制（INP）与解除主线程阻塞

INP 衡量页面生命周期中各项交互事件的延迟。长时间运行的 JavaScript 任务阻塞主线程，会导致 INP 较差。

<a id="dos-2"></a>

### 应当做的事

* **应当拆分长任务**：任何超过 50ms 的 JavaScript 执行都应拆分。频繁交还主线程控制权，让浏览器处理待响应的用户输入。
* **应当使用 `scheduler.yield()` 并提供回退**：现代 `scheduler.yield()` API 会将任务后续部分放在队列*前面*；不支持的浏览器回退到用 Promise 包裹的 `setTimeout`。
* **应当为高频事件监听器防抖或节流**：限制 `scroll`、`resize` 或高频 `input` 事件处理器的执行频率。
* **应当将 UI 更新与繁重计算分离**：同步更新 UI，立即提供视觉反馈，再把后台处理交给 Web Worker 或延迟任务。

<a id="donts-2"></a>

### 不要做的事

* **不要仅依赖 `setTimeout(..., 0)` 持续让出控制权**：标准 `setTimeout` 会把后续执行放到任务队列*末尾*；如果有其他等待中的任务，可能出现很长延迟。可用时应使用 `scheduler.yield()`。
* **不要引发布局抖动**：避免在同一个循环中交替读取 DOM（`offsetHeight`、`getBoundingClientRect`）和写入 DOM（`style.height`）。先批量读取，再批量写入。
* **不要用重复计时器阻塞线程**：避免使用 `setInterval` 执行繁重轮询，挤占主线程。

<a id="code-examples-2"></a>

### 代码示例

**JS：`scheduler.yield` polyfill 与用法**
```javascript
// Polyfill for yielding to main thread
async function yieldToMain() {
  if ('scheduler' in window && 'yield' in scheduler) {
    return await scheduler.yield();
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Processing a large array without blocking user input
async function processLargeList(items) {
  for (let i = 0; i < items.length; i++) {
    processItem(items[i]);
    
    // Yield every 50 iterations to allow rendering/interaction
    if (i % 50 === 0) {
      await yieldToMain();
    }
  }
}
```

<a id="main-thread-task-slicing-heuristic"></a>

### 主线程任务切片的经验规则

**针对 INP 的 50ms 规则**：

- **< 50ms**：同步执行。
- **50ms–250ms**：拆分任务，并通过 `scheduler.yield()` 让出控制权。
- **> 250ms**：交给 Web Worker。

<a id="third-party-script-management"></a>

## 第三方脚本管理

分析、广告、聊天小组件等第三方脚本，是主线程拥堵的主要来源。

<a id="dos-3"></a>

### 应当做的事

* **应当避免第三方脚本阻塞主要内容**：除非对页面加载至关重要，否则所有第三方脚本都使用 `defer`，并放在页脚加载，而非 `<head>`。
* **应当自行托管关键第三方依赖**：把第三方库托管在本站源域名，减少 DNS 查询，并实施自定义 `Cache-Control` 逻辑。

<a id="code-examples-3"></a>

### 代码示例

**HTML：第三方脚本执行**
```html
<!-- 1. Place third-party scripts near the end of the page with the defer attribute -->
<script defer src="https://www.example.com/third-party.js"></script>
```

<a id="css-rendering--containment-optimization"></a>

## CSS 渲染与 containment 优化

渲染涉及布局、样式、绘制和合成计算。CSS Containment 可以限制这些计算的范围，对于计算容易造成性能问题的大型复杂页面尤其有用。

<a id="dos-4"></a>

### 应当做的事

* **应当在大型复杂页面的屏幕外区域使用 `content-visibility: auto`**：让浏览器跳过整个子树的布局与绘制计算，直到它们接近视口。
* **应当将 `content-visibility` 与 `contain-intrinsic-size` 配合使用**：为尚未渲染的容器提供占位高度/宽度，避免布局位移和滚动条跳动。
* **应当根据内容确定 `contain-intrinsic-size`**：设置 `contain-intrinsic-size` 时使用 `auto` 关键字，并根据已知内容估算尺寸，例如文字大小、间距、图形尺寸、字符数。优先使用与内容元素取值相符的 `rem`、`lh`、`cap` 或 `ch` 单位，而不是 `px`。如果同组条目的内容尺寸不一致，使用平均尺寸。
* **应当显式使用 CSS containment（`contain`）**：对模态框、小组件等独立 UI 组件，使用 `contain: layout style paint`，防止内部变化触发整个页面回流。

<a id="donts-3"></a>

### 不要做的事

* **不要在较小、较简单的页面上使用 `content-visibility: auto`**：收益微乎其微，还存在内容跳动等副作用风险。
* **不要给首屏内容设置 `content-visibility: auto`**：浏览器仍会计算其状态，让可见元素额外经过 containment 引擎，会增加少量不必要开销。
* **不要在全局过度使用 `will-change`**：不加区分地给多个元素设置 `will-change: transform`，会消耗过多显存，导致 GPU 崩溃或渲染迟缓。
* **不要在隐藏元素时忽视无障碍体验**：`content-visibility: auto` 会让元素保留在 DOM 中供屏幕阅读器使用。如果屏幕外内容确实应该对辅助技术隐藏，应手动管理 `aria-hidden`。

<a id="code-examples-4"></a>

### 代码示例

**CSS：Content Visibility 与 Containment**
```css
/* Optimize a long list of articles below the fold */
.article-list-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 600px; /* Provides a 600px placeholder */
}

.row {
  --row-gap: .4rem;
  --title-height: 1lh;
  --description-height: 0.85lh;

  display: grid;
  row-gap: var(--row-gap);
  content-visibility: auto;
  /* The sum of the title height, row gap, and description height should be the size of the contents when skipped for rendering. */
  contain-intrinsic-block-size: auto calc(var(--title-height) + var(--row-gap) + var(--description-height));
}

/* Scope a complex widget to prevent layout thrashing */
.isolated-widget {
  contain: layout style paint;
}

/* Hardware accelerate an animation only on hover */
.interactive-button:hover {
  will-change: transform;
  transform: scale(1.05);
}
```

<a id="modern-image--media-optimization"></a>

## 现代图片与媒体优化

图片通常是网页中体积最大的载荷。优化需要结合格式协商、响应式尺寸和布局稳定性。

<a id="dos-5"></a>

### 应当做的事

* **应当提供现代格式（AVIF / WebP / JPEG XL）**：通过 `<picture>` 提供压缩效果最好的 AVIF 或 JPEG XL，回退到 WebP，再为旧浏览器回退到 JPEG/PNG。
* **应当显式设置 `width` 和 `height`**：原生属性可以让浏览器立即计算宽高比、预留空间并消除 CLS。图片尺寸可以通过 HTML 属性或 CSS 属性设置。
* **应当对所有首屏以下图片使用 `loading="lazy"`**：利用浏览器原生懒加载，推迟初始视口外图片的网络请求。
* **应当用 `srcset` 和 `sizes` 实现响应式图片**：根据屏幕密度和视口宽度提供适合的分辨率，避免移动设备下载桌面尺寸图片。

<a id="donts-4"></a>

### 不要做的事

* **不要懒加载首屏图片**：这会直接损害 LCP。可见图片必须采用 `loading="eager"`，即默认值。
* **不要删除必要尺寸**：懒加载图片未指定宽高，会导致布局位移。
* **不要在使用 `srcset` 时省略 `sizes`**：没有 `sizes` 时，浏览器会假设 `100vw`，下载可用的最大图片。

<a id="code-examples-5"></a>

### 代码示例

**HTML：完整的响应式图片组件**
```html
<picture>
  <!-- Modern Formats with Source Negotiation -->
  <source type="image/avif" srcset="hero-400w.avif 400w, hero-800w.avif 800w" sizes="(max-width: 600px) 100vw, 50vw">
  <source type="image/webp" srcset="hero-400w.webp 400w, hero-800w.webp 800w" sizes="(max-width: 600px) 100vw, 50vw">
  
  <!-- Fallback + Dimensions + Priority for Above-The-Fold -->
  <img 
    src="hero-800w.jpg" 
    alt="Descriptive text" 
    width="800" 
    height="600"
    fetchpriority="high"
    loading="eager"
  >
</picture>

<!-- Below-The-Fold Image -->
<img 
    src="footer-icon.png" 
    alt="Footer Logo" 
    width="100" 
    height="100"
    loading="lazy"
>

<!-- DO: Use native lazy loading for below the fold iframes -->
<iframe src="https://example.com/map" width="800" height="600" loading="lazy" title="Example Map"></iframe>
```

<a id="service-workers--caching-strategies"></a>

## Service Worker 与缓存策略

通过 Service Worker 进行客户端缓存，可以完全绕过网络，直接从磁盘或内存提供资源。

<a id="dos-6"></a>

### 应当做的事

* **应当对静态、带版本的资源采用 `CacheFirst`**：字体、带哈希字符串的 JS/CSS 包等不可变文件，应直接从缓存提供，确保即时加载。
* **应当对动态非关键资源使用 `StaleWhileRevalidate`**：对于允许数据略微过期的 API 调用，立即返回缓存，同时在后台静默更新缓存。
* **应当对 HTML 文档采用 `NetworkFirst`**：确保用户总能得到最新应用外壳和 manifest，仅离线时回退到缓存。
* **应当限制缓存大小和有效期**：使用过期插件，防止 Service Worker 耗尽设备存储配额。

<a id="donts-5"></a>

### 不要做的事

* **不要盲目缓存 opaque 响应**：缺少 CORS 响应头的第三方域响应是不透明的。大量缓存会消耗配额并可能静默失败。只通过 `NetworkFirst` 或 `StaleWhileRevalidate` 缓存它们。
* **不要缓存 POST 请求**：Service Worker 原生无法缓存非 GET 请求。离线提交应实现后台同步队列。
* **不要跳过版本管理**：不更新资源哈希或版本，会让用户陷入无限缓存循环。
* **不要对非敏感资源使用 `Cache-Control: no-store`**：该指令会阻止浏览器将页面保存到**后退/前进缓存（bfcache）**，显著降低感知性能。仅对真正私密的数据使用它；对于只需提供最新内容的页面，使用 `Cache-Control: no-cache` 或 `Cache-Control: max-age=0`。

<a id="code-examples-6"></a>

### 代码示例

**JS：通过 Workbox 实现 Service Worker 缓存**
```javascript
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// 1. HTML Documents: Network First
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'pages-cache' })
);

// 2. Static Assets (JS, CSS, Fonts): Cache First
registerRoute(
  ({ request }) => ['style', 'script', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'static-resources',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })
    ]
  })
);

// 3. API Responses: Stale While Revalidate
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/content'),
  new StaleWhileRevalidate({
    cacheName: 'api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] })
    ]
  })
);
```

<a id="web-fonts-optimization"></a>

## Web 字体优化

Web 字体是渲染阻塞的常见来源。优化字体可以减少不可见文本闪现（FOIT），并加快初始渲染。

<a id="dos-7"></a>

### 应当做的事

* **应当预加载关键字体**：为首屏可见字体使用 `<link rel="preload" as="font" type="font/woff2" crossorigin>`。所有字体都应包含 `crossorigin`，同源字体也不例外。
* **应当裁剪字体子集**：精简字重和字形变体，只保留应用需要的字符。

<a id="donts-6"></a>

### 不要做的事

* **不要预加载所有字体**：过度预加载会制造网络争用，挤占其他关键资源的带宽。
* **不要为字体设置 `fetchpriority="high"`**：字体默认已经以高优先级加载，无需再指定 `fetchpriority="high"`。

<a id="code-examples-7"></a>

### 代码示例

**CSS：字体加载定义**
```css
@font-face {
  font-family: 'Modern Sans';
  src: url('/fonts/modern-sans.woff2') format('woff2');
}
```

**HTML：关键字体预加载**
```html
<!-- Always use crossorigin for fonts even if on the same origin -->
<link rel="preload" href="/fonts/modern-sans.woff2" as="font" type="font/woff2" crossorigin>
```

<a id="video-performance--metrics"></a>

## 视频性能与指标

视频是体积最大的资源类别之一。优化重点是减少带宽不足造成的停顿，并保持累积布局偏移（CLS）的稳定性。

<a id="dos-8"></a>

### 应当做的事

* **应当显式指定 `width` 和 `height`**：原生尺寸可以预留布局空间，防止 CLS。
* **应当提供 `poster` 图片回退**：视频缓冲期间显示轻量占位图片，改善感知性能。
* **应当在视频是 LCP 元素时，为封面图片使用 `<link rel="preload" as="image" fetchpriority="high">`**：确保图片尽快下载。
* **应当对非关键视频设置 `preload="none"`**：推迟首屏以下或不自动播放视频的带宽消耗。
* **应当通过 source 协商提供现代格式**：在标准 MP4 之外提供压缩比更好的 WebM。
* **应当对屏幕外视频使用 `loading="lazy"`**：懒加载可以将 `poster` 和 `preload` 下载推迟到视频进入或接近视口时。

<a id="donts-7"></a>

### 不要做的事

* **不要盲目自动播放视频文件**：依据用户意图，或者使用渐进增强的流。
* **不要自动播放大型视频文件**：下载大文件前应依赖用户意图。

<a id="code-examples-8"></a>

### 代码示例

**HTML：可访问的动态视频加载器**
```html
<video 
  controls 
  width="1200" 
  height="675"
  poster="/images/video-poster.webp" 
  preload="none"
  loading="lazy"
>
  <source src="/videos/intro.webm" type="video/webm">
  <source src="/videos/intro.mp4" type="video/mp4">
  <!-- Include accessibility tracks -->
  <track src="/video-caps.vtt" kind="captions" srclang="en" label="English">
</video>
```

<a id="javascript-code-splitting"></a>

## JavaScript 代码拆分

庞大的单体代码包会在低端设备上长时间占用主线程解析。拆分代码可以确保仅下载当前视口所需的字节。

<a id="dos-9"></a>

### 应当做的事

* **应当使用动态导入**：通过标准 `import()` 拆分路由或大型 UI 库。
* **应当配置打包器资源分块**：使用 Vite 或 Webpack 的打包配置，将第三方依赖与应用运行逻辑拆开。

<a id="donts-8"></a>

### 不要做的事

* **不要分发单个巨大的 `app.js` 包**：它会增加初始视图的解析时间和内存占用。

<a id="code-examples-9"></a>

### 代码示例

**JS：按路由动态拆分**
```javascript
// Dynamic import of heavy module only when button is clicked
document.getElementById('heavy-btn').addEventListener('click', async () => {
  const { heavyFunction } = await import('./heavy-module.js');
  heavyFunction();
});
```
