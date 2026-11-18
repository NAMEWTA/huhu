<a id="pull-to-reveal"></a>

# 下拉显示

“下拉显示”是一种 UI 模式：首次加载时，内容（如搜索栏或刷新控件）隐藏在可滚动区域顶部上方，用户向下拉动（向上滚动）即可显示。这种模式常用于移动应用和 Web 应用的搜索栏、筛选器及其他应可访问、但不必立即可见的次要控件。

CSS 属性 `scroll-initial-target` 提供了仅用 CSS 的声明式实现方式。在主要内容元素上设置 `scroll-initial-target: nearest`，滚动容器渲染时就会将隐藏内容滚出视野。过去，开发者依赖 JavaScript（`Element.scrollIntoView()`）或 URL 片段标识符（`#content-id`），两者都有局限，实现也较复杂。

<a id="how-to-implement"></a>

## 实现方法

实现下拉显示模式时：

1. **确保存在滚动容器：**目标元素必须位于滚动容器内，即允许通过 overflow 滚动的元素，例如 `overflow: auto`。它可以是任意祖先，包括根 `<html>` 元素。
2. **定义隐藏元素：**把需要隐藏的内容（例如搜索栏）放在滚动容器内的第一个后代位置。首次加载时，该元素会被滚出视野。
3. **定义主要内容：**将主要内容元素紧接在隐藏元素之后。用户首先应看到的是这个元素。
4. **将主要内容设为目标：**给主要内容元素应用 `scroll-initial-target: nearest`，使滚动容器渲染时将它滚入视野，从而隐藏上方元素。
5. **添加滚动吸附：**为了确保隐藏元素总是完全可见或完全隐藏，不停在半露出的滚动状态，给滚动容器添加 `scroll-snap-type: y mandatory`，并给隐藏元素和主要内容元素都添加 `scroll-snap-align: start`。

<a id="example-code-pull-to-reveal-search"></a>

## 代码示例：下拉显示搜索

```css
/**
 * ANCESTOR: Define the scroll container.
 * Scroll snapping ensures the search bar is always
 * either fully visible or fully hidden.
 */
.scroll-container {
  height: 100vh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
}

/**
 * HIDDEN ELEMENT: The search bar hidden above the fold on load.
 * It has scroll-snap-align so it snaps into place when pulled down.
 */
.search-bar {
  height: 60px;
  scroll-snap-align: start;
}

/**
 * MAIN CONTENT + TARGET: The element the user sees first.
 * scroll-snap-align makes it a valid snap point.
 * scroll-initial-target tells the browser to scroll here on
 * initial render, hiding the search bar above it.
 */
.main-content {
  scroll-snap-align: start;
  scroll-initial-target: nearest;
}
```


<a id="strategic-implementation--best-practices"></a>

## 实施策略与最佳实践

- **必须**为每种下拉显示操作提供可见按钮（或菜单项），通过单次点击或 Enter 键执行相同操作，满足 WCAG 2.5.1 指针手势对基于路径手势的要求。每个按钮至少为 24×24 CSS 像素（WCAG 2.5.8 目标尺寸〔最小值〕），并根据其作用对象命名。
- **应当**在希望加载时把用户注意力引到可滚动区域的某个部分，并有意隐藏顶部搜索栏等外围 UI 单元时，使用 `scroll-initial-target: nearest`。
- **不要**将其与无障碍焦点混淆。此属性只移动**视觉**视口，不移动键盘焦点。如果目标应成为键盘用户的起点，需要手动管理 `element.focus()`。
- **不要**在加载时需要平滑“滚动”动画的情况下使用；该属性是离散的，会在布局阶段即时设置位置。
- **不要**在同一滚动容器内给多个元素设置 `scroll-initial-target`。多个元素都指定 `scroll-initial-target: nearest` 时，浏览器选择 DOM 树顺序中最先出现的一个。
- **应当**考虑**优先级层次**：URL 片段（如 `example.com/#top`）和容器级 `scroll-start` 属性都优先于 `scroll-initial-target`。

<a id="fallback-strategy"></a>

## 回退策略

scroll-initial-target 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 133（2025 年 2 月）和 Edge 133（2025 年 2 月）。
不支持：Firefox 和 Safari。

对尚不支持该 API 的浏览器，使用 JavaScript 回退。注意，对于下拉显示内容，应将主要内容对齐到容器的 `start`（顶部）。

```javascript
/**
 * Progressive Enhancement Fallback
 */
document.addEventListener("DOMContentLoaded", () => {
  // Check for native CSS support
  if (!CSS.supports("scroll-initial-target", "nearest")) {
    const targetContent = document.querySelector('.main-content');
    if (targetContent) {
      // Use behavior: "instant" to mimic the native CSS behavior
      // 'block: start' should match your CSS 'scroll-snap-align' (or expected top position)
      targetContent.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }
});
```

