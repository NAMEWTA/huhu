<a id="carousel-snap-highlights"></a>

# 轮播吸附高亮

滚动状态容器查询允许根据元素当前滚动状态设置样式，例如是否因粘性定位而“卡住”，或因滚动吸附而“吸附”。这使轮播或图库无需 JavaScript IntersectionObserver 或滚动监听器，就能在视觉上区分活动项目。

<a id="core-implementation"></a>

### 核心实现

要高亮吸附项，必须建立滚动吸附容器，将吸附目标定义为滚动状态容器，再查询状态来设置后代样式。

<a id="1-establish-the-scroll-snap-container"></a>

#### 1. 建立滚动吸附容器
父容器必须启用 `scroll-snap-type`。

```html
<div class="carousel">
  <div class="carousel-item">
    <div class="card">Product 1 content</div>
  </div>
  <div class="carousel-item">
    <div class="card">Product 2 content</div>
  </div>
</div>
```

```css
.carousel {
  display: flex;
  overflow-x: auto;
  /* MANDATORY: Enable scroll snapping on the container */
  scroll-snap-type: x mandatory;
}
```

<a id="2-define-snap-targets-as-scroll-state-containers"></a>

#### 2. 将吸附目标定义为滚动状态容器
轮播中每个需要跟踪吸附的项目都必须声明为 `scroll-state` 容器。

```css
.carousel-item {
  /* Define where the item snaps within the container */
  scroll-snap-align: center;
  
  /* MANDATORY: Establish this element as a scroll-state query container */
  container-type: scroll-state;
}
```

<a id="3-query-the-snapped-state"></a>

#### 3. 查询 `snapped` 状态

容器查询设置的是**后代**样式，因此高亮应应用在吸附目标*内部*元素。滚动容器沿 x 轴溢出，所以使用 `scroll-state(snapped: x)`。

**必须：** 用 `@media (prefers-reduced-motion: no-preference)` 包裹样式，仅向未请求减少动态效果的用户显示。某些用例可保留部分效果，但此例卡片从白色闪到蓝色，可能影响部分用户，因此完全禁用。

```css
/* Specify transition outside of queries so that it is applied regardless of state.  */
.card {
  transition:
    scale 0.4s cubic-bezier(0.25, 0.8, 0.25, 1),
    background-color 0.4s,
    color 0.4s,
    box-shadow 0.4s;
}
/* 
Only show the effect for users not requesting reduced motion. Disable completely, including the color change, as it causes a flash that may be problematic.
*/
@media (prefers-reduced-motion: no-preference) {
  /* Style the content when its parent .carousel-item is snapped on the x axis */
  @container scroll-state(snapped: x) {
    .card {
      background: #007bff;
      color: white;
      scale: 1.15;
      box-shadow: 0 10px 25px rgba(0, 123, 255, 0.3);
    }
  }
}

/* MANDATORY Copy-Paste Safety: Disable highlight scaling/flashing for motion sensitive users */
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none !important;
    scale: 1 !important;
  }
}
```

`snapped` 描述符可查询特定轴：`x`、`y`、`inline`、`block` 或 `both`。

<a id="accessibility"></a>

### 无障碍

* **不要**将 `scroll-state` 作为让用户选择选项的方式。
* **避免**把 `scroll-state` 与交互元素结合。

吸附项的视觉高亮可改善体验，但吸附状态不会暴露到无障碍树。因此，吸附不能作为内容选择方式，其视觉主题也不得暗示元素已激活或聚焦。具有足够对比度的键盘焦点环（与相邻颜色至少 3:1）应区别于 `snapped` 高亮。吸附项可交互时，必须使用其他标准无障碍实践。

滚动引发吸附，不会移动键盘焦点。但焦点移入滚动容器某元素可能使容器滚动，改变吸附项，而新吸附项不一定是聚焦项。这容易使用户困惑，因此不鼓励在此容器放交互元素。

> [!NOTE]
> 此模式并非传统轮播组件：后者的幻灯片通常自动切换，可能无法暂停或停止，也难以准确向屏幕阅读器用户传达可见信息。如果用例是一次只呈现一张幻灯片的轮播，不要使用此技术，它缺乏这类组件所需的无障碍信息。应采用类似标签页的实现，确保仅用键盘即可操作，可暂停或停止轮播，并准确传达名称、角色和状态。让所有人都能访问轮播涉及细致且依赖上下文的设计；生产环境务必参考成熟无障碍标准并进行充分用户测试。

确保未高亮内容不会意外难以感知。例如不要让图库未高亮项变为低透明度灰度，只有吸附后才达到足够对比。内容应始终具有足够对比，既能被感知，也让用户知道还有更多可导航内容。

最后，为确保不同浏览器和辅助技术组合下可操作性一致，让滚动容器可聚焦（`tabindex="0"`），提供描述内容的无障碍名称和合适角色（例如 `role="region"`）。

```html
<div class="carousel-snap" role="region" aria-label="Highlights" tabindex="0">
  …
</div>
```

<a id="fallback-strategies"></a>

## 回退策略

Container scroll-state queries 的浏览器支持：有限可用。
支持版本：Chrome 144（2026 年 1 月）和 Edge 144（2026 年 1 月）。
不支持：Firefox 和 Safari。

不支持滚动状态查询时，应提供完整基础体验，让全部项目即使没有“活动”高亮也清晰可读。

<a id="feature-detection"></a>

#### 特性检测
可以用 `@supports` 仅向支持浏览器提供增强：

```css
@supports (container-type: scroll-state) {
  /* Enhancement styles here */
}
```

<a id="javascript-fallback"></a>

#### JavaScript 回退

如果高亮对体验至关重要，用 `IntersectionObserver` 确定吸附项。通过行内方向为负的 `rootMargin` 将观察区域缩成轮播中央薄片。例如只将位于中央 2% 的元素视为相交，将 `rootMargin` 设为 `"0px -49%"`。

```javascript
// Optional: detect support and apply a JS-based fallback
if (!CSS.supports('container-type', 'scroll-state')) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      // Toggle a class based on intersection
      entry.target.classList.toggle('is-snapped', entry.isIntersecting);
    });
  }, {
    root: document.querySelector(".carousel"),
    // Carousel item intersects if any part of the carousel item is in the middle 2% of the carousel.
    rootMargin: "0px -49%"
  });

  document.querySelectorAll('.carousel-item').forEach(item => {
    observer.observe(item);
  });
}
```
