<a id="scrollability-affordance-hints"></a>

# 可滚动性提示

<a id="overview"></a>

## 概述

可滚动性提示告诉用户，区域在某个方向上还有更多内容，并在到达该端尽头时消失。分为两类：

- **阴影**绘制在滚动视口边缘之上，像是内容藏在边缘下面。通过滚动容器伪元素上的滚动状态容器查询显示。
- **渐隐**让内容本身在边缘逐渐消失。通过滚动容器上的 mask 绘制，并由滚动驱动动画控制。

两种方式都不需要滚动监听器，也不需要在标记中增加额外元素。

<a id="choosing-between-a-shadow-and-a-fade"></a>

## 如何选择阴影或渐隐

以下情况使用**渐隐**：

- 滚动容器沿一排项目水平滚动（标签页、标签片、轮播）。被渐隐截断的项目会传达“还有更多同类内容”。
- 背景不是纯色（渐变、图像、半透明表面）。Mask 让内容透明，而不是在内容上覆盖颜色，因此适用于任意背景。
- 滚动容器没有可见边界。渐隐不需要一个让内容藏在其下的边缘。

以下情况使用**阴影**：

- 内容必须一直到边缘都保持可读（长文本、表格、表单）。渐隐会让边缘附近内容难以辨认。
- 滚动容器由固定界面框架界定，例如对话框的页头和页脚，或表格的粘性表头。阴影会让这些框架看起来高于内容。

如果两者都不适用，垂直滚动容器默认用阴影，水平滚动容器默认用渐隐。

<a id="shadows"></a>

## 阴影

<a id="1-make-the-scroller-a-scroll-state-container"></a>

### 1. 将滚动容器设为滚动状态容器

```css
.scroller {
  overflow-y: auto;
  container-type: scroll-state;
}
```


<a id="2-draw-the-shadows-with-before-and-after"></a>

### 2. 用 `::before` 和 `::after` 绘制阴影

不要向标记中加入指示元素。滚动容器自身的 `::before` 和 `::after` 是第一个和最后一个子节点，因此 `position: sticky` 能将它们保持在滚动视口边缘。负外边距抵消它们的高度，所以不占空间。

```css
.scroller::before,
.scroller::after {
  content: "";
  display: block;
  position: sticky;
  /* Example value: how far the shadow reaches into the content */
  block-size: .75rem;
  /* Paint above positioned content */
  z-index: 1;
  /* Let clicks through to the content underneath */
  pointer-events: none;
  opacity: 0;
  transition: opacity .2s;
}

/* Radial, so the shadow curves and tapers off at the sides. Keep it subtle: it should not compete with the content. */
.scroller::before {
  inset-block-start: 0;
  margin-block-end: -.75rem;
  background: radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / .15), transparent);
}

.scroller::after {
  inset-block-end: 0;
  margin-block-start: -.75rem;
  background: radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / .15), transparent);
}
```


伪元素即使隐藏也参与滚动容器布局。这种方式最适合块布局、单列 grid 或纵向 flex 布局的滚动容器。

<a id="3-show-each-shadow-when-there-is-content-beyond-its-edge"></a>

### 3. 当边缘之外还有内容时显示相应阴影

伪元素可以查询其来源元素，因此滚动容器的 `::before` 和 `::after` 能响应它的滚动状态。

```css
@container scroll-state(scrollable: block-start) {
  .scroller::before {
    opacity: 1;
  }
}

@container scroll-state(scrollable: block-end) {
  .scroller::after {
    opacity: 1;
  }
}
```


<a id="fades"></a>

## 渐隐

在滚动容器自身应用 mask，让内容渐隐：一个不透明层减去两端各一条渐变带。只遮罩渐变带，能保持其他内容可见，包括滚动容器的焦点轮廓；如果用单个裁切到 border box 的渐变，轮廓就会被隐藏。通过跟踪滚动容器自身滚动位置的滚动驱动动画，改变每条带的尺寸：用户从某一端离开时，该端渐隐从 0 增长；接近另一端时，相应渐隐缩回 0。内容全部放得下时，滚动时间线不活跃，不显示渐隐。

```css
@property --fade-start {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@property --fade-end {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

.scroller {
  overflow-x: auto;
  /* Example value: how far each fade reaches */
  --fade-size: 3rem;
  /* Gradient directions and positions are physical, so flip them for right-to-left content */
  --fade-dir: right;
  --fade-start-pos: 0;
  --fade-end-pos: 100%;
  mask:
    linear-gradient(black, black) no-clip subtract,
    linear-gradient(to var(--fade-dir), black, transparent) var(--fade-start-pos) 0 / var(--fade-start) 100% no-repeat no-clip,
    linear-gradient(to var(--fade-dir), transparent, black) var(--fade-end-pos) 0 / var(--fade-end) 100% no-repeat no-clip;
  animation: reveal-fade-start linear both, hide-fade-end linear both;
  animation-timeline: scroll(self inline);
  /* Each fade animates over the first or last --fade-size of scrolling */
  animation-range: 0 var(--fade-size), calc(100% - var(--fade-size)) 100%;

  &:dir(rtl) {
    --fade-dir: left;
    --fade-start-pos: 100%;
    --fade-end-pos: 0;
  }
}

@keyframes reveal-fade-start {
  to {
    --fade-start: var(--fade-size);
  }
}

@keyframes hide-fade-end {
  from {
    --fade-end: var(--fade-size);
  }
}
```


- 必须：用 `@property` 注册 `--fade-start` 和 `--fade-end`。未注册的自定义属性不会插值，渐隐会突然跳变。
- 如果滚动容器使用滚动吸附或包含可聚焦项目，将 `scroll-padding-inline`（或 `scroll-padding-block`）设为渐隐尺寸，确保吸附或聚焦的项目不会停在渐隐区内。
- 对垂直滚动容器，使用 `to bottom`，将两条带放在 `0 0` 和 `0 100%`，尺寸分别为 `100% var(--fade-start)` 与 `100% var(--fade-end)`，并使用 `scroll(self block)` 和 `overflow-y`。
- 对从右到左的内容，反转 `--fade-dir` 并交换渐变带位置，如上面的 `:dir(rtl)` 规则。滚动时间线遵循书写方向，但渐变方向和 mask 位置使用物理方向。

<a id="accessibility-considerations"></a>

## 无障碍注意事项

可滚动性提示旨在补充现有浏览器行为，帮助用户发现更大的可滚动区域。它们属于辅助提示，次于主要提示（默认滚动条，或具有足够对比度的自定义滚动条），因此不必达到特定对比度阈值。如果作者想移除滚动条（由于多种可用性原因，不建议这样做），可滚动性提示就必须与所有直接相邻颜色保持 3:1 对比度（满足 WCAG 成功准则 1.4.11 非文本对比度），让用户容易判断该区域可以滚动。

<a id="fallback-strategies"></a>

## 回退策略

提示是一种增强：没有它们，滚动容器仍然可用。如果目标 Baseline 不支持下列功能，只要滚动条可见，省略提示可以接受。如果隐藏了滚动条，这些提示就是区域可滚动的唯一线索，因此**必须**提供回退。

<a id="fallbacks--browser-support-for-scroll-state-container-queries"></a>

### 滚动状态容器查询的回退与浏览器支持

容器滚动状态查询的浏览器支持状态：有限可用。
支持的浏览器：Chrome 144（2026 年 1 月）和 Edge 144（2026 年 1 月）。
不支持：Firefox 和 Safari。

没有滚动状态查询时，阴影保持隐藏。可改用支持更广的滚动驱动动画显示。伪元素位于滚动容器内部，因此 `scroll()` 会将该容器用作时间线。每个阴影在用户离开对应边缘的最初几像素内淡入，而不是直接切换。

```css
@supports not (container-type: scroll-state) {
  .scroller::before,
  .scroller::after {
    animation: show-shadow linear both;
    animation-timeline: scroll();
  }

  .scroller::before {
    /* Example value: how much scrolling it takes to fully show the shadow */
    animation-range: 0 2rem;
  }

  .scroller::after {
    animation-direction: reverse;
    animation-range: calc(100% - 2rem) 100%;
  }
}

@keyframes show-shadow {
  to {
    opacity: 1;
  }
}
```


内容全部放得下时，滚动时间线不活跃，因此两个阴影都不出现。如果目标 Baseline 也不支持滚动驱动动画，使用下方最后手段的回退之一。

<a id="fallbacks--browser-support-for-scroll-driven-animations"></a>

### 滚动驱动动画的回退与浏览器支持

滚动驱动动画的 Baseline 状态：新近可用。它自 2026-10-27 起进入 Baseline。
支持的浏览器：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

没有滚动驱动动画时，渐隐永远不会出现；如果也不支持滚动状态查询，阴影也不会出现。使用以下最后手段的回退之一。

<a id="shadows-on-a-solid-background-background-attachment"></a>

#### 纯色背景上的阴影：背景附着

如果滚动容器是纯色背景，改用背景绘制阴影。这适用于所有浏览器，无须 JavaScript。
每个阴影都是 `scroll` 背景，停留在滚动视口边缘。
每个阴影都有一个遮盖层：使用滚动容器自身颜色的 `local` 背景，随内容一起滚动。
在内容两端，遮盖层位于阴影上方并隐藏它；用户离开该端后，遮盖层移走，阴影显现。

```css
@supports not ((container-type: scroll-state) or (animation-timeline: scroll())) {
  .scroller {
    background:
      /* Covers: scroll with the content. Must use the scroller's own background color. */
      linear-gradient(var(--surface) 30%, transparent) top / 100% 2.5rem no-repeat local,
      linear-gradient(transparent, var(--surface) 70%) bottom / 100% 2.5rem no-repeat local,
      /* Shadows: stay at the edges of the scrollport */
      radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / .15), transparent) top / 100% .75rem no-repeat,
      radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / .15), transparent) bottom / 100% .75rem no-repeat,
      var(--surface);
  }
}
```


阴影绘制在内容后方，因此具有不透明背景的内容会盖住阴影。这种情况下，使用下方的 `IntersectionObserver` 回退。

<a id="fades-or-shadows-on-any-background-intersectionobserver"></a>

#### 渐隐，或任意背景上的阴影：`IntersectionObserver`

用 `IntersectionObserver` 标记哪些边缘还有更多内容，并依据这些属性显示提示。以滚动容器为 root、`threshold: 1`，观察其第一个和最后一个子元素；子元素未完全可见，意味着该方向还有更多内容。

```js
if (!CSS.supports('animation-timeline', 'scroll()')) {
  for (const scroller of document.querySelectorAll('.scroller')) {
    const [first, last] = [scroller.firstElementChild, scroller.lastElementChild];
    // rootMargin: without it, sub-pixel widths can leave an edge child a fraction of a pixel short of fully visible
    const observer = new IntersectionObserver(entries => {
      for (const { target, intersectionRatio } of entries) {
        scroller.classList.toggle(target === first ? 'more-start' : 'more-end', intersectionRatio < 1);
      }
    }, { root: scroller, threshold: 1, rootMargin: '1px' });

    observer.observe(first);
    observer.observe(last);
  }
}
```


```css
/* Shadows */
.scroller.more-start::before,
.scroller.more-end::after {
  opacity: 1;
}

/* Fades */
.scroller {
  transition: --fade-start .2s, --fade-end .2s;

  &.more-start {
    --fade-start: var(--fade-size);
  }

  &.more-end {
    --fade-end: var(--fade-size);
  }
}
```


如果单个子元素可能比滚动容器更大（例如一篇长文章），它永远不会完全可见，上述方式就会一直显示两端提示。此时改为观察哨兵：由脚本在滚动容器两端添加空元素。某个哨兵离开视野，意味着该端之外还有内容。

```js
// Must be valid children of the scroller (e.g. <li aria-hidden="true"> in a list)
const [start, end] = [document.createElement('div'), document.createElement('div')];
for (const sentinel of [start, end]) {
  // A zero-size sentinel at the very edge never counts as intersecting
  sentinel.style.cssText = 'min-inline-size: 1px; min-block-size: 1px';
}
scroller.prepend(start);
scroller.append(end);
// Observe them as above, with the default threshold, using !isIntersecting instead of intersectionRatio < 1
```

