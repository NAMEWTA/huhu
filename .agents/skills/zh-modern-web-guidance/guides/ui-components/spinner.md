<a id="loading-spinner"></a>

# 加载旋转指示器

加载旋转指示器（或活动指示器）在无法确定时长时告知用户流程正在进行。与进度环不同，它是“不确定”的，通常通过动画表达活动。

本指南通过以下方式实现：

- 使用原生 `<progress>` 作为语义基础。省略 `value` 后，浏览器将其视为不确定进度条，确保辅助技术正确播报。
- 用 `conic-gradient()` 创建可见拖尾，并用 `background-clip: border-area` 挖空中心形成圆环。
- 使用 CSS 变换高效动画，并尊重 `prefers-reduced-motion`，让所有用户都获得舒适体验。

已知时长的确定任务参见 `progress-ring`（通过 `npx -y modern-web-guidance@latest retrieve "progress-ring"` 获取）。

<a id="implementation"></a>

## 实现

<a id="1-markup"></a>

### 1. 标记

使用原生 `<progress>` 同时作为语义真实依据与视觉组件。没有 `value` 属性时，它隐式表示不确定状态。

```html
<progress aria-label="Loading" class="loading-spinner"></progress>
```

<a id="2-styles"></a>

### 2. 样式

<a id="hiding-native-ui"></a>

#### 隐藏原生 UI
要将 `<progress>` 设置为旋转指示器，先隐藏浏览器默认的不确定进度条样式。

```css
/* Hide native bars */
progress.loading-spinner:indeterminate::-webkit-progress-bar {
  display: none;
  background: none;
}
progress.loading-spinner:indeterminate::-webkit-progress-value {
  display: none;
  background: none;
}
progress.loading-spinner:indeterminate::-moz-progress-bar {
  display: none;
  background: none;
}
progress.loading-spinner:indeterminate::slider-fill {
  display: none;
  background: none;
}
```

<a id="spinner-ring-and-trail"></a>

#### 圆环和拖尾
用 `conic-gradient` 创建可见拖尾。强制颜色模式会移除背景渐变，因此在 `@media (forced-colors: active)` 中，用 `forced-color-adjust: none` 排除自动调整，并使用系统颜色绘制，否则指示器会消失。

```css
@property --arc-start {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
@property --arc-end {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
/* Use a custom property to conditionally include the dash animation */
@property --progress-dash-animation {
  syntax: "*";
  inherits: false;
  initial-value: , progress-dash 3s ease-in-out infinite;
}

progress.loading-spinner:indeterminate {
  --_from: calc(90deg + var(--arc-start, 0deg));
  --_to: calc(90deg + var(--arc-end, 158deg));
  --size: 40px;
  --thickness: 2px;
  --spinner-color: #2563eb;
  --track-color: #e2e5e7;
  --spinner-duration: 1.5s;
  --_used-spinner-duration: var(--spinner-duration);
  --spinner-timing: linear;

  position: relative;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  appearance: none;

  /* Create the fading trail with dynamic angles */
  background: conic-gradient(
      from var(--_from),
      var(--spinner-color) calc(var(--_to) - var(--_from)),
      transparent 0
    )
    var(--track-color);

  @supports (background-clip: border-area) {
    background-clip: border-area;
    border: var(--thickness) solid transparent;
    background-origin: border-box;
  }

  /* ... fallback for background-clip: border-area ... */

  @media (forced-colors: active) {
    /* Keeps the gradient, which forced colors mode removes, and draws it in system colors */
    forced-color-adjust: none;
    --spinner-color: CanvasText;
    --track-color: Canvas;
  }

  /* The dash animation is only included if @property is supported */
  animation:
    progress-spin var(--_used-spinner-duration) linear infinite
    var(--progress-dash-animation, );
}

@keyframes progress-spin {
  to {
    rotate: 1turn;
  }
}

@keyframes progress-dash {
  from {
    --arc-start: 0deg;
    --arc-end: 3deg;
  }
  50% {
    --arc-start: 100deg;
    --arc-end: 358deg;
  }
  to {
    --arc-start: 360deg;
    --arc-end: 363deg;
  }
}
```

<a id="respecting-motion-preferences"></a>

#### 尊重动态效果偏好

快速旋转可能使对动态效果敏感的用户感到迷失。始终尊重 `prefers-reduced-motion`。设置内部 `--_used-spinner-duration` 来覆盖用户的 `--spinner-duration`，使用与指示器规则相同的选择器以确保覆盖生效，并去掉虚线动画，只保留缓慢旋转。

```css
@media (prefers-reduced-motion: reduce) {
  progress.loading-spinner:indeterminate {
    /* Slow down the animation significantly rather than stopping it entirely,
       so the user still knows that the process is active. */
    --_used-spinner-duration: 6s;
    /* Drops the dash animation, so the arc keeps a fixed length */
    --progress-dash-animation: ;
    --arc-end: 158deg;
  }
}
```

<a id="fallback-strategies"></a>

## 回退策略

Registered custom properties 的 Baseline 状态：新近可用。自 2024-07-09 起纳入 Baseline。
支持版本：Chrome 85（2020 年 8 月）、Edge 85（2020 年 8 月）、Firefox 128（2024 年 7 月）和 Safari 16.4（2023 年 3 月）。

支持 `@property` 时，通过 `--progress-dash-animation` 属性的 `initial-value` 自动加入虚线动画。不支持 `@property` 时，属性注册被忽略，动画回退为简单旋转。此回退无需 JavaScript。

background-clip: border-area 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）、Edge 150（2026 年 7 月）和 Safari 18.2（2024 年 12 月）。
不支持：Firefox。

尚不支持 `background-clip: border-area` 的浏览器，用 `mask-image` 回退来挖空中心。

```css
/* Fallback: use mask-image to create the ring */
@supports not (background-clip: border-area) {
  --clip-boundary: calc(100% - var(--thickness));
  mask-image: radial-gradient(
    farthest-side,
    transparent var(--clip-boundary),
    black var(--clip-boundary)
  );
  border: 0;
}
```