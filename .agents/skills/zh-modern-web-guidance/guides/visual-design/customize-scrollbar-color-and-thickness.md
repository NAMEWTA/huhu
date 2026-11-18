<a id="customize-the-color-or-thickness-of-a-scrollbar"></a>
# 自定义滚动条的颜色或粗细

可以使用标准 CSS 属性 `scrollbar-color` 和 `scrollbar-width` 自定义滚动条外观。

* **`scrollbar-color`**：接受两个 `<color>` 值，第一个用于滑块，即可移动部分；第二个用于轨道，即固定背景。
* **`scrollbar-width`**：接受 `auto`（默认）、`thin`（更细的版本）或 `none`（完全隐藏滚动条，但仍保留滚动能力）。

<a id="apply-scrollbar-color-and-scrollbar-width"></a>
## 应用 `scrollbar-color` 和 `scrollbar-width`

强制要求：在可滚动容器上使用 `scrollbar-color` 和 `scrollbar-width`。

选择相对于轨道颜色至少有 3:1 对比度的滑块颜色。在轨道可能透明的情况下，例如 macOS 覆盖式滚动条，滑块相对于容器背景也应达到该对比度，让用户看清滑块及已经滚动的位置（WCAG 1.4.11 非文本对比度）。

使用 `scrollbar-color` 时，通过 CSS 变量分别保存滑块色和轨道色，以提高可读性和可维护性，尤其是在使用回退方案时。

```css
.scroller {
  --scrollbar-thumb: var(--color-neutral-70);
  --scrollbar-track: var(--color-neutral-90);

  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
```


<a id="fallback-strategies"></a>
## 回退策略

scrollbar-width 的 Baseline 状态：新近可用。自 2024-12-11 起纳入 Baseline。
支持的浏览器：Chrome 121（2024 年 1 月）、Edge 121（2024 年 1 月）、Firefox 64（2018 年 12 月）和 Safari 18.2（2024 年 12 月）。

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

