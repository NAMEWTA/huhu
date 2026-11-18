<a id="scroll-snap-state-sync"></a>

# 滚动吸附状态同步

让 UI 与滚动容器吸附位置同步，过去需要复杂监听、手动偏移计算和相交观察器。`scrollsnapchange` 原生且高效地检测滚动器何时稳定在新目标，适合同步侧栏或高亮目录当前章节。

<a id="implementation"></a>

## 实现

<a id="1-configure-scroll-snap-in-css"></a>

### 1. 在 CSS 配置滚动吸附
容器必须定义 `scroll-snap-type`，子元素具有 `scroll-snap-align`，浏览器才能跟踪目标。带目录的长文章可用它将章节标题吸附到视口顶部。

```css
main {
  /* Enable scroll snapping on the container */
  scroll-snap-type: y proximity;
  overflow-y: auto;
}

h2 {
  /* Define how headers align when snapped */
  scroll-snap-align: start;
}
```

<a id="2-listen-for-snap-changes"></a>

### 2. 监听吸附变化
在容器上用 `scrollsnapchange` 响应用户结束滚动并吸附到新元素，例如高亮目录活动链接。

```html
<!-- MANDATORY: Wrap table of contents links inside a proper navigation landmark -->
<nav aria-label="Table of contents">
  <ul>
    <li><a href="#section-1" aria-current="location">Section 1</a></li>
    <li><a href="#section-2">Section 2</a></li>
  </ul>
</nav>
```

```javascript
const main = document.getElementById('main');
const links = document.querySelectorAll('nav a');

function setActiveLink(id) {
  for (const link of links) {
    if (link.getAttribute('href') === `#${id}`) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

// The event fires when the scroller settles on a new snap target
main.addEventListener('scrollsnapchange', (event) => {
  // Use snapTargetBlock for vertical or snapTargetInline for horizontal
  const snappedHeader = event.snapTargetBlock;

  if (snappedHeader) {
    setActiveLink(snappedHeader.id);
  }
});
```

<a id="accessibility"></a>

## 无障碍

> [!CAUTION]
> 滚动吸附事件可在视觉上将其他内容与滚动器同步，却不会自动以程序方式暴露信息。元素关系、活动状态和动态内容必须反映到无障碍树。

目录侧栏活动链接应使用 `aria-current="true"` 或 `aria-current="location"`。

谨慎使用 `scroll-snap-type` 的 `mandatory`，吸附点间内容高于屏幕时，可能使中间内容不可访问。

为确保选择锚点后仍可导航滚动区域，给对应目标 `tabindex="-1"`，让其能获得焦点，键盘用户可滚动容器或从那里继续导航。

```html
<li><a href="#section-2">Section 2</a></li>
…
<!-- Adding a tabindex="-1" attribute to the heading will mean that it can receive focus after being navigated to -->
<h2 id="section-2" tabindex="-1">Section 2</h2>
```

为不同浏览器和辅助技术组合保持一致可操作性，让滚动容器可聚焦（`tabindex="0"`），具有描述内容的无障碍名称；若没有隐式角色（例如 `<main>` 已有），添加合适角色如 `role="region"`。

<a id="fallback-strategies"></a>

## 回退策略

Scroll snap events 的浏览器支持：有限可用。
支持版本：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

不支持 `scrollsnapchange` 时，用 `IntersectionObserver` 检测当前位于滚动器顶部的元素。它与 `scrollsnapchange` 的行为不同：滚动过程中就触发，而非只在稳定后触发。

```javascript
// Feature detect support for scroll snap events
if (!('onscrollsnapchange' in HTMLElement.prototype)) {
  const headers = main.querySelectorAll('h2');
  const observer = new IntersectionObserver(
    () => {
      // Account for any top border on the scroll container so scrollportTop
      // matches the IntersectionObserver root's padding-box top.
      const scrollportTop =
        main.getBoundingClientRect().top + main.clientTop;
      const topEntry = [...headers].reduce((currentTop, header) => {
        // Use the bottom to handle scrolling up, when the top is still offscreen
        const { bottom } = header.getBoundingClientRect();
        // Exclude targets whose bottom has scrolled past the 1px top rootMargin
        if (bottom <= scrollportTop + 1) return currentTop;
        if (!currentTop) return header;
        return bottom < currentTop.getBoundingClientRect().bottom
          ? header
          : currentTop;
      }, undefined);
      if (topEntry) setActiveLink(topEntry.id);
    },
    {
      root: main,
      // Inset top by 1px so adjacent sections stop intersecting when snapped to start
      rootMargin: '-1px 0px 0px 0px',
      // Fire both when a target exits/enters (0) and when a heading settles into view (0.9)
      threshold: [0, 0.9],
    },
  );

  // Observe all snap targets (e.g., section headers)
  headers.forEach((header) => observer.observe(header));
}
```
