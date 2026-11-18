<a id="scroll-snap-real-time-feedback"></a>

# 滚动吸附实时反馈

<a id="overview"></a>

## 概述
与轮播或图库交互时，用户希望立即得到视觉反馈。传统滚动吸附只在手势完成、元素稳定后反馈。使用 Scroll Snap Events，尤其 `scrollsnapchanging`，可在手势进行中实时高亮即将吸附的目标，无需等用户松开触摸或鼠标。

<a id="implementation"></a>

## 实现

<a id="1-listen-for-scrollsnapchanging"></a>

### 1. 监听 `scrollsnapchanging`
在滚动容器上注册 `scrollsnapchanging` 事件监听器。浏览器判断可能选中新的吸附目标时，会触发此事件。

```javascript
const container = document.querySelector('#gallery');
const thumbnails = document.querySelectorAll('.thumbnail');
const items = document.querySelectorAll('.gallery-item');

container.addEventListener('scrollsnapchanging', (event) => {
  // Highlight pending snap target during scroll for real-time feedback.
  const pendingTarget = event.snapTargetInline;
  const index = [...items].indexOf(pendingTarget);

  if (index === -1 || !thumbnails[index]) return;

  // Use lightweight class toggle to avoid layout thrashing during rapid events.
  // Note: aria-current is NOT toggled here. It tracks the settled "current"
  // item, which is updated in the scrollsnapchange handler below.
  thumbnails.forEach((thumb) => thumb.classList.remove('pending'));
  thumbnails[index].classList.add('pending');
});
```

示例图库水平滚动，所以用 `snapTargetInline`；垂直滚动则用 `snapTargetBlock`。

<a id="2-listen-for-scrollsnapchange"></a>

### 2. 监听 `scrollsnapchange`
要在手势完成且实际吸附后确认状态，监听 `scrollsnapchange`。这是建立最终活动状态所必需的。

```javascript
container.addEventListener('scrollsnapchange', (event) => {
  // Promote pending state to active on scroll completion.
  const snappedTarget = event.snapTargetInline;
  const index = [...items].indexOf(snappedTarget);

  if (index === -1 || !thumbnails[index]) return;

  // Establish final active state and clean up pending.
  thumbnails.forEach((thumb) => {
    thumb.classList.remove('pending', 'active');
    thumb.removeAttribute('aria-current');
  });
  thumbnails[index].classList.add('active');
  thumbnails[index].setAttribute('aria-current', 'true');
});
```

<a id="3-sync-initial-state"></a>

### 3. 同步初始状态
页面加载时，浏览器可能恢复滚动位置，例如历史导航或锚点链接。`scrollsnapchange` 和 `scroll` 都不会自动触发。执行一次几何检查，同步 UI 与初始位置。

```javascript
// Note: For item.offsetLeft to be relative to the container, 
// the container MUST be the offsetParent (e.g., `position: relative`).
const findClosestItemIndex = () => {
  // Center-distance assumes scroll-snap-align: center on items.
  // For start-aligned snap, compare scrollLeft to item.offsetLeft directly.
  const containerCenter = container.scrollLeft + container.clientWidth / 2;
  let closestIndex = 0;
  let minDistance = Infinity;

  items.forEach((item, index) => {
    const itemCenter = item.offsetLeft + item.offsetWidth / 2;
    const distance = Math.abs(containerCenter - itemCenter);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
};

const initActiveItem = () => {
  const closestIndex = findClosestItemIndex();
  if (!thumbnails[closestIndex]) return;

  thumbnails.forEach((thumb) => {
    thumb.classList.remove('pending', 'active');
    thumb.removeAttribute('aria-current');
  });
  thumbnails[closestIndex].classList.add('active');
  thumbnails[closestIndex].setAttribute('aria-current', 'true');
};

if (document.readyState === 'complete') {
  initActiveItem();
} else {
  window.addEventListener('load', initActiveItem, { once: true });
}
```

<a id="accessibility-considerations"></a>

## 无障碍考量

创建具有关联导航控件的轮播或图库时：

1. 关联控件与滚动容器显示内容必须同步。容器更新时，用 `aria-current="true"` 更新控件正确状态，使用户知道当前内容。
2. 整个组件放入有无障碍名称的 `<section>`，设置 `focusgroup="toolbar wrap"`，按视觉设计调整值，管理焦点并为控件提供 roving tabindex。
3. 按钮名称应匹配所控制滚动内容的文字/描述，让阅读者理解关联。

> [!NOTE]
> 此模式不是传统自动轮播：传统轮播可能无法暂停停止，也难以向屏幕阅读器准确传达可见信息。如果用例是一次只显示一张且自动切换的轮播，不要使用此技术，它缺少所需无障碍信息。应采用类似标签页的实现，确保仅用键盘可操作、可暂停停止，并准确传达名称、角色和状态。让所有人访问轮播需要细致且依赖上下文的设计；生产环境需参考成熟标准并充分用户测试。

为确保不同浏览器与辅助技术组合可操作性一致，让滚动容器可聚焦（`tabindex="0"`），具有描述内容的无障碍名称和合适角色，例如 `role="region"`。

<a id="fallback-strategies"></a>

## 回退策略
Scroll snap events 的浏览器支持：有限可用。
支持版本：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

Scroll snap 的 Baseline 状态：广泛可用。自 2020-01-15 起纳入 Baseline。
支持版本：Chrome 69（2018 年 9 月）、Edge 79（2020 年 1 月）、Firefox 68（2019 年 7 月）和 Safari 11（2017 年 9 月）。

缺少 `scrollsnapchanging` 时，默认不会在手势中提前反馈，关联 UI 会与内容失步。

**必须：** 为不支持的浏览器提供回退，否则关联 UI 失步。

**要**用 `scroll` 监听器、`requestAnimationFrame` 和几何距离计算模拟 `scrollsnapchanging` 的实时特性，在用户滚动时确定最近目标。

```javascript
if ('onscrollsnapchanging' in Element.prototype) {
  // Use native scroll snap events
} else {
  // Fallback: use scroll + requestAnimationFrame for eager feedback
  // (assumes the same container, thumbnails, items defined in step 1)
  let scrollTimeout;
  let rafId = null;

  const promotePendingToActive = () => {
    const closestIndex = findClosestItemIndex();
    if (!thumbnails[closestIndex]) return;
    thumbnails.forEach((thumb) => {
      thumb.classList.remove('pending', 'active');
      thumb.removeAttribute('aria-current');
    });
    thumbnails[closestIndex].classList.add('active');
    thumbnails[closestIndex].setAttribute('aria-current', 'true');
  };

  container.addEventListener('scroll', () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const closestIndex = findClosestItemIndex();
      if (!thumbnails[closestIndex]) return;

      // DO NOT forget to clean up stale pending classes
      thumbnails.forEach((thumb) => thumb.classList.remove('pending'));
      thumbnails[closestIndex].classList.add('pending');
    });

    // Debounce fallback for browsers that don't support scrollend
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(promotePendingToActive, 100);
  }, { passive: true });

  // Fallback: use Baseline `scrollend` event to promote pending to active cleanly where supported
  container.addEventListener('scrollend', () => {
    clearTimeout(scrollTimeout);
    promotePendingToActive();
  });
}
```

结合几何计算的 `scroll` + `requestAnimationFrame` 回退很接近原生吸附预测，也能正确处理程序滚动。`scrollIntoView` 等方法运行时自然触发 `scroll`，因此 UI 在整个动画中平滑同步，无需额外定制逻辑。

<a id="fallbacks--browser-support-for-focusgroup"></a>

### focusgroup 的回退方案和浏览器支持

focusgroup 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

标记中保留 `focusgroup="toolbar wrap"`。若 `'focusGroup' in HTMLElement.prototype` 为 false，为图库控件实现 roving tabindex，并手动给容器 `role="toolbar"`。原生支持时绝不安装。

```js
if (!('focusGroup' in HTMLElement.prototype)) {
  document.querySelectorAll('[focusgroup~="toolbar"]').forEach(group => {
    group.setAttribute('role', 'toolbar');

    const items = () => [...group.querySelectorAll('button')]
      .filter(item => item.closest('[focusgroup]') === group)
      .filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true');

    const syncTabIndex = () => {
      const list = items();
      let current = list.indexOf(document.activeElement);

      if (current < 0) {
        current = list.indexOf(list.find(item => item.getAttribute('aria-current') === 'true'));
      }

      list.forEach((item, index) => {
        item.tabIndex = current === index ? 0 : -1;
      });
    };

    group.addEventListener('focusin', syncTabIndex);
    group.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const list = items();
      const current = list.indexOf(document.activeElement);
      if (current < 0) return;
      const next = (current + (event.key === 'ArrowLeft' ? -1 : 1) + list.length) % list.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      list.forEach((item, index) => {
        item.tabIndex = index === next ? 0 : -1;
      });
      list[next].focus({ preventScroll: true });
    }, true);

    syncTabIndex();
  });
}
```