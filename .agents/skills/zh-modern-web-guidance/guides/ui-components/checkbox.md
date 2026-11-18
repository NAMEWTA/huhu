<a id="styling-checkboxes"></a>

# 复选框样式

使用具有语义和无障碍支持的 HTML，让每个复选框关联标签：可将 `<input>` 嵌入 `<label>`，或让标签的 `for` 对应输入框 `id`。

现代 CSS 有两种方式：用 `accent-color` 定制原生外观，或在 `<input type="checkbox">` 上使用 `appearance: none` 覆盖默认呈现。

<a id="native-customization-with-accent-color"></a>

## 用 `accent-color` 定制原生外观

需要简单且符合品牌的样式，同时保留原生渲染、键盘行为、校验和系统焦点指示时，使用 `accent-color`。

```css
.checkbox-native {
  accent-color: #1a73e8;

  /* Sizing is controlled via relative units */
  inline-size: 1.25em;
  aspect-ratio: 1;
  margin: 0;
  cursor: pointer;
}
```

<a id="fully-custom-styling-with-appearance-none"></a>

## 用 `appearance: none` 完全定制

设计需要控制形状、尺寸、状态或指示符时，使用 `appearance: none`。它移除原生视觉样式，但 `<input>` 仍是交互目标。

由于 `appearance: none` 同时移除浏览器默认尺寸，应为 `--checkbox-size`、`--checkbox-icon-size` 设置明确的相对尺寸。图标应小于复选框，为边框和视觉内边距留空间。

```css
/* Reusable SVG assets */
:root {
  --icon-check: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'></polyline></svg>");
  --icon-dash: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'><line x1='5' y1='12' x2='19' y2='12'></line></svg>");
}

/* Custom checkbox */
.checkbox-custom {
  --checkbox-size: 1.25em;
  --checkbox-icon-size: 0.7em;

  appearance: none;
  display: inline-grid;
  place-content: center;
  inline-size: var(--checkbox-size);
  aspect-ratio: 1;
  margin: 0;
  border: 2px solid currentColor;
  cursor: pointer;

  &::before {
    content: "";
    inline-size: var(--checkbox-icon-size);
    aspect-ratio: 1;
    background-color: currentColor;
    mask: var(--checkbox-icon) no-repeat center / contain;
    scale: 0;

    @media (prefers-reduced-motion: no-preference) {
      transition: scale 150ms ease;
    }

    @media (forced-colors: active) {
      background-color: CanvasText;
    }
  }

  &:checked {
    --checkbox-icon: var(--icon-check);
  }

  &:indeterminate {
    --checkbox-icon: var(--icon-dash);
  }

  &:is(:checked, :indeterminate)::before {
    scale: 1;
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
```

<a id="the-indeterminate-state"></a>

## 不确定状态

不确定状态不能通过 HTML 属性设置，需在 JavaScript 中设置 `indeterminate` DOM 属性（`checkbox.indeterminate = true`），并确保 `:indeterminate` 视觉上区别于 `:checked` 和未选中状态：

* **原生（`accent-color`）：** 浏览器会自动使用元素的 `accent-color` 绘制，无需额外 `:indeterminate` CSS。
* **自定义（`appearance: none`）：** 如上例，在 `.checkbox-custom:indeterminate` 上将 `--checkbox-icon` 切为 `var(--icon-dash)`。

```js
const selectAll = document.querySelector("#select-all");
selectAll.indeterminate = true;
```

<a id="accessibility-and-interaction"></a>

## 无障碍与交互

- **应当**使用 `:focus-visible` 而非 `:focus` 设置自定义复选框焦点指示，让键盘导航显示独特轮廓，而指针点击不显示。
- **不要**使用 `outline: none` 或隐藏焦点指示。
- **应当**确保焦点指示与背景对比度至少 `3:1`。
- **应当**确保选中及不确定状态颜色与背景对比度至少 `3:1`。
- **应当**使复选框或其 `<label>` 提供至少 `44px x 44px` 的交互目标，同时可见复选框仍用相对单位定尺寸：
  ```css
  label {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-block-size: 44px;
    cursor: pointer;
  }
  ```
- **应当**提供降低透明度并设置 `cursor: not-allowed` 的 `:disabled` 变体，清楚表达不可用。

<a id="issues-to-be-aware-of-when-using-accent-color"></a>

### 使用 accent-color 时需注意的问题

不同浏览器的 `accent-color` 渲染不同。复选框勾号、单选圆点等通常绘制在强调色背景上的指示符，可能有不同处理：
- **Chromium** 和 **Firefox** 通常选择对比鲜明的指示符颜色。
- **Safari** 可能在浅色模式保留白色指示符，深色模式保留黑色指示符，同时调整背景强调色。这不能保证所有给定颜色都具有足够对比度，因此应在 Safari 测试重要组合，包括浅色、深色方案。不要假定 Safari 会自动选择对比度最佳的指示色。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-accent-color"></a>

### accent-color 的回退与浏览器支持

accent-color 的浏览器支持：有限可用。
支持：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）、Firefox 92（2021 年 9 月）和 Safari 26.2（2025 年 12 月）。

`accent-color` 属于渐进增强。不支持的浏览器会忽略，并使用默认 UI 颜色。

<a id="css-masks"></a>

### CSS Mask

Mask 的 Baseline 状态：广泛可用。自 2023-12-07 起达到 Baseline。
支持：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

