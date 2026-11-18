<a id="complex-shapes"></a>
# 复杂形状

<a id="overview"></a>
## 概述
要将元素裁切为笔触、有机纹理等复杂自由形状，使用 CSS 遮罩（`mask-image`）。`clip-path` 很适合几何形状或矢量路径，而 `mask-image` 可用图片，例如带透明度的 PNG，或 SVG 定义元素可见区域。它支持半透明，因此表达力更强，可实现用 `clip-path` 难以或无法实现的柔边和复杂纹理。

<a id="implementation"></a>
## 实现
使用 CSS 遮罩实现复杂形状：

<a id="using-transparency-from-an-image"></a>
### 利用图片的透明度
可将图片透明度用作遮罩，不透明部分可见，透明部分隐藏。图片可以是 PNG、SVG 或其他带透明度的图像，也可以是 CSS 渐变等生成图像。

```css
.shaped-element {
  /* MANDATORY: Use vendor prefix for wider support in older browsers */
  -webkit-mask-image: url('mask.svg');
  -webkit-mask-size: cover; /* Scale mask to cover element */
  -webkit-mask-repeat: no-repeat; /* Do not tile the mask */

  /* Standard property for modern browsers */
  mask-image: url('mask.svg');
  mask-size: cover;
  mask-repeat: no-repeat;
}
```


<a id="using-an-svg-element-in-html"></a>
### 使用 HTML 中的 SVG 元素
也可以引用页面 HTML 中内联 SVG 定义的 `<mask>`。使用 `maskContentUnits="objectBoundingBox"`，让遮罩随元素尺寸自动缩放。它让浏览器将遮罩内全部坐标解释为 `0` 到 `1` 的比例，例如 `0.5` 表示 50%，而不是绝对像素。

> **亮度遮罩与 Alpha 遮罩**：默认情况下，SVG 遮罩根据**亮度**决定不透明度：白色显示、黑色隐藏、灰色产生半透明。如果希望改用 SVG 形状的 **Alpha 通道**，即透明度，可在 CSS 中指定 `mask-type: alpha;`，或直接在 SVG `<mask>` 上设置 `mask-type="alpha"`。

```html
<!-- White areas reveal content, gray creates semi-transparency, black or transparent hides it -->
<svg width="0" height="0">
  <defs>
    <!-- objectBoundingBox scales mask coordinates (0 to 1) with the element's size -->
    <mask id="custom-shape" maskContentUnits="objectBoundingBox">
      <!-- Use white shapes to define fully opaque areas -->
      <circle cx="0.5" cy="0.5" r="0.5" fill="white" />
      <!-- Use gray shapes to define semi-transparent/faded areas -->
      <circle cx="0.5" cy="0.5" r="0.25" fill="gray" />
    </mask>
  </defs>
</svg>

<div class="masked-content">
  <!-- Content to be masked -->
</div>

<style>
.masked-content {
  /* Reference the SVG mask ID */
  -webkit-mask-image: url(#custom-shape);
  mask-image: url(#custom-shape);
}
</style>
```


<a id="fallback-strategies"></a>
### 回退策略
遮罩的 Baseline 状态：广泛可用。自 2023-12-07 起纳入 Baseline。
支持的浏览器：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

如果浏览器不支持 `mask-image` 或带前缀版本：
- 元素不会被裁切，将显示为普通矩形。
- 确保没有遮罩时，内容仍可读且布局不会损坏，即采用渐进增强。
- 可选地，通过特性检测，用 `clip-path` 提供更简单的回退形状。

```css
/* Fallback for browsers that do not support masking */
@supports (not (mask-image: url(x))) and (not (-webkit-mask-image: url(x))) {
  .shaped-element {
    /* Use a simple rounded rectangle as fallback */
    clip-path: inset(5% round 15px);
  }
}
```

