<a id="brand-consistent-forms"></a>
# 与品牌一致的表单

过去，自定义复选框和单选按钮等标准 HTML 表单元素一直比较困难。开发者通常只能在使用浏览器默认外观和从头构建自定义组件之间选择。创建自定义控件耗时，而且很容易造成无障碍问题或遗漏状态，例如复选框的不确定状态。

CSS 属性 `accent-color` 提供了一种简单方式：仅用一行 CSS 就能把品牌色应用到内置 HTML 表单输入控件，同时保留无障碍能力和浏览器内置功能。

<a id="how-to-implement"></a>
## 如何实现

为表单控件应用品牌色时：

1. **确定品牌色：** 选择一种代表品牌的颜色。
2. **应用 `accent-color` 属性：** 在 CSS 中为元素或容器元素（如 `body` 或某个表单）添加 `accent-color`。
3. **支持深色模式（可选，但推荐）：** 使用 `color-scheme` 告知浏览器站点支持深色模式；必要时调整 `accent-color`，以获得更好的对比度。

<a id="example-code-brand-consistent-form-controls"></a>
## 代码示例：与品牌一致的表单控件

```css
:root {
  --brand-color: #6200ee;
}

/* Apply accent-color to the body or a specific container */
body {
  accent-color: var(--brand-color);
}

/* Optional: Adjust for dark mode if needed */
@media (prefers-color-scheme: dark) {
  :root {
    --brand-color: #bb86fc; /* A lighter shade for dark mode */
  }
}
```

```html
<form>
  <!-- Checkbox -->
  <label for="subscribe">
    <input type="checkbox" id="subscribe" checked>
    Subscribe to newsletter
  </label>

  <!-- Radio Buttons -->
  <label for="plan-monthly">
    <input type="radio" id="plan-monthly" name="plan" value="monthly">
    Monthly
  </label>
  <label for="plan-yearly">
    <input type="radio" id="plan-yearly" name="plan" value="yearly" checked>
    Yearly
  </label>

  <!-- Range Slider -->
  <label for="volume">Volume:</label>
  <input type="range" id="volume" min="0" max="100" value="70">

  <!-- Progress Bar -->
  <label for="file">Upload Progress:</label>
  <progress id="file" max="100" value="70">70%</progress>
</form>
```

<a id="strategic-implementation--best-practices"></a>
## 实施策略与最佳实践

- **应当**使用 `accent-color`，轻松为表单控件应用与品牌一致的主题。
- **不要**盲目信任浏览器会正确处理对比度。虽然浏览器理应自动确定合适的对比颜色，但 **Safari**（WebKit 缺陷 244233）和 **Android Chrome**（Chromium 缺陷 343503163）等实现中存在已知问题，可能无法反转勾选标记的颜色。在颜色与背景对比不足时，例如浅色模式下使用浅色或深色模式下使用深色，控件可能变得不可见或难以辨认。
- **应当**结合 `accent-color` 与 `color-scheme: light dark`，确保表单控件在浅色和深色主题下都有良好外观。
- **不要**使用过于接近背景的颜色。尽管浏览器会尝试保证对比度，最好仍提供本身具有良好对比度的颜色，与背景的对比度至少达到 `3:1`。
- **不要**假定 `accent-color` 适用于所有表单元素。目前它仅为 `checkbox`、`radio`、`range` 和 `progress` 元素着色。

<a id="fallback-strategy"></a>
## 回退策略

accent-color 的浏览器支持：可用性有限。
支持：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）、Firefox 92（2021 年 9 月）和 Safari 26.2（2025 年 12 月）。

在不支持 `accent-color` 的浏览器中，表单控件会回退为浏览器的默认外观。为在所有环境中保持完整的品牌一致性和较高可靠性，**必须**使用成熟的“视觉隐藏输入控件”技术实现自定义回退策略。

<a id="progressive-enhancement-with-supports-not"></a>
### 使用 `@supports not` 渐进增强

**必须**使用 `@supports not` 规则，仅在不支持 `accent-color` 时应用自定义回退样式。这样既能在现代浏览器中利用 `accent-color` 的简洁性，又能让旧浏览器获得一致的品牌体验。

<a id="1-html-structure"></a>
#### 1. HTML 结构
确保标签中的文本包裹在 `<span>` 内，以便使用 CSS 兄弟选择器：
```html
<label for="subscribe-fallback">
  <input type="checkbox" id="subscribe-fallback" class="visually-hidden" checked>
  <span>Subscribe to newsletter</span>
</label>
```

<a id="2-css-fallback"></a>
#### 2. CSS 回退
在 `@supports not` 块中应用自定义样式：
```css
/* Fallback for older browsers without accent-color */
@supports not (accent-color: var(--brand-color)) {
  /* Visually hide the native input using the canonical accessible recipe */
  form input[type="checkbox"].visually-hidden {
    position: absolute !important;
    clip-path: inset(50%) !important;
    overflow: hidden !important;
    width: 1px !important;
    height: 1px !important;
    margin: -1px !important;
    padding: 0 !important;
    border: 0 !important;
    white-space: nowrap !important;
  }

  /* Style the wrapper label */
  label {
    position: relative;
    padding-left: 2rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  /* Custom box for checkbox */
  input[type="checkbox"] + span::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 1.2rem;
    height: 1.2rem;
    border: 2px solid #ccc;
    background: white;
    border-radius: 4px;
    box-sizing: border-box;
    transition: all 0.2s ease;
  }

  /* Ensure custom checkbox shows focus for keyboard users */
  input[type="checkbox"]:focus-visible + span::before {
    outline: 2px solid #000;
    outline-offset: 2px;
  }

  /* Checked State */
  input[type="checkbox"]:checked + span::before {
    background-color: var(--brand-color, #6200ee);
    border-color: var(--brand-color, #6200ee);
  }

  /* Checkmark (Unicode) */
  input[type="checkbox"]:checked + span::after {
    content: "✓";
    position: absolute;
    left: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    color: white;
    font-weight: bold;
    font-size: 0.9rem;
  }

  /* Fallback for Range Slider */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
  }

  /* Webkit (Chrome, Safari, Edge) */
  input[type="range"]::-webkit-slider-runnable-track {
    width: 100%;
    height: 8px;
    /* Use gradient to show progress for a static value (e.g., 70%) or update with JS */
    background: linear-gradient(to right, var(--brand-color, #6200ee) 70%, #ccc 70%);
    border-radius: 4px;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--brand-color, #6200ee);
    cursor: pointer;
    margin-top: -4px; /* Center vertically */
  }

  /* Firefox */
  input[type="range"]::-moz-range-track {
    width: 100%;
    height: 8px;
    background: #ccc;
    border-radius: 4px;
  }

  input[type="range"]::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--brand-color, #6200ee);
    cursor: pointer;
  }

  /* Firefox specific progress bar */
  input[type="range"]::-moz-range-progress {
    background-color: var(--brand-color, #6200ee);
    height: 8px;
    border-radius: 4px;
  }

  /* Fallback for Progress Bar */
  progress {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    border: none;
    background: #ccc;
    height: 8px;
    border-radius: 4px;
  }

  progress::-webkit-progress-bar {
    background-color: #ccc;
    border-radius: 4px;
  }

  progress::-webkit-progress-value {
    background-color: var(--brand-color, #6200ee);
    border-radius: 4px;
  }

  progress::-moz-progress-bar {
    background-color: var(--brand-color, #6200ee);
    border-radius: 4px;
  }
}
```

<a id="dynamic-range-progress-in-webkit-fallback"></a>
### Webkit 回退方案中的动态滑块进度

要让 Webkit 浏览器中的范围滑块进度填充随滑块移动（在不使用 `accent-color` 时），可以结合 CSS 变量与少量 JavaScript。

1. **更新 CSS：** 用 CSS 变量指定渐变停止位置：
```css
input[type="range"]::-webkit-slider-runnable-track {
  background: linear-gradient(to right, var(--brand-color) var(--progress, 0%), #ccc var(--progress, 0%));
}
```

2. **添加 JavaScript：** 在 `input` 事件中更新该变量：
```javascript
if (!CSS.supports('accent-color')) {
  const slider = document.getElementById('volume');
  slider.addEventListener('input', (e) => {
    e.target.style.setProperty('--progress', `${e.target.value}%`);
  });
}
```
