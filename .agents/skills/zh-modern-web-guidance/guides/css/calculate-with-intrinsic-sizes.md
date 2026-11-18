<a id="calculate-with-intrinsic-sizes"></a>

# 对内在尺寸进行计算

`calc-size()` 是用于对 `auto`、`min-content`、`fit-content` 等内在尺寸关键字执行数学运算的 CSS 函数。**强制要求**：只有需要通过计算或约束修改内在尺寸时才使用 `calc-size()`；简单的关键字动画（例如从 `0` 到 `auto`）必须使用 `interpolate-size: allow-keywords`。

<a id="implementation-steps"></a>

## 实现步骤

1. **确定内在尺寸基准**：确定哪个内在尺寸关键字（`auto`、`min-content` 等）作为计算基准。
2. **定义约束**：在第二个参数中使用 `clamp()`、`min()` 或 `max()` 等 CSS 数学函数，对内在尺寸施加设计约束。
3. **强制要求：提供回退**：在使用 `calc-size()` 的属性之前，始终紧接着声明标准尺寸关键字或长度，确保不支持它的浏览器中布局仍可用。
4. **采用逻辑属性**：默认使用 `inline-size`、`block-size` 等逻辑属性，使计算遵循文档书写模式。
5. **可选：渐进增强**：把复杂布局逻辑或动画放进 `@supports (inline-size: calc-size(auto, size + 0px))` 块，只向具备能力的浏览器提供高级特性。

<a id="basic-syntax"></a>

## 基本语法

```css
/* calc-size(<calc-size-basis>, <calc-sum>) — mathematical operations on intrinsic sizing keywords */
.element {
  /* MANDATORY: Always provide a fallback for browsers that do not support calc-size() */
  inline-size: min-content;
  
  /* DO: Use calc-size to modify an intrinsic basis with a calculation or function */
  inline-size: calc-size(min-content, size + 2rem);
}
```

<a id="valid-basis-arguments-calc-size-basis"></a>

### 有效的基准参数（`<calc-size-basis>`）
第一个参数定义计算的“基础”尺寸。

**标准关键字：**
- `auto`：元素的默认尺寸。
- `min-content`：元素在不溢出情况下能够占用的最小尺寸。
- `max-content`：将全部内容容纳在一行时的尺寸。
- `fit-content`：等价于 `clamp(min-content, auto, max-content)`。
- `content`：仅当 `calc-size()` 用在 `flex-basis` 属性中时有效。

**特殊参数：**
- `any`：不知道具体内在尺寸类型或进行嵌套计算时使用的通用基准。
- 嵌套的 `calc-size()`：支持多步或条件计算。
- `<calc-sum>`：具体长度、百分比或数学表达式（例如 `100px` 或 `20%`）。使用固定值作基准时，**`size` 关键字仍然可用**（但仅在第二个参数中），表示该基准解析后的值。

**强制要求**：第一个参数（`<calc-size-basis>`）自身不能使用 `size` 关键字。它是局部变量，只存在于第二个参数（`<calc-sum>`）中，用来引用基准。

<a id="valid-calculation-arguments-calc-sum"></a>

### 有效的计算参数（`<calc-sum>`）
第二个参数是数学表达式。
- 通常使用 `size` 关键字引用基准值。
- 虽然 `size` 关键字技术上可省略，但省略后计算会得到固定值，完全忽略基准。
- 可以包含标准运算符（`+`、`-`、`*`、`/`）。
- 可以包含 `clamp()`、`min()`、`max()`、`round()` 等 CSS 数学函数。
- **强制要求**：每次 `calc-size()` 计算只允许**一个**内在尺寸值，即基准。不能在同一次 `calc-size()` 调用中混合内在尺寸关键字。

<a id="use-cases"></a>

## 使用场景

<a id="animating-to-and-from-intrinsic-sizes"></a>

### 动画过渡到内在尺寸，或从内在尺寸过渡出来
默认情况下，浏览器无法在长度（例如 `0px`）与内在尺寸关键字（例如 `auto`）之间插值。用 `calc-size()` 包裹关键字，可以使它成为可插值的值。

<a id="choosing-the-right-tool-for-animations"></a>

#### 为动画选择正确工具
- **强制要求：使用 `interpolate-size: allow-keywords`**：用于不涉及数学修改的简单内在尺寸动画（例如 `height: 0` 到 `height: auto`）。这是简单关键字插值所要求的方式，理想情况下应通过 `:root` 全局应用。

  ```css
  :root {
    /* Best practice: Enable keyword interpolation globally */
    interpolate-size: allow-keywords;
  }

  .item {
    height: 0;
    visibility: hidden;
    transition: height 0.3s ease, visibility 0.3s;
  }

  .item.open {
    /* Simple interpolation from 0 to auto now works without calc-size() */
    height: auto;
    visibility: visible;
  }
  ```

- **使用 `calc-size()`**：仅在过渡期间需要对内在尺寸执行数学计算（例如添加间距或限制尺寸）时使用。

```css
.accordion-content {
  display: block;
  overflow: hidden;
  /* MANDATORY: Fallback value for closed state */
  block-size: 0;
  /* Removes the closed content from the accessibility tree and the tab order;
     transitioning visibility keeps it visible until the panel finishes closing */
  visibility: hidden;
  transition: block-size 0.3s ease-out, visibility 0.3s;
}

.accordion-content.open {
  /* MANDATORY: Fallback value for open state */
  block-size: auto;

  /* 
    DO: Use calc-size(auto, ...) to enable animation from 0 to the element's 
    intrinsic size while doing a calculation (in this case, adding a space of 2rem).
  */
  block-size: calc-size(auto, size + 2rem);
  visibility: visible;
}
```

**强制要求**：收缩到零尺寸（`block-size: 0` 或 `height: 0`）只会在视觉上隐藏内容；屏幕阅读器仍会读取，链接和控件仍在 Tab 顺序中。关闭状态设置 `visibility: hidden`，打开状态设置 `visibility: visible`，并把 `visibility` 纳入过渡，使内容在关闭动画结束前保持可见。

**强制要求**：不能直接在两个内在尺寸关键字之间插值。过渡的一端必须是长度或百分比。

<a id="respecting-user-motion-preferences"></a>

#### 尊重用户的动效偏好
改变大范围布局尺寸的动画可能尤其影响有前庭障碍的用户。**强制要求**：始终通过 `prefers-reduced-motion` 媒体查询尊重用户动效偏好，简化或尽量减少非必要动画。常见策略包括完全禁用动效、缩短时长，或用轻微的透明度过渡替代布局移动。

```css
.accordion-content {
  opacity: 0;
  visibility: hidden;
  transition: block-size 0.3s ease, opacity 0.3s ease, visibility 0.3s;
}

.accordion-content.open {
  opacity: 1;
  visibility: visible;
}

@media (prefers-reduced-motion: reduce) {
  .accordion-content {
    /* 
       EXAMPLE: Replacing disruptive layout animations with a subtle fade-in.
       Setting the block-size instantly and transitioning opacity 
       provides a clear state change without large-scale motion.
    */
    transition: opacity 1.5s ease;
  }

  .accordion-content.open {
    /* Jump the size instantly */
    block-size: auto;
  }
}
```

<a id="applying-constraints-to-intrinsic-sizes"></a>

### 对内在尺寸施加约束
可以将 `calc-size()` 与任何 CSS 数学函数（例如 `min()`、`max()`、`clamp()`、`round()`）结合，确保元素的内在尺寸保持在设计边界内。

```css
.dynamic-container {
  /* MANDATORY: Always provide a fallback for browsers that do not support calc-size() */
  inline-size: fit-content;

  /* 
    DO: Establish a dynamic size based on content, while:
    1. Enforcing boundaries using CSS math functions (min, clamp, etc.)
    2. Modifying the intrinsic size with fixed or relative offsets
  */
  inline-size: calc-size(fit-content, min(size + var(--extra-space), var(--max-allowed)));
}
```

<a id="critical-considerations"></a>

## 关键注意事项

- **百分比陷阱**：`<calc-sum>` 内的百分比相对于**容器尺寸**解析，而不是 `size` 关键字。例如 `calc-size(auto, size + 10%)` 会在元素的 `auto` 宽度上加上**父元素**宽度的 10%，可能导致意外结果或溢出。
- **计算要求**：**强制要求**：简单动画（例如 `0` 到 `auto`）使用 `interpolate-size: allow-keywords`，不要用 `calc-size()`。只有布局需要动态数学调整内在基准时，才应使用 `calc-size()`。
- **性能说明**：对 `inline-size`、`block-size` 等盒模型属性执行动画会触发布局重新计算，成本可能很高。主要在不影响布局的替代方案不足以满足需求、且布局变化很关键的元素上使用 `calc-size()` 动画。

<a id="fallback-strategies"></a>

## 回退策略

calc-size() 的浏览器支持：有限可用。
支持：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

interpolate-size 的浏览器支持：有限可用。
支持：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

`calc-size()` 和 `interpolate-size` 属于**渐进增强**。不支持它们的浏览器会忽略属性，布局仍可用，只是到内在尺寸关键字的动画会直接跳变。始终提供标准关键字或长度作为回退。

```css
.element {
  /* Fallback for browsers that don't support calc-size() */
  inline-size: fit-content; 
  /* Modern browsers will override the fallback */
  inline-size: calc-size(fit-content, size + 2rem);
}
```

<a id="animation-and-transition-fallbacks"></a>

### 动画与过渡回退
不支持 `calc-size()` 或 `interpolate-size` 的浏览器无法对涉及内在尺寸关键字的过渡插值。

- **优雅降级**：默认回退是在状态间立即跳变（例如从 `0` 到 `auto`）。由于布局仍可用，这通常可以接受。
- **增强体验**：使用 `@supports` 应用只在能够平滑内在尺寸动画时才有意义的复杂布局逻辑或额外样式。
- **避免用 JS 测量**：虽然可以用 JavaScript 测量元素并手动动画其尺寸，但这通常没有必要，还可能导致布局抖动。现代 Web 应用推荐依赖原生的立即跳变作为回退。

对于动画，回退体验会是立即跳到最终尺寸。可在 CSS 或 JavaScript 中检测支持：

```css
/* CSS Feature Detection */
@supports (inline-size: calc-size(auto, size + 0px)) {
  .element {
    /* Apply advanced logic only when supported */
  }
}
```

```javascript
/* JavaScript Feature Detection */
if (CSS.supports('inline-size', 'calc-size(auto, size + 0px)')) {
  // Apply advanced sizing or animations
}
```

