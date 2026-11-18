<a id="directional-navigation-transitions"></a>

# 有方向的导航过渡

单页应用（SPA）通过替换页面内容而非导航到新页面，呈现导航效果。默认直接替换，没有过渡。有方向的过渡可在视觉上强化视图间空间关系。

让新内容从用户前进的方向滑入，可以建立应用结构的心智地图。例如产品站点“前进”向右、“后退”向左，或幻灯片用上下过渡表示下一张和上一张。

<a id="implementation-steps"></a>

### 实现步骤

1. **检测导航方向：** 判断用户沿应用流程“前进”还是“后退”，具体方法依用例而定。
2. **用类型触发过渡：** 将方向放入 `types` 数组传给 `document.startViewTransition()`，对过渡分类。
3. **用 CSS 定义方向动画：** 通过 `:active-view-transition-type()` 根据导航类型应用特定动画。

<a id="defining-keyframes"></a>

### 定义关键帧

定义从各方向进入和离开的滑动动画。为最佳性能，用 `transform` 或独立变换属性 `scale`、`rotate`、`translate` 动画位置变化。`opacity` 通常也高效；其他属性先验证不会触发布局或绘制，再添加动画。

```css
/* Slide an element out to the left */
@keyframes slide-to-left {
  /* Mandatory: animate `transform` instead of inset properties for better performance. */
  to { transform: translateX(-100%); }
}

/* Slide an element in from the right */
@keyframes slide-from-right {
  from { transform: translateX(100%); }
}

/* Slide an element out to the right */
@keyframes slide-to-right {
  to { transform: translateX(100%); }
}

/* Slide an element in from the left */
@keyframes slide-from-left {
  from { transform: translateX(-100%); }
}
```

<a id="set-up-shared-animation-settings"></a>

### 设置共享动画配置

用 `::view-transition-group(root)` 应用所有过渡共用配置。过渡组必须采用非线性时间函数（例如 `ease` 关键字或 `cubic-bezier()`），不要使用会让方向滑动显得机械突兀的 `linear`。

```css
::view-transition-group(root){
  animation: 0.4s ease-in-out both;
}
```

<a id="applying-directional-animations"></a>

### 应用方向动画

使用 `active-view-transition-type` 伪类，在“forward”或“backward”类型活动时选中相应过渡视图。

```css
/* MANDATORY: Apply forward animations when the 'forward' type is active */
html:active-view-transition-type(forward)::view-transition-old(root) {
  animation-name: slide-to-left;
}
html:active-view-transition-type(forward)::view-transition-new(root) {
  animation-name: slide-from-right;
}

/* MANDATORY: Apply backward animations when the 'backward' type is active */
html:active-view-transition-type(backward)::view-transition-old(root) {
  animation-name: slide-to-right;
}
html:active-view-transition-type(backward)::view-transition-new(root) {
  animation-name: slide-from-left;
}
```

<a id="triggering-the-transition"></a>

### 触发过渡

导航时将合适类型传给 `startViewTransition`。

```javascript
const transitionType = yourTransitionTypeLogic();
const updateDOM = yourUpdateDOMLogic();

document.startViewTransition({
  update: updateDOM,
  types: [transitionType] // Matches the CSS :active-view-transition-type() selectors
});
```

<a id="accessibility"></a>

### 无障碍

始终通过禁用或简化动画来尊重减少动态效果偏好。

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(root) {
    animation: none !important;
  }
}
```

<a id="fallback-strategies"></a>

### 回退策略

View transitions 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 144（2025 年 10 月）和 Safari 18（2024 年 9 月）。

Active view transition 的 Baseline 状态：新近可用。自 2026-01-13 起纳入 Baseline。
支持版本：Chrome 125（2024 年 5 月）、Edge 125（2024 年 5 月）、Firefox 147（2026 年 1 月）和 Safari 18.2（2024 年 12 月）。

View Transitions API 属于渐进增强。不支持时 `document.startViewTransition` 为 `undefined`。必须对导航逻辑做特性检测，确保仍能立即更新 DOM，只是没有动画，如以下辅助函数：

```javascript
/**
 * Navigates to a new view with a directional transition.
 * @param {Function} updateDOM - Callback to update the DOM state.
 * @param {string} direction - Either 'forward' or 'backward'.
 */
function navigate(updateDOM, direction) {
  // Feature detect for browsers that do not support View Transitions
  if (!document.startViewTransition) {
    updateDOM();
    return;
  }

  // Start transition with the specific navigation type
  document.startViewTransition({
    update: updateDOM,
    types: [direction] // Matches the CSS :active-view-transition-type() selectors
  });
}
```
