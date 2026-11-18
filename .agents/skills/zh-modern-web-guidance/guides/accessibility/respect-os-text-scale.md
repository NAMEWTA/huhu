<a id="respect-operating-system-text-scale"></a>
# 尊重操作系统的文字缩放

<a id="overview"></a>
## 概述

有视觉障碍的用户经常在操作系统层面配置文字缩放，例如 iOS 的动态字体，或 Android/ChromeOS 的字体大小缩放。默认情况下，移动浏览器会忽略这些操作系统级无障碍设置，避免旧式固定像素网站的视觉布局被破坏。

不要让页面始终保持固定大小，也不要依赖自定义且脆弱的 JavaScript 布局计算，而应通过 `<meta name="text-scale">` 标签启用原生操作系统文字缩放。启用后，浏览器会动态调整根字号（`1rem`），使其匹配用户的操作系统偏好，让所有使用相对单位（`rem`/`em`）的字号、布局和间距自动、平稳地缩放。

<a id="implementation"></a>
## 实现

<a id="1-opt-into-os-text-scaling"></a>
### 1. 启用操作系统文字缩放

将 `<meta name="text-scale">` 元素放入文档的 `<head>`。这会向支持的浏览器表明，你的布局是现代、自适应且可安全缩放的：

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width" />
  
  <!-- Opt this page into OS-level dynamic type and accessibility text scaling -->
  <meta name="text-scale" content="scale" />
  
  <title>Adaptive Accessibility Layout</title>
</head>
```

<a id="2-use-relative-typography--spacing"></a>
### 2. 使用相对字号与间距

使用相对单位（`rem` 或 `em`）定义字号，而不是固定像素（`px`）。行高使用无单位数值，使其与每个元素计算后的字号成比例缩放。

当外边距和内边距与文字大小相关，或必须随文字缩放而适应时，使用相对单位。对于独立于文字的间距，可以在合适时使用固定单位，前提是缩放不会导致文字裁切、重叠、内容丢失或布局无法使用：

```css
body {
  font-family: system-ui, sans-serif;
  /* Inherits the root font-size, which scales automatically with the OS setting */
  line-height: 1.5;      /* Unitless so it scales proportionally with computed font-size */
  padding: 1.5rem;       /* Scales proportionally to prevent dense crowding at larger scales */
}

h1 {
  font-size: 2.25rem;    /* Scales proportionally to the root base */
  margin-bottom: 1rem;
}
```

只有当设计需要不同于继承的浏览器默认字号时，才在 `body` 上设置基础文字大小；否则让其继承。在标题等具体元素上，使用 `rem` 或 `em` 等相对单位设置大小。需要相对于根字号时使用 `rem`，需要依赖父元素字号时使用 `em`。不要在 `:root` 或 `html` 上设置自定义字号。

<a id="fluid-typography"></a>
#### 流式字号

流式字号可以使用 `vw` 等视口相对单位，前提是字号同时包含 `rem` 或 `em` 等字体相对分量。关于容器查询单位和 `clamp()` 等更多流式缩放技术，参见 `fluid-scaling`，可通过 `npx -y modern-web-guidance@latest retrieve "fluid-scaling"` 获取。

避免仅使用视口单位设置文字大小：

```css
/* ❌ DO NOT DO THIS: The font size does not respond fully to user text scaling */
.heading {
  font-size: 5vw;
}
```

应结合字体相对值与视口相对缩放，并使用相对的最小和最大边界：

```css
.heading {
  font-size: clamp(2rem, 1.25rem + 2vw, 4rem);
}
```

测试文字能否调整到默认大小的至少 200%，且不丢失内容或功能。对于流式字号，一个实用经验是让最大字号不超过最小字号的 2.5 倍。还应在 320 CSS 像素的视口宽度下测试重排，相当于将 1280 CSS 像素宽的视口放大到 400%；除非确有必要，否则内容必须在无需二维滚动的情况下仍然可用。

<a id="3-use-scalable-responsive-breakpoints"></a>
### 3. 使用可缩放的响应式断点

响应式断点不得假设文字会一直保持默认大小。如果断点的目的是响应文字可用空间，应优先使用由内容驱动的布局、容器查询，或基于 `em` 的媒体查询，而不是固定像素阈值。

在开启操作系统文字缩放和浏览器缩放的情况下测试响应式布局。文字必须保持可读，内容必须保持可见，不得发生重叠、裁切或横向滚动。

<a id="4-ensure-content-wrapping--flexible-heights"></a>
### 4. 确保内容可换行且高度可伸缩

文字放大时，元素需要更多的垂直和水平空间，以防截断或重叠。为保持组件稳健，应让布局围绕内容动态扩展，而不是强制使用僵硬的坐标：

* **允许文字容器增长**：包含文字的组件和容器必须能够增长，以容纳缩放后的文字。避免固定的 `height` 或 `block-size`，以及限制过严的 `max-height` 或 `max-block-size`，以免造成裁切或溢出。优先使用内容驱动的尺寸；只有确实需要最小尺寸时，才使用 `min-height` 或 `min-block-size`。
* **允许自然换行**：不要对包含句子的块设置 `white-space: nowrap` 来限制行内轴文字换行。让文字自然重排到新行。
* **采用灵活的 Flexbox 与 Grid 换行（可选示例）**：对于多列卡片画廊，使用 `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))` 这样的可重排列，让项目在达到相对宽度阈值时纵向堆叠：

```css
/* Card container using min-height to ensure expansion and auto-fit to reflow if needed */
.card {
  padding: 1.5rem;
  border: 1px solid #ccc;
  border-radius: 8px;
  /* Use min-height so the box expands vertically when the font is enlarged */
  min-height: 10rem;
}
```

<a id="5-do-not-override-the-root-font-size"></a>
### 5. 不要覆盖根字号

通过 `<meta name="text-scale" content="scale">` 元素启用缩放时，**不要**在样式表中显式设置根元素的 `font-size`。这一要求既适用于 `:root`，也适用于 `html` 上的声明，并涵盖绝对单位、相对单位和计算值。

例如，不要用固定值覆盖根字号：

```css
/* ❌ DO NOT DO THIS: This can prevent the browser from applying text scaling */
html {
  font-size: 16px;
}
```

不要将 `<meta name="text-scale" content="scale">` 与 `env(preferred-text-scale)` 结合，用后者手动应用操作系统文字缩放。浏览器已经通过 meta 选择加入机制应用缩放，两者同时使用可能导致重复缩放：

```css
/* ❌ DO NOT DO THIS: The meta opt-in already applies the operating system text scale */
:root {
  font-size: calc(1rem * env(preferred-text-scale));
}
```

将根字号交给浏览器。浏览器会自动处理操作系统文字缩放，并将其应用到按根字号相对定尺寸的内容上。

<a id="fallback-strategies"></a>
## 回退策略

<meta name="text-scale"> 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 146（2026 年 3 月）和 Edge 146（2026 年 3 月）。
不支持的浏览器：Firefox 和 Safari。

在不支持 `<meta name="text-scale" content="scale">` 的浏览器中，布局会平稳降级。页面按浏览器标准的默认基础字号呈现，通常为 16px；用户仍可使用标准的手动页面缩放或双指缩放。
