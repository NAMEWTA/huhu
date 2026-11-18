<a id="build-a-parallax-effect-on-scroll"></a>

# 构建滚动视差效果

滚动视差让不同内容层随页面滚动以不同速度移动，产生深度错觉，前景看似比背景更快，形成有吸引力的沉浸体验。最佳实现是 CSS 滚动驱动动画，将动画绑定到容器滚动位置。

<a id="how-to-implement"></a>

## 实现方法

基础视差步骤如下：

1. **创建包装元素：** 仅将所有视差层分组，不是滚动元素，因此应裁剪溢出。给它设置与其中一层相同的 `height`。

    ```html
    <div class="wrapper">
      …
    </div>
    ```

    ```css
    .wrapper {
      overflow: clip;
      height: 100vh; /* Height of one of the layers of the parallax */
    }
    ```

2. **声明图层：** 在包装内加入各层，以不同速度移动。

    ```html
    <div class="wrapper">
      <div class="layer">LAYER 0</div>
      <div class="layer">LAYER 1</div>
      <div class="layer">LAYER 2</div>
      …
    </div>
    ```

3. **添加平移动画：** 定义改变图层 `transform` 的 CSS 动画，视差通常用 `translateY` 垂直移动。

    ```css
    @keyframes parallax {
      from {
        transform: translateY(700px);
      }
    }
    ```

4. **设置 `view-timeline`：** 在包装元素上创建 `view-timeline` 并应用到各层，将动画与滚动绑定。

    ```css
    .wrapper {
      view-timeline: --wrapper;
    }

    .layer {
      animation: parallax linear both;
      animation-timeline: --wrapper;
    }
    ```

5. **错开动画：** 两种主要方法是**在关键帧中错开**或**错开 `animation-range`**。

   各层共享时间轴和范围、但移动距离不同时，选关键帧错开，固定层数最简单。各层应在长容器不同滚动阈值进入退出时，选错开 `animation-range`。

   两种方法都可使用硬编码值或 `sibling-index()`/`sibling-count()`。硬编码最简单，适合少量图层；`sibling-index()`/`sibling-count()` 实现适合很多图层。

   * **关键帧错开：**

     使用**硬编码值**时，为每层定义自定义属性，手动控制视差偏移。

        ```css
        .layer:nth-child(1) { --offset: 100px; }
        .layer:nth-child(2) { --offset: 200px; }
        .layer:nth-child(3) { --offset: 300px; }

        @keyframes parallax {
          from {
            transform: translateY(var(--offset));
          }
        }
        ```

     使用 **`sibling-index()`** 时，由 `sibling-index()` 返回子元素在兄弟中的序号，自动计算交错效果。

        ```css
        @keyframes parallax {
          from {
            transform: translateY(calc(100px * sibling-index()));
          }
        }
        ```

   * **错开 `animation-range`：**

     使用**硬编码值**时，逐层明确指定 `animation-range` 的边界。

        ```css
        .layer:nth-child(1) { animation-range: entry 25% exit 50%; }
        .layer:nth-child(2) { animation-range: entry 25% exit 75%; }
        .layer:nth-child(3) { animation-range: entry 25% exit 100%; }
        ```

     使用 **`sibling-index()` 和 `sibling-count()`** 时，根据总层数（`sibling-count()`）以数学方式计算范围。

        ```css
        .layer {
          animation-range: entry 25% exit calc(100% / sibling-count() * sibling-index());
        }
        ```

<a id="example-code"></a>

## 示例代码

```css
@keyframes parallax {
  from {
    transform: translateY(calc(100px * sibling-index()));
  }
}

.wrapper {
  view-timeline: --wrapper;
}

.layer {
  animation: parallax linear both;
  animation-timeline: --wrapper;
}

@media (prefers-reduced-motion: reduce) {
  .layer {
    animation: none;
  }
}
```

也可通过 `animation-range` 获得类似效果：

```css
@keyframes parallax {
  from {
    transform: translateY(700px);
  }
}

.wrapper {
  view-timeline: --wrapper;
}

.layer {
  animation: parallax linear both;
  animation-timeline: --wrapper;
  animation-range: entry 25% exit calc(100% / sibling-count() * sibling-index());
}

@media (prefers-reduced-motion: reduce) {
  .layer {
    animation: none;
  }
}
```

<a id="best-practices"></a>

## 最佳实践

滚动驱动动画应遵循以下实践，确保流畅与无障碍：

- **要**进行特性检测：并非所有浏览器支持。使用 `@supports ((animation-timeline: view()) and (animation-range: entry))` 并为不支持者提供回退。
  - **必须**包含 `(animation-range: entry)`，过滤仅部分支持的浏览器。
  - **不要**用 `scroll-timeline-polyfill` 回退，它功能不完整且存在许多已知问题。
  - 仅装饰性动画选择渐进增强，**不要**提供回退。
- **要**尊重用户偏好：通过 `prefers-reduced-motion` 禁用或减少动画。
- **要**尽量只动画高性能 CSS 属性：`transform`、`opacity` 等可由合成器线程处理；`width`、`height` 可能带来性能问题。
- **要**使用正确声明顺序：`animation-timeline` 和 `animation-range` 放在 `animation` 简写*之后*，避免被重置。

设置 `animation-range` 时：

- **要**让各层使用同一起始偏移，例如 `entry 25%`。
- **要**让各层用不同结束偏移，可通过 `sibling-count()` 和 `sibling-index()` 分配，例如 `exit calc(100% / sibling-count() * sibling-index())`。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

Scroll-driven animations 的 Baseline 状态：新近可用。自 2026-10-27 起纳入 Baseline。
支持版本：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。因此通常需要回退策略。

不支持时，可用回退重现视觉效果，通常是滚动监听（ScrollTimeline 效果）或 IntersectionObserver（ViewTimeline 效果）。

支持滚动驱动动画的浏览器始终使用原生 CSS，因为性能更好。

并非所有效果都能用回退重现。

本用例下，以下脚本为不支持浏览器回退：用 `IntersectionObserver` 跟踪 `.wrapper` 可见性，根据滚动位置更新图层 `transform`。CSS 的 `prefers-reduced-motion` 不影响脚本设置的行内样式，因此脚本用 `matchMedia()` 检查偏好，请求减少动态时不运行。

```js
// Fallback for browsers that don't support scroll-driven animations
// Like the CSS, it doesn't run when the user prefers reduced motion.
if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)') &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const wrapper = document.querySelector('.wrapper');
  const layers = document.querySelectorAll('.layer');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        window.addEventListener('scroll', onScroll);
      } else {
        window.removeEventListener('scroll', onScroll);
      }
    });
  }, { threshold: 0 });

  observer.observe(wrapper);

  function onScroll() {
    const scrollY = window.scrollY;
    const wrapperRect = wrapper.getBoundingClientRect();
    const wrapperTop = wrapperRect.top + scrollY;
    const wrapperHeight = wrapperRect.height;
    const windowHeight = window.innerHeight;

    if (scrollY >= wrapperTop - windowHeight && scrollY <= wrapperTop + wrapperHeight) {
      const scrollPercent = (scrollY - (wrapperTop - windowHeight)) / (wrapperHeight + windowHeight);
      
      layers.forEach((layer, index) => {
        // This matches the effect as defined in the CSS example above.
        // Customize this further if needed.
        const initialTranslateY = 100 * index;
        const translateY = initialTranslateY * (1 - scrollPercent);
        layer.style.transform = `translateY(${translateY}px)`;
      });
    }
  }

  // Trigger onScroll once to set initial positions
  onScroll();
}
```
