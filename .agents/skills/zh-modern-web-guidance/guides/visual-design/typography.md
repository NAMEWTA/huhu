<a id="typography"></a>
# 字体排版

<a id="overall-best-practices"></a>
## 通用最佳实践

- `line-height` 使用无单位数值，例如 `1.5`，确保字号继承时按比例缩放。
- 使用 `overflow-wrap: break-word` 或 `anywhere`，容纳较长的 URL。
- **不要**用 `px` 设置字号。优先使用 `rem`，尊重用户的浏览器字号偏好，即根字号；或使用 `em`/百分比，根据上下文定尺寸。
- **不要**为包含文字的元素设置固定 `height` 或 `block-size`，例如按钮、徽章、标签页和卡片。让内容决定高度，需要最小值时使用 `min-block-size`。这样，用户将行高增至 1.5、段后间距增至 2em、字母间距增至 0.12em、单词间距增至 0.16em 时，文字不会溢出或被裁切；WCAG 1.4.12 文字间距要求在这些值下不丢失内容或功能。

<a id="readability"></a>
## 可读性

- **避免过长的文字行**：将段落块宽度限制为最多 80 个字符。
- **避免空白形成“河流”**：避免 `text-align: justify`，它可能使文字更难阅读。如果必须使用，配合 `hyphens: auto`，避免单词间空白过大。`hyphens: auto` 只对通过 `lang` 声明了语言的文字进行断词，例如 `<html lang="en">`。
- **不要使用过度装饰的字体**：主要阅读内容不要采用花体字。
- **不要依赖全部大写来强调**：视觉强调优先加粗，语义强调则使用 `<em>`/`<strong>`。
- **总体上限制强调**：到处强调就会失去意义；只有需要改变内容阅读方式的地方，才应用强调。
- **支持用户缩放偏好**：允许用户将文字放大至 200%，且不丢失内容或功能；让文字在 320 CSS px 的视口宽度下重排，无需横向滚动（WCAG 1.4.10 重排）。避免对连续正文使用 `white-space: nowrap` 和固定宽度。

```css
body {
  line-height: 1.5;
  text-align: start; /* Supports LTR and RTL */
}
article {
  max-width: 60ch; /* Caps line length to ~80 characters for readability (1ch is the width of "0", which is wider than most characters) */
}
```


<a id="text-wrapping"></a>
## 文字换行

- 对标题及类似标题的内容，例如 `<th>`，使用 `text-wrap: balance`，使各行均衡。
- 对段落、引用块等长篇正文使用 `text-wrap: pretty`。
- 有针对性地使用 `text-wrap: balance` 或 `text-wrap: pretty`，**不要**应用到 `*`，因为它确实有性能成本。
- 避免对有可见盒子的元素使用 `text-wrap: balance`，例如带背景、边框或阴影的元素。它不会改变容器宽度，只影响文字在该宽度*内部*的换行方式，可能在容器末尾留下通常不希望出现的空白。

<a id="responsive-typography"></a>
## 响应式字体排版

- **应当**在 `clamp()` 中结合视口相对单位和字体相对单位，使字号随视口大小变化，同时保持在指定范围内。例如 `clamp(2rem, 1rem + 5vw, 4rem)`。调整两类单位的比例，可控制字号变化速度。使用字体相对单位设置最小和最大值，且最大值不超过最小值的 2.5 倍。用户缩放时，视口单位不会随之增大，因此只有字号最小值超过基于视口的值后，文字才会增大；当最大值不超过最小值的 2.5 倍时，最高可达 500% 的浏览器缩放，仍能让文字放大至 200%。WCAG 1.4.4 调整文字大小要求文字可放大至 200%，且不丢失内容或功能。
- **不要**脱离 `clamp()`，仅使用 `vw` 设置字号，否则文字可能在极端屏幕尺寸下过小或过大。
