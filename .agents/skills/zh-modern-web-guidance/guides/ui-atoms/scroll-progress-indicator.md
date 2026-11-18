<a id="build-a-scroll-progress-indicator"></a>

# 构建滚动进度指示器

滚动进度指示器是一种常见 UI 模式，以视觉方式传达用户在可滚动文档或容器中的阅读进度。用户滚动时，视觉元素随位置更新，让用户清晰、直观地了解已看过多少内容、还剩多少。

<a id="how-to-implement"></a>

## 实现方法

创建滚动进度指示器需要两样东西：

1. 作为进度条的元素。通常使用 `position: fixed` 或 `position: absolute`，使其在用户滚动时保持可见。
2. 与滚动位置关联的动画。

可以按以下方式实现：

- 首先，创建充当进度条的 HTML 元素，并按需要设置样式。
- 然后，在 CSS 中定义缩放进度条的 `@keyframes` 动画。常见方式是从 `scaleX(0)` 缩放到 `scaleX(1)`。
- 最后，将动画应用于进度条，并将其 `animation-timeline` 设置为 scroll-timeline。这会让浏览器根据最近祖先滚动容器的位置驱动动画进度。

<a id="example-code"></a>

## 代码示例

以下代码使用 `scroll()` 函数创建的匿名 scroll-timeline，让 `#progress` 元素随滚动增长。

```css
@media (prefers-reduced-motion: no-preference) {
  @supports ((animation-timeline: scroll())) {
    @keyframes grow-progress {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }

    #progress {
      position: fixed;
      left: 0; top: 0;
      width: 100%; height: 1em;
      background: red;

      transform-origin: 0 50%;
      animation: grow-progress auto linear;
      animation-timeline: scroll();
    }
  }
}
```


由于元素在 DOM 中的位置，`scroll()` 会在 `block` 方向跟踪最近祖先滚动容器，此处就是根滚动容器。

```html
<body>
  <div id="progress"></div>
</body>
```


以下代码使用 `scroll-timeline` 属性创建的具名 scroll-timeline，让 `#progress` 元素随滚动增长。

```css
@media (prefers-reduced-motion: no-preference) {
  @supports ((animation-timeline: scroll())) {
    @keyframes grow-progress {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }

    :root {
      scroll-timeline: --tl block;
    }

    #progress {
      position: fixed;
      left: 0; top: 0;
      width: 100%; height: 1em;
      background: red;

      transform-origin: 0 50%;
      animation: grow-progress auto linear;
      animation-timeline: --tl;
    }
  }
}
```


<a id="best-practices"></a>

## 最佳实践

使用滚动驱动动画时，遵循以下最佳实践，确保体验流畅且可访问：

- **应当**包含特性检测：并非所有浏览器都支持滚动驱动动画。使用 `@supports (animation-timeline: scroll())` 检查支持情况，为不支持的浏览器提供回退。
  - **不要**将 `scroll-timeline-polyfill` 包用于回退策略，因为它功能不完整，并有许多已知问题。
  - 如果动画仅具装饰作用，采用渐进增强，**不要**提供回退。
- **应当**让纯装饰性指示器不进入辅助技术的阅读流程：仅通过 CSS 设置样式的空元素不需要额外操作。如果指示器包含文本或图像，为其设置 `aria-hidden="true"`。
- **应当**尊重用户偏好：一些用户希望网页动态效果更少。使用 `prefers-reduced-motion` 媒体查询，为这些用户禁用或减少动画。
- **应当**尽量只对性能良好的 CSS 属性设置动画：为获得最流畅效果，使用浏览器合成线程可处理的属性，例如 `transform` 和 `opacity`。对 `width`、`height` 等其他属性设置动画，可能造成性能问题。
- **应当**使用正确声明顺序：使用 `animation` 简写时，在它**之后**声明 `animation-timeline`，防止简写重置时间线。

使用 `scroll()` 函数创建滚动驱动动画时：

- **可选**，显式指定滚动容器：目标不是最近祖先滚动容器时，通过 `scroll(root)` 或 `scroll(self)` 明确要使用哪个滚动容器。
  - 如果 `root`、`nearest` 或 `self` 均不够用，使用具名 scroll-timeline。
- **可选**，显式指定跟踪轴：目标不是默认 `block` 轴时（例如水平滚动容器），通过 `scroll(block)` 或 `scroll(inline)` 明确跟踪哪个轴。

使用 `scroll-timeline` 属性创建滚动驱动动画时：

- **应当**使用 CSS `<dashed-ident>` 命名。
- **可选**，显式指定跟踪轴：目标不是默认 `block` 轴时（例如水平滚动容器），通过 `scroll-timeline-axis` 明确跟踪哪个轴。
- **应当**确保名称查找作用域有效：如果声明 `scroll-timeline` 的元素不是动画元素在扁平树中的祖先，通过共同祖先上的 `timeline-scope` 提升 `scroll-timeline` 名称的可见范围。

<a id="fallback-strategies"></a>

## 回退策略

滚动驱动动画的 Baseline 状态：新近可用。它自 2026-10-27 起进入 Baseline。
支持的浏览器：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

对于不支持滚动驱动动画的浏览器，可以通过回退重现视觉效果。通常使用滚动监听器（对应 ScrollTimeline 效果）或 IntersectionObserver API（对应 ViewTimeline 效果）实现。

在原生支持滚动驱动动画的浏览器中，始终使用原生 CSS 实现，因为性能更好。

注意，并非所有效果都能通过回退方式重现。

针对本用例，以下脚本为不支持滚动驱动动画的浏览器应用回退。它用滚动监听器跟踪根元素的滚动位置，并相应更新进度条的 `transform` 属性。

```html
<script>
  if (!CSS.supports('animation-timeline', 'scroll()')) {
    const progress = document.querySelector('#progress');

    window.addEventListener('scroll', () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const progressPercentage = (scrolled / scrollable);

      progress.style.transform = `scaleX(${progressPercentage})`;
    });
  }
</script>
```

