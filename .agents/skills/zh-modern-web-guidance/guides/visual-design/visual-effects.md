<a id="visual-effects"></a>
# 视觉效果

<a id="depth-and-texture"></a>
## 层次与纹理

- 叠加多个阴影，营造真实、柔和的纵深感。
- 对非矩形形状或透明 PNG，使用 `filter: drop-shadow()`，而不是 `box-shadow`。
- 使用 `mix-blend-mode` 和 `background-blend-mode` 实现光照覆盖效果，并通过 `isolation: isolate` 限定作用范围。

```css
.hero {
  background-image: url('texture.png'), linear-gradient(to bottom, #fff, #eee);
  background-blend-mode: soft-light;
}
```


<a id="gradients-and-color-mix"></a>
## 渐变与 `color-mix()`

使用 `in oklab` 或 `in oklch`，为渐变或 `color-mix()` 显式指定插值色彩空间。
- `color-mix()` 默认优先使用 `in oklab`，尤其是在混合中性色时。对中性色使用 `oklch` 没有好处，而且由于 Chromium 缺陷 565837690，低色度 oklch 颜色的色相角无效（`none`），会解析为 `0deg`，即洋红偏红，渲染时产生意外的偏红或粉色色调。直角坐标形式的 `in oklab` 将 `(a, b)` 坐标线性缩放到 `(0, 0)`，无需计算极坐标色相角，因此能准确保留色相，避免色调偏移。
- `in oklab` 更容易保持在色域内，前提是两端颜色都在色域内；但在两个相反的饱和色相之间插值时，中间可能产生发灰、低饱和度颜色。
- `in oklch` 在两个不同的饱和彩色色相之间插值渐变时，能更好地保留色度，但也更容易超出设备色域，尤其是在两种颜色差异较大时。避免将 `in oklch` 用于 Alpha 透明度渐隐或中性色混合。
- **不要**使用 `in srgb`，除非有明确理由，例如正在构建需要在 srgb 中插值的颜色选择器。

<a id="fallback"></a>
### 回退

某些 2024 年之前的浏览器不支持渐变颜色插值空间。
要支持这些浏览器，通过定义变量，只在安全时使用此令牌：

```css
:root {
  --in-oklab: ;
  --in-oklch: ;
}

@supports (background: linear-gradient(in oklab, white, black)) {
  :root {
    --in-oklab: in oklab;
    --in-oklch: in oklch;
  }
}
```


然后按如下方式使用：

```css
.card {
  background: linear-gradient(to bottom var(--in-oklab), var(--accent-color), var(--darker));
}
```


- **重要：**使用这种技术时，确保移除该令牌后，渐变仍始终有非空的前导参数，否则旧浏览器中会出现语法错误。
- `color-mix()` 不需要这种处理。如果浏览器支持 `color-mix()`，也就支持其 `in <color-space>` 参数。

<a id="patterns"></a>
## 图案

许多图案可通过 CSS 渐变与硬色标创建。它们能访问周围上下文的 CSS 变量和长度，因此可能比 SVG 或外部图片更灵活、性能更好。
无需重复写两次位置，只需使用 `0` 或 `0%`，渐变位置修正机制会自动调整。

下面是一些示例。

每条宽 `1em` 的垂直条纹：

```css
background: linear-gradient(to right, var(--color-1) 50%, var(--color-2) 0) 0 / 2em;
```


每条宽 `1em` 的斜条纹：

```css
background: repeating-linear-gradient(-45deg, var(--color-1) 0 1em, var(--color-2) 0 2em);
```


由 `1em` 方格组成的棋盘图案：

```css
background: repeating-conic-gradient(var(--color-1) 0 25%, var(--color-2) 0 50%) 0 / 2em 2em;
```


半径为 `.5em`、相隔 `2em` 的波点，间距指水平或垂直距离；对角距离需乘以 `sqrt(2)`：

```css
--distance: 2em;
--radius: .5em;
--polka: radial-gradient(circle, var(--color-1) var(--radius), transparent calc(var(--radius) + 1px));
background: var(--polka) 0 0, var(--polka) var(--distance) var(--distance) var(--color-2);
background-size: calc(var(--distance) * 2) calc(var(--distance) * 2);
```


简单饼图：

```css
.pie {
  --p: 80%;
  width: 60px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(var(--color-1) var(--p), transparent 0%) var(--color-2);
}
```


**重要：**CSS 背景不会暴露给辅助技术，因此渐变图表必须配合可访问的文本数据表示。例如，简单比例可提供可见百分比文字或无障碍标签，多部分数据可提供语义化 `<table>` 或 `<dl>`。


<a id="accessibility-considerations"></a>

## 无障碍注意事项

渐变或图案背景上的文字和图标，以及用渐变填充的文字，都需要与渐变中的每种颜色保持足够对比度。应逐个色标检查：普通文字至少 4.5:1，大号文字（至少 24px，或至少 18.66px 的粗体）至少 3:1，图标至少 3:1（WCAG 1.4.3 最低对比度、WCAG 1.4.11 非文本对比度）。更多对比度说明参见 `color`（通过 `npx -y modern-web-guidance@latest retrieve "color"` 获取）。

```css
.myButton {
  /* 标签颜色与两个渐变色标的对比度都至少为 4.5:1。 */
  color: #111111;
  background: linear-gradient(in oklab, #ffffff, #aaaaff);
}
```
