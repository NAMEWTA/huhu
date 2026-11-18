<a id="motion"></a>

# 动态效果

- 用 `clip-path` 和 `mask-image` 实现自定义几何揭示和平滑淡出。两者也裁剪元素自身焦点轮廓；若元素可聚焦（例如 `tabindex="0"` 的滚动容器），应在未裁剪或遮罩的父元素绘制焦点指示。
- 非关键的滚动绑定效果使用**滚动驱动动画**（`animation-timeline: scroll()`），不用 JS 监听。
- 用**视图过渡**在复杂布局状态之间无缝动画。

<a id="performance"></a>

## 性能

- 优先动画 `opacity` 和 `transform`，包括独立变换属性，例如用 `translate` 替代 `left/right/top/bottom`，确保留在合成器线程。
- 用 `transition-behavior: allow-discrete`、`@starting-style`，以及顶层元素（`<dialog>`、`[popover]`）的 `overlay`，原生动画离散进入退出状态。参见 `animate-element-entry-exit`（通过 `npx -y modern-web-guidance@latest retrieve "animate-element-entry-exit"` 获取）和 `animate-to-from-top-layer`（通过 `npx -y modern-web-guidance@latest retrieve "animate-to-from-top-layer"` 获取）。

```css
.popover-reveal {
  /* Transition discrete display and top-layer overlay alongside opacity */
  transition:
    opacity ease-out,
    display,
    overlay;
  transition-duration: 0.2s;
  /* Separate after transition so the shorthand doesn't reset it or fail in older browsers */
  transition-behavior: allow-discrete;
}
```

<a id="accessibility"></a>

## 无障碍

- **提供暂停机制：** 允许用户停止自动轮播、横幅或其他持续动画。任何自动开始、持续超过五秒且与其他内容同时显示的移动、闪烁或滚动内容，都需要可见的暂停、停止或隐藏控件，例如旁边一个键盘可用的 `<button>`（WCAG 2.2.2 暂停、停止、隐藏）。`prefers-reduced-motion` 不能替代控件，未开启该设置的用户也需要停止。按钮标签在“暂停”和“播放”间变化时，不要再设置 `aria-pressed`，否则屏幕阅读器会播报“已按下的播放按钮”。
- **默认静态视图：** 考虑默认静态，让用户主动启用动态效果。
- **不超过闪烁限制（每秒三次）：** 绝不包含快速明暗闪烁，它可能引发癫痫。无论动态偏好如何都适用，因此也不要把闪烁放在 `@media (prefers-reduced-motion: no-preference)` 中（WCAG 2.3.1 三次闪烁或低于阈值：任意一秒内不超过三次）。
- **保留最终状态：** 关闭动画后确保元素仍处于最终状态，避免内容留在隐藏状态（例如 `opacity: 0`），并确保焦点和选择指示仍显示。

<a id="respect-reduced-motion"></a>

### 尊重减少动态效果

始终尊重该偏好。根据策略是完全移除动画还是仅调整参数，选择 `@media (prefers-reduced-motion: no-preference)` 或 `@media (prefers-reduced-motion: reduce)`：
- 策略是**完全没有动画**时使用 `@media (prefers-reduced-motion: no-preference)`，仅在需要处应用，而非先普遍声明再 `animation: none` 取消。
- 策略是**改变动画参数**时使用 `@media (prefers-reduced-motion: reduce)`，例如延长 `animation-duration` 来放慢速度。

**不要**全局应用 `animation-duration: 0.01ms;`，某些动画会因此*更*突兀。应逐例处理，把 `@media` 查询嵌套在规则中，让两个版本放在一起。保留非移动过渡（例如链接和按钮的 `color`、`background-color`），只减弱或禁用空间位移、缩放、旋转或持续动画。

<a id="opt-in-to-motion-with-media-prefers-reduced-motion-no-preference"></a>

#### 通过 `@media (prefers-reduced-motion: no-preference)` 启用动态

减少动态时应完全无动画的场景，默认静态，只在 `@media (prefers-reduced-motion: no-preference)` 中启用，而不是先设置 `animation` 再用 `animation: none` 覆盖：

```css
/* Good: Default to static state and opt in to full motion */
.spinner {
  @media (prefers-reduced-motion: no-preference) {
    animation: spin 1s linear infinite;
  }
}
```

<a id="adjust-animation-parameters-with-media-prefers-reduced-motion-reduce"></a>

#### 通过 `@media (prefers-reduced-motion: reduce)` 调整参数

减少动态时仍需以温和参数运行的场景，声明基础动画，再仅在 `@media (prefers-reduced-motion: reduce)` 中覆盖改变的属性：

```css
/* Good: Slow down the animation for reduced motion instead of canceling it */
progress:not([value]) {
  animation: slide 1s infinite linear;
  @media (prefers-reduced-motion: reduce) {
    animation-duration: 20s;
  }
}
```

<a id="working-with-animation-and-transition-events-in-javascript"></a>

## 在 JavaScript 中处理动画与过渡事件

`AnimationEvent`（`animationstart`、`animationiteration`、`animationend`、`animationcancel`）和 `TransitionEvent`（`transitionrun`、`transitionstart`、`transitionend`、`transitioncancel`）的 `event.target` 都提供源 DOM 元素。要获取触发事件的具体 `Animation` 对象（`Animation`、`CSSAnimation`、`CSSTransition`），使用只读 `event.animation`。

没有 `event.animation` 时，通常可调用 `event.target.getAnimations()` 并过滤得到 `Animation` 实例，过滤依据为 `event.animationName`（过渡则 `event.propertyName`）过滤。但优先直接使用 `event.animation`，避免下列对 `event.target.getAnimations()` 进行过滤却不能按预期工作的场景：

- Web Animations API（`element.animate()`）创建的动画没有 `animationName`，因此过滤 `event.target.getAnimations()` 时无法按名称匹配。
- 同一元素绑定多个同名动画时，按 `animationName` 过滤 `AnimationEvent` 有歧义。
  - 对 `TransitionEvent` 按 `transitionProperty` 过滤可行，因为每个过渡属性只有一个事件。
- `event.target` 总指向源 DOM 元素，无法区分元素自身和伪元素动画；`event.animation.effect.pseudoElement` 可直接暴露目标伪元素。

```js
// Works in most basic CSS animation cases, but fails for WAAPI animations,
// duplicate animation names on the same element, or pseudo-elements.
document.addEventListener('animationstart', (event) => {
  const animation = event.target
    .getAnimations()
    .find((anim) => anim.animationName === event.animationName);
  console.log(animation);
});

// PREFERRED: Directly access the exact Animation object via event.animation
document.addEventListener('animationstart', (event) => {
  const animation = event.animation;
  console.log(animation);
});
```

可用 `'animation' in AnimationEvent.prototype` 或 `'animation' in TransitionEvent.prototype` 检测。

减少动态使动画或过渡根本不运行时（仅在 `@media (prefers-reduced-motion: no-preference)` 中应用、设为 `none`，或时长为零且无延迟），`animationend` 与 `transitionend` 不会触发。若代码等待这些事件移除或隐藏元素，应在 `element.getAnimations()` 返回空数组时立即继续，或保留短暂透明度过渡而非完全移除。
