<a id="navigation-drawer"></a>

# 导航抽屉

<a id="overview"></a>

## 概述

导航抽屉是从视口边缘滑入、覆盖页面内容并将背后内容变暗的面板。它由触发按钮打开，可以通过将面板滑出屏幕、轻触变暗的背景、激活面板内明确的关闭按钮或按 Escape 来关闭。

本指南将抽屉实现为：

- 顶层元素（模态 `<dialog>` 或 `popover="manual"` 元素，参见[选择抽屉元素](#choose-the-drawer-element)），让面板及其 `::backdrop` 覆盖页面所有其他元素，不受层叠上下文影响。
- 具有两个 CSS 滚动吸附停靠点的水平滚动容器，一个表示“打开”，一个表示“关闭”，由浏览器原生处理滑动手势。无需 JavaScript 指针事件代码，即可获得动量、速度和中断跟踪。
- 将背景透明度绑定到滚动位置的滚动驱动动画，让用户拖动面板时背景平滑淡入淡出。
- 作用于面板的 `IntersectionObserver`，检测面板何时完全进入或离开视口，并据此关闭抽屉和更新状态。

此方式优于 JavaScript 驱动的 `transform` 动画，因为滚动机制让用户直接控制面板位置（由手指驱动，而非补间动画），更贴近用户习惯的原生移动应用交互。

<a id="choose-the-drawer-element"></a>

### 选择抽屉元素

先决定它是否始终只是抽屉，还是同一元素在某些条件下（例如宽屏）也会成为常驻可见的侧栏。需求未说明时，假定它始终只是抽屉。

- **始终只是抽屉：** 使用 `<dialog>`，通过 `showModal()` 打开。浏览器会使页面其余部分不可交互、向辅助技术暴露为模态对话框、处理 Escape，并在关闭时恢复焦点。参见[使用 `<dialog>` 实现](#implementation-with-dialog)。
- **也作为侧栏：** 使用带 `role="dialog"` 和 `popover="manual"` 的普通元素，作为侧栏时移除 `role`。`<dialog>` 不适合，因为它始终暴露为对话框，而侧栏并不是对话框。浮层不是模态，因此代码必须手动处理模态行为。参见[兼作侧栏的抽屉实现](#implementation-for-a-drawer-that-also-acts-as-a-sidebar)。

<a id="implementation-with-dialog"></a>

## 使用 `<dialog>` 实现

<a id="1-markup"></a>

### 1. 标记

抽屉由单个 `<dialog>` 包含水平滚动器，滚动器内是可见的面板。触发按钮位于页面内容中。抽屉关闭按钮具有 `autofocus`，在打开时获得焦点。

```html
<!-- MANDATORY: Provide an accessible name for the dialog with aria-label or,
     if there is already text within the drawer that can act as its accessible name,
     with aria-labelledby. -->
<dialog class="Drawer" id="drawer" aria-label="Navigation drawer">
  <div class="Drawer-scroller">
    <nav class="Drawer-sheet">
      <!-- Close button that can be used to dismiss the drawer -->
      <button id="drawer-close" aria-label="Close menu" autofocus>
        <!-- close icon or blank if icon inserted via CSS -->
      </button>
      <ul>
        <li><a href="/page-1">Page 1</a></li>
        <li><a href="/page-2">Page 2</a></li>
        <!-- ... -->
      </ul>
    </nav>
  </div>
</dialog>

<main>
  <header>
    <!-- aria-controls links the trigger to the drawer; aria-expanded
         reflects the current state for assistive tech. -->
    <button id="drawer-open"
            aria-label="Menu"
            aria-expanded="false"
            aria-controls="drawer">
      <!-- open icon or blank if icon inserted via CSS -->
    </button>
  </header>
  <!-- Page content. -->
</main>
```

使用图标时如何保持无障碍，参见 `icons`（通过 `npx -y modern-web-guidance@latest retrieve "icons"` 获取）。

<a id="2-styles"></a>

### 2. 样式

<a id="reset-the-dialog-and-fill-the-viewport"></a>

#### 重置对话框并填满视口

对话框必须覆盖整个视口，让滑动表面从边缘延伸到另一边缘。用户代理默认对话框样式（居中、尺寸受限、内边距、边框）会妨碍这一点，必须重置。

```css
.Drawer {
  /* min() caps the sheet width on large screens but on a phone leaves
     a 20% peek of page content visible, which is the affordance that
     tells the user they can tap outside to dismiss. */
  --drawer-width: min(20em, 80dvw, 100dvw - 24px);

  /* Custom property driven by the scroll-driven animation below.
     0 = drawer fully closed (transparent backdrop).
     1 = drawer fully open (visible backdrop). */
  --drawer-backdrop: 0;

  /* Reset UA dialog styles that would constrain the element. */
  inset: 0;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  background: transparent;
  border: 0;
  overflow: visible;
}

/* Style the dialog's ::backdrop to achieve the overlay effect and
   provide visual affordances indicating that the rest of the page is inert */
.Drawer::backdrop {
  background: #000;
  /* Use calc() to limit the opacity range so the content beneath is visible */
  opacity: calc(var(--drawer-backdrop) / 2);
}
```

<a id="build-the-swipe-surface-with-scroll-snap"></a>

#### 用滚动吸附构建滑动表面

滚动器是比视口更宽的水平网格：第 1 列放面板（宽 `--drawer-width`），第 2 列是与视口同宽的空伪元素间隔区。在两列之间吸附就能打开和关闭抽屉。

```css
.Drawer-scroller {
  position: relative;
  display: grid;
  /* Sheet on the left, full-viewport spacer on the right. The user
     scrolls between the two snap stops to open and close. */
  grid-template-columns: var(--drawer-width) 100%;

  overflow-x: scroll;
  /* Stop the swipe from chaining into the page's vertical scroll
     when the user reaches either snap edge. */
  overscroll-behavior: none;
  scrollbar-width: none;
  /* `mandatory` guarantees the drawer always settles fully open or
     fully closed — never half-open after a partial swipe. */
  scroll-snap-type: x mandatory;
}

/* Enable smooth scrolling natively, but only if the user has not
   requested reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .Drawer-scroller {
    scroll-behavior: smooth;
  }
}

/* The empty spacer that creates the "closed" snap stop. */
.Drawer-scroller::after {
  content: '';
  scroll-snap-align: end;
  /* Open the drawer already scrolled to this stop (drawer off-screen),
     so the JS only needs to scroll to the open position to
     animate it in. */
  scroll-initial-target: nearest;
}

.Drawer-sheet {
  display: grid;
  grid-template-rows: auto 1fr;
  /* Use `svh` (small viewport height) — not `vh` or `dvh` — so the
     sheet height does not jump when the iOS Safari address bar
     resizes mid-swipe. */
  height: 100svh;

  background: #333;
  color: #fff;
  overflow-y: auto;
  scroll-snap-align: start;
  scrollbar-width: none;
}
```

<a id="tie-the-backdrop-opacity-to-the-scroll-position"></a>

#### 将背景透明度绑定到滚动位置

滚动驱动动画在滚动范围内将 `--drawer-backdrop` 从 1（打开）映射到 0（关闭），让背景淡入淡出与拖动完全同步。

```css
/* MANDATORY: Wrap this entire block in @supports. Browsers that don't
   support animation-timeline still parse the @keyframes and would
   apply the animation's `0%` value (--drawer-backdrop: 1) at all
   times, leaving the backdrop permanently opaque. The @supports gate
   ensures the animation is only registered where it actually works. */
@supports (animation-timeline: scroll()) {
  .Drawer {
    /* timeline-scope lets .Drawer reference a scroll-timeline that
       is defined on its descendant (the scroller). Without this, the
       timeline name is not visible to the .Drawer element. */
    timeline-scope: --drawer-fade;
    animation: fade-drawer-backdrop linear both;
    animation-timeline: --drawer-fade;
  }

  .Drawer-scroller {
    /* The horizontal scroll position of this element drives the
       timeline named `--drawer-fade`. */
    scroll-timeline: --drawer-fade x;
  }

  /* @property is REQUIRED. Without registering --drawer-backdrop with
     a `<number>` syntax, the browser treats it as a string and cannot
     interpolate it — the backdrop would jump from 0 to 1 with no
     fade. */
  @property --drawer-backdrop {
    syntax: '<number>';
    inherits: true;
    initial-value: 0;
  }

  @keyframes fade-drawer-backdrop {
    /* Scroll position 0 = drawer fully open = backdrop visible. */
    0% { --drawer-backdrop: 1 }
    /* Scroll position 100% = drawer fully closed = backdrop hidden. */
    100% { --drawer-backdrop: 0 }
  }
}
```

<a id="3-open-and-close-the-drawer"></a>

### 3. 打开和关闭抽屉

打开分两步：将对话框以模态显示，再把面板滚动到视野内。关闭只有一步：滚回间隔区；观察器（第 4 步）在面板完全离屏后关闭对话框。

```js
const drawer = document.getElementById('drawer');
const openBtn = document.getElementById('drawer-open');
const scroller = drawer.querySelector('.Drawer-scroller');
const sheet = drawer.querySelector('.Drawer-sheet');
const closeBtn = document.getElementById('drawer-close');

function openDrawer() {
  // Show the dialog first so the element is in the top layer before
  // we trigger any scrolling. `scroll-initial-target` (set on the
  // ::after spacer) places the initial scroll position at the closed
  // stop, so the drawer enters the top layer already off-screen.
  drawer.showModal();

  // Scroll the sheet into view. The `behavior: 'auto'` option defers
  // to the CSS `scroll-behavior` property, which will be smooth unless
  // the user prefers reduced motion. Snap takes over at the end and
  // locks the drawer fully open.
  scroller.scrollTo({left: 0, behavior: 'auto'});
}

function closeDrawer() {
  // Scroll back to the spacer. Do NOT call close() here —
  // doing so would remove the element from the top layer mid-animation
  // and the close animation would not be visible. The
  // IntersectionObserver in step 4 closes the dialog once the sheet
  // has actually left the viewport.
  scroller.scrollTo({left: scroller.offsetWidth, behavior: 'auto'});
}
```

<a id="4-detect-open-and-closed-state"></a>

### 4. 检测打开与关闭状态

以面板上的 `IntersectionObserver` 而非滚动位置作为抽屉状态的真实依据。无论面板如何移动（用户滑动、程序滚动、吸附稳定），观察器都会触发，让所有关闭路径汇聚到同一回调。

抽屉是模态 `<dialog>`，浏览器会在打开时使页面其余部分不可交互，关闭时将焦点返回触发按钮，因此回调只需要关闭对话框并同步 `aria-expanded`。

```js
function onDrawerOpened() {
  openBtn.setAttribute('aria-expanded', 'true');
}

function onDrawerClosed() {
  // Close the dialog only after the close animation completes,
  // so the slide-out is visible to the user.
  drawer.close();
  openBtn.setAttribute('aria-expanded', 'false');
}

// Treat "any pixel of the sheet visible inside the dialog" as
// "open enough to count as not closed". This threshold is intentionally
// tiny so the closed callback only fires once the sheet is truly gone.
const visibleThreshold = 1 / window.innerWidth;

const observer = new IntersectionObserver(
  (entries) => {
    // During programmatic scrolling the observer can deliver multiple
    // entries in one batch. Only the most recent describes the
    // current state; earlier entries are intermediate positions.
    const entry = entries.at(-1);
    if (entry.intersectionRatio < visibleThreshold) onDrawerClosed();
    if (entry.intersectionRatio === 1) onDrawerOpened();
  },
  // root: drawer makes the dialog element the intersection root,
  // so the ratio reflects the sheet's visibility within the dialog
  // (i.e. how much of it has been swiped on-screen).
  {root: drawer, threshold: [visibleThreshold, 1]},
);
observer.observe(sheet);
```

<a id="5-wire-up-the-trigger-and-dismissal-handlers"></a>

### 5. 连接触发器与关闭处理器

```js
// Open trigger.
openBtn.addEventListener('click', openDrawer);

// Close trigger.
closeBtn.addEventListener('click', closeDrawer);

// Light-dismiss: a tap on the dimmed area (anywhere inside the
// dialog but outside the sheet) closes the drawer. Do not use
// closedby="any": the dialog fills the viewport, so taps land on the
// dialog rather than its ::backdrop, and it would close without the
// slide-out animation.
drawer.addEventListener('click', (event) => {
  if (!sheet.contains(event.target)) closeDrawer();
});

// Escape key. A modal dialog fires `cancel` on Escape; prevent the
// instant close and slide the drawer out instead.
// NOTE: Browsers may make `cancel` non-cancelable on repeated Escape
// presses without user activation in between, closing the dialog instantly.
drawer.addEventListener('cancel', (event) => {
  if (event.cancelable) {
    event.preventDefault();
    closeDrawer();
  }
});
```

<a id="implementation-for-a-drawer-that-also-acts-as-a-sidebar"></a>

## 兼作侧栏的抽屉实现

当同一元素在某些条件下也会成为常驻可见侧栏时，使用此实现（参见[选择抽屉元素](#choose-the-drawer-element)）。用切换布局的同一媒体查询切换 `role`（例如 `matchMedia()`）：作为侧栏时移除，再次成为抽屉时恢复 `role="dialog"`。本指南不涵盖侧栏布局本身。

沿用 [`<dialog>` 实现](#implementation-with-dialog)，作如下修改：

- **标记：** `<div class="Drawer" id="drawer" popover="manual" role="dialog" aria-label="Navigation drawer">`。**必须**使用 `popover="manual"`；不要用 `popover="auto"` 或 `"hint"`，因为它们内建的轻触关闭也会在滑动中触发。
- **打开和关闭：** 用 `showPopover()` 替代 `showModal()`，用 `hidePopover()` 替代 `close()`。其余 CSS 和 JS 不变。
- **模态：** 浮层不是模态，因此代码必须完成模态对话框原生提供的工作：
  - 打开期间将页面其余部分标记为 `inert`。
  - 打开期间应用 `aria-modal="true"`，关闭时移除。
  - 关闭后将焦点返回触发按钮。
  - 在 `document` 上用 `keydown` 监听器处理 Escape，因为浮层不触发 `cancel`。

```js
const main = document.querySelector('main');

function openDrawer() {
  drawer.showPopover();
  // Mark everything outside the drawer inert immediately on open (include
  // sibling <header>/<footer> landmarks if they live outside <main>).
  main.inert = true;
  drawer.setAttribute('aria-modal', 'true');
  scroller.scrollTo({left: 0, behavior: 'auto'});
}

function onDrawerClosed() {
  // The observer also reports "closed" on page load; ignore it unless open.
  if (!drawer.hasAttribute('aria-modal')) return;
  drawer.hidePopover();
  main.inert = false;
  drawer.removeAttribute('aria-modal');
  openBtn.setAttribute('aria-expanded', 'false');
  openBtn.focus();
}

// Escape key. Listen on document because focus may be inside the
// drawer when the user presses Escape.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawer();
});
```

<a id="fallback-strategies"></a>

## 回退策略

Scroll snap 的 Baseline 状态：广泛可用。自 2020-01-15 起纳入 Baseline。
支持版本：Chrome 69（2018 年 9 月）、Edge 79（2020 年 1 月）、Firefox 68（2019 年 7 月）和 Safari 11（2017 年 9 月）。

Intersection observer 的 Baseline 状态：广泛可用。自 2019-03-25 起纳入 Baseline。
支持版本：Chrome 58（2017 年 4 月）、Edge 16（2017 年 10 月）、Firefox 55（2017 年 8 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

背景淡入淡出的滚动驱动动画和 `scroll-initial-target` 属于渐进增强；如果需要广泛浏览器支持，可轻松实现简单回退。

<a id="backdrop-fade-fallback-no-animation-timeline-support"></a>

### 背景淡入淡出回退（不支持 `animation-timeline`）：

Scroll-driven animations 的 Baseline 状态：新近可用。自 2026-10-27 起纳入 Baseline。
支持版本：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

用 `CSS.supports('animation-timeline: scroll()')` 检测；不支持时通过 `scroll` 事件监听器写入 `--drawer-backdrop`。第 2 步 CSS 的 `@supports` 块确保不支持的浏览器不会应用关键帧，因此只有 JavaScript 写入该值。

```js
if (!CSS.supports('animation-timeline: scroll()')) {
  scroller.addEventListener('scroll', () => {
    // Same mapping as the @keyframes: 0 scroll = 1 (open),
    // sheet-width scroll = 0 (closed).
    const ratio = 1 - scroller.scrollLeft / sheet.offsetWidth;
    drawer.style.setProperty('--drawer-backdrop', ratio);
  });
}
```

<a id="initial-scroll-position-fallback-no-scroll-initial-target-support"></a>

### 初始滚动位置回退（不支持 `scroll-initial-target`）：

scroll-initial-target 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）和 Edge 133（2025 年 2 月）。
不支持：Firefox 和 Safari。

用 `CSS.supports('scroll-initial-target', 'nearest')` 检测；在 `openDrawer()` 内，显示抽屉后立即把滚动器跳到关闭位置（使用 `showModal()`；[兼作侧栏时](#implementation-for-a-drawer-that-also-acts-as-a-sidebar)使用 `showPopover()`）。否则抽屉会瞬间出现在打开位置，没有滑入动画。

```js
async function openDrawer() {
  drawer.showModal(); // sidebar variant: showPopover(), main.inert = true, and aria-modal="true"

  if (!CSS.supports('scroll-initial-target', 'nearest')) {
    // Jump-scroll to the closed stop so the scroll below
    // animates the drawer in from off-screen.
    scroller.scrollTo({left: scroller.offsetWidth, behavior: 'instant'});
    // Wait two animation frames for the jump-scroll to commit.
    // A single rAF is not enough — the second `scrollTo` would
    // cancel the first before the browser has a chance to apply it.
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
  }

  scroller.scrollTo({left: 0, behavior: 'auto'});
}
```

<a id="property-fallback-no-registered-custom-properties"></a>

### `@property` 回退（不支持注册自定义属性）：

Registered custom properties 的 Baseline 状态：新近可用。自 2024-07-09 起纳入 Baseline。
支持版本：Chrome 85（2020 年 8 月）、Edge 85（2020 年 8 月）、Firefox 128（2024 年 7 月）和 Safari 16.4（2023 年 3 月）。

需要 `@property` 只是因为滚动驱动动画会在关键帧之间插值 `--drawer-backdrop`：没有注册时，该属性被当作字符串，在 0 与 1 之间跳变，无法渐变。如果已提供上面的滚动动画回退，JavaScript 每个滚动帧都向 `--drawer-backdrop` 写入新的数字字符串，不进行插值，因此无需独立 `@property` 回退；所有支持滚动驱动动画的浏览器也都支持 `@property`。

<a id="popover-api-fallback-sidebar-variant-only"></a>

### Popover API 回退（仅侧栏变体）：

api.HTMLElement.showPopover 能力的 Baseline 状态：广泛可用。自 2024-04-16 起纳入 Baseline。
支持版本：Chrome 114（2023 年 5 月）、Edge 114（2023 年 6 月）、Firefox 125（2024 年 4 月）和 Safari 17（2023 年 9 月）。

inert 的 Baseline 状态：广泛可用。自 2023-04-11 起纳入 Baseline。
支持版本：Chrome 102（2022 年 5 月）、Edge 102（2022 年 5 月）、Firefox 112（2023 年 4 月）和 Safari 15.5（2022 年 5 月）。

抽屉[兼作侧栏时](#implementation-for-a-drawer-that-also-acts-as-a-sidebar)，使用 `popover="manual"` 并完全通过 JavaScript 实现关闭，因此不依赖轻触关闭、`popovertarget` 属性或顶层管理的 Escape 处理。除提升到顶层（`showPopover()`）和 `::backdrop` 外，它唯一依赖的浮层行为是显示时处理 `autofocus`。

需要更广泛浏览器支持时，不要按特性检测分支，而是完全不用 popover。去掉 `popover="manual"`，用 `position: fixed` 和高 `z-index` 替代顶层提升，用样式相同的兄弟元素替代 `::backdrop`（共用 `--drawer-backdrop` 自定义属性），通过类切换可见性替代 `showPopover()`/`hidePopover()`，并在 `openDrawer()` 将抽屉显示后调用 `closeBtn.focus({preventScroll: true})`（`preventScroll` 避免容器提前滚动）。组件其余部分（滚动吸附、滚动驱动背景动画、`IntersectionObserver` 和关闭处理器）不变。
