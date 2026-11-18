<a id="child-state-based-styling"></a>

# 根据子元素状态设置样式

过去 CSS 选择器只能向下匹配：可以根据父元素为子元素设置样式，却不能反过来。`:has()` 伪类改变了这一点，让你根据后代元素的存在或状态，有条件地为容器设置样式。

结合 `:has()` 与状态伪类（如 `:checked`、`:focus`、`:valid`、`:invalid` 或 `:not()`），可以完全通过 CSS 构建复杂交互 UI，无需 JavaScript 在父元素上切换 `.is-active`、`.has-error` 等修饰类。

这特别适合需要响应内部交互的组件，例如随复选框（`:checked`）变化的局部主题切换、突出错误（`:invalid`）的表单组，或子链接获得焦点（`:focus-within`）时抬升的卡片。

<a id="implementing-state-based-container-styling"></a>

## 实现基于状态的容器样式

**强制要求**：必须在容器元素上使用 `:has()` 选择器，检测交互子元素的具体状态（例如 `:checked`、`:focus`、`:invalid`）。

构建根据子元素状态改变样式的组件：

1. **定义默认样式**：在容器上设置 CSS 变量，定义基础状态。
2. **应用基于状态的覆盖**：使用 `:has([child-selector]:[state])` 选择容器，为活动或替代状态重新定义 CSS 变量。

*示例：根据子级开关改变主题的组件。*

```css
/* 1. Define the default state on the component container */
.theme-card {
  /* Using custom properties makes state-switching cleaner */
  --card-bg: #ffffff;
  --card-text: #333333;
  --card-border: #cccccc;

  background-color: var(--card-bg);
  color: var(--card-text);
  border: 1px solid var(--card-border);

  /* Use a transition for smooth state changes */
  transition: background-color 0.3s, color 0.3s;
}

/* 2. Apply styles when the child enters the specific state */
/* MANDATORY: Target the container and use :has() to check the descendant's state */
.theme-card:has(.theme-toggle:checked) {
  /* Override the properties for the active or alternate state */
  --card-bg: #222222;
  --card-text: #f0f0f0;
  --card-border: #555555;
}
/* You can also combine :has() and :not() to target specific negative states */
/* This selects a card that DOES NOT have a toggle in the checked state */
.theme-card:not(:has(.theme-toggle:checked)) {
  /* Optional: Explicit styles for the unchecked state if needed */
}
```

```html
<!-- The container element that receives the styling -->
<div class="theme-card">
  <!-- The child element whose state controls the parent -->
  <label>
    <input type="checkbox" class="theme-toggle">
    Enable Dark Mode
  </label>

  <h2>Card Title</h2>
  <p>The style of this entire card is controlled by the checkbox above.</p>
</div>
```

**性能提示**：使用 `:has()` 时，将选择器限定到尽可能具体的容器（例如 `.theme-card`）。如果样式变化是局部的，避免以 `body:has(...)` 等高层元素作锚点，因为宽泛的 `:has()` 查询可能触发更多布局重新计算。

<a id="fallback-strategies"></a>

## 回退策略

:has() 的 Baseline 状态：广泛可用。自 2023-12-19 起达到 Baseline。
支持：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 121（2023 年 12 月）和 Safari 15.4（2022 年 3 月）。

如果基于状态的样式对用户体验或页面布局至关重要，必须为不支持 `:has()` 的浏览器提供回退。纯装饰效果可以将 `:has()` 作为无需回退的渐进增强。

**强制要求**：为关键功能实现回退时，必须在 CSS 中使用 `@supports not selector(:has(*))` 定义传统的基于类的回退。如果关键状态变化依赖用户交互，还必须通过包含 `CSS.supports()` 的小型内联脚本，根据对应的 JavaScript 事件（例如 `change`、`focus`、`blur`）切换该类。

```css
/* Fallback CSS for older browsers */
/* We check if the browser DOES NOT support the :has() selector */
@supports not selector(:has(*)) {
  /* Define a traditional modifier class that applies the exact same overrides */
  .theme-card.is-active {
    --card-bg: #222222;
    --card-text: #f0f0f0;
    --card-border: #555555;
  }
}
```

```javascript
/* Fallback JavaScript for older browsers */
/* Check for support before running the script to avoid unnecessary work in modern browsers */
if (!CSS.supports('selector(:has(*))')) {
  const toggle = document.querySelector('.theme-toggle');
  const card = document.querySelector('.theme-card');

  if (toggle && card) {
    // Manually toggle the fallback class when the input state changes
    toggle.addEventListener('change', (e) => {
      card.classList.toggle('is-active', e.target.checked);
    });
  }
}
```

