<a id="efficient-background-processing"></a>

# 高效的后台处理

当浏览器没有渲染某个组件时，暂停其繁重后台任务，以节约系统资源和电量。

<a id="overview"></a>

## 概述

`content-visibility: auto` 属性允许浏览器跳过距离视口较远元素的渲染计算。当浏览器决定跳过或恢复某个元素的渲染时，会在该元素上触发 `contentvisibilityautostatechange` 事件。

监听该事件，就能在不需要时暂停 `<canvas>` 动画、WebGL 渲染或高频 WebSocket 数据轮询等高开销操作，并在浏览器准备显示内容时及时恢复。

<a id="contentvisibilityautostatechange-vs-intersectionobserver"></a>

### `contentvisibilityautostatechange` 与 `IntersectionObserver`

应明确两种 API 各自适用的情况：

* **与元素在视口中的准确视觉可见性相关的应用逻辑，应使用 `IntersectionObserver`**，例如懒加载数据、触发无限滚动。
* **渲染开销大的工作，应使用 `contentvisibilityautostatechange`**，例如复杂 canvas 更新或大量 DOM 修改。该事件直接关联浏览器内部渲染生命周期。浏览器通常在元素真正进入屏幕前就开始渲染，即存在预渲染边距。此事件会告诉你预渲染何时发生，确保内容在用户看到前已经准备就绪。

<a id="implementation"></a>

## 实现

<a id="1-apply-css-content-visibility"></a>

### 1. 应用 CSS Content Visibility

在高开销容器上设置 `content-visibility: auto`，并提供占位尺寸，避免滚动条跳动。

```css
.heavy-component {
  /* Defer rendering work when off-screen */
  content-visibility: auto;
  
  /* Mandatory: Provide a placeholder size to prevent layouts shifts.
    - 'auto' is optional and enables the browser to remember the actual size
      once rendered. It must be paired with a <length> value to be used for
      the first render.
    - 'none' tells the browser not to apply any intrinsic width to this element.
      It can be used for either the height or the width value.
    - '500px' is the estimated height of this element. This can be any valid
      CSS <length> value. Replace it with the expected height of your
      component.
   */
  contain-intrinsic-size: auto none auto 500px;
}
```

<a id="2-listen-for-state-changes"></a>

### 2. 监听状态变化

添加 `contentvisibilityautostatechange` 事件监听器，暂停或恢复后台任务。

> [!IMPORTANT]
> 在部分浏览器实现中，`contentvisibilityautostatechange` 事件不会冒泡。为了可靠处理该事件，必须采用以下方式之一：
>
> - 直接将事件监听器附加到应用了 `content-visibility: auto` 的元素上。
> - 如果把事件委托给父容器，使用捕获阶段监听器（`{ capture: true }`）。

```javascript
const component = document.querySelector('.heavy-component');

// Option 1: Direct listener (recommended)
component.addEventListener('contentvisibilityautostatechange', (event) => {
  if (event.skipped) {
    // The browser skipped rendering this content.
    // DO NOT perform heavy mutations or animation loops here.
    stopSimulation();
    pauseWebSocketPolling();
  } else {
    // The browser is about to render the content.
    // Resume your work so it is ready when visible.
    startSimulation();
    resumeWebSocketPolling();
  }
});

// Option 2: Capturing listener for event delegation
document.addEventListener('contentvisibilityautostatechange', (event) => {
  if (event.target.matches('.heavy-component')) {
    if (event.skipped) {
      stopSimulation();
    } else {
      startSimulation();
    }
  }
}, { capture: true });
```

<a id="fallback-strategies"></a>

### 回退策略

content-visibility 的 Baseline 状态：Newly available。自 2025-09-15 起纳入 Baseline。
支持的浏览器：Chrome 108（2022 年 11 月）、Edge 108（2022 年 12 月）、Firefox 130（2024 年 9 月）和 Safari 26（2025 年 9 月）。

`content-visibility` 属性及其关联的 `contentvisibilityautostatechange` 事件属于渐进增强。在不支持它们的浏览器中：

* CSS 属性会被忽略，内容照常渲染。
* 事件不会触发，后台任务会像未优化时那样持续运行。

如果必须支持旧浏览器中的任务暂停，可以使用 `IntersectionObserver` 做近似回退。这也能帮助旧设备节约电量与 CPU 资源。

```javascript
// Fallback using IntersectionObserver for older browsers
const target = document.getElementById('target-container');

// Check if content-visibility is supported
const isSupported = 'contentVisibility' in document.documentElement.style;

if (!isSupported) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // The element is close to the screen. Start work!
        startSimulation();
      } else {
        // The element is far away. Pause work!
        stopSimulation();
      }
    });
  }, {
    // Use rootMargin to start rendering before it hits the screen
    rootMargin: '200px'
  });

  observer.observe(target);
}
```
