<a id="build-carousel-slide-effects"></a>

# 构建轮播幻灯片效果

轮播幻灯片效果可以为轮播增添视觉趣味。用户滚动幻灯片时，每张幻灯片都可以在进入滚动视口、位于中心和离开时播放动画，例如淡入淡出、旋转或缩放，从而营造动态且有吸引力的体验。与简单的入场／离场动画不同，这种效果用一段连续动画控制幻灯片穿过整个滚动视口时的外观。

<a id="how-to-implement"></a>

## 实现方法

创建轮播幻灯片效果的步骤如下：

1. **创建滚动容器：**该元素作为轮播幻灯片容器。本例使用 `overflow-x: scroll` 允许水平滚动。如果幻灯片不含可聚焦元素，为滚动容器设置 `tabindex="0"` 和无障碍名称，因为并非所有浏览器都让滚动容器默认可由键盘聚焦。名称需要支持命名的角色：`<ul>` 已有 `list` 角色，而 `<div>` 需要添加角色，例如 `role="region"`。

    ```html
    <!-- The slides contain no focusable elements, so the scroller takes focus itself. The label is an example. -->
    <ul class="scroller" tabindex="0" aria-label="Slides">
      <li class="entry">1</li>
      <li class="entry">2</li>
      <li class="entry">3</li>
      …
    </ul>
    ```


    ```css
    .scroller {
      overflow-x: scroll;
    }
    ```


   如果希望滚动停止时项目整齐吸附到中心状态，可以给滚动容器添加 `scroll-snap-type: x mandatory`，给幻灯片添加 `scroll-snap-align: center`。

2. **定义动画：**创建 CSS 动画，定义幻灯片穿过滚动视口时的不同状态。可以为动画任意部分定义关键帧。例如，加入 `50%` 关键帧即可定义幻灯片位于滚动视口中心时的状态。本例中，`scale` 属性使幻灯片接近中心时放大，远离中心时缩小。

    ```css
    @keyframes animate {
      0% {
        scale: 0.5;
      }
      50% {
        scale: 1;
      }
      100% {
        scale: 0.5;
      }
    }
    ```


3. **应用动画和 `view-timeline`：**将动画附加到轮播幻灯片，并关联到跟踪元素穿过容器的 `view-timeline`。

    ```css
    .scroller > * {
      animation: animate auto linear both;
      animation-timeline: view(inline);
    }
    ```


   默认情况下，`view()` 在 `block` 轴上跟踪元素。如果需要在 `inline` 轴跟踪，可以使用 `view(inline)`。

<a id="example-code"></a>

## 代码示例

以下代码通过**匿名 view-timeline**，在水平滚动容器滚动时为轮播项目添加动画：

```css
/* Scale values are examples; customize with performant properties such as transform, scale, or opacity */
@keyframes animate {
  0% {
    scale: 0.5;
  }

  50% {
    scale: 1;
  }

  100% {
    scale: 0.5;
  }
}

/* Only runs the effect when the user has no reduced-motion preference */
@media (prefers-reduced-motion: no-preference) {
  /* Include (animation-range: entry) to exclude browsers with partial scroll-driven animation support */
  @supports ((animation-timeline: view()) and (animation-range: entry)) {
    .scroller > * {
      /* Applies the animation using an `auto` duration */
      animation: animate auto linear both;
      /* Sets the animation timeline to use an anonymous view progress timeline, tracking the element's progress through the scroller on the inline axis */
      animation-timeline: view(inline);
    }
  }
}
```


以下代码通过**具名 view-timeline**，在水平滚动容器滚动时为轮播项目添加动画：

```css
/* Scale values are examples; customize with performant properties such as transform, scale, or opacity */
@keyframes animate {
  0% {
    scale: 0.5;
  }

  50% {
    scale: 1;
  }

  100% {
    scale: 0.5;
  }
}

/* Only runs the effect when the user has no reduced-motion preference */
@media (prefers-reduced-motion: no-preference) {
  /* Include (animation-range: entry) to exclude browsers with partial scroll-driven animation support */
  @supports ((animation-timeline: view()) and (animation-range: entry)) {
    /* This creates a named view-timeline on each carousel item. The timeline is used to drive the animation that is applied on the same element. */
    .scroller > * {
      /* Applies the animation using an `auto` duration */
      animation: animate auto linear both;
      /* Defines a named view progress timeline, tracking the element's progress through the scroller on the inline axis */
      view-timeline: --item inline;
      /* Sets the animation timeline to use the named view progress timeline defined above */
      animation-timeline: --item;
    }
  }
}
```


<a id="best-practices"></a>

## 最佳实践

使用滚动驱动动画时，遵循以下最佳实践，确保体验流畅且可访问：

- **应当**包含特性检测：并非所有浏览器都支持滚动驱动动画。使用 `@supports ((animation-timeline: view()) and (animation-range: entry))` 检查支持情况，为不支持的浏览器提供回退。
  - 此处**必须**包含 `(animation-range: entry)` 检查，过滤仅部分支持的浏览器。
  - **不要**将 `scroll-timeline-polyfill` 包用于回退策略，因为它功能不完整，并有许多已知问题。
  - 如果动画仅具装饰作用，采用渐进增强，**不要**提供回退。
- **应当**尊重用户偏好：一些用户希望网页动态效果更少。使用 `prefers-reduced-motion` 媒体查询，为这些用户禁用或减少动画。
- **应当**尽量只对性能良好的 CSS 属性设置动画：为获得最流畅效果，使用浏览器合成线程可处理的属性，例如 `transform` 和 `opacity`。对 `width`、`height` 等其他属性设置动画，可能造成性能问题。
- **应当**使用正确声明顺序：使用 `animation` 简写时，在它**之后**声明 `animation-timeline` 和 `animation-range`，防止简写重置时间线。

当动画元素与被跟踪元素是同一个元素时，默认使用匿名 `view()` 时间线，避免给每条时间线命名。如果多个元素复用同一条时间线（避免重复时间线），或需要跨 DOM 引用（例如通过 `timeline-scope` 为后代或非祖先元素设置动画，且 `view()` 或 `scroll(nearest)` 不足以实现），则使用具名 `view-timeline`。

使用 `view()` 函数创建滚动驱动动画时：

- **可选**，显式指定跟踪轴：目标不是默认 `block` 轴时（例如水平滚动容器），通过 `view(block)` 或 `view(inline)` 明确跟踪哪个轴。

使用 `view-timeline` 属性创建滚动驱动动画时：

- **应当**使用 CSS `<dashed-ident>` 命名（如 `view-timeline: --my-custom-name`）。
- **可选**，显式指定跟踪轴：目标不是默认 `block` 轴时（例如水平滚动容器），通过 `view-timeline-axis` 明确跟踪哪个轴。
- **应当**确保名称查找作用域有效：如果声明 `view-timeline` 的元素不是动画元素在扁平树中的祖先，通过共同祖先上的 `timeline-scope` 提升 `view-timeline` 名称的可见范围。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

滚动驱动动画的 Baseline 状态：新近可用。它自 2026-10-27 起进入 Baseline。
支持的浏览器：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

因此，通常需要回退策略。

对于不支持滚动驱动动画的浏览器，可以通过回退重现视觉效果。通常使用滚动监听器（对应 ScrollTimeline 效果）或 IntersectionObserver API（对应 ViewTimeline 效果）实现。

在原生支持滚动驱动动画的浏览器中，始终使用原生 CSS 实现，因为性能更好。

注意，并非所有效果都能通过回退方式重现。

针对本用例，以下脚本为不支持滚动驱动动画的浏览器应用回退。它通过 Web Animations API（`Element.animate()`）给轮播中的每个项目创建暂停的动画，然后监听滚动容器的 `scroll` 事件，根据项目在容器中的滚动进度更新各动画的 `currentTime`。CSS 中的 `prefers-reduced-motion` 媒体查询不会影响脚本创建的动画，因此脚本通过 `matchMedia()` 检查偏好，仅在用户没有减少动态效果偏好时运行。

```js
// Fallback for browsers that don't support scroll-driven animations
// Like the CSS, it only runs when the user has no reduced-motion preference.
if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)') &&
    matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  const scroller = document.querySelector('.scroller');
  const entries = document.querySelectorAll('.entry');

  // Create a map to store animations
  const animations = new Map();

  entries.forEach(entry => {
    const animation = entry.animate(
      {
        scale: ['0.5', '1', '0.5']
      },
      {
        duration: 1, // We'll control the time ourselves
        fill: 'both'
      }
    );
    animation.pause();
    animations.set(entry, animation);
  });

  // Update animations on scroll
  const tick = () => {
    const scrollerRect = scroller.getBoundingClientRect();

    entries.forEach(entry => {
      const animation = animations.get(entry);
      if (!animation) return;

      const entryRect = entry.getBoundingClientRect();
      const progress = (entryRect.left + entryRect.width / 2 - scrollerRect.left) / scrollerRect.width;

      animation.currentTime = progress;
    });
  };
    
  scroller.addEventListener('scroll', tick);
  tick();
}
```

