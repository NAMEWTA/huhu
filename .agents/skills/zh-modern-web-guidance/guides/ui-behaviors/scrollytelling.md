<a id="scrollytelling"></a>

# 滚动叙事

滚动叙事通过用户滚动时的页面动画讲述故事或引导叙事，创造生动沉浸的 Web 体验。CSS 滚动驱动动画可直接实现，无需依赖 JavaScript。动画由滚动位置而非时间时钟控制，始终与用户滚动同步。

<a id="how-to-implement"></a>

## 实现方法

需要两组元素：一组跟踪滚动，另一组接受动画。

先在跟踪元素上定义具名 `view-timeline`，作为动画驱动器。

```css
#tracked {
  section:nth-child(1){ view-timeline: --tl-1 block; }
  section:nth-child(2){ view-timeline: --tl-2 block; }
  section:nth-child(3){ view-timeline: --tl-3 block; }
  section:nth-child(4){ view-timeline: --tl-4 block; }
  section:nth-child(5){ view-timeline: --tl-5 block; }
}
```

再为动画元素应用动画，通过 `animation-timeline` 关联刚创建的时间轴。

```css
#animated {
  section {
    animation: animate-in auto linear both, animate-out auto linear forwards;
    animation-range: entry 25% cover 50%, exit 50% exit 75%;
  }

  section:nth-child(1){ animation-timeline: --tl-1; }
  section:nth-child(2){ animation-timeline: --tl-2; }
  section:nth-child(3){ animation-timeline: --tl-3; }
  section:nth-child(4){ animation-timeline: --tl-4; }
  section:nth-child(5){ animation-timeline: --tl-5; }
}
```

要让 `animation-timeline` 引用具名时间轴，它们需在同一作用域。可在共同祖先设置 `timeline-scope`，让所有所需元素访问。`:root` 往往是合适选择。

```css
html {
  timeline-scope: --tl-1, --tl-2, --tl-3, --tl-4, --tl-5;
}
```

最后用 `animation-range` 指定动画运行的精确范围，细粒度控制触发时机和进度。

```css
#animated section {
  animation-range: entry 25% cover 50%, exit 50% exit 75%;
}
```

<a id="example-code"></a>

## 示例代码

```css
@supports ((animation-timeline: scroll()) and (animation-range: 0% 100%)) {
  html {
    timeline-scope: --tl-1, --tl-2, --tl-3, --tl-4, --tl-5;
  }

  #tracked {
    section:nth-child(1){ view-timeline: --tl-1 block; }
    section:nth-child(2){ view-timeline: --tl-2 block; }
    section:nth-child(3){ view-timeline: --tl-3 block; }
    section:nth-child(4){ view-timeline: --tl-4 block; }
    section:nth-child(5){ view-timeline: --tl-5 block; }
  }

  @keyframes animate-in {
    from { scale: 0.5; opacity: 0; transform: rotateY(-180deg); }
    to { transform: rotateY(0deg); }
  }
  @keyframes animate-out {
    to { translate: 100% 0; opacity: 0; }
  }

  #animated {
    section {
      animation: animate-in auto linear both, animate-out auto linear forwards;
      animation-range: entry 25% cover 50%, exit 50% exit 75%;
      backface-visibility: hidden;
    }

    section:nth-child(1){ animation-timeline: --tl-1; }
    section:nth-child(2){ animation-timeline: --tl-2; }
    section:nth-child(3){ animation-timeline: --tl-3; }
    section:nth-child(4){ animation-timeline: --tl-4; }
    section:nth-child(5){ animation-timeline: --tl-5; }
  }
}

/* MANDATORY Copy-Paste Safety: Disable continuous storytelling motion for sensitive users */
@media (prefers-reduced-motion: reduce) {
  #animated section {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

<a id="best-practices"></a>

## 最佳实践

为保证流畅和无障碍：

- **要**检测支持：用 `@supports ((animation-timeline: scroll()) and (animation-range: 0% 100%))`，为不支持者提供回退。
  - **必须**包含 `(animation-range: 0% 100%)`，过滤仅部分支持。
  - **不要**使用 `scroll-timeline-polyfill`，其功能不完整且存在许多已知问题。
  - 仅装饰性动画采用渐进增强，**不要**回退。
- **要**尊重偏好：用 `prefers-reduced-motion` 禁用或减少动画。
- **要**尽量只动画高性能属性：`transform`、`opacity` 可由合成器线程处理，`width`、`height` 可能导致性能问题。
- **要**保持声明顺序：`animation-timeline`、`animation-range` 放在 `animation` 简写之后，避免重置时间轴。

使用 `view-timeline` 时：

- **要**以 CSS `<dashed-ident>` 命名。
- **可选：** 不跟踪默认 `block` 轴时（例如水平滚动），通过 `view-timeline-axis` 明确轴。
- **要**确保查找作用域有效：声明 `view-timeline` 的元素不是动画元素的扁平树祖先时，在共享祖先上用 `timeline-scope` 提升 `view-timeline` 名称的可见性。

<a id="fallback-strategies"></a>

## 回退策略

Scroll-driven animations 的 Baseline 状态：新近可用。自 2026-10-27 起纳入 Baseline。
支持版本：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

不支持时可用回退重现视觉效果，通常为滚动监听（ScrollTimeline）或 IntersectionObserver（ViewTimeline）。

支持的浏览器始终用原生 CSS，性能更好。

并非所有效果都能回退重现。

本用例脚本用 `IntersectionObserver` 跟踪每个 `#tracked section` 可见性，并相应更新对应 `#animated section` 的 `transform`。

```js
const animatedSections = document.querySelectorAll('#animated section');
// The CSS only hides the sections once this class is set, so they stay visible if the script doesn't run
document.querySelector('#animated').classList.add('scroll-fallback');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const sectionIndex = Array.from(document.querySelectorAll('#tracked section')).indexOf(entry.target);
    if (sectionIndex !== -1) {
      const animatedSection = animatedSections[sectionIndex];
      // Reaches 1 once the section fills the viewport, even when it's taller than the viewport
      const ratio = Math.min(1, entry.intersectionRect.height / Math.min(entry.boundingClientRect.height, innerHeight));

      // Animate-in
      animatedSection.style.opacity = ratio;
      animatedSection.style.transform = `scale(${0.5 + ratio * 0.5}) rotateY(${-180 + ratio * 180}deg)`;

      // Animate-out
      if (ratio < 0.5) {
        animatedSection.style.translate = `${(0.5 - ratio) * 2 * 100}% 0`;
      } else {
        animatedSection.style.translate = '0 0';
      }
    }
  });
}, { threshold: Array.from({length: 101}, (_, i) => i / 100) });

document.querySelectorAll('#tracked section').forEach(section => {
  observer.observe(section);
});
```

配套 CSS：

```css
#animated.scroll-fallback section {
  opacity: 0;
  transform: scale(0.5)  rotateY(-180deg);
  backface-visibility: hidden;
}

/* MANDATORY Copy-Paste Safety: Ensure content remains fully visible and legible for assistive technologies or users with motion sensitivities */
@media (prefers-reduced-motion: reduce) {
  #animated section {
    opacity: 1 !important;
    transform: none !important;
    translate: 0 0 !important;
  }
}
```

此回退为不支持原生 CSS 的浏览器提供更准确的滚动驱动动画，保持更一致体验。通过为 `IntersectionObserver` 设置一系列阈值，更精确跟踪位置，创建更平滑动画。