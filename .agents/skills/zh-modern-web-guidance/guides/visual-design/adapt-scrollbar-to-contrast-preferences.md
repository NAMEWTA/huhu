<a id="adapt-scrollbar-to-high-contrast-preferences"></a>
# 让滚动条适应高对比度偏好

在操作系统或浏览器中启用高对比度模式的用户，希望滚动条等界面元素极易辨认。他们通常依靠鲜明的前景与背景区分，而不是微妙的灰色或主题色。

本指南介绍如何使用 CSS 媒体特性 `@media (prefers-contrast: more)`，实施高对比度滚动条样式。

<a id="enhance-legibility"></a>
## 提高辨识度

使用 `scrollbar-color` 或自定义变量定制滚动条时，可以为高对比度模式提供显式覆盖。若应用的主主题为了视觉效果使用较低对比度的滚动条，这尤其有帮助；不过默认滑块相对于轨道仍须至少达到 3:1 的对比度（WCAG 1.4.11 非文本对比度）。

使用 `@media (prefers-contrast: more)` 块，为滑块和轨道定义深色且区分明显的颜色。

```css
/* Define default standard colors as variables */
.scroller {
  --scrollbar-thumb: #707070;
  --scrollbar-track: #f1f1f1;

  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

/* Provide clear, high-contrast overrides */
@media (prefers-contrast: more) {
  .scroller {
    /* Use extremely distinct colors like solid black against white */
    --scrollbar-thumb: #000000;
    --scrollbar-track: #ffffff;
  }
}
```


<a id="issues-to-be-aware-of-when-using-scrollbar-color"></a>
### 使用 scrollbar-color 时需要注意的问题

- 不要为 `scrollbar-color` 设置动画或过渡。[WebKit 的一个缺陷](https://bugs.webkit.org/show_bug.cgi?id=311752)会使滚动条在每次 `scrollbar-color` 变化时闪烁。
- 只要计算后的 `scrollbar-width` 不是 `auto`，而是 `thin` 或 `none`，或计算后的 `scrollbar-color` 不是 `auto`，包括继承得到的 `scrollbar-color`，该元素上的旧式 `::-webkit-scrollbar` 伪元素就会被禁用。
- 对于覆盖式滚动条，例如 macOS 默认样式，`scrollbar-color` 会在滚动期间设置滑块样式，而轨道可能保持透明。确保滑块颜色相对于轨道色和可滚动容器背景都有足够对比度，不要只依赖轨道衬托滑块。

<a id="fallbacks--browser-support"></a>
## 回退与浏览器支持

<a id="fallbacks--browser-support-for-scrollbar-color"></a>
### scrollbar-color 的回退与浏览器支持

scrollbar-color 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持的浏览器：Chrome 121（2024 年 1 月）、Edge 121（2024 年 1 月）、Firefox 64（2018 年 12 月）和 Safari 26.2（2025 年 12 月）。

此特性属于渐进增强，并非总是需要回退。

如果样式很重要，而且用户的 Baseline 目标为“Baseline 广泛可用”或更早版本，应提供非标准的 `::-webkit-scrollbar` 伪元素作为回退。

将旧式回退放在基础规则之后的 `@supports not (scrollbar-color: auto)` 块中，防止在同时原生支持标准属性与旧式 WebKit 选择器的浏览器里发生冲突。如果还在可滚动容器上设置了 `scrollbar-width: thin`，则在 `@supports not (scrollbar-color: auto)` 内，对同一选择器重设 `scrollbar-width: auto`，避免只支持 `scrollbar-width` 而不支持 `scrollbar-color` 的浏览器抑制 `::-webkit-scrollbar` 样式。

如果使用自定义属性定义颜色，它们会自动层叠到旧式 WebKit 选择器，无需重复定义。

```css
/* Legacy fallback for WebKit/Blink browsers */
@supports not (scrollbar-color: auto) {
  .scroller {
    /* Reset scrollbar-width: thin (if set) so it does not disable
       ::-webkit-scrollbar in browsers without scrollbar-color */
    scrollbar-width: auto;
  }

  .scroller::-webkit-scrollbar {
    /* Must define a base size (e.g., 8px for thin or 12px for default) for custom colors to render in WebKit */
    width: 12px;
    height: 12px;
  }

  .scroller::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
  }

  .scroller::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
}
```

