<a id="consistent-cross-document-transitions"></a>

# 稳定一致的跨文档过渡

<a id="the-problem"></a>

## 问题

跨文档视图过渡在同源导航期间为两个页面的元素添加动画。浏览器先截取旧页快照，导航后再从快照过渡到新页。如果新页面关键资源尚未加载完——样式表、布局脚本或关键 DOM 元素——过渡就会指向不完整或无样式状态，造成视觉故障，例如元素变形到错误位置、动画中途内容重排，或过渡结束后回退字体闪成 Web 字体。

<a id="the-solution"></a>

## 解决方案

在新页 `<head>` 的关键 `<link>` 和 `<script>` 上使用 `blocking="render"`，并用 `<link rel="expect">` 阻止渲染，直到特定 DOM 元素解析完成。这样新页视觉状态稳定前，浏览器不会开始过渡动画。HTML 仍在后台解析，只有绘制延后。

<a id="implementation-strategy"></a>

### 实现策略

1. **必须：** 两页都通过 CSS `@view-transition` 声明启用跨文档视图过渡。
2. **必须：** 关键样式表放在 `<head>`。位于 `<head>` 中的样式表默认阻塞渲染。动态注入的样式表则需要显式 `blocking="render"`。
3. **要**为必须在动画前执行的 `<script>` 元素（例如应用主题或影响布局的脚本）设置 `blocking="render"`。
4. **要**用 `<link rel="expect" href="#element-id" blocking="render">` 等待首屏内容解析。适用于所有过渡：整页淡入淡出（避免过渡到空白）、变形动画（确保具名元素存在）、依赖脚本的布局（确保有样式内容已解析）。
5. **不要**为非关键内容阻塞渲染。只阻塞影响初始视口的资源和元素；过多会延迟过渡并损害感知性能。

<a id="implementation-guide"></a>

## 实现指南

<a id="step-1-opt-in-to-cross-document-view-transitions"></a>

### 第 1 步：启用跨文档视图过渡

必须：源页和目标页都包含 `@view-transition`。否则不会发生跨文档过渡。

```css
/*
  MANDATORY: Include this rule in every page that participates
  in cross-document view transitions.
  `navigation: auto` enables transitions for standard navigations
  (link clicks, form submissions, back/forward).
*/
@view-transition {
  navigation: auto;
}

/* MANDATORY Copy-Paste Safety: Disable cross-document view transitions for users requesting reduced motion */
@media (prefers-reduced-motion: reduce) {
  @view-transition {
    navigation: none;
  }
}
```

<a id="step-2-block-rendering-until-critical-scripts-execute"></a>

### 第 2 步：阻塞渲染，直到关键脚本执行

如果 `<head>` 中非阻塞脚本必须在动画前运行（例如应用主题类或影响布局），标记 `blocking="render"`。否则 `async`、`defer` 或 `type="module"` 脚本可能在过渡开始后才执行。

```html
<head>
  <!--
    DO: Mark layout-critical scripts with blocking="render".
  -->
  <script type=module blocking="render">
    // Example: apply a stored theme before the page renders,
    // so the transition snapshot reflects the correct theme.
    document.documentElement.dataset.theme =
      localStorage.getItem('theme') || 'light';
  </script>
</head>
```

<a id="step-3-block-rendering-until-key-dom-elements-are-parsed"></a>

### 第 3 步：阻塞渲染，直到关键 DOM 元素解析

`<head>` 中样式表和 `blocking="render"` 脚本只保证 `<head>` 处理完成，**不会**等待 `<body>` 内容解析。没有额外阻塞，浏览器可能在首屏元素进入 DOM 前截取新页快照，动画就会过渡到空白或部分渲染页面。

`<link rel="expect">` 通过等待特定 `id` 元素解析来解决。`href` 必须是匹配目标 `id` 的片段标识符，例如 `#hero`。解析到该元素结束标签后，解除渲染阻塞。注意 `<link rel="expect">` 只保证目标 DOM 元素已存在，**不会**等待外部子资源（如 `<img>` 像素）下载或解码。

以下场景都**应**使用 `<link rel="expect">`：

<a id="use-case-1-full-page-cross-fade"></a>

#### 用例 1：整页交叉淡入淡出

即使没有任何元素设置 `view-transition-name`，默认 `root` 过渡也会让整页交叉淡入淡出。若首屏内容尚未解析就截取快照，动画会从旧页变为空白或不完整页。应等待一个标记首屏可见内容末端的元素。

```html
<head>
  <link rel="stylesheet" href="/css/styles.css">

  <!--
    DO: Block rendering until the main content area is parsed,
    even for a simple cross-fade. Without this, the browser may
    snapshot the page before visible content exists in the DOM,
    causing the cross-fade to reveal a blank or partial page.
  -->
  <link rel="expect" href="#main-content" blocking="render">
</head>
<body>
  <header>...</header>
  <main id="main-content">
    <h1>Page Title</h1>
    <p>Above-the-fold content the user should see immediately.</p>
  </main>
  <!-- Content below the fold does NOT need to be blocked on -->
  <section>...</section>
</body>
```

<a id="use-case-2-morph-animations-between-specific-elements"></a>

#### 用例 2：特定元素之间的变形动画

两页元素共享 `view-transition-name` 时，浏览器会在导航期间平滑变形。若过渡开始时目标未解析，就找不到它，变形退化为独立退出和进入动画。应阻塞到具有 `view-transition-name` 的元素解析完成。

由于 `<link rel="expect">` 只等待目标 DOM 解析，不等待图片下载或解码，未缓存 `<img>` 可能在新页快照中呈现为空矩形。为避免图片变形时空白或布局偏移，预加载或预解码关键图片（例如 `<link rel="preload" as="image">`，或预渲染目标页），并提供明确尺寸回退（`width` 和 `height`，或 CSS `aspect-ratio`，加占位背景色）。

```html
<head>
  <link rel="stylesheet" href="/css/styles.css">

  <!--
    DO: Preload critical transition images so their pixels are
    available to decode before the new-page snapshot is captured.
    <link rel="expect"> only waits for the DOM element to be parsed,
    NOT for image pixels to download or decode.
  -->
  <link rel="preload" as="image" href="/img/product.webp" fetchpriority="high">

  <!--
    DO: Block rendering until the element participating in the
    morph animation has been parsed. Without this, the browser
    may start the transition before #hero exists, causing the
    morph to degrade to a fade-out/fade-in.
  -->
  <link rel="expect" href="#hero" blocking="render">

  <!--
    When multiple blocking="render" resources are present,
    rendering is blocked until ALL of them are satisfied.
    Here, the browser waits for both the script to execute
    AND the #hero element to be parsed — whichever comes last.
  -->
  <script async blocking="render" src="/js/transition-setup.js"></script>
</head>
<body>
  <header>...</header>
  <section id="hero">
    <h1 style="view-transition-name: page-title">Product Name</h1>
    <!--
      DO: Provide explicit dimensions (width/height or aspect-ratio)
      as a sizing fallback so the snapshot captures the correct layout
      box even if image decoding is still in progress.
    -->
    <img
      style="view-transition-name: hero-image"
      src="/img/product.webp"
      width="800"
      height="600"
      alt="Product"
    >
  </section>
</body>
```

<a id="step-4-use-media-queries-for-responsive-render-blocking"></a>

### 第 4 步：用媒体查询实现响应式渲染阻塞

不同视口尺寸首屏可能显示不同数量内容。通过 `<link rel="expect">` 的 `media` 属性，仅等待该宽度下可见内容。

```html
<head>
  <!--
    DO: Use media queries to conditionally block rendering.
    On wide screens, both the hero and the sidebar are visible,
    so block until both are parsed. On narrow screens, only the
    hero is visible initially.
  -->
  <link
    rel="expect"
    href="#hero"
    blocking="render"
    media="screen and (width <= 768px)"
  >
  <link
    rel="expect"
    href="#sidebar"
    blocking="render"
    media="screen and (width > 768px)"
  >
</head>
```

<a id="step-5-use-pagereveal-for-context-dependent-transitions-optional"></a>

### 第 5 步：用 pagereveal 实现依赖上下文的过渡（可选）

核心渲染阻塞策略**不需要** `pagereveal`。只有必须根据用户来源动态分配 `view-transition-name` 时才需要，例如将特定列表项变形为详情页标题。

如果 `view-transition-name` 值在 CSS 中静态分配，或只使用默认整页淡入淡出，完全跳过此步。

```html
<head>
  <!--
    MANDATORY: The pagereveal listener must be registered before
    the page renders. Inline small setup scripts with blocking="render"
    to avoid an extra network round-trip on cold loads, or use an
    external async script with blocking="render" so the listener is
    registered early without blocking HTML parsing.
    If the listener is registered too late (e.g., in a deferred
    script), the event may have already fired.
  -->
  <script async blocking="render" src="/js/transition-setup.js"></script>
</head>
```

```javascript
// transition-setup.js
window.addEventListener('pagereveal', async (event) => {
  if (!event.viewTransition) return;

  const from = navigation.activation?.from;
  if (!from) return;

  const fromUrl = new URL(from.url);

  // DO: Assign view-transition-name based on navigation context.
  // This enables a morph animation from the product card on the
  // list page to the heading on the detail page.
  if (fromUrl.pathname === '/products/') {
    const heading = document.querySelector('main h1');
    if (!heading) return;

    heading.style.viewTransitionName = 'product-title';

    try {
      await event.viewTransition.ready;
    } catch (error) {
      // Skipped view transitions reject `ready` with InvalidStateError.
      if (error.name !== 'InvalidStateError') {
        throw error;
      }
    } finally {
      // MANDATORY: Remove the temporary name after the transition
      // finishes. Stale names interfere with subsequent navigations
      // and prevent the page from entering the bfcache.
      await event.viewTransition.finished;
      heading.style.viewTransitionName = '';
    }
  }
});
```

<a id="best-practices"></a>

## 最佳实践

- **要**尽可能通过 CSS 分配 `view-transition-name`。仅在名称依赖导航上下文时通过 JavaScript（`pagereveal`）分配。
- **要**让阻塞渲染脚本小而快。浏览器有约 4 秒内建超时，超时后完全跳过过渡；若过渡已启动，`viewTransition.ready` 以 `InvalidStateError` 拒绝。
- **不要**用 `<link rel="expect">` 等待初始视口不可见的页面深处元素。这只延迟过渡，没有视觉收益。
- **不要**为分析、广告网络、标签管理器或其他第三方加载器设置 `blocking="render"`，即使它们向首屏注入内容。其网络延迟计入过渡超时，输出也不属于页面稳定状态。
- **不要**在同一页多个元素上分配同一个 `view-transition-name`。重复名称会让整个过渡跳过。
- **对辅助技术时机的影响：** `blocking="render"` 延迟视觉更新和首帧绘制。虽可避免明眼用户看到视觉故障，但依赖渲染后无障碍树的屏幕阅读器等辅助技术可能处理延迟或延后初始化。权衡视觉连续性与非视觉用户初始读取延迟，并确保阻塞脚本极小且充分优化。

<a id="fallback-strategies"></a>

## 回退策略

Cross-document view transitions 的浏览器支持：有限可用。
支持版本：Chrome 126（2024 年 6 月）、Edge 126（2024 年 6 月）和 Safari 18.2（2024 年 12 月）。
不支持：Firefox。

跨文档过渡很适合渐进增强。不支持时忽略 `@view-transition`，同源导航与未使用此功能时完全相同。支持浏览器获得平滑过渡，其余得到标准导航。有限支持不是避免采用的理由。

所有支持跨文档视图过渡的浏览器也支持 `blocking="render"` 和 `<link rel="expect">`，因此这些阻塞功能无需独立回退。

<a id="other-considerations"></a>

## 其他考量

1. **性能影响：** 每项阻塞资源都延迟动画开始。尽量减少阻塞脚本，仅为首屏元素使用 `<link rel="expect">`。通过 Speculation Rules API 预渲染目标页可完全消除加载延迟。
2. **超时行为：** 总阻塞时间超过约 4 秒时，浏览器跳过过渡，活动的 `viewTransition.ready` 以 `InvalidStateError` 拒绝。确保关键资源在此窗口内充分提前加载。
3. **bfcache 兼容性：** 过渡后未清理的临时 `view-transition-name` 可能阻止页面进入 bfcache。始终在 `finished` 回调移除动态名称。
