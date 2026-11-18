<a id="design-token-reactivity"></a>

# 设计令牌的响应性

<a id="background--overview"></a>

## 背景与概述

作者经常需要根据上下文改变组件设计。过去必须使用选择器完成，因此很多设计令牌虽能用自定义属性表示，高阶令牌却只能编码为选择器模式（类名或属性约定），或 JavaScript 框架的 props/context。

**容器样式查询**允许根据祖先元素计算后的自定义属性值为元素设置样式。这样就能在样式表内编写有意义的设计令牌值，不再依赖标记或 JavaScript 表达呈现方式。

<a id="how-to-implement"></a>

## 如何实现

使用容器样式查询实现响应式设计令牌很直接：

1. 将高阶设计令牌作为自定义属性设置在容器上，无需注册该属性。
2. 使用 `@container style()` 查询这个自定义属性的值。
3. 向容器内的后代元素应用相应样式。

注意：

- 样式查询的目标容器不需要设置 `container-type` 或 `container-name`，但设置 `container-name` 可以使查询更明确。
- 容器样式查询不能为被查询的容器自身设置样式。

以下是这些步骤的基本示例。

```html
<div class="features">
  <div class="card"></div>
  <div class="card"></div>
</div>
<div class="bugs">
  <div class="card"></div>
  <div class="card"></div>
  <div class="card"></div>
  <div class="card"></div>
</div>
```

```css
.features {
  --density: spacious;
}

.bugs {
  --density: compact;
}

@container style(--density: compact) {
  .card {
    padding: 8px;
  }
}

@container style(--density: spacious) {
  .card {
    padding: 24px;
  }
}
```

<a id="fallback-strategies"></a>

## 回退策略

容器样式查询的 Baseline 状态：新近可用。自 2026-05-19 起达到 Baseline。
支持：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 151（2026 年 5 月）和 Safari 18（2024 年 9 月）。

在容器样式查询达到 Baseline 支持前，不建议将它用于必须在所有浏览器可用的核心功能，因为很难建立既不削弱其优点、又没有自身限制的回退。例如，如果 UI 密度偏好不属于所有体验中都必须提供的核心功能，就可以不加回退地使用容器样式查询实现它。

<a id="using-selectors-instead"></a>

### 改用选择器

核心功能应采用基于选择器的替代方案。此例使用 `data-density` 属性在标记中编码密度设计令牌，而不是用自定义属性：

```html
<div class="features" data-density="spacious">
  <div class="card"></div>
  <div class="card"></div>
</div>
<div class="bugs" data-density="compact">
  <div class="card"></div>
  <div class="card"></div>
  <div class="card"></div>
  <div class="card"></div>
</div>
```

```css
/* This example uses `:where()` to avoid increasing specificity */
:where([data-density="compact"]) .card {
  padding: var(--card-padding-compact);
}

:where([data-density="spacious"]) .card {
  padding: var(--card-padding-spacious);
}
```

这种回退的主要限制是不能支持带有 `data-density` 属性的嵌套元素，因为选择器特异性相同，最终样式由出现顺序决定（即 `[data-density="spacious"]` 总是优先于 `[data-density="compact"]`）。

<a id="using-style-queries-as-a-progressive-enhancement"></a>

### 将样式查询作为渐进增强

虽然不推荐，但如果希望对核心功能渐进增强地使用样式查询，可以先创建若干自定义属性，再放入样式查询，以避免重复。确保回退方案在选择容器时使用 `:where()`，避免增加特异性。

```css
.card {
  --card-padding-compact: 8px;
  --card-padding-spacious: 24px;
}

:where([data-density="compact"]) .card {
  padding: var(--card-padding-compact);
}

:where([data-density="spacious"]) .card {
  padding: var(--card-padding-spacious);
}

/* Use style queries as a progressive enhancement: same specificity, so order of appearance is used */

@container style(--density: compact) {
  .card {
    padding: var(--card-padding-compact);
  }
}

@container style(--density: spacious) {
  .card {
    padding: var(--card-padding-spacious);
  }
}
```

<a id="feature-checking-with-just-css"></a>

### 仅使用 CSS 检测特性

如果需要检测容器样式查询，并有条件显示依赖它的 UI，可以直接使用样式查询：

```css
:root {
  --style-queries-supported: check;
}

.density-toggle {
  display: none;
}

@container style(--style-queries-supported) {
  .density-toggle {
    display: revert;
  }
}
```

<a id="feature-checking-with-javascript"></a>

### 使用 JavaScript 检测特性

JS 检测稍复杂：`CSSContainerRule` 接口早于容器样式查询存在，因此不能可靠用于此目的。应检查一个通过样式查询设置的已知属性的计算值。

以下使用不会造成视觉影响的自定义属性：

```css
:root {
  --style-queries-supported: check;
}

@container style(--style-queries-supported: check) {
  body {
    --style-queries-supported: yes;
  }
}
```

然后在 JavaScript 中检查计算值：

```js
if (getComputedStyle(document.body).getPropertyValue("--style-queries-supported") === "yes") {
  // Use container style queries
} else {
  // Use fallback strategy
}
```

