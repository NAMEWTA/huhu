<a id="animate-to-intrinsic-sizes"></a>

# 过渡到内在尺寸

过去，将元素以动画方式变化到 `block-size: auto` 或 `inline-size: max-content` 等动态尺寸，需要 JavaScript 或脆弱的“max-height”技巧。`interpolate-size` 属性和 `calc-size()` 函数让浏览器能够原生地在固定长度与内在尺寸关键字之间插值。

<a id="implementation-steps"></a>

## 实现步骤

1. **启用关键字插值**：在父元素（通常是 `:root`）上应用 `interpolate-size: allow-keywords`，为使用内在尺寸关键字的属性启用过渡。
2. **定义过渡**：在目标元素上为尺寸属性（例如 `block-size`、`inline-size`）设置 `transition`。
3. **使用内在尺寸关键字**：交互时（例如 `:hover` 或状态类）将尺寸属性改为受支持的内在尺寸关键字：`auto`、`min-content`、`max-content`、`fit-content`，或用于 flex-basis 的 `content`。
4. **执行计算（可选）**：需要对内在尺寸作数学计算（例如 `auto + 2rem`）时使用 `calc-size()`。`calc-size()` 也支持 `any` 关键字，用于不依赖具体基准的计算。

<a id="example-generic-expansion-pattern"></a>

## 示例：通用展开模式

可以将此模式用于任意容器（例如“显示更多”区域或导航菜单），在受限高度与元素自然尺寸之间过渡。

```css
/* Opt-in globally for all children */
:root {
  /* MANDATORY: Transitions to intrinsic keywords are disabled by default for compatibility */
  interpolate-size: allow-keywords;
}

.expandable-container {
  /* 1. Define a fixed initial size (or 0) and hide overflow */
  block-size: 100px;
  overflow: hidden;
  
  /* 2. Transition the sizing property */
  transition: block-size 0.4s ease-out;
}

.expandable-container.is-expanded {
  /* 3. Smoothly animate to the intrinsic natural height */
  block-size: auto;
}
```

<a id="example-calculated-intrinsic-inline-size"></a>

## 示例：计算内在 inline-size

```css
.badge {
  inline-size: 40px;
  overflow: hidden;
  white-space: nowrap;
  transition: inline-size 0.3s ease;
}

.badge:is(:hover, :focus-visible) {
  /* calc-size(basis, calculation) */
  /* 'size' refers to the evaluated basis (max-content in this case) */
  inline-size: calc-size(max-content, size + 20px);
}
```

<a id="example-transition-from-intrinsic-to-fixed"></a>

## 示例：从内在尺寸过渡到固定尺寸

也可以反向动画：从自然尺寸开始，收缩到特定长度。这适用于可关闭组件。

```css
.collapsible-alert {
  /* 1. Start with the natural content height */
  block-size: auto;
  overflow: hidden;
  transition: block-size 0.5s ease-in-out, opacity 0.5s ease;
}

.collapsible-alert.is-dismissed {
  /* 2. Smoothly collapse to zero */
  block-size: 0;
  opacity: 0;
  pointer-events: none;
}

/* MANDATORY Copy-Paste Safety: Disable sizing animations for sensitive users */
@media (prefers-reduced-motion: reduce) {
  .expandable-container,
  .badge,
  .collapsible-alert {
    transition: none !important;
  }
}
```

```javascript
// MANDATORY Accessibility Synchronization: Ensure elements collapsed to zero dimensions are removed from the assistive technology tree, and sync aria-expanded states on triggers.
const alertElement = document.querySelector('.collapsible-alert');
function dismissAlert() {
  alertElement.classList.add('is-dismissed');
  // Waits for the transitions the class starts, ignoring any other animations
  // on the element; under reduced motion there are none
  const transitions = alertElement.getAnimations().filter((animation) => animation instanceof CSSTransition);
  Promise.allSettled(transitions.map((transition) => transition.finished)).then(() => {
    if (alertElement.classList.contains('is-dismissed')) {
      alertElement.hidden = true;
    }
  });
}

// Example trigger syncer
const triggerBtn = document.querySelector('.accordion-trigger');
triggerBtn?.addEventListener('click', () => {
  const isExpanded = triggerBtn.getAttribute('aria-expanded') === 'true';
  triggerBtn.setAttribute('aria-expanded', !isExpanded);
});
```

<a id="key-constraints"></a>

## 关键约束

* **关键字到关键字的限制**：不能直接在两个不同关键字之间动画（例如从 `min-content` 到 `max-content`）。过渡的一端必须是固定长度或百分比（例如从 `0` 到 `auto`）。
* **Calc-size 语法**：不能在同一个 `calc-size()` 表达式中混合不同的内在尺寸关键字。第一个参数（基准）定义 `size` 的含义。
* **需要明确启用**：为了保持向后兼容，默认禁用到内在尺寸关键字的过渡（`numeric-only`）。必须在元素或祖先上应用 `interpolate-size: allow-keywords`。`calc-size()` 则作为属性级覆盖，只要使用就自动启用插值。

<a id="fallback-strategies"></a>

## 回退策略

interpolate-size 的浏览器支持：有限可用。
支持：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

calc-size() 的浏览器支持：有限可用。
支持：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

`interpolate-size` 和 `calc-size()` 属于渐进增强。不支持的浏览器会立即跳到目标尺寸。

* **优雅降级**：对于简单的 `block-size: auto` 过渡，常规浏览器会立即切换尺寸，功能仍可用，只是效果不够平滑。
* **手动关键字回退**：使用 `calc-size()` 时，始终为旧浏览器提供标准关键字回退，因为旧浏览器会丢弃整条 `calc-size()` 声明。

```css
.card {
  block-size: auto; /* Fallback for older browsers */
  block-size: calc-size(auto, size); /* Modern browsers use this */
  transition: block-size 0.3s ease;
}
```

