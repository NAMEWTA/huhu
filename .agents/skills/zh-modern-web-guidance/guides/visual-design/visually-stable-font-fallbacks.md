<a id="visually-stable-font-fallbacks"></a>
# 保持视觉稳定的字体回退

Web 字体加载后，经常会替换尺寸不同的回退字体，即使两者设置了相同的 `font-size`。这会造成布局偏移（累计布局偏移，Cumulative Layout Shift）；如果回退字体的小写字母高度，即 x-height，与首选字体差异很大，还会使文字难以辨认。

`font-size-adjust` 根据特定度量，通常是 x-height，规范化字体大小，从而保证无论当前使用哪种字体，文字都占据相同的视觉空间。

<a id="implementation-steps"></a>
## 实施步骤

<a id="1-identify-the-aspect-ratio-of-your-preferred-font"></a>
### 1. 确定首选字体的比例值
要规范化回退字体，需要知道主字体的“比例值”，即小写字母高度与字号的比值。

* **自动发现（推荐）：**使用 `from-font` 关键字，让浏览器从主要 Web 字体提取该比例。
* **手动计算：**如果知道具体数值，例如 Verdana 的 0.545，可以直接提供，以便更精确地控制。

<a id="2-apply-font-size-adjust-to-the-text-container"></a>
### 2. 对文字容器应用 font-size-adjust
将该属性应用于元素或其父容器。这样，当主字体加载失败或仍在加载时，回退字体会缩放以匹配主字体的视觉大小。

```css
.text-content {
  /* Define your font stack as usual */
  font-family: "MyWebFont", "Arial", sans-serif;
  font-size: 1rem;

  /* MANDATORY: Normalize the font size based on the primary font's x-height.
     This ensures that if 'Arial' is used as a fallback, it is scaled 
     to match the x-height of 'MyWebFont'. */
  font-size-adjust: from-font;
}
```


<a id="3-optional-adjust-for-specific-metrics"></a>
### 3. 可选：根据特定度量调整
虽然 x-height 是默认且最常见的度量，也可以使用其他度量进行规范化，例如适合全大写标题的 `cap-height`，或适合等宽字体的 `ch-width`。

```css
h1 {
  /* Normalize based on the height of capital letters */
  font-size-adjust: cap-height from-font;
}
```


<a id="4-verify-visual-stability"></a>
### 4. 验证视觉稳定性
确保 `font-size-adjust` 值正确对齐回退字体。可以临时阻止 Web 字体加载，或在浏览器 DevTools 中调整 `font-family` 声明，检查文字布局是否保持稳定。

<a id="fallback-strategies"></a>
## 回退策略

font-size-adjust 的 Baseline 状态：新近可用。自 2024-07-25 起纳入 Baseline。
支持的浏览器：Chrome 127（2024 年 7 月）、Edge 127（2024 年 7 月）、Firefox 118（2023 年 9 月）和 Safari 17（2023 年 9 月）。

在不支持 `font-size-adjust` 的浏览器中，字体按默认比例渲染，可能在字体切换期间造成布局偏移或可读性变化。

不使用 `font-size-adjust` 时，可以通过 `@font-face` 描述符 `size-adjust`、`ascent-override` 和 `descent-override` 手动调校回退字体来缓解，但计算它们比单个 `font-size-adjust` 值更复杂。
