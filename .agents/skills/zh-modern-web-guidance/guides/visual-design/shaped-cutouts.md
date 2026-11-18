<a id="shaped-cutouts"></a>
# 异形镂空

<a id="overview"></a>
## 概述
CSS 遮罩可将元素裁切为自定义形状，例如为卡片添加缺口，或创建异形边框。在复杂布局中组合形状时，应根据元素所含内容选择遮罩策略：

| 遮罩策略 | 最适合 | 对文字的影响 |
| ------------------------------- | ------------------------------- | ------------------------------ |
| 直接对元素应用 SVG 遮罩 | 图片、图标、装饰形状、复杂形状 | 不推荐用于文字，可能裁切文字 |
| 对相邻元素应用 SVG 遮罩 | 带文字的卡片、关键内容 | 文字保持完全可读 |
| 纯 CSS 渐变 | 简单几何形状 | 不推荐用于文字，可能裁切文字 |

---

<a id="implementation"></a>
## 实现
实现异形镂空：

<a id="using-an-svg-mask"></a>
### 使用 SVG 遮罩
SVG 遮罩允许通过白色（显示）和黑色（隐藏）填充定义形状，从可见区域中减去或添加部分。

> **亮度遮罩与 Alpha 遮罩**：SVG 遮罩默认使用**亮度**模式，因此用 `fill="white"` 显示区域，用 `fill="black"` 挖空区域。如果更希望使用 SVG 的透明度，即 Alpha 通道，而非颜色，可在 CSS 中设置 `mask-type: alpha;`，或在 SVG `<mask>` 上设置 `mask-type="alpha"`。

<a id="direct-element-svg-masking"></a>
#### 直接对元素应用 SVG 遮罩
如果元素内部没有需要顾及的文字，例如个人头像、商品图片或插画，可以直接将 SVG 遮罩应用于元素。

在 SVG 遮罩中使用 `maskContentUnits="objectBoundingBox"`，可确保遮罩自动适应任意目标元素的宽高。

```html
<!-- 1. Define the mask in SVG (hidden from view) -->
<svg width="0" height="0" style="position: absolute;" aria-hidden="true">
  <defs>
    <!-- objectBoundingBox makes the mask scale from 0 to 1 along the element's borders -->
    <mask id="splat-mask" maskContentUnits="objectBoundingBox">
      <!-- Organic Bezier path defining an artistic paint splat shape -->
      <path d="M 0.5 0.05 C 0.58 0.05, 0.58 0.21, 0.67 0.18 C 0.76 0.15, 0.79 0.08, 0.85 0.15 C 0.91 0.22, 0.83 0.32, 0.89 0.38 C 0.95 0.44, 1.03 0.45, 0.99 0.55 C 0.95 0.65, 0.82 0.62, 0.8 0.72 C 0.78 0.82, 0.89 0.92, 0.8 0.97 C 0.71 1.02, 0.64 0.88, 0.55 0.93 C 0.46 0.98, 0.44 1.06, 0.35 1.01 C 0.26 0.96, 0.31 0.81, 0.22 0.79 C 0.13 0.77, 0.01 0.88, 0.01 0.77 C 0.01 0.66, 0.16 0.62, 0.14 0.52 C 0.12 0.42, -0.02 0.39, 0.03 0.29 C 0.08 0.19, 0.23 0.27, 0.29 0.19 C 0.35 0.11, 0.3 0.01, 0.4 0.01 C 0.5 0.01, 0.42 0.05, 0.5 0.05 Z" fill="white" />
    </mask>
  </defs>
</svg>

<!-- 2. Apply the mask to the image element -->
<img src="avatar.jpg" alt="User Profile" class="shaped-avatar">

<style>
.shaped-avatar {
  width: 200px;
  height: 200px;
  object-fit: cover;
  
  /* Apply the SVG mask ID with standard and webkit-prefixed properties */
  -webkit-mask-image: url(#splat-mask);
  mask-image: url(#splat-mask);
}
</style>
```


<a id="adjacent-element-svg-masking"></a>
#### 对相邻元素应用 SVG 遮罩
将遮罩应用于相邻元素，而不是包含文字的父元素，确保文字不会被裁切且保持可读。

为此，将组件组织为两部分布局：
1. **安全、无遮挡的文字容器**（`.card-body`），承载全部可读内容。
2. 放在旁边的**空装饰性 `div`**（`.card-accent`），承载自定义 SVG 遮罩。

为两部分指定相同背景色，它们在视觉上就会合并成一个自定义形状的组件。

```html
<!-- 1. Define the SVG mask (hidden from view) -->
<svg width="0" height="0" style="position: absolute;" aria-hidden="true">
  <defs>
    <!-- Use objectBoundingBox to make the mask scale with the element -->
    <mask id="accent-stencil" maskContentUnits="objectBoundingBox">
      <!-- Fill the entire area with white (fully visible) -->
      <rect width="1" height="1" fill="white" />
      <!-- Draw a black shape to cut out a concave curve. Extending the path to x=1.1 guarantees it fully clears the right edge, preventing subpixel lines -->
      <path d="M 1.1,0 C 0.4,0.1 0.4,0.9 1.1,1 L 1.1,0 Z" fill="black" />
    </mask>
  </defs>
</svg>

<!-- 2. Create the unified card layout -->
<div class="unified-card">
  <!-- The text-bearing element remains unmasked and perfectly rectangular -->
  <div class="card-body">
    <h3>Premium Membership</h3>
    <p>Get exclusive weekly updates on modern web standards and premium UI designs.</p>
  </div>
  <!-- The empty accent element next to it is masked to form the custom shape -->
  <div class="card-accent"></div>
</div>

<style>
.unified-card {
  display: flex;
  width: 400px;
  /* Shadow on the parent silhouettes the combined card + masked accent shape */
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.3));
}

.card-body {
  flex: 1;
  background-color: #1e293b; /* Elegant slate color */
  color: #f8fafc;
  padding: 24px;
  border-top-left-radius: 16px;
  border-bottom-left-radius: 16px;
}

.card-accent {
  width: 60px;
  background-color: #1e293b; /* Same background color so they merge visually without seams */
  border-top-right-radius: 16px;
  border-bottom-right-radius: 16px;

  /* Reference the SVG mask */
  -webkit-mask-image: url(#accent-stencil);
  mask-image: url(#accent-stencil);
}
</style>
```


<a id="using-a-single-css-gradient-for-simple-cutouts"></a>
### 使用单个 CSS 渐变实现简单镂空
如果只需要简单几何镂空，例如顶部半圆缺口、侧面凹口或直线斜切，无需编写或引用外部 SVG。可以直接在 `mask-image` 属性中定义 CSS 径向或线性渐变。

```html
<div class="gradient-masked-card">
  <h3>Notched Coupon Card</h3>
  <p>This card uses a pure CSS radial gradient to cut out a semi-circular notch along its top edge.</p>
</div>

<style>
.gradient-masked-card {
  background: linear-gradient(135deg, #2563eb, #1e40af);
  color: white;
  padding: 40px 24px 24px 24px; /* Extra top padding ensures content clears the notch */
  border-radius: 16px;
  text-align: center;

  /* radial-gradient places a circle at 50% (horizontal center) and 0% (top edge), cutting out a 20px transparent notch */
  -webkit-mask-image: radial-gradient(circle at 50% 0%, transparent 20px, black 21px);
  mask-image: radial-gradient(circle at 50% 0%, transparent 20px, black 21px);
}
</style>
```


<a id="fallback-strategies"></a>
## 回退策略
遮罩的 Baseline 状态：广泛可用。自 2023-12-07 起纳入 Baseline。
支持的浏览器：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

如果浏览器不支持 `mask-image` 或带前缀版本：
- **异形图片**：元素会平稳降级，按默认回退样式呈现为普通矩形。
- **异形卡片**：相邻的装饰性 `.card-accent` 元素会保持实心、无遮罩的矩形。由于它与文字容器的背景色相同，整张卡片只会呈现为标准、简洁的矩形容器。
- **渐进增强**：让文字层完全位于遮罩之外，可以保证旧浏览器中的内容依然完整可读、结构清晰且可访问。
