<a id="same-document-transitions"></a>

# 同文档过渡

<a id="the-problem"></a>

## 问题

网站常为对象提供多种视图，例如产品列表与各产品详情。两者导航往往缺少联系：点击缩略图后，缩略图消失，屏幕另一处立即出现较大图片。缺乏连续性使用户难以跟踪元素关系。

<a id="the-solution"></a>

## 解决方案

**View Transitions API** 允许指定过渡前后不同状态中的元素对。单页应用（SPA）调用 `document.startViewTransition()` 时，浏览器通过共享且唯一的 `view-transition-name` 识别对应元素，自动计算位置、尺寸与样式差异，并从旧状态平滑动画到新状态。过渡位于顶层，甚至高于高 `z-index` 元素。

<a id="implementation-guide"></a>

## 实现指南

<a id="step-1-wrap-state-changes-in-startviewtransition"></a>

### 第 1 步：用 `startViewTransition` 包裹状态变化

SPA 或简单状态变化，将更新 DOM 的逻辑放入 `document.startViewTransition`。浏览器截取当前快照、运行更新，再截取新状态。

```javascript
function navigate(view) {
  // MANDATORY: Wrap the update in startViewTransition
  document.startViewTransition(() => updateDOM(view));
}
```

<a id="step-2-assign-shared-transition-names"></a>

### 第 2 步：分配共享过渡名称

用 CSS `view-transition-name` 告知浏览器哪些元素变形。名称可任意取值，`none` 除外。**必须：** 过渡前后各自最多只能有一个元素使用给定的 `view-transition-name`。若有两个或更多元素使用同一个 `view-transition-name`，DOM 会立即更新而不发生过渡。

可用多个 `view-transition-name` 同时变形多个元素对，例如产品图片和标题分别过渡。

列表视图有多个项目，不能全部使用同一个 `view-transition-name`。SPA 有两种解决方法：

1. **动态详情页：** 为列表页每个项目分配唯一的 `view-transition-name`，选择项目时将该名称动态赋给详情页对应元素，如下。

```css
/* In the list view, give each */
#product-1 { view-transition-name: p1 }
#product-2 { view-transition-name: p2 }
#product-3 { view-transition-name: p3 }
```

```js
function updateDOM(clickedTransitionName){
  const hero = document.getElementById("hero");
  hero.style.viewTransitionName = clickedTransitionName;
}
```

2. **动态列表项：** 为详情页元素预先分配 `view-transition-name`，列表项被选择时再给它应用该名称；返回列表页时，从列表项移除 `view-transition-name`。

详情页的 `#hero` 元素与列表页中选定的 `.thumbnail` 元素共享一个 `view-transition-name`。

```css
#hero{
  view-transition-name: hero;
}
.thumbnail.selected {
  view-transition-name: hero;
}
```

点击缩略图时，用 `.selected` 类选择器赋予 `view-transition-name`，先完成所需 DOM 准备，再启动过渡。

然后可调用 `document.startViewTransition()`，应用将页面从详情切换到列表视图的更改。

返回列表后必须清理过渡类，防止下次导航出错。可在 `finished` promise 完成后清理。

```javascript
// Function called when a thumbnail is clicked
function goFromListToDetail(e){
  e.currentTarget.classList.add("selected");
  const hero = document.getElementById("hero");
  const bgColor = getComputedStyle(e.currentTarget).backgroundColor;
  hero.style.background = bgColor;

  // Trigger the transition, checking for support
  if (!document.startViewTransition) {
    document.body.classList.add("detail");
    // MANDATORY Accessibility Routing: Route focus to the newly revealed heading to announce context and preserve logical tab flow
    document.getElementById("detail-heading")?.focus();
    return; // MANDATORY: End function execution if view transitions are not supported.  
  }
  const transition = document.startViewTransition(() => {
    document.body.classList.add("detail");
  });
  // MANDATORY Accessibility Routing: Route focus after the view transition resolves
  transition.finished.finally(() => {
    document.getElementById("detail-heading")?.focus();
  });
}

// Function called when navigating from detail back to list view
function goFromDetailToList() {
  if (!document.startViewTransition) {
    document.body.classList.remove("detail");
    document.getElementById("list-heading")?.focus();
    return;
  }
  const transition = document.startViewTransition(() => {
    document.body.classList.remove("detail");
  });
  // Clean up the list view and route focus
  transition.finished.finally(() => {
    // Route focus back to list view
    document.getElementById("list-heading")?.focus();
    // Remove selected classList to remove view-transition-names
    document.querySelectorAll(".selected").forEach(
      (element) => {
        element.classList.remove("selected");
      },
    );
  });
}
```

方法取决于用例。动态列表项重复 CSS 较少，但需要更多手动 JavaScript 清理。

<a id="step-3-fix-aspect-ratio-stretching"></a>

### 第 3 步：修复宽高比“拉伸”

默认浏览器在一个伸缩以适应新旧快照的组中交叉淡入淡出。文字过渡时，将新旧视图文字元素宽度都设为 `fit-content`，保持其宽高比稳定。

```css
#list-page .title {
  width: fit-content;
}

#detail-page #title {
  width: fit-content;
}
```

元素宽高比改变时，可能需要将新旧伪元素高度设为 `::view-transition-pair()` 的 100%。

```css
::view-transition-old(hero),
::view-transition-new(hero){
  height: 100%;
}
```

伪元素是实时元素的快照，也可用 `object-fit`、`object-position` 更精细控制。

<a id="best-practices"></a>

## 最佳实践

- **不要**指定过多过渡，仅为用户主动跟踪的主要内容（主图、标题）设置共享元素。
- **要**在完成后移除临时 `view-transition-name`，避免影响未来过渡。
- **不要**过渡正在播放动画的元素。视图过渡操作快照，动画期间看起来会暂停。
- **要**通过 `prefers-reduced-motion` 尊重减少动态效果偏好。
- **必须进行无障碍路由处理：** 视图过渡动态改变布局，却不管理程序焦点。焦点若留在被隐藏或移除的元素，会遗失，使键盘和辅助技术用户失去上下文。DOM 更新后立即或 `finished` 完成时，程序聚焦更新后的页面标题或视图容器（使用 `tabindex="-1"`）。

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

<a id="fallback-strategies"></a>

## 回退策略

View transitions 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 144（2025 年 10 月）和 Safari 18（2024 年 9 月）。

API 为渐进增强设计。不支持的浏览器直接更新 DOM，没有动画。

```javascript
function navigate(){
  if (!document.startViewTransition) {
    // Fallback: Just update the DOM
    updateDOM();
  } else {
    document.startViewTransition(() => updateDOM());
  }
}
```
