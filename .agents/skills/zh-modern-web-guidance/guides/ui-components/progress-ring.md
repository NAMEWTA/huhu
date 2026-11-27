<a id="progress-ring"></a>

# 进度环

进度环（或圆形进度条）为任务状态提供视觉反馈。与线性进度条相比，圆形适合仪表板、卡片组件或空间受限的位置。

本指南通过以下方式实现进度环：

- 使用原生 `<progress>` 作为语义基础，确保组件开箱即用地支持屏幕阅读器和键盘用户。
- 使用 `conic-gradient()` 与 `mask-image` 设置样式，无需复杂 SVG 路径操作，即可获得完全响应式、可主题化的圆环。
- 使用 CSS 自定义属性和 `@property`，让进度填充平滑过渡并获得 GPU 加速。

此方式优于纯 SVG 方案，因为它使用语义 `<progress>` 而非 ARIA，更容易融入现有布局、设计系统和排版。

不确定的加载状态参见 `spinner`（通过 `npx -y modern-web-guidance@latest retrieve "spinner"` 获取）。

<a id="implementation"></a>

## 实现

<a id="1-markup"></a>

### 1. 标记

用包装元素容纳可见圆环和可选中心内容。`<progress>` 仍是语义真实依据。使用工具类在视觉上隐藏原生进度条，同时保持可访问。

```html
<div class="progress-ring-wrapper">
  <progress value="75" max="100" aria-label="Task progress" class="progress-ring"></progress>
  <!-- 可选：显示在中心的内容。因重复 <progress> 元素的值，对辅助技术隐藏。 -->
  <div class="progress-ring-content" aria-hidden="true">
    75%
  </div>
</div>
```

通过 `aria-hidden="true"` 对辅助技术隐藏中心内容。`<progress>` 已暴露其值，否则屏幕阅读器会重复播报。

如果中心内容用另一种形式显示值，例如“5 个文件中的 3 个”或百分比，每次更新时也将相同文字设为 `<progress>` 的 `aria-valuetext`，否则屏幕阅读器只能获取数字。

<a id="2-styles"></a>

### 2. 样式

<a id="hiding-native-ui"></a>

#### 隐藏原生 UI
要将 `<progress>` 样式设为进度环，先隐藏浏览器默认进度条样式。

```css
/* 隐藏原生进度条。 */
progress.progress-ring::-webkit-progress-bar {
  display: none;
  background: none;
}
progress.progress-ring::-webkit-progress-value {
  display: none;
  background: none;
}
progress.progress-ring::-moz-progress-bar {
  display: none;
  background: none;
}
progress.progress-ring::slider-fill {
  display: none;
  background: none;
}
```

<a id="container-and-ring"></a>

#### 容器和圆环

包装元素提供定位上下文，`<progress>` 负责可见渐变。强制颜色模式会移除背景渐变，因此在 `@media (forced-colors: active)` 中，用 `forced-color-adjust: none` 将圆环排除自动调整，并使用系统颜色绘制，否则圆环会消失。

```css
.progress-ring-wrapper {
  position: relative;
  display: grid;
  place-items: center;
}

progress.progress-ring {
  --size: 150px;
  --thickness: 16px;
  --track-color: #f1f5f9;
  --fill-color: #3b82f6;
  --value: attr(value type(<number>));
  width: var(--size);
  height: var(--size);

  transition: --value 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;

  background: conic-gradient(
    var(--fill-color) calc(var(--value) * 1%),
    var(--track-color) 0
  );

  /* 必须：将背景裁剪到 border-area。 */
  background-clip: border-area;
  border: var(--thickness) solid transparent;
  background-origin: border-box;

  @media (forced-colors: active) {
    /* 保留强制颜色模式会移除的渐变，并以系统颜色绘制。 */
    forced-color-adjust: none;
    --fill-color: CanvasText;
    --track-color: Canvas;
  }
}

.progress-ring-content {
  /* 放在包裹层中央。 */
  position: absolute;
}
```

也可以用 `radial-gradient` 制作圆角端帽。

<a id="enable-smooth-transitions-with-property"></a>

#### 使用 `@property` 启用平滑过渡

为在数值变化时让进度环平滑动画，将 `--value` 注册为数值型自定义属性。

对动态效果敏感的用户可能因数值间过渡而感到迷失。尊重 `prefers-reduced-motion`：默认持续时间为 0 秒（即时），只为没有此偏好的用户设置更长时长。

```css
@property --value {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

progress.progress-ring {
  transition: --value 0s ease-in-out;
  @media (prefers-reduced-motion: no-preference) {
    transition-duration: 0.4s;
  }
}

```

<a id="3-progress-updates"></a>

### 3. 更新进度

值变化时更新 `<progress>` 的 `value` 属性，以及 `.progress-ring-content` 的文本（若显示百分比）。

<a id="4-optional-success-state"></a>

### 4. 可选成功状态

可以使用 CSS 属性选择器，在任务完成时自动更新圆环外观，例如改为绿色。

```css
/* 进度到达 100% 时，将填充色改为绿色。 */
progress.progress-ring[value="100"] {
  --fill-color: #10b981;
}
```

<a id="fallback-strategies"></a>

## 回退策略

不要在 `<progress>` 元素内部添加回退值。辅助技术不使用它，所有现代浏览器也都会忽略。

<a id="animation-fallback"></a>

#### 动画回退

Registered custom properties 的 Baseline 状态：新近可用。自 2024-07-09 起纳入 Baseline。
支持版本：Chrome 85（2020 年 8 月）、Edge 85（2020 年 8 月）、Firefox 128（2024 年 7 月）和 Safari 16.4（2023 年 3 月）。

不支持 `@property` 时，圆环会直接跳到新值，而非平滑过渡。多数情况下这完全可接受，不影响功能。

如果过渡绝对必需，可以检测 `@property` 支持，并在旧浏览器中用 `requestAnimationFrame()` 循环插值 `--value`。

background-clip: border-area 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）、Edge 150（2026 年 7 月）和 Safari 18.2（2024 年 12 月）。
不支持：Firefox。

尚不支持 `background-clip: border-area` 的浏览器，用 `mask-image` 回退，将 `<progress>` 中心挖空。

```css
/* 顶层 @supports 内的声明需要选择器，否则解析器会丢弃它们。 */
@supports not (background-clip: border-area) {
  progress.progress-ring {
    mask-image: radial-gradient(
      transparent calc(50% - var(--thickness)),
      black calc(50% - var(--thickness) + 0.5px)
    );
    border: 0;
  }
}
```

attr() 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 155（2026 年 9 月）。
不支持：Safari。

对于不支持在任意属性中使用 CSS `attr()` 的浏览器，用 `MutationObserver` 自动将 `value` 属性同步到 `--value` 自定义属性。

```js
if (!CSS.supports("width: attr(value type(<number>))")) {
  const observer = new MutationObserver(() => {
    progress.style.setProperty("--value", progress.getAttribute("value"));
  });
  observer.observe(progress, {
    attributes: true,
    attributeFilter: ["value"],
  });
}
```