<a id="optimizing-interactions-in-complex-layouts"></a>

# 优化复杂布局中的交互

在看板、大型数据网格等复杂多列布局中进行拖放或大量修改时，保持较高帧率（60FPS），并消除交互延迟。

<a id="overview"></a>

## 概述

在复杂布局中，对单个项目做轻微修改，例如拖动卡片或编辑单元格，可能引起样式和布局计算的连锁反应，迫使浏览器对整个页面进行回流，导致丢帧和较高的交互到下一次绘制（INP）延迟。

为自包含的布局区域，例如看板中的列，设置 `content-visibility: auto`，可以隔离渲染工作。

<a id="mechanism-for-on-screen-elements"></a>

### 对屏幕内元素的作用机制

需要理解 `content-visibility: auto` 如何改善**已经在屏幕上可见**的元素：

* 对于可见元素，浏览器**不会**跳过渲染。
* 性能收益完全来自该属性自动施加的 **CSS containment**，即布局、样式和绘制隔离。
* containment 构成一道边界。当修改发生在应用了 containment 的容器内部时，浏览器知道这些变化不会影响容器外元素的几何或样式，因此可以局部进行页面回流，避免全局布局重算。

<a id="implementation"></a>

## 实现

<a id="1-identify-containment-regions"></a>

### 1. 识别隔离区域

将 `content-visibility: auto` 应用到代表独立布局单元的大型自包含容器，例如网格列或看板列表。

```css
.board-column {
  /* Apply containment boundaries */
  content-visibility: auto;
  
  /* Mandatory: Provide a placeholder size to prevent layouts shifts.
     For a vertical column, define a reasonable width and height. 
     - 'auto' is optional and enables the browser to remember the actual size
       once rendered. It must be paired with a <length> value to be used for
       the first render.
     - '300px' is the estimated width of this element. This can be any valid
      CSS <length> value. Replace it with the expected width of your
      component.
     - '800px' is the estimated height of this element. This can be any valid
      CSS <length> value. Replace it with the expected height of your
      component.
   */
  contain-intrinsic-size: auto 300px auto 800px;
}
```

<a id="2-manage-interactions"></a>

### 2. 管理交互

确保列内部的交互能够受益于隔离。

```javascript
// Example: Drag and drop item movement
function moveItemToColumn(itemId, columnId) {
  const item = document.getElementById(itemId);
  const column = document.getElementById(columnId);
  
  // The browser will only reflow this specific column, 
  // not the entire board layout!
  column.appendChild(item);
}
```

<a id="fallback-strategies"></a>

### 回退策略

content-visibility 的 Baseline 状态：Newly available。自 2025-09-15 起纳入 Baseline。
支持的浏览器：Chrome 108（2022 年 11 月）、Edge 108（2022 年 12 月）、Firefox 130（2024 年 9 月）和 Safari 26（2025 年 9 月）。

该属性可以优雅降级。在不支持的浏览器中：

* 属性会被忽略，修改会触发通常的全局回流。
* 为了在旧浏览器中获得类似隔离效果，可以回退为手动应用 containment：

```css
@supports not (content-visibility: auto) {
  .board-column {
    /* Manual fallback for containment */
    contain: layout style paint;
  }
}
```
