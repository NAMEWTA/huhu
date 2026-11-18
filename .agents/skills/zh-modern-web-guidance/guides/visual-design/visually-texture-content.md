<a id="visually-texture-content"></a>
# 为内容添加视觉纹理

<a id="overview"></a>
## 概述
要为元素添加真实的做旧效果或纹理，例如污渍、噪点或纸张纹理，使用 CSS 遮罩（`mask-image`）配合重复纹理图片。它通过让内容的部分区域半透明，使内容本身呈现纹理，而不仅是在上方叠加纹理，因此能营造更真实的物理材质外观。

<a id="implementation"></a>
## 实现
应用纹理图案：

<a id="method-1-using-a-repeating-raster-image-recommended-for-realistic-textures"></a>
### 方法 1：使用重复的栅格图像（真实纹理的推荐方式）
这是制作真实纹理最常见的方法。

```css
.weathered-element {
  /* MANDATORY: Use vendor prefix for wider support in older browsers */
  -webkit-mask-image: url('grunge-pattern.png');
  -webkit-mask-repeat: repeat; /* Repeat the pattern to fill the area */
  -webkit-mask-size: 300px; /* Control the scale of the texture */

  /* Standard property for modern browsers */
  mask-image: url('grunge-pattern.png');
  mask-repeat: repeat;
  mask-size: 300px;
}
```


<a id="method-2-using-css-gradients-for-geometric-patterns"></a>
### 方法 2：使用 CSS 渐变生成几何图案
可以使用 CSS 渐变生成图案。该方法自包含，无需外部图片文件。

```css
.patterned-element {
  --checkerboard-gradient: 
    linear-gradient(45deg, #000 25%, transparent 25%), 
    linear-gradient(-45deg, #000 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #000 75%), 
    linear-gradient(-45deg, transparent 75%, #000 75%);

  /* Apply a checkerboard pattern as a mask */
  -webkit-mask-image: var(--checkerboard-gradient);
  -webkit-mask-size: 20px 20px;
  -webkit-mask-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  
  mask-image: var(--checkerboard-gradient);
  mask-size: 20px 20px;
  mask-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}
```


<a id="alpha-vs-luminance-masking-modes"></a>
### Alpha 与亮度遮罩模式

默认情况下，CSS 遮罩使用 `mask-mode: match-source`。这意味着浏览器根据提供的源类型，自动决定使用遮罩的 **Alpha 通道**（透明度）还是**亮度**：

| 遮罩源类型 | 默认遮罩模式 | 遮罩行为 |
| :--- | :--- | :--- |
| **内联 SVG `<mask>` 元素** | `luminance` | 由颜色亮度决定不透明度。**白色**显示内容，**黑色**隐藏内容，**灰色**产生半透明。 |
| **直接图片文件**，例如 PNG、SVG 文件 | `alpha` | 由透明度决定不透明度。**不透明**部分显示内容，**透明**部分隐藏内容。 |
| **CSS 渐变** | `alpha` | 由透明度决定不透明度。**不透明**颜色，例如 `black`，显示内容；**透明**颜色隐藏内容。 |

> [!NOTE]
> 可以通过 CSS 的 `mask-mode` 属性显式覆盖默认遮罩模式，例如 `mask-mode: luminance;` 或 `mask-mode: alpha;`。

<a id="fallback-strategies"></a>
## 回退策略
遮罩的 Baseline 状态：广泛可用。自 2023-12-07 起纳入 Baseline。
支持的浏览器：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

如果浏览器不支持 `mask-image` 或带前缀版本：
- 元素将不带纹理显示，呈现干净、实心的填充。
- 确保没有纹理时，内容依然可读，即采用渐进增强。
- 可以用背景图片或覆盖层模拟纹理作为回退，但这不会影响内容本身的透明度。

```css
/* Fallback: Use a background image for browsers without mask support */
@supports (not (mask-image: url(x))) and (not (-webkit-mask-image: url(x))) {
  .weathered-element {
    /* Fallback adds texture on top or behind, depending on implementation */
    background-image: url('grunge-pattern.svg');
    background-color: #fff; /* Ensure background is solid if needed */
  }
}
```

