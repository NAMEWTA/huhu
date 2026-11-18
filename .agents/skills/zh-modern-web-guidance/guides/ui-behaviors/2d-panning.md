<a id="two-dimensional-panning"></a>

# 二维平移

用户滚动二维容器时，浏览器通常采用滚动轴锁定启发式（也称“railing”）。如果手势起始时沿某一轴的运动明显大于与它垂直的另一轴，浏览器会把滚动锁在该水平或垂直轴，忽略另一轴的增量，通常持续到整个手势结束。

轴锁定能防止一维阅读流意外横向漂移，却会妨碍交互地图、放大图片、无限画布、节点图和大型数据网格等二维平移表面。锁定会持续整个手势，因此影响任何涉及两个方向的平移：既包括两轴同时运动的斜向平移，也包括同一手势内先后改变方向的曲线、圆形或 L 形路径。CSS `scroll-axis-lock` 可以直接在原生滚动容器禁用该启发式，在保留合成器线程滚动、惯性物理、原生滚动条和键盘导航的同时，允许自由二维平移。

<a id="implementation"></a>

## 实现

<a id="1-disable-axis-locking-and-contain-overscroll-on-the-two-dimensional-scroll-container"></a>

### 1. 在二维滚动容器上禁用轴锁定并约束过度滚动

将 `scroll-axis-lock: none` 直接应用到建立二维滚动容器的元素（`overflow: auto` 或 `overflow: scroll`）。默认 `auto` 下二维容器已可同时更新两轴增量，但 `auto` 允许浏览器在手势主要沿某一轴开始时启用轴锁定。设置 `scroll-axis-lock: none` 可防止触摸屏、触控板和鼠标滚轮输入触发这种锁定。

在滚动容器上组合 `scroll-axis-lock: none` 与 `overscroll-behavior: none`（或 `overscroll-behavior: contain`），避免到达边缘后将滚动传给父页面，或意外触发浏览器过度滚动导航，例如水平前进后退手势或下拉刷新。

<a id="2-preserve-keyboard-focusability-and-accessibility"></a>

### 2. 保留键盘可聚焦性和无障碍

二维平移表面往往没有可聚焦子控件，例如地图或放大图片。为容器添加 `tabindex="0"`、合适的 `role`、无障碍标签和可见 `:focus-visible` 指示，确保键盘用户能聚焦并用方向键平移。

<a id="example-code"></a>

## 示例代码

```html
<!-- Make the 2D scroll container keyboard-focusable and labeled so keyboard
     users can focus the viewport and pan in all directions with Arrow keys. -->
<div class="pan-viewport" tabindex="0" role="region" aria-label="Interactive canvas">
  <div class="pan-surface">
    <!-- 2D overflowing content (map tiles, zoomed image, canvas nodes, or grid) -->
  </div>
</div>
```

```css
.pan-viewport {
  /* Example viewport dimensions; adjust to fit your layout. */
  inline-size: 100%;
  block-size: 500px;

  /* MANDATORY: Establish a scroll container that can overflow on both axes. */
  overflow: auto;

  /* MANDATORY: Prevent browser scroll axis-locking ("railing") from kicking in
     so 2D gestures never get locked to a single axis. */
  scroll-axis-lock: none;

  /* Contain scrolling and prevent accidental swipe navigations at edges
     (use `none` or `contain`). */
  overscroll-behavior: none;
}

/* Provide a clear focus indicator when keyboard users focus the viewport. */
.pan-viewport:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 2px;
}

.pan-surface {
  /* Example surface dimensions larger than .pan-viewport in both axes. */
  inline-size: 3000px;
  block-size: 3000px;
}
```

<a id="best-practices--constraints"></a>

## 最佳实践与约束

- **应用于滚动容器本身，而非祖先包装元素：** `scroll-axis-lock` 不继承，在包装元素上设置不会影响后代滚动容器。
- **约束过度滚动并防止意外导航：** 为二维容器添加 `overscroll-behavior: none` 或 `overscroll-behavior: contain`，避免平移到边界后滚动传递到父页面，或触发前进后退手势与下拉刷新。
- **嵌套一维面板自动保留轴锁定：** `scroll-axis-lock` 不继承，因此 `.pan-viewport` 内的侧栏或检查器仍保留默认 `scroll-axis-lock: auto`。
- **标准垂直信息流、文章和一维列表保留 `auto`：** 轴锁定可防止单向内容意外垂直于主方向漂移。
- **不要无条件设置 `touch-action`：** `touch-action` 控制浏览器是否处理触摸手势（不影响触控板或滚轮），限制它会禁用原生合成器触摸滚动。仅在实现 JavaScript 指针回退时于 `@supports not (scroll-axis-lock: none)` 内应用，并用 `touch-action: pinch-zoom` 而非 `none`，保留双指缩放（WCAG 1.4.4 文本缩放）。
- **通过 `scrollLeft` / `scrollTop` 平移，绝不用 CSS `transform`：** 用 `transform` 平移表面会使元素不再充当滚动容器，破坏相应行为，包括原生滚动条、边界约束、键盘方向键滚动、`scroll` 事件、`IntersectionObserver` 和滚动驱动动画。

<a id="fallback-strategies"></a>

## 回退策略

scroll-axis-lock 的浏览器支持：有限可用。
支持版本：Chrome 153（2026 年 9 月）。
不支持：Edge、Firefox 和 Safari。

按应用需求选择**渐进增强**或 **JavaScript 回退**：

<a id="option-1-progressive-enhancement-no-javascript"></a>

### 方案 1：渐进增强（无 JavaScript）

如果保留原生合成器线程触摸滚动与惯性甩动比在旧浏览器消除轴锁定更重要，使用渐进增强：

- **支持的浏览器：** 在二维容器滚动手势期间阻止轴锁定启发式启动。
- **不支持的浏览器：** 安全忽略未知 `scroll-axis-lock: none`，保留默认 `auto` 二维滚动：可原生沿两轴滚动，但主要沿单轴开始的手势仍会锁定。

<a id="option-2-javascript-fallback-wheel--pointermove-with-scrollleftscrolltop"></a>

### 方案 2：JavaScript 回退（`wheel` + `pointermove` 配合 `scrollLeft`/`scrollTop`）

若所有浏览器都必须自由二维平移，用 `@supports not (scroll-axis-lock: none)` 和 `CSS.supports('scroll-axis-lock', 'none')` 条件性拦截 `wheel` 和指针拖动。

`wheel`（`e.deltaX`、`e.deltaY`）和 `pointermove`（`e.clientX`、`e.clientY`）会在浏览器滚动引擎应用轴锁定前暴露原始未锁定二维增量，可直接应用到 `scrollLeft` 和 `scrollTop`：

- **为何使用 `scrollLeft`/`scrollTop` 而非 CSS `transform`：** 更新 `scrollLeft` 和 `scrollTop` 保持真正的滚动容器。浏览器自动将位置限制到 `[0, scrollWidth - clientWidth]` 和 `[0, scrollHeight - clientHeight]`，滚动条同步，方向键继续工作，`scroll` 和 `IntersectionObserver` 正常触发。
- **取舍：** 以 `{ passive: false }` 拦截 `wheel` 会将滚动移到主线程；触摸屏设 `touch-action: pinch-zoom` 则将平移交给脚本，失去 `pointerup` 后的原生甩动惯性。`pinch-zoom` 保留双指缩放，而 `touch-action: none` 还会禁用缩放。

```css
/* Only disable native touch panning when scroll-axis-lock is unsupported
   and the JavaScript pointer fallback below is active. pinch-zoom keeps
   pinch-to-zoom working. */
@supports not (scroll-axis-lock: none) {
  .pan-viewport {
    touch-action: pinch-zoom;
  }
}
```

```javascript
// Only attach the main-thread gesture fallback when native support is missing
if (!CSS.supports('scroll-axis-lock', 'none')) {
  const viewport = document.querySelector('.pan-viewport');
  let lastPointer = null;

  // 1. Trackpad and mouse wheel fallback
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) return; // Ctrl+wheel and trackpad pinch zoom the page
      e.preventDefault();
      viewport.scrollLeft += e.deltaX;
      viewport.scrollTop += e.deltaY;
    },
    { passive: false },
  );

  // 2. Touch and pointer drag fallback
  viewport.addEventListener('pointerdown', (e) => {
    // Ignore non-primary buttons and clicks on native scrollbars
    const rect = viewport.getBoundingClientRect();
    if (
      !e.isPrimary ||
      e.button !== 0 ||
      e.clientX - rect.left - viewport.clientLeft >= viewport.clientWidth ||
      e.clientY - rect.top - viewport.clientTop >= viewport.clientHeight
    ) {
      return;
    }
    lastPointer = { x: e.clientX, y: e.clientY };
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!lastPointer) return;
    viewport.scrollLeft -= e.clientX - lastPointer.x;
    viewport.scrollTop -= e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };
  });

  const endPointerPan = () => {
    lastPointer = null;
  };
  viewport.addEventListener('pointerup', endPointerPan);
  viewport.addEventListener('pointercancel', endPointerPan);
}
```
