<a id="shrinking-header-on-scroll"></a>

# 随滚动缩小的页头

随滚动缩小的页头是常见 UI 模式：页面顶部固定的页头随着用户向下滚动，平滑缩小。该效果常用于尽量增加主要内容的屏幕空间，同时保留必要导航或品牌元素的可访问性。CSS 滚动驱动动画通过将动画与文档滚动位置关联，可以以声明式、高性能方式实现。

<a id="how-to-implement"></a>

## 实现方法

创建随滚动缩小页头的步骤如下：

1. **创建固定页头：**先建立固定在页面顶部、具有预定义高度的页头元素。

    ```html
    <header>HEADER</header>
    ```


    ```css
    header {
      position: fixed;
      height: 200px;
      top: 0;
      left: 0;
      right: 0;
    }
    ```


2. **定义缩小动画：**创建改变页头高度的 CSS 动画。

    ```css
    @keyframes shrink {
      to {
        height: 50px;
      }
    }
    ```


3. **应用动画和滚动时间线：**将动画附加到页头，并通过 `scroll()` 函数关联到文档滚动位置。

    ```css
    header {
      animation: shrink auto linear both;
      animation-timeline: scroll(block root);
    }
    ```


4. **设置 `animation-range`：**使用 `animation-range` 指定动画发生的滚动距离。例如，要在前 150 像素滚动中缩小页头，使用 `animation-range: 0px 150px;`。

    ```css
    header {
      animation-range: 0px 150px;
    }
    ```


如果页头使用 `position: sticky`，设置 `scroll-padding-top`，确保元素获得焦点时不会显示在粘性内容下方。将其值设为粘性元素高度，使控件获得焦点时始终可见，并位于粘性内容之后。这满足 WCAG 2.4.11 焦点不被遮挡，确保聚焦控件不会被完全盖住。可以在缩小页头的同一条 `scroll-timeline` 上为 `scroll-padding-top` 设置动画，使其值与视觉变化同步。

**提示：**为避免页头后面的内容被遮挡，给 `body`（或主要内容容器）添加与页头初始高度相等的 `padding-top`。

**提示：**为确保页面内容滚动与页头缩小同步，将 `animation-range-end` 设为起始和结束尺寸的差值。这样动画会恰在页头达到最终尺寸时完成。本演示中页头从 `200px` 缩到 `50px`，因此 `animation-range-end` 设置为 `150px`。

<a id="example-code"></a>

## 代码示例

```css
@keyframes shrink {
  to {
    height: 50px;
  }
}

header {
  animation: shrink auto linear both;
  animation-timeline: scroll(block root);
  animation-range: 0px 150px;
}
```


<a id="best-practices"></a>

## 最佳实践

使用滚动驱动动画时，遵循以下最佳实践，确保体验流畅且可访问：

- **应当**包含特性检测：并非所有浏览器都支持滚动驱动动画。使用 `@supports ((animation-timeline: scroll()) and (animation-range: 0% 100%))` 检查支持情况，为不支持的浏览器提供回退。
  - 此处**必须**包含 `(animation-range: 0% 100%)` 检查，过滤仅部分支持的浏览器。
  - **不要**将 `scroll-timeline-polyfill` 包用于回退策略，因为它功能不完整，并有许多已知问题。
  - 如果动画仅具装饰作用，采用渐进增强，**不要**提供回退。
- **应当**尊重用户偏好：一些用户希望网页动态效果更少。使用 `prefers-reduced-motion` 媒体查询，为这些用户禁用或减少动画。
- **应当**尽量只对性能良好的 CSS 属性设置动画：为获得最流畅效果，使用浏览器合成线程可处理的属性，例如 `transform` 和 `opacity`。对 `width`、`height` 等其他属性设置动画，可能造成性能问题。
- **应当**使用正确声明顺序：使用 `animation` 简写时，在它**之后**声明 `animation-timeline` 和 `animation-range`，防止简写重置时间线。

使用 `scroll()` 函数创建滚动驱动动画时：

- **可选**，显式指定滚动容器：目标不是最近祖先滚动容器时，通过 `scroll(root)` 或 `scroll(self)` 明确要使用哪个滚动容器。
  - 如果 `root`、`nearest` 或 `self` 均不够用，使用具名 scroll-timeline。
- **可选**，显式指定跟踪轴：目标不是默认 `block` 轴时（例如水平滚动容器），通过 `scroll(block)` 或 `scroll(inline)` 明确跟踪哪个轴。

具体到本用例：

- 在 `animation-range` 中使用百分比时，动画元素**不能**是 `position: static` 或 `position: relative`。
  - 因为这些元素属于“普通流”。滚动时缩小它们，会缩短总滚动距离，从而影响例如滚动到 `10%` 时的计算值。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

滚动驱动动画的 Baseline 状态：新近可用。它自 2026-10-27 起进入 Baseline。
支持的浏览器：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。因此，通常需要回退策略。

对于不支持滚动驱动动画的浏览器，可以通过回退重现视觉效果。通常使用滚动监听器（对应 ScrollTimeline 效果）或 IntersectionObserver API（对应 ViewTimeline 效果）实现。

在原生支持滚动驱动动画的浏览器中，始终使用原生 CSS 实现，因为性能更好。

注意，并非所有效果都能通过回退方式重现。

针对本用例，以下脚本为不支持滚动驱动动画的浏览器应用回退。它用滚动监听器跟踪文档在 `150px` 距离内的滚动位置，并相应更新页头高度。

```js
// Fallback for browsers that don't support scroll-driven animations
if (!CSS.supports('(animation-timeline: scroll()) and (animation-range: 0% 100%)')) {
  const header = document.querySelector('header');

  const initialHeight = 200;
  const finalHeight = 50;
  const scrollDistance = 150;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const scrollPercent = Math.min(1, scrollY / scrollDistance);
    const newHeight = initialHeight - (initialHeight - finalHeight) * scrollPercent;

    header.style.height = `${newHeight}px`;
  });
}
```

