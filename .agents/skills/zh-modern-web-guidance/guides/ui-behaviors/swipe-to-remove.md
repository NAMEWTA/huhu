<a id="swipe-to-remove"></a>

# 滑动移除

滑动移除在移动应用中常见，Web 上干净实现却有挑战。使用 CSS Scroll Snap 可创建直接接入浏览器滚动引擎、平滑且具有原生手感的交互，无需复杂 JS 手势库，就能获得高性能和物理惯性。

同一模式适用于任何单操作滑动：移除、归档、标为已读、稍后处理。只改变视觉，不改变机制。

> 如果希望水平滑动吸附打开一组操作按钮或侧菜单，**不在滑动时自动提交操作**，参见 `swipe-to-reveal`（通过 `npx -y modern-web-guidance@latest retrieve "swipe-to-reveal"` 获取）。

<a id="how-to-implement"></a>

## 实现方法

组件分为**列表**（`<ul>`）和内部**项目**。每项由外层 `<li>`、内部滚动**轨道**（带吸附点的容器）和**内容**（可见行）组成。滑动揭示的 UI（垃圾桶图标、归档标签等）在内容两侧。列表负责共享连接逻辑（延迟初始化、接收新增项），各项负责自身滑动检测。

<a id="step-1-mark-up-the-list-with-track-and-content"></a>

### 第 1 步：标记包含轨道与内容的列表

```html
<!-- tabindex="-1" lets focus move here when the last item is removed (Step 4). -->
<h2 id="list-heading" tabindex="-1">Inbox</h2>

<!-- Safari removes list semantics when list-style is none; role="list"
     restores the item count for screen readers. -->
<ul class="SwipeableList" role="list" aria-labelledby="list-heading">
  <li id="list-item-1" class="SwipeableList-item">
    <div class="SwipeableList-track">
      <div class="SwipeableList-content">
        <span class="SwipeableList-label">Item One</span>
        <!-- Swiping can't be done with a keyboard, a single tap or a screen
             reader, so each swipe action needs another way to run it (see
             "Accessibility considerations"). This example gives each swipe
             action its own button. data-direction
             is the swipe direction the button stands in for (Step 4), and
             including the item name in the button text tells screen reader
             users which row it acts on. This example has a single action. -->
        <button type="button" class="SwipeableList-action" data-direction="right">
          Remove<span class="visually-hidden"> Item One</span>
        </button>
      </div>
    </div>
  </li>
  <!-- ...more items... -->
</ul>

<!-- Screen readers only announce changes to a live region that was already
     in the page, so render this empty and fill it on removal (Step 4). -->
<p role="status" class="SwipeableList-status visually-hidden"></p>
```

<a id="step-2-configure-the-track-as-a-horizontal-snap-container-with-three-snap-points"></a>

### 第 2 步：将轨道配置为三个吸附点的水平容器

轨道有三个全宽列：左间隔（`::before`）、内容、右间隔（`::after`）。吸附到间隔意味着内容完全离屏，这是提交滑动后的静止位置。

配置受项目 `.is-initialized` 类控制。JS 升级前仅呈现普通内容，没有水平滚动器；第 4 步连接滑动检测后才加类，确保功能准备好前用户不能滑动。

```css
.SwipeableList {
  list-style: none;
}

.SwipeableList-item {
  /* Establishes a containing block for the absolutely positioned action
     icons (Step 3) and clips overflow during the row's removal
     animation (Step 4). */
  contain: content;
}

/* The track only becomes a scroll snap container after JS upgrades
   the row by adding `.is-initialized` (see Step 4). */
.SwipeableList-item.is-initialized .SwipeableList-track {
  /* Three full-width columns: left spacer | content | right spacer.
     Width is 100% of the track, so each column fills the viewport row. */
  display: grid;
  grid-template-columns: 100% 100% 100%;

  /* Horizontal scroll only; vertical overflow is clipped so the
     reveal stays inside the row. */
  overflow: scroll clip;

  /* Prevent the swipe from chaining into the page scroll or browser
     back-gesture on iOS/Android. */
  overscroll-behavior-x: none;

  /* Hide the scrollbar; the swipe doesn't need one, and the action
     buttons (Step 1) are the visible alternative. */
  scrollbar-width: none;

  /* `mandatory` ensures the track always rests on a snap point
     (spacer or content), never partially scrolled. */
  scroll-snap-type: x mandatory;
}

/* Spacers act as the left and right snap targets, AND carry the action's
   reveal color. As the user swipes, the colored spacer slides into view,
   which is what the user sees behind the content. */
.SwipeableList-item.is-initialized .SwipeableList-track::before,
.SwipeableList-item.is-initialized .SwipeableList-track::after {
  content: '';

  /* `scroll-snap-align` is required to make this a valid snap target,
     but the specific value (`start`/`center`/`end`) doesn't matter here
     because each snap point spans the full width of the scroll
     container, so all alignments resolve to the same resting position. */
  scroll-snap-align: start;

  /* `hsl(0 65% 50%)` is an example value; pick whatever fits your
     design (red here signals "delete"; use a different color for
     archive, mark-as-read, etc.). */
  background-color: hsl(0 65% 50%);
}

.SwipeableList-content {
  /* The content sits above the action icons (Step 3), so it covers
     them until the user swipes. */
  position: relative;
  z-index: 2;

  /* Required to make the content a valid snap target (its resting
     position). As with the spacers above, the specific value doesn't
     matter because the snap points are full-width. */
  scroll-snap-align: start;

  /* The content must paint over the revealed spacer color. */
  background: Canvas;

  /* Row separator (example value; customize to taste). */
  border-bottom: 1px solid #eee;
}

/* Gate `scroll-initial-target` behind `.is-initialized` so it only
   applies once the track is actually a scroll container. Setting it on
   the content before then would let the property walk up to the nearest
   scrollable ancestor (typically the document) and shift the page's
   initial scroll position to bring this row's content into view. With
   the gate, the rule is only live when the row's own track can satisfy
   it, so the initial scroll happens inside the track as intended. */
.SwipeableList-item.is-initialized .SwipeableList-content {
  scroll-initial-target: nearest;
}

/* The track is the focusable scroll container, but its overflow is clipped
   so a default focus ring on the track itself would be invisible. Project
   the focus affordance onto the content element (which paints above the
   track) using `:focus-visible` on the track. */
.SwipeableList-track:focus-visible .SwipeableList-content {
  outline: auto;
  outline-offset: -2px;
}
```

<a id="step-3-add-the-action-icons-to-the-list-item"></a>

### 第 3 步：给列表项添加操作图标

操作颜色在间隔上（第 2 步），**图标**在列表项本身，锚定到行左右边缘。

> [!NOTE]
> 本文“左”指*行的左侧*（向右滑动揭示），“右”指*行的右侧*（向左滑动揭示）。

以下位置、尺寸和动态效果只是**起始建议**，不是要求。图标大小、边缘缩进、越过阈值时弹出比例、过渡时长，以及伪元素或真实 DOM 的选择，都可按设计调整。唯一机制要求是：图标在内容后方（滑动前能被覆盖），并位于列表项内（不随间隔滚动）。其他都是视觉取舍。

```css
/* Action icons painted on the list item. They're absolutely positioned
   inside the row (which is a containing block thanks to `contain: content`
   on `.SwipeableList-item` from Step 2) and sit at z-index 1, so the
   content element (z-index 2) covers them until the user swipes far
   enough. */
.SwipeableList-item.is-initialized::before,
.SwipeableList-item.is-initialized::after {
  /* Inline an SVG as the action icon. Replace this with whatever icon
     fits the action (archive, checkmark, clock, etc.). The `fill='white'`
     is baked into the SVG so it contrasts with the red spacer background;
     adjust if your background color is light. */
  --action-icon: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z'/></svg>");

  content: '';
  position: absolute;
  z-index: 1;

  /* The size (`width`) and insets (`left`/`right` below) are example
     values, tune them to match your row height and visual weight.
     The icon fills its box via `background-size: contain`, so changing
     `width` resizes it. */
  width: 1.5em; /* example value, adjust to taste */
  aspect-ratio: 1;
  top: 50%;
  translate: 0 -50%;

  /* Smooth transitions for the icon's visual states: the activate-point
     pop (`scale`, see `.is-activating` below) and the removal fade
     (`scale` + `opacity`, see `.is-removing` below). 0.2s is an example
     duration. */
  transition: scale 0.2s ease, opacity 0.2s ease;

  background: var(--action-icon) center / contain no-repeat;
}
/* Inset from the row edge (example values; adjust to match your layout). */
.SwipeableList-item.is-initialized::before { left: 1.5em; }
.SwipeableList-item.is-initialized::after  { right: 1.5em; }

/* Activating pop: scale the icon up when the user is past the visual
   activate point, so the row's affordance feels reactive. Toggled by JS
   in Step 4. */
.SwipeableList-item.is-activating::before,
.SwipeableList-item.is-activating::after {
  scale: 1.333;
}

/* Removal affordance: fade and shrink the icons as the row collapses.
   Driven by the `is-removing` class added in Step 4 at commit time;
   the existing `transition` on the icons animates the change. */
.SwipeableList-item.is-removing::before,
.SwipeableList-item.is-removing::after {
  scale: 0.5;
  opacity: 0;
}

/* Only show the icon on the *leading* side of the swipe; hide the
   trailing-side one. `data-swipe-direction` is set by JS in Step 4. */
.SwipeableList-item.is-activating[data-swipe-direction="left"]::after,
.SwipeableList-item.is-activating[data-swipe-direction="right"]::before {
  visibility: hidden;
}

/* Skip the icon pop for users who prefer reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .SwipeableList-item.is-activating::before,
  .SwipeableList-item.is-activating::after {
    scale: 1;
  }
}

/* Forced colors replaces the action background with Canvas, which hides the
   white icon. Paint the icon shape in CanvasText instead so it stays visible. */
@media (forced-colors: active) {
  .SwipeableList-item.is-initialized::before,
  .SwipeableList-item.is-initialized::after {
    forced-color-adjust: none;
    background: CanvasText;
    mask: var(--action-icon) center / contain no-repeat;
  }
}
```

<a id="step-4-detect-the-commit-gesture-with-intersectionobserver"></a>

### 第 4 步：用 `IntersectionObserver` 检测提交手势

使用以轨道为根节点的 `IntersectionObserver` 观察内容。滑动时内容与轨道相交比例下降，使用**两个阈值**：

- `activateThreshold`：较高比例，例如 0.8。可见比例低于它表示越过视觉激活点，切换图标弹出提示。
- `commitThreshold`：较低比例，例如 0.2。低于它表示已提交，**立即**开始移除动画，不等待吸附稳定。折叠行融入仍持续的滑动惯性，比等吸附完成后才反应更灵敏。

这里还处理三个问题：

- **逐项延迟初始化：** 一个以视口为 root 的外层 `IntersectionObserver` 驱动初始化和内部滑动观察器启停。项目首次进入视野才连接，离屏时暂停内部观察。这限制活动观察器数量，也避免项目渲染前读取 `clientWidth` 等布局值。
- **动态项目：** 真实列表随时间增长（初始加载、无限滚动、服务器推送）。`<ul>` 上的 `MutationObserver` 将新增项注册给外层观察器。
- **操作按钮：** 点击或 Enter 运行与对应滑动相同的 `commit`，共用焦点移动、播报和移除动画。操作颜色和图标由轨道滚动揭示，所以按钮触发时不会出现。

```js
// Per-item handles. Populated when an item is first lazily wired up; read by
// the outer viewport observer to start/stop the inner observer as items enter
// and leave the viewport.
const swipeObservers = new WeakMap();

// Outer observer: drives the entire swipe lifecycle off viewport visibility.
// On first entry, lazily wires the item up (`setupItem` reads layout-dependent
// values like `clientWidth`, which return 0 until the item is rendered). After
// setup, starts the inner observer. On exit, stops the inner observer so
// offscreen items don't track scroll positions.
const viewportObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const item = entry.target;
    if (entry.isIntersecting) {
      const handle = swipeObservers.get(item) ?? setupItem(item);
      handle.observer.observe(handle.content);
    } else {
      const handle = swipeObservers.get(item);
      if (handle) handle.observer.unobserve(handle.content);
    }
  }
});

function setupItem(item) {
  const track = item.querySelector('.SwipeableList-track');
  const content = track.querySelector('.SwipeableList-content');

  // Upgrade the row into "swipeable" mode. This is the gate for all the CSS
  // from Steps 2 and 3 (the track becomes a snap container, the action icons
  // appear). Done *before* the inner observer is attached so the snap
  // container exists by the time intersection callbacks can fire.
  item.classList.add('is-initialized');

  // Tunable thresholds. `activateThreshold` is the visual feedback point
  // (icon pops). `commitThreshold` is the point of no return: once the
  // content is past this point of being off-screen, we commit even if the
  // user releases mid-gesture and the track snaps back. A low value (~0.2)
  // commits before the snap settles, so the remove animation can start
  // during the swipe.
  const activateThreshold = 0.8;
  const commitThreshold = 0.2;

  // One inner observer per item, rooted at the track. Vertical scrolling of
  // the outer list moves root and target together, so the callback only fires
  // for the horizontal swipe.
  const observer = new IntersectionObserver((entries, observer) => {
    const entry = entries.at(-1);
    const ratio = entry.intersectionRatio;

    // Direction the user is swiping toward. A positive offset from the
    // track's left edge means the content has been pulled right (left
    // spacer revealed), so the leading icon is on the left.
    const direction = (entry.boundingClientRect.x - entry.rootBounds.x) > 0
      ? 'left'
      : 'right';

    if (ratio < commitThreshold) {
      // The IO entry's boundingClientRect is the last reliable measurement
      // before the animation starts; reuse it for both the pre-collapse
      // height and the slide-off translate distance.
      commit(direction, entry);
      return;
    }

    // Scale up the leading icon while the content is past the activate
    // point; restore it at rest.
    item.classList.toggle('is-activating', ratio < activateThreshold);

    // Hold the previous direction at rest so the icon's exit animation
    // finishes on the side the user was swiping toward.
    if (entry.boundingClientRect.x !== entry.rootBounds.x) {
      item.dataset.swipeDirection = direction;
    }
  }, {
    root: track,
    threshold: [commitThreshold, activateThreshold],
  });

  // The swipe and the action buttons all commit through here, so they share
  // one removal path. The guard stops a second swipe or click from removing
  // the row twice.
  function commit(direction, entry) {
    if (item.classList.contains('is-removing')) return;
    removeItem(item, content, direction, entry);
    viewportObserver.unobserve(item);
    observer.disconnect();
  }

  // Return the handle without starting observation; the outer viewport observer
  // calls `observer.observe(content)` once the item is in view.
  const handle = {observer, content, track, commit};
  swipeObservers.set(item, handle);
  return handle;
}

async function removeItem(item, content, direction, entry) {
  // Removing or inerting the row drops focus to <body> if focus is inside it,
  // so move focus to the next row first (or the previous row, or the list
  // heading when the list is now empty). Rows still collapsing are skipped.
  // Keep focus on the same kind of element: if the row itself had focus
  // (some browsers make the track a Tab stop even when it contains buttons),
  // focus the next row, so the larger row focus indicator appears where the
  // user expects it; otherwise focus the next row's first button.
  const list = item.parentElement;
  if (item.contains(document.activeElement)) {
    const rows = [...list.children].filter(
      (row) => row === item || !row.classList.contains('is-removing'),
    );
    const index = rows.indexOf(item);
    const next = rows[index + 1] ?? rows[index - 1];
    const listHeading = document.getElementById(list.getAttribute('aria-labelledby'));
    const firstButton = next?.querySelector('button');
    const target = document.activeElement.matches('.SwipeableList-track')
      ? next?.querySelector('.SwipeableList-track')
      : firstButton;
    (target ?? listHeading).focus();
    // Not every browser lets the track take focus; fall back to the button.
    if (target && document.activeElement !== target) (firstButton ?? listHeading).focus();
  }

  // A row disappearing isn't announced, so say which item was removed in
  // the page's role="status" element from Step 1.
  const label = item.querySelector('.SwipeableList-label').textContent;
  document.querySelector('.SwipeableList-status').textContent = `${label} removed`;

  // Sliding the row off-screen is large movement, so skip it for users who
  // prefer reduced motion and keep a shorter collapse instead.
  // (150ms and 300ms are example durations.)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opts = { duration: reduce ? 150 : 300, easing: 'ease', fill: 'forwards' };

  const rect = entry.boundingClientRect;
  // Content's pixel offset from the track's left edge.
  const x = rect.x - entry.rootBounds.x;
  // Pixel distance the content needs to travel to be fully out of view.
  const translate = direction === 'left'
    ? rect.width - x
    : -(x + rect.width);

  // Use a combination of CSS transitions (for declarative styles) and
  // WAAPI animations (for computed values) to remove the element,
  // then await the completion of all of them.
  // Note: the content translate animation is important because the
  // height-collapse animation can otherwise finish before the browser's
  // smooth scroll-snap has scrolled the content fully off-screen.
  item.classList.add('is-removing');
  item.animate([{ height: `${rect.height}px` }, { height: '0px' }], opts);
  if (!reduce) content.animate([{ translate: `${translate}px` }], opts);
  await Promise.allSettled(
    item.getAnimations({ subtree: true }).map((a) => a.finished),
  );

  // Safari has a scroll-latching bug: removing the node while the swipe
  // gesture's momentum is still resolving causes the next item (which
  // slides up into this one's place) to inherit the scroll and
  // immediately scroll itself off-screen. Detect Safari via
  // `GestureEvent` (a Safari-only API) and defer the actual DOM removal
  // until the gesture has fully settled. The 5s delay is conservative;
  // anything longer than the momentum tail is fine. Mark the row inert
  // so it can't be interacted with during the delay.
  if (globalThis.GestureEvent) {
    item.inert = true;
    setTimeout(() => item.remove(), 5000);
  } else {
    item.remove();
  }
}

function setupList(list) {
  // Observe items already in the list.
  for (const item of list.children) {
    if (item.matches('.SwipeableList-item')) {
      viewportObserver.observe(item);
    }
  }

  // Pick up items added later (initial render after data loads, infinite
  // scroll, server push). Removals don't need MutationObserver handling —
  // `commit()` above already unobserves the item before removing it from the
  // DOM.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE &&
            node.matches('.SwipeableList-item')) {
          viewportObserver.observe(node);
        }
      }
    }
  }).observe(list, { childList: true });

  // Delegate from the list so items added later work too. A keyboard user can
  // reach a button before its row has scrolled into view, so set the item up
  // on demand.
  list.addEventListener('click', (event) => {
    const button = event.target.closest('.SwipeableList-action');
    const item = button?.closest('.SwipeableList-item');
    if (!item) return;
    const handle = swipeObservers.get(item) ?? setupItem(item);
    // Commit in the direction of the swipe this button stands in for, passing
    // the same measurements an IntersectionObserver entry carries.
    handle.commit(button.dataset.direction, {
      boundingClientRect: handle.content.getBoundingClientRect(),
      rootBounds: handle.track.getBoundingClientRect(),
    });
  });
}

document.querySelectorAll('.SwipeableList').forEach(setupList);
```

<a id="step-5-use-the-action-and-label-that-fits-your-use-case"></a>

### 第 5 步：选择适合用例的操作与标签

移除以外的变体只改变视觉与提交处理器主体：

- **归档：** 绿/蓝背景，归档图标，将项目移到归档列表而非删除。
- **标为已读：** 柔和背景，对勾图标，更新状态重渲染，或只移除 `.unread`。
- **稍后处理：** 蓝背景，时钟图标，隐藏到选定时间。

滚动、吸附、观察机制不变。

<a id="different-actions-per-swipe-direction"></a>

#### 不同方向执行不同操作

同一行可提供**两种操作**，左滑和右滑各一种，例如右滑归档、左滑删除，类似许多原生邮件应用。滚动、吸附和提交检测完全不变，只改变提交时执行内容。

第 4 步 `commit` 总调用 `removeItem(...)`。支持双操作时，按 `direction` 选择处理器，每种操作有独立按钮，`data-direction` 对应其代表的滑动方向（第 1 步）：

```js
function commit(direction, entry) {
  if (item.classList.contains('is-removing')) return;
  const handler = direction === 'left' ? archiveItem : removeItem;
  handler(item, content, direction, entry);
  viewportObserver.unobserve(item);
  observer.disconnect();
}
```

命名说明：`removeItem` 按破坏性场景命名，但它执行的“折叠高度、滑出内容、移除节点”其实是通用的“此行已完成，动画离开”流程，同样适用于归档、已读或稍后处理，因为该行都会离开*当前*列表。处理器实际不删除任何数据（例如都移动到别处）时，可改名为 `dismissItem` 等中性名称。

为视觉区分两种操作，把各方向颜色和图标提升为列表项变量，再用同一变量绘制分割渐变轨道和两个伪元素图标。

```css
.SwipeableList-item {
  /* Action color + icon per swipe direction. `--left-*` is revealed
     when the user swipes RIGHT (e.g., archive); `--right-*` is revealed
     when the user swipes LEFT (e.g., delete). */
  --left-action-color: hsl(140 50% 40%);
  --left-action-icon: url("…archive svg…");
  --right-action-color: hsl(0 65% 50%);
  --right-action-icon: url("…trash svg…");
}

.SwipeableList-item.is-initialized .SwipeableList-track {
  /* Split reveal: left half of the scrollable area gets the left-action
     color, right half gets the right-action color. `background-attachment:
     local` makes the gradient's positioning area the scrollable area
     (3x the visible width), so the default size fills it and the 50% hard
     stop lines up exactly with the midpoint of the resting content column.
     The track's color also stays continuous behind the content as it
     translates off, so the leading-direction color shows the whole way. */
  background-image: linear-gradient(
    to right,
    var(--left-action-color) 50%,
    var(--right-action-color) 50%
  );
  background-attachment: local;
}

/* Per-side icons read from the same variables. */
.SwipeableList-item.is-initialized::before { background-image: var(--left-action-icon); }
.SwipeableList-item.is-initialized::after  { background-image: var(--right-action-icon); }
```

此配置由轨道渐变负责揭示，间隔不再需要自身背景色。双操作变体可删除第 2 步 `.SwipeableList-track::before, ::after` 的 `background-color` 规则。

<a id="best-practices-and-pitfalls"></a>

## 最佳实践与易错点

- **要**用 `mandatory` 而非 `proximity`，使用 `proximity` 时，行可能停在半滚动状态，露出一半操作背景。
- **要**轨道设 `overscroll-behavior-x: none`，否则过度滑动可能触发 iOS/Android 浏览器返回手势。
- **要**在吸附稳定*前*的阈值提交（如 `commitThreshold ≈ 0.2`），不要等完全离屏。这让移除在手势中开始，更灵敏。
- **要**由外层视口 `IntersectionObserver` 驱动初始化，而非加载时连接全部项，避免在项目渲染前读取布局相关值（如 `clientWidth`），使活动观察器数与可见内容成比例。
- **要**在动态添加项目时（数据加载后的首次渲染、无限滚动、服务器推送），在列表上使用 `MutationObserver`；否则，页面加载后追加的项目无法连接到滑动处理逻辑。
- **不要**依赖 `pointerdown`、`pointermove`、`pointerup` 事件手动驱动变换，会失去原生惯性、弹回和键盘滚动。
- **要**在合适时确认破坏性操作。移除可考虑滑动结束后提供撤销 Toast，手势快且易误触。还要把结果（如“项目一已移除”）写入页面已存在的 `role="status"`，屏幕阅读器只播报变化前已存在的实时区域。

<a id="accessibility-considerations"></a>

## 无障碍考量

为满足 WCAG 2.5.1 指针手势，功能不能仅通过滑动提供。可见按钮是无障碍替代，尤其帮助语音控制用户。按钮至少 24×24 CSS 像素（WCAG 2.5.8 最小目标尺寸），名称包含操作项目，并可仅键盘到达和使用。行内已有按钮后，不要给轨道加 `tabindex`：聚焦轨道时方向键会无确认直接提交。

另一种满足方式是在其他位置提供功能。例如收件箱左滑收藏，也可进入邮件后按键盘可达的“收藏邮件”按钮。若需要大量重复操作，这种方式可用性较低，残障用户会耗费更多时间。长按菜单提供同样操作也可作为替代，但不如常驻按钮易发现。若按钮仅悬停或聚焦显示，也应在轻触项目时显示，让触摸用户可到达。

<a id="fallback-strategies"></a>

## 回退策略

Scroll snap 的 Baseline 状态：广泛可用。自 2020-01-15 起纳入 Baseline。
支持版本：Chrome 69（2018 年 9 月）、Edge 79（2020 年 1 月）、Firefox 68（2019 年 7 月）和 Safari 11（2017 年 9 月）。

Intersection observer 的 Baseline 状态：广泛可用。自 2019-03-25 起纳入 Baseline。
支持版本：Chrome 58（2017 年 4 月）、Edge 16（2017 年 10 月）、Firefox 55（2017 年 8 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

MutationObserver 的 Baseline 状态：广泛可用。自 2015-07-29 起纳入 Baseline。
支持版本：Chrome 26（2013 年 3 月）、Edge 12（2015 年 7 月）、Firefox 14（2012 年 7 月）和 Safari 7（2013 年 10 月）。

Resize observer 的 Baseline 状态：广泛可用。自 2020-07-28 起纳入 Baseline。
支持版本：Chrome 64（2018 年 1 月）、Edge 79（2020 年 1 月）、Firefox 69（2019 年 9 月）、Safari 13.1（2020 年 3 月）和 Safari iOS 13.4（2020 年 3 月）。

Web animations 的 Baseline 状态：广泛可用。自 2020-09-16 起纳入 Baseline。
支持版本：Chrome 84（2020 年 7 月）、Edge 84（2020 年 7 月）、Firefox 75（2020 年 4 月）和 Safari 14（2020 年 9 月）。

使用的更新特性要么非核心，要么已有可可靠使用的稳健回退。

<a id="fallback-for-overscroll-behavior"></a>

### `overscroll-behavior` 回退

overscroll-behavior 的浏览器支持：有限可用。
支持版本：Chrome 144（2026 年 1 月）、Edge 144（2026 年 1 月）和 Firefox 150（2026 年 4 月）。
不支持：Safari。

本用例无需回退。虽然 `overscroll-behavior` 在没有可滚动溢出的容器上存在互操作问题，但此轨道始终水平可滚（100% 宽容器内三个全宽列），因此行为跨浏览器一致，滑动可靠被约束。

<a id="fallback-for-scrollbar-width"></a>

### `scrollbar-width` 回退

scrollbar-width 的 Baseline 状态：新近可用。自 2024-12-11 起纳入 Baseline。
支持版本：Chrome 121（2024 年 1 月）、Edge 121（2024 年 1 月）、Firefox 64（2018 年 12 月）和 Safari 18.2（2024 年 12 月）。

隐藏滚动条只是视觉增强，不是滑动移除的核心。目标 Baseline 不支持 `scrollbar-width` 时，行仍滚动、吸附、检测提交并正确移除，只是可能显示横向滚动条。产品要求旧 WebKit 也隐藏时，可为滑动轨道增加严格限定范围的 `::-webkit-scrollbar { display: none; }`。

<a id="fallback-for-scroll-initial-target"></a>

### `scroll-initial-target` 回退

scroll-initial-target 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）和 Edge 133（2025 年 2 月）。
不支持：Firefox 和 Safari。

目标 Baseline 不包含 `scroll-initial-target` 时，在 `setupItem` 内程序滚动轨道到内容，使用 `CSS.supports` 检测：

```js
// Hoist the feature detect so the conditional `ResizeObserver` below can be
// skipped entirely when the property is supported.
const needsScrollWorkaround = !CSS.supports('scroll-initial-target', 'nearest');

function setupItem(item) {
  // ...existing setup from Step 4...

  if (needsScrollWorkaround) {
    track.scrollLeft = track.clientWidth;
  }

  // ...attach the inner IntersectionObserver, etc.
}
```

**调用顺序很重要。** 程序滚动必须：

1. 在添加 `.is-initialized` **之后**执行，该类才使轨道可滚动；对不可滚动元素设置 `scrollLeft` 不会产生效果。
2. 在连接第 4 步内部 `IntersectionObserver` **之前**执行，否则初始滚过左间隔会被识别为滑动，立即触发提交。

外层视口观察器驱动初始化使其可靠：`setupItem` 在项目渲染后运行，`track.clientWidth` 返回真实值而非 `0`。

某些浏览器（尤其 Safari）在轨道尺寸变化时会重置吸附容器位置，如地址栏显隐、视口调整或容器查询。为各轨道使用 `ResizeObserver` 重新应用滚动，并置于同一个 `CSS.supports` 检查条件下；原生支持 `scroll-initial-target` 时，浏览器会自行处理尺寸变化时的滚动位置恢复。

```js
const trackResizeObserver = needsScrollWorkaround
  ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        entry.target.scrollLeft = entry.target.clientWidth;
      }
    })
  : null;

function setupItem(item) {
  // ...existing setup...

  if (needsScrollWorkaround) {
    track.scrollLeft = track.clientWidth;
    trackResizeObserver.observe(track);
  }

  // ...attach the inner IntersectionObserver, etc.
}
```

`removeItem` 的行高动画前取消观察轨道，否则高度变化会在移除中重新触发 resize 回调。在第 4 步 `commit` 函数的 `viewportObserver.unobserve(item)` 旁加入：

```js
function commit(direction, entry) {
  if (item.classList.contains('is-removing')) return;
  removeItem(item, content, direction, entry);
  viewportObserver.unobserve(item);
  if (needsScrollWorkaround) trackResizeObserver.unobserve(track);
  observer.disconnect();
}
```
