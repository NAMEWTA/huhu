<a id="add-entry-and-exit-effects-to-elements-as-they-enter-or-exit-the-scrollport"></a>

# 为进入或离开滚动可视区的元素添加效果

进入和退出效果在元素进入或离开视口时触发，可创建生动动态体验。例如滚入时淡入，滚出时缩小。

<a id="how-to-implement"></a>

## 实现方法

需要组合几个 CSS 属性，步骤如下：

1. **分别为进入和退出创建 `@keyframes`。** 进入视口时应用进入动画，离开时应用退出动画。

    ```css
    @keyframes slide-in {
      from { transform: translateX(-100%); }
    }
    @keyframes slide-out {
      to { transform: translateX(100%); }
    }
    ```

2. **将两组关键帧附加到元素。** 在 `animation` 中定义多个动画。

   - 将进入动画的 `animation-fill-mode` 设为 `backwards`，开始前应用初始状态。
   - 将退出动画的 `animation-fill-mode` 设为 `forwards`，完成后保持最终状态。

    ```css
    .animated-element {
      animation:
        slide-in auto linear backwards,
        slide-out auto linear forwards;
    }
    ```

3. **创建 View Timeline 并关联动画。** 视图时间轴绑定元素在视口中的可见性，通过 `view()` 创建，再用 `animation-timeline` 应用。

    ```css
    .animated-element {
      animation-timeline: view();
    }
    ```

   `view()` 默认跟踪 `block` 轴。需要跟踪 `inline` 轴时用 `view(inline)`。

4. **将动画限制在 `entry` 与 `exit` 范围。** `animation-range` 指定时间轴哪一段运行动画。

   - `entry` 从元素首次进入到完全可见。
   - `exit` 从开始离开到完全隐藏。

    ```css
    .animated-element {
      animation-range: entry, exit;
    }
    ```

   也可不用两条独立 `@keyframes` 规则和 `animation-range: entry, exit`，改在**单个 `@keyframes`** 中使用 `<timeline-range-name>` 选择器（`entry 0%`、`entry 100%`、`exit 0%`、`exit 100%`）并设 `animation-fill-mode: both`。需要复用、组合独立动画（如共享的 `fade-in`、`fade-out` 关键帧）时，使用分开的 `@keyframes`；需要将同一元素的进入和退出逻辑集中在一处时，使用单条 `@keyframes` 规则。

<a id="example-code"></a>

## 示例代码

以下用**匿名视图时间轴**，在滚动时动画滚动器的直接子元素：

```css
@media (prefers-reduced-motion: no-preference) {
  @supports ((animation-timeline: view()) and (animation-range: entry)) {
    @keyframes grow {
      from {
        scale: 0.5;
      }
    }
    @keyframes shrink {
      to {
        scale: 0.5;
      }
    }

    .scroller > * {
      animation:
        grow auto linear backwards,
        shrink auto linear forwards;
      animation-timeline: view(inline);
      animation-range: entry, exit;
    }
  }
}
```

元素进入可视区时播放 `grow`，离开时播放 `shrink`。

以下视觉结果相同，但使用**具名视图时间轴**：

```css
@media (prefers-reduced-motion: no-preference) {
  @supports ((animation-timeline: view()) and (animation-range: entry)) {
    @keyframes grow {
      from {
        scale: 0.5;
      }
    }
    @keyframes shrink {
      to {
        scale: 0.5;
      }
    }

    .scroller > * {
      view-timeline: --tl inline;
      animation:
        grow auto linear backwards,
        shrink auto linear forwards;
      animation-timeline: --tl;
      animation-range: entry, exit;
    }
  }
}
```

也可以在**单条 `@keyframes`** 中用时间轴范围选择器表达相同效果，填充模式设 `both`，元素上无需覆盖 `animation-range`：

```css
@media (prefers-reduced-motion: no-preference) {
  @supports ((animation-timeline: view()) and (animation-range: entry)) {
    @keyframes grow-and-shrink {
      entry 0% {
        scale: 0.5; /* Example value */
      }
      /* Explicitly set the resting state across the middle (`contain`) phase so the element doesn't interpolate straight from entry 0% to exit 100% */
      entry 100%,
      exit 0% {
        scale: 1;
      }
      exit 100% {
        scale: 0.5;
      }
    }

    .scroller > * {
      animation: grow-and-shrink auto linear both;
      animation-timeline: view(inline);
    }
  }
}
```

<a id="best-practices"></a>

## 最佳实践

滚动驱动动画应遵循以下实践，确保流畅和无障碍：

- **要**检测特性：用 `@supports ((animation-timeline: view()) and (animation-range: entry))` 检查，并为不支持者提供回退。
  - **必须**包含 `(animation-range: entry)`，过滤仅部分支持的浏览器。
  - **不要**使用 `scroll-timeline-polyfill`，其功能不完整且存在大量已知问题。
  - 仅装饰性动画选择渐进增强，**不要**回退。
- **要**尊重用户偏好：用 `prefers-reduced-motion` 禁用或减少动画。
- **要**尽量只动画高性能属性：`transform`、`opacity` 可由合成器线程处理；`width`、`height` 可能带来性能问题。
- **要**保持声明顺序：`animation-timeline` 与 `animation-range` 放在 `animation` 简写之后，避免重置。

动画元素与跟踪元素相同时，默认用匿名 `view()`，无需逐个命名。多个元素共用单一时间轴（避免重复），或跨 DOM 访问（例如用 `timeline-scope` 动画后代或非祖先关系元素，`view()` 或 `scroll(nearest)` 不够）时用具名 `view-timeline`。

使用 `view()` 时：

- **可选：** 不跟踪默认 `block` 轴时（例如水平滚动器），通过 `view(block)` 或 `view(inline)` 明确轴。

使用 `view-timeline` 时：

- **要**以 CSS `<dashed-ident>` 命名。
- **可选：** 不跟踪默认 `block` 轴时（例如水平滚动器），通过 `view-timeline-axis` 明确要跟踪的轴。
- **要**确保查找作用域有效：声明 `view-timeline` 的元素不是动画元素的扁平树祖先时，在共享祖先上用 `timeline-scope` 提升 `view-timeline` 名称的可见范围。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

Scroll-driven animations 的 Baseline 状态：新近可用。自 2026-10-27 起纳入 Baseline。
支持版本：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

因此通常需要回退策略。

不支持时，可通过滚动监听（ScrollTimeline）或 IntersectionObserver（ViewTimeline）重现视觉效果。

支持的浏览器始终使用原生 CSS，性能更好。

并非所有效果都可通过回退重现。

本用例回退脚本用 `IntersectionObserver` 跟踪每个 `.scroller > *` 可见性，根据 `intersectionRatio` 更新 `scale`。CSS 中的 `prefers-reduced-motion` 媒体查询不影响脚本设置的行内样式，因此脚本用 `matchMedia()` 检查，仅在用户未请求减少动态时运行。

```html
<script>
  // Like the CSS, the fallback only runs when the user has no reduced-motion preference.
  if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)') &&
      matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // This matches the effect as defined in the CSS example above.
          // Customize this further if needed.
          entry.target.style.scale = 0.5 + entry.intersectionRatio * 0.5;
        }
      },
      {
        threshold: Array.from({ length: 101 }, (_, i) => i / 100),
      }
    );

    document.querySelectorAll('.scroller > *').forEach((el) => {
      observer.observe(el);
    });
  }
</script>
```
