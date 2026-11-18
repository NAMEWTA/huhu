<a id="ensure-text-readability-with-dynamic-background-colors"></a>
# 在动态背景颜色下保证文字可读

构建可复用界面组件，例如徽章、按钮、页头或页脚，或支持可定制主题时，要确保文字在变化的背景色上始终可读并不容易。CSS 函数 `contrast-color()` 会解析为 `black`（`rgb(0, 0, 0)`）或 `white`（`rgb(255, 255, 255)`），最大化与指定纯色 `<color>` 的对比度，目标是至少达到 WCAG AA 的 4.5:1 对比度。

<a id="determine-optimal-text-color"></a>
## 确定最佳文字颜色

当元素背景色可变或动态注入时，可以让浏览器计算最安全的文字颜色。

强制要求：通过 `contrast-color()` 设置 `color` 属性，将背景色或其自定义属性作为参数传入。

```css
.badge {
  /* Define the background color as a custom property */
  --badge-bg: #e02424;
  background-color: var(--badge-bg);
  /* MANDATORY: Dynamic contrasting color */
  color: contrast-color(var(--badge-bg));
}
```


不要：将 `contrast-color()` 用于 `background-color`。它专门用于根据给定背景色，为文字或边框等前景色提供对比。

<a id="integrate-with-theming"></a>
## 与主题集成

`contrast-color()` 接受任何有效的 `<color>` 值，包括 CSS 自定义属性，因此在设计系统中尤其有用。将背景主题集中为变量后，每当主题变化，甚至变为用户指定颜色时，前景内容的对比色都会自动更新。

应当：在 `contrast-color()` 中引用共享背景变量，保证整个应用同步。

```css
.theme-card {
  background-color: var(--theme-surface-color);
  color: contrast-color(var(--theme-surface-color));
}

.theme-container[data-theme="light"] {
  --theme-surface-color: #f4f4f4;
}
.theme-container[data-theme="dark"] {
  --theme-surface-color: #1a1a1a;
}
.theme-container[data-theme="custom"] {
  --theme-surface-color: var(--user-custom-theme);
}
```


不要：在背景动态变化时，为每个交互状态硬编码独立的文字颜色。这样会重新引入 `contrast-color()` 本来要防止的颜色不匹配问题。

<a id="fallback-strategies"></a>
## 回退策略

contrast-color() 的 Baseline 状态：新近可用。自 2026-04-10 起纳入 Baseline。
支持的浏览器：Chrome 147（2026 年 4 月）、Edge 147（2026 年 4 月）、Firefox 146（2025 年 12 月）和 Safari 26（2025 年 9 月）。

要支持没有 `contrast-color()` 的浏览器，必须提供回退。如果背景色已知且固定，使用硬编码的高对比度颜色。对于可变背景色，例如运行时颜色未知的主题自定义属性，根据界面要求与浏览器支持目标，从下表的五种回退策略中选择。

| 策略 | 最适合…… | 注意事项 |
| :--- | :--- | :--- |
| **用 `color(xyz)` 计算对比色** | 自动、纯 CSS 的对比色计算，确保符合 WCAG 1.4.3 对比度〔最低要求〕。 | 质量最高的纯 CSS 回退。 |
| **文字阴影** | 快速提高任意背景上的可读性。 | 可能显得“脏”或“发光”，不一定适合所有设计。 |
| **文字描边** | 在确保边缘对比度的同时保留字重。 | 若可用，使用 `paint-order` 避免字形变细。 |
| **半透明覆盖层** | 保证文字后方有达到最低对比度的区域。 | 会改变文字下方背景色的外观，需要独立文字元素。 |
| **SVG 滤镜** | 随背景变化自动更新的对比色。 | 需要独立文字元素，实现较为取巧。 |

<a id="recommended-calculate-contrast-with-colorxyz"></a>
### 推荐：使用 `color(xyz)` 计算对比色

为遵循 WCAG 1.4.3 对比度〔最低要求〕，使用 CIE XYZ D65 色彩空间中的相对颜色语法计算对比色；该色彩空间的 `y` 值表示相对亮度。注意，`white` 是 `color(xyz 0.9505 1 1.089)`，因为这是 D65 白点。

相对颜色的 Baseline 状态：新近可用。自 2024-09-16 起纳入 Baseline。
支持的浏览器：Chrome 125（2024 年 5 月）、Edge 125（2024 年 5 月）、Firefox 128（2024 年 7 月）和 Safari 18（2024 年 9 月）。

```css
--wcag-y-threshold: 0.17913;
--y: max(0, sign(var(--wcag-y-threshold) - y));
color: color(from var(--color) xyz-d65 calc(var(--y) * 0.9505) var(--y) calc(var(--y) * 1.089));
```


<a id="alternative-css-fallbacks"></a>
### 其他 CSS 回退

应当：如果相对颜色语法（RCS）不够用或不受支持，选择最符合设计约束的回退。

<a id="option-1-text-stroke"></a>
#### 选项 1：文字描边

文字描边与填充（兼容性前缀）的 Baseline 状态：广泛可用。自 2017-04-05 起纳入 Baseline。
支持的浏览器：Chrome 4（2010 年 1 月）、Edge 15（2017 年 4 月）、Firefox 49（2016 年 9 月）、Safari 3（2007 年 10 月）和 Safari iOS 2（2008 年 7 月）。

```css
.badge--stroke {
  -webkit-text-stroke: 4px black;
}
```


<a id="option-2-text-stroke-with-paint-order-to-preserve-letterforms"></a>
#### 选项 2：结合 `paint-order` 的文字描边以保留字形

paint-order 的 Baseline 状态：广泛可用。自 2024-03-22 起纳入 Baseline。
支持的浏览器：Chrome 123（2024 年 3 月）、Edge 123（2024 年 3 月）、Firefox ≤66 和 Safari ≤12。

```css
.badge--stroke {
  -webkit-text-stroke: 4px black;
  paint-order: stroke fill;
}
```


<a id="option-3-translucent-background-overlay"></a>
#### 选项 3：半透明背景覆盖层

```css
.badge--overlay {
  position: relative;
  color: #fff;
  overflow: hidden;
}
.badge--overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  background-color: rgb(0 0 0 / 0.4);
  z-index: 0;
}
.badge--overlay span {
  position: relative;
  z-index: 1;
}
```


<a id="option-4-text-shadow"></a>
#### 选项 4：文字阴影

```css
.badge--shadow {
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
}
```


<a id="option-5-svg-filters"></a>
#### 选项 5：SVG 滤镜

SVG 滤镜的 Baseline 状态：广泛可用。自 2015-07-29 起纳入 Baseline。
支持的浏览器：Chrome 5（2010 年 5 月）、Edge 12（2015 年 7 月）、Firefox 3（2008 年 6 月）和 Safari 6（2012 年 7 月）。

1. 加载此 SVG 滤镜定义。如果需要支持受[此 WebKit 缺陷](https://bugs.webkit.org/show_bug.cgi?id=320118)影响的 Safari 版本，必须直接加入 HTML 文档，因为该缺陷会阻止滤镜的外部引用和 data URL 引用。否则，应从外部文件加载，可以是 SVG 文件，也可以内联到 CSS 中。

```html
<!-- Technique from https://miunau.com/posts/dynamic-text-contrast-in-css/ -->
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" height="0" style="display: none;">
  <defs>
    <filter id="contrast-filter" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix"
        values="0.2126 0.7152 0.0722 0 0
          0.2126 0.7152 0.0722 0 0
          0.2126 0.7152 0.0722 0 0
          0 0 0 1 0"/>
      <feMorphology operator="dilate" radius="2"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="-255" intercept="128"/>
        <feFuncG type="linear" slope="-255" intercept="128"/>
        <feFuncB type="linear" slope="-255" intercept="128"/>
      </feComponentTransfer>
      <feComposite operator="in" in2="SourceGraphic"/>
    </filter>
  </defs>
</svg>
```


2. 用 `<span>` 包裹文字。

```html
<div class="badge--svg">
  <span>Badge content</span>
</div>
```


3. 将滤镜应用到 `<span>`。

```css
.badge--svg span{
  color: var(--badge-bg);
  filter: url(#contrast-filter);
}
```

