<a id="interactive-content-reveal"></a>

# 交互式内容揭示

通过 CSS 遮罩和注册自定义属性，为站点添加高性能交互揭示效果。将径向渐变作为遮罩并注册色标值，可平滑过渡进入与退出，同时只需少量 JavaScript 跟随指针。

<a id="implementation"></a>

## 实现

<a id="1-register-custom-properties"></a>

### 1. 注册自定义属性
为让渐变色标平滑插值，必须用 `@property` 注册变量，告知浏览器数据类型，使更新时可在值之间过渡。

```css
/* Register the spotlight inner and outer sizes to enable interpolation */
 @property --inner-size{
  syntax: "<length-percentage>";
  inherits: true;
  initial-value: 0px;
}
@property --outer-size{
  syntax: "<length-percentage>";
  inherits: true;
  initial-value: 0px;
}
```

跟踪指针位置的自定义属性无需过渡，因此不必注册。

<a id="2-define-the-masking-layer"></a>

### 2. 定义遮罩层
在要揭示的元素上应用 `mask-image`，使用引用已注册属性的 `radial-gradient`。

```css
.reveal-layer {
  /* Only transition the size properties, NOT the position variables */
  transition: --inner-size 0.2s ease-in-out, --outer-size 0.2s ease-in-out;  

  /* The spotlight is defined by the transparent center of the mask */
  mask-image: radial-gradient(
    circle at var(--mouse-x) var(--mouse-y),
    black var(--inner-size, 0%),
    transparent var(--outer-size, 0%)
  );

  /* Ensure the mask doesn't repeat if the element is large */
  mask-repeat: no-repeat;

  /* Make the mask layer non-interactive */
  pointer-events: none;
}

/* Update the gradient stops when hovering the interactive container (inherits into .reveal-layer; .reveal-layer itself has pointer-events: none) */
.container:hover {
  --inner-size: 100px;
  --outer-size: 120px;
}
```

<a id="3-update-coordinates-with-javascript"></a>

### 3. 用 JavaScript 更新坐标
在 pointermove 事件中跟踪位置并更新 CSS 变量。位置变量立即更新而不经过渡，因此聚光区直接跟随指针，尺寸属性则平滑扩张或收缩。

```javascript
const container = document.querySelector('.container');
// Store the container's bounding rect
let rect = container.getBoundingClientRect();
// Update the rect when the container is resized
const resizeObserver = new ResizeObserver(()=>{
  rect = container.getBoundingClientRect();
})
resizeObserver.observe(container);

container.addEventListener('pointermove', (e) => {
  // Calculate position as a percentage of the container.
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;

  // Update the position properties
  container.style.setProperty('--mouse-x', `${x}%`);
  container.style.setProperty('--mouse-y', `${y}%`);
});
```

<a id="4-accessibility-and-interaction"></a>

### 4. 无障碍与交互
**必须保证无障碍：** 此模式依赖指针揭示视觉聚光效果。必须确保底层布局中的全部内容默认完全可见、清晰且可独立通过键盘到达，聚光层仅作为指针用户非必需的视觉增强。绝不能用它遮挡或限制仅键盘及辅助技术用户获取关键内容。

* **指针事件：** 遮罩覆盖层设 `pointer-events: none`，让正常点击和触摸穿透到底层控件。
* **减少动态效果覆盖：** 对请求减少动态效果的用户禁用平滑插值。

```css
/* MANDATORY Copy-Paste Safety: Disable transition scaling for motion-sensitive users */
@media (prefers-reduced-motion: reduce) {
  .reveal-layer {
    transition: none !important;
  }
}
```

确保极高缩放下底层内容仍可到达。尤其是使用此模式的全部内容必须：

* 使用浏览器内建缩放到 200% 时不丢失功能。
* 初始视口为 1280×1024 CSS 像素、缩放到 400% 时，无需二维滚动仍可见且可操作。

确保过渡在任意一秒内闪烁不超过三次。

<a id="fallback-strategies"></a>

## 回退策略

Registered custom properties 的 Baseline 状态：新近可用。自 2024-07-09 起纳入 Baseline。
支持版本：Chrome 85（2020 年 8 月）、Edge 85（2020 年 8 月）、Firefox 128（2024 年 7 月）和 Safari 16.4（2023 年 3 月）。

<a id="non-registered-property-fallback"></a>

### 未注册属性回退
支持 `mask-image` 但不支持 `@property` 时，仍显示聚光区，但无法对 `radial-gradient` 内的值插值，效果会在开关状态间跳变。使用 `var()` 时提供回退值。

```css
.reveal-layer {
  mask-image: radial-gradient(
    circle at var(--mouse-x) var(--mouse-y),
    /* Use fallback values when using the `var()` function for browsers that don't get an initial value from the @property registration. */
    black var(--inner-size, 0%),
    transparent var(--outer-size, 0%)
  );
}
```

Masks 的 Baseline 状态：广泛可用。自 2023-12-07 起纳入 Baseline。
支持版本：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

<a id="basic-mask-support"></a>

### 基础遮罩支持

完全不支持 CSS 遮罩时：
1. **前缀属性：** 使用 `-webkit-mask-image` 扩大浏览器支持。
2. **渐进增强：** 基础 UI 在没有揭示效果时也完全可用、可读。效果只是视觉点缀而非阅读必需时，适合此方式。
