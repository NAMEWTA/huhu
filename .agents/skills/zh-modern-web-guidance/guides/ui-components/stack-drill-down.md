<a id="stack-drill-down"></a>

# 堆栈式逐层导航

<a id="overview"></a>

## 概述

堆栈式逐层导航是移动应用中常见的层级导航模式：激活链接会在前一个视图上推入新的全屏视图。内容由应用决定，例如设置子页、信息流中的讨论串、文件浏览器中的文件夹或图库中的详情页。用户向右将当前视图滑出屏幕，或点击返回按钮即可返回。浏览器历史保持同步，使操作系统级返回手势、深链接以及前进/后退导航协调运作。

本指南将堆栈实现为：

- 水平 CSS 滚动吸附容器，每个视图恰好是一个吸附停靠点。深入一层时追加视图并平滑滚动过去；滑动返回由浏览器原生处理，无需指针事件 JavaScript，就能获得动量、速度和中断跟踪。
- 堆栈上的 `scrollsnapchange` 监听器，在吸附目标改变时触发，作为“活动视图已改变”的唯一真实依据。滑动、点击、程序滚动和 `popstate` 路径汇聚于同一回调，更新 `inert`、恢复焦点、移除用户已滑过的视图，并协调浏览器历史。
- 集成 `pushState` / `popstate`，使每次深入增加历史条目、操作系统级返回手势可用，并让深链接直接打开正确视图。
- 每个视图可选的滚动驱动 `view()` 动画，将视差、变暗和阴影效果直接绑定到滑动手势，让可见运动由用户手指驱动，而非补间动画。

此方式优于 JavaScript 驱动的 `transform` 动画，因为吸附机制让用户通过手势直接控制面板位置，并符合原生移动应用的预期交互。

<a id="implementation"></a>

## 实现

<a id="1-markup"></a>

### 1. 标记

静态 HTML 只有空的堆栈容器；视图由 JavaScript 构建，并随用户导航追加。

```html
<div class="Stack">
  <!-- Intentionally empty. The initial view is appended by JavaScript
       at init time (step 8). -->
</div>
```

每个视图都是 `.Stack` 的直接子元素 `.Stack-view`（吸附目标），内部包含 `.Stack-viewContent` 包装元素（放置视图内容并应用视差变换，见第 2 步）。任意时刻，每个活动历史条目对应一个视图，按深入顺序从左到右排列。从根视图深入两层后，渲染 DOM 如下：

```html
<div class="Stack">
  <!-- Root view. Has whatever content makes sense as the entry point
       of this section of the app. No back button — there is nothing
       behind the root in the stack. -->
  <div class="Stack-view" inert>
    <!-- tabindex="-1" lets focus move to the root's content when there is
         no link or back button to focus (step 7). -->
    <div class="Stack-viewContent" tabindex="-1">
      <!-- Root content; includes <a href> links that drill in. -->
    </div>
  </div>

  <!-- First-level drill-down view. The user got here by activating a
       link in the root view. -->
  <div class="Stack-view" inert>
    <div class="Stack-viewContent">
      <header>
        <!-- DO include a back button. The swipe gesture is not
             discoverable or available to all users, so keyboard and
             pointer users need an explicit control. Name it after the
             view it returns to (step 7). -->
        <button class="back" aria-label="Back to Inbox"></button>
        <h2>Message</h2>
      </header>
      <main>
        <!-- View content; may include further drill-down <a href> links. -->
      </main>
    </div>
  </div>

  <!-- Second-level drill-down view. Currently visible — no `inert`
       attribute. Same shape as the first-level view. -->
  <div class="Stack-view">
    <div class="Stack-viewContent">
      <header>
        <button class="back" aria-label="Back to Message"></button>
        <h2><!-- ... --></h2>
      </header>
      <main><!-- ... --></main>
    </div>
  </div>
</div>
```

注意：

- 除当前可见视图外，其余都有 `inert`。由第 7 步 `scrollsnapchange` 处理器自动添加/移除，不要在视图构建器中设置。
- 用户向后滑过的视图会从 DOM 移除（同样由第 7 步处理），使堆栈永远不超过 `currentDepth + 1` 个子元素。前进导航重新访问时，根据缓存 URL 路径按需重建。

<a id="2-styles"></a>

### 2. 样式

<a id="the-stack-scroller"></a>

#### 堆栈滚动器

堆栈是水平网格，每个子视图恰好与容器同宽，CSS 滚动吸附确保每次吸附一个视图，从而赋予滑动返回原生手感。

```css
.Stack {
  /* Use dvh so the height tracks the dynamic viewport on mobile, where
     the address bar can show/hide. svh would clip during the address bar
     animation; vh leaks under it. */
  height: 100dvh;

  /* Lay views out left-to-right, each one full-width, so horizontal
     scrolling moves between them one at a time. */
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 100%;
  grid-template-rows: 100%;
  overflow-x: auto;

  /* `mandatory` guarantees the stack always settles fully on a view —
     never half-way between two. */
  scroll-snap-type: x mandatory;
  /* Prevent the swipe-back gesture from chaining into the browser's
     own history-back gesture (iOS, some Android) or the page's vertical
     scroll. The user is navigating the stack, not the page. */
  overscroll-behavior-x: none;
}

/* Hide the visual scrollbar — the snap and the parallax are the
   affordances; a horizontal scrollbar would look out of place. */
.Stack::-webkit-scrollbar {
  display: none;
}

/* MANDATORY: Opt into smooth programmatic scrolling via CSS, gated on
   prefers-reduced-motion. JS code calls scrollTo/scrollBy with
   behavior: 'auto' which defers to this rule, so the OS-level reduced-
   motion preference automatically downgrades to instant scrolling
   without any per-call JS branching. */
@media (prefers-reduced-motion: no-preference) {
  .Stack {
    scroll-behavior: smooth;
  }
}

.Stack-view {
  scroll-snap-align: start;
  /* `always` prevents the user from blowing through more than one view
     per gesture, so depth changes always happen one step at a time. */
  scroll-snap-stop: always;
}

/* MANDATORY: A separate inner element is required for the parallax
   transform below. Applying transforms directly to the snap target
   (.Stack-view) would feed back into the scroll container's snap
   geometry and the scroller would jump mid-gesture. */
.Stack-viewContent {
  width: 100%;
  height: 100%;
  /* Set the text color with the background color so the pair keeps its
     contrast when the page uses a dark color scheme. */
  background-color: Canvas;
  color: CanvasText;
  /* Each view scrolls its own content vertically, independent of the
     stack's horizontal scroll. */
  overflow-y: auto;
}
```

<a id="the-stack-effect-parallax--dim--shadow"></a>

#### “堆栈”效果（视差 / 变暗 / 阴影）

滚动驱动的 `view(inline)` 动画跟踪每个视图经过滚动器的进度，为退出视图应用视差和变暗，并为进入的深入视图添加阴影，使其看起来像叠在前一个视图上的“卡片”。

```css
/* MANDATORY: Wrap the animation block in @supports. Browsers without
   scroll-driven animations still parse the @keyframes and would
   apply the `to` state as a static style, leaving every view
   permanently transformed. The @supports gate confines the animation
   to browsers where it actually animates. */
@supports (animation-timeline: view()) {
  .Stack-viewContent {
    /* view(inline) tracks this element's progress through its nearest
       scrollable ancestor on the inline (x) axis. */
    animation: parallax linear both;
    animation-timeline: view(inline);
    /* Only animate the EXIT phase — when this view is being covered
       by a deeper one. During its own entry the view stays at rest,
       so the fresh content is fully bright and in position throughout. */
    animation-range: exit 0% exit 100%;
  }

  /* Drill-down views (everything except the root) also get a shadow on
     their left edge during the transition so they feel like cards
     stacking over the previous view. */
  .Stack-view:not(:first-child) .Stack-viewContent {
    animation: parallax linear both, shadow-fade linear both;
    animation-timeline: view(inline), view(inline);
    /* parallax: only exit (the view sliding back as a deeper one comes in).
       shadow-fade: entry through exit (visible the whole time the view is
       transitioning, not when it's at rest). */
    animation-range: exit 0% exit 100%, entry 0% exit 100%;
  }

  @keyframes parallax {
    /* translateX(75%) and brightness(0.8) are examples — adjust to taste. */
    to {
      transform: translateX(75%);
      filter: brightness(0.8);
    }
  }

  @keyframes shadow-fade {
    /* Shadow ramps in during entry, holds across the middle of the
       gesture, and ramps out during exit — so it's only visible while
       the view is mid-transition, not when at rest. */
    0%, 100% { box-shadow: 0 0 1.5rem #0000; }
    25%, 75% { box-shadow: 0 0 1.5rem #0004; }
  }
}
```

注意：这种效果常见于现代原生堆栈应用，是良好起点；也可按需要定制具体视觉效果以匹配现有过渡风格。

<a id="3-module-state"></a>

### 3. 模块状态

堆栈在模块作用域跟踪四项状态：

```js
const stack = document.querySelector('.Stack');

// Reference to the root view DOM element. The Stack starts empty, so
// this is null until the root view is created — either at init (step 8,
// when the URL is '/') or later by synthesizeRootEntry() (when the user
// landed on a deep link and then navigates back). Held as a mutable
// reference because other code (the scrollsnapchange handler, init, etc.)
// uses identity comparisons against it.
let rootView = null;

// Tracks which element to restore focus to when the user swipes back
// into a previous view. Keyed by the view element itself so entries
// are garbage-collected automatically when the view is pruned.
const returnFocus = new WeakMap();

// Maps history depth -> {urlPath, view}. We MUST maintain this map
// ourselves because the History API does not expose state for entries
// other than the current one — so when a view is pruned on swipe-back,
// we still need to remember which URL it represented in case the user
// later forward-navigates back into it.
const entriesByDepth = new Map();

// Tracked manually because history.state on a popstate event tells us
// the destination depth but not where we came from. We need both to
// compute the direction (back vs forward) and the distance.
let currentDepth = 0;
```

另外还有三个应用专用辅助函数，它们是接入应用路由和视图渲染的唯一位置：

```js
// Resolve a URL path to the data your app needs to render the
// corresponding drill-down view, or return null for paths this section
// of the app does not handle (the root path '/', external links,
// unknown routes). resolveUrl() is for drill-down routes only — the
// root view is rendered separately by createRootView() below.
function resolveUrl(urlPath) {
  // Replace with your routing logic. For example, match `/view/:id`
  // and look the id up in your app state.
}

// Build the root (home) view of the stack. Application-specific content;
// preserve the .Stack-view / .Stack-viewContent wrapper structure (the
// inner element is required for the parallax — see step 2) and DO NOT
// render a back button — the root view has nothing behind it in the
// stack.
function createRootView() {
  const view = document.createElement('div');
  view.className = 'Stack-view';
  view.innerHTML = `
    <!-- tabindex="-1" lets step 7 focus the root's content when there is
         no link to return focus to. -->
    <div class="Stack-viewContent" tabindex="-1">
      <!-- Root content. Include <a href> elements pointing at URL paths
           that resolveUrl() accepts, to enable drill-down from here. -->
    </div>
  `;
  return view;
}

// Build a drill-down view DOM element from the resolved route data.
// Customize the inner content freely, but DO preserve the .Stack-view
// / .Stack-viewContent wrapper structure and DO include a back button
// (the swipe gesture is not discoverable or available to all users).
function createDrillDownView(routeData) {
  const view = document.createElement('div');
  view.className = 'Stack-view';
  view.innerHTML = `
    <div class="Stack-viewContent">
      <header>
        <!-- Step 7 names this button after the view it returns to. -->
        <button class="back" aria-label="Back"></button>
        <h2></h2>
        <!-- Breadcrumb or other view chrome derived from routeData. -->
      </header>
      <main>
        <!-- View body, also from routeData. Include further <a href>
             elements pointing at URL paths that resolveUrl() also
             accepts, to enable additional drill-downs from this view. -->
      </main>
    </div>
  `;
  // Set the title as text so it can't inject markup. (`title` is an
  // example field; use whatever your routeData provides.)
  view.querySelector('h2').textContent = routeData.title;
  return view;
}

function getCurrentUrlPath() {
  return location.pathname;
}
```

<a id="4-drill-down"></a>

### 4. 逐层深入

深入操作按顺序做四件事：推入历史条目、构建新视图、追加视图、平滑滚动到它。吸附稳定后由 `scrollsnapchange` 处理器（第 7 步）继续处理。

```js
function drillDown(urlPath) {
  const routeData = resolveUrl(urlPath);
  if (!routeData) return;

  const newDepth = currentDepth + 1;
  // Push BEFORE creating the view so the URL is correct if anything
  // observing history (analytics, etc.) reads it during view creation.
  history.pushState({depth: newDepth}, '', urlPath);

  // pushState truncates forward entries in real browser history;
  // mirror that truncation in our depth map so we don't hold references
  // to views the user can no longer reach.
  for (const d of entriesByDepth.keys()) {
    if (d >= newDepth) entriesByDepth.delete(d);
  }
  currentDepth = newDepth;

  const newView = createDrillDownView(routeData);
  stack.appendChild(newView);
  entriesByDepth.set(newDepth, {urlPath, view: newView});

  // Scroll one viewport-width to the right. behavior: 'auto' defers to
  // the CSS `scroll-behavior` set in step 2, which is smooth unless
  // prefers-reduced-motion is set. The snap container locks onto the
  // new view; the scrollsnapchange listener (step 7) fires when the
  // snap settles.
  stack.scrollBy({left: stack.clientWidth, behavior: 'auto'});
}
```

<a id="5-click-and-back-button-handling"></a>

### 5. 点击与返回按钮处理

拦截堆栈内链接点击并转为深入操作。保留修饰键行为，让 cmd/中键点击仍可在新标签页打开链接。

```js
stack.addEventListener('click', (e) => {
  // Back button: defer to goBack() (defined below), which handles both
  // the normal in-app case and the deep-link case.
  if (e.target.closest('.back')) {
    goBack();
    return;
  }

  // Drill-down link.
  const link = e.target.closest('a');
  if (!link || !stack.contains(link)) return;
  // Let the browser handle modified clicks so users can open links
  // in new tabs / windows. e.button !== 0 filters out middle-clicks.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

  const urlPath = new URL(link.href).pathname;
  const parentView = link.closest('.Stack-view');
  // If the URL isn't handled by this section of the app (resolveUrl
  // returns null), fall through so the browser navigates normally.
  if (!resolveUrl(urlPath) || !parentView) return;

  e.preventDefault();
  // Record which link the user activated so focus can be restored to
  // it when they swipe (or click) back into this view.
  returnFocus.set(parentView, link);
  drillDown(urlPath);
});

// Going back is usually just history.back(), but there's an important
// edge case: when the user lands directly on a deep-linked URL, there
// is no in-app history entry behind it. Calling history.back() in that
// situation would take them out of the app entirely. MANDATORY: detect
// this case and synthesize a root entry instead, so an in-app Back from
// a deep link lands on the root view and the platform Back from there
// returns the user to where they came from.
function goBack() {
  const atDeepLinkRoot = currentDepth === 0
    && entriesByDepth.get(0)?.view !== rootView;
  if (atDeepLinkRoot) {
    synthesizeRootEntry();
  } else {
    // history.back() fires popstate, which routes through
    // updateFromHistoryState (step 6) and scrolls the stack — the
    // same path a swipe-back converges on.
    history.back();
  }
}

function synthesizeRootEntry() {
  // Push a new history entry pointing at the root URL. This becomes the
  // entry the user "came from"; the original deep-linked entry is now
  // behind us, so platform Back from the root view will return there.
  const newDepth = currentDepth + 1;
  history.pushState({depth: newDepth}, '', '/');

  // Create the root view if it doesn't exist yet (we landed on a deep
  // link and never needed it before now), and insert it at the LEFT end
  // of the stack. Adjust scrollLeft by one viewport width so the user's
  // view doesn't visually jump — they should still be looking at the
  // deep-linked view until the scroll animation below runs.
  if (!rootView) {
    rootView = createRootView();
    stack.prepend(rootView);
    stack.scrollLeft += stack.clientWidth;
  }
  entriesByDepth.set(newDepth, {urlPath: '/', view: rootView});

  // Now scroll to the new entry (the root view). updateFromHistoryState
  // smooth-scrolls one step left, the parallax plays, and
  // scrollsnapchange fires when the root view settles.
  updateFromHistoryState(history.state);
}
```

<a id="6-sync-from-history-popstate"></a>

### 6. 从历史同步（popstate）

用户使用浏览器/操作系统前进后退按钮，或 JavaScript 调用 `history.back()` / `.go()` 时，触发 `popstate`。此处理器是响应历史变化而滚动堆栈的唯一路径。

```js
window.addEventListener('popstate', (event) => {
  updateFromHistoryState(event.state);
});

function updateFromHistoryState(state, behaviorOverride) {
  const newDepth = state?.depth ?? 0;
  const urlPath = getCurrentUrlPath();

  // Ensure entriesByDepth has an entry for the destination depth.
  // If the URL changed (e.g. forward-nav into a previously-pruned
  // view), clear the cached view reference so the loop below rebuilds.
  const entry = entriesByDepth.get(newDepth) ?? {view: null};
  if (entry.urlPath !== urlPath) {
    entry.urlPath = urlPath;
    entry.view = urlPath === '/' ? rootView : null;
  }
  entriesByDepth.set(newDepth, entry);

  // Rebuild any views between root and the destination that were
  // pruned earlier (when the user swiped back past them). Without
  // this, forward-navigating to a previously-pruned view would have
  // no element to scroll to.
  for (let d = 0; d <= newDepth; d++) {
    const e = entriesByDepth.get(d);
    if (!e || e.view) continue;
    const routeData = resolveUrl(e.urlPath);
    if (!routeData) continue;
    const rebuilt = createDrillDownView(routeData);
    stack.appendChild(rebuilt);
    e.view = rebuilt;
  }

  currentDepth = newDepth;

  const targetView = entriesByDepth.get(newDepth)?.view;
  if (!targetView) return;

  // Compare destination index against current scroll position so we
  // can bail if they're already aligned. This is reached when the
  // scrollsnapchange handler below calls history.go() to sync history
  // after a swipe-back that already completed visually — there's
  // nothing more to scroll.
  const toIdx = [...stack.children].indexOf(targetView);
  const fromIdx = Math.round(stack.scrollLeft / stack.clientWidth);
  if (fromIdx === toIdx) return;

  // Pick a scroll behavior:
  //   - multi-step jumps (e.g. history.go(-3)): 'instant' to skip
  //     intermediate snap points — otherwise smooth-scrolling would
  //     fire scrollsnapchange for each one and do N rounds of
  //     state-transition work for no reason.
  //   - rightward (forward) single-step: 'instant'. Browser-forward is
  //     rare on the web and is often spurious (e.g. iOS Safari treats
  //     edge swipes as forward navigation, even with overscroll-behavior
  //     set). An instant swap reads as "snap" rather than a misleading
  //     drilldown animation the user didn't ask for. The user-initiated
  //     drill-down path (drillDown, step 4) is unaffected — it calls
  //     scrollBy directly and never reaches this code.
  //   - leftward (back) single-step: 'auto' so the CSS `scroll-behavior`
  //     (smooth unless prefers-reduced-motion is set — see step 2)
  //     applies. Back is the common, expected case and benefits from
  //     the animation.
  // NOTE: "forward" here means spatial direction (toIdx > fromIdx),
  // NOT depth direction. synthesizeRootEntry (step 5) pushes a new
  // depth but scrolls LEFT to the root view, which correctly reads as
  // back-style (smooth).
  const forward = toIdx > fromIdx;
  const multiStep = Math.abs(toIdx - fromIdx) > 1;
  const behavior = behaviorOverride ?? (forward || multiStep ? 'instant' : 'auto');
  stack.scrollTo({left: toIdx * stack.clientWidth, behavior});
}
```

<a id="7-scrollsnapchange-the-single-source-of-truth"></a>

### 7. `scrollsnapchange`：唯一真实依据

每次吸附提交后，无论由滑动、点击还是程序滚动触发，浏览器都会在滚动容器触发 `scrollsnapchange`，通过 `event.snapTargetInline`（水平吸附）暴露新吸附元素。把所有状态转换放在同一个处理器中，才能保持滑动、点击和 `popstate` 路径一致。

将处理器提取为独立 `onActiveViewChanged` 函数，让回退（见下文“回退策略”）复用而不重复逻辑。

```js
function onActiveViewChanged(currentView) {
  // Note whether focus is in the stack before views are made inert or
  // removed, so the focus fallback below only moves focus that would
  // otherwise be lost, and never moves it on page load.
  const focusWasInStack = stack.contains(document.activeElement);

  // Walk the stack in DOM order to update each view's role:
  //  - Views at or before currentView stay in the DOM but get
  //    `inert` (except currentView) so focus, pointer events, and
  //    AT navigation cannot leak into views hidden behind the
  //    parallax.
  //  - Views after currentView are unreachable (the user swiped
  //    back past them) so we drop them from the DOM to free memory.
  //    Their urlPath stays in entriesByDepth so a later forward
  //    navigation can rebuild the view from scratch.
  let seenCurrent = false;
  for (const view of [...stack.children]) {
    if (seenCurrent) {
      for (const e of entriesByDepth.values()) {
        if (e.view === view) e.view = null;
      }
      view.remove();
    } else {
      // MANDATORY: inert non-current views. Without this, tabbing
      // and screen-reader navigation can reach content hidden behind
      // the parallax — a severe accessibility failure that's
      // invisible to sighted users.
      view.toggleAttribute('inert', view !== currentView);
      if (view === currentView) seenCurrent = true;
    }
  }

  // If the visible view's depth doesn't match `currentDepth`, the
  // user got here by swiping (not clicking) — sync history so the
  // browser back/forward buttons stay coherent with what's on screen.
  let currentViewDepth;
  for (const [d, e] of entriesByDepth) {
    if (e.view === currentView) currentViewDepth = d;
  }
  if (currentViewDepth !== undefined && currentViewDepth !== currentDepth) {
    // history.go fires popstate, which re-enters updateFromHistoryState.
    // That call's fromIdx === toIdx check bails out without scrolling.
    history.go(currentViewDepth - currentDepth);
  }

  // Name the active view in the title, and use the app name alone for the
  // root. Each drill-down adds a history entry, and the title is what the
  // history list, the tab and screen readers use to tell them apart.
  // ('Mail' is an example app name.)
  const viewTitle = currentView.querySelector('h2')?.textContent;
  document.title = viewTitle ? `${viewTitle} | Mail` : 'Mail';

  // Name the back button after the view it returns to: the previous view
  // in the stack, or the root view after a deep link. Focus lands on it
  // after a drill-down, so "Back" alone tells screen reader users nothing
  // about where they are. ('Inbox' is the example root title.)
  const back = currentView.querySelector('.back');
  if (back) {
    const parentTitle =
      currentView.previousElementSibling?.querySelector('h2')?.textContent ?? 'Inbox';
    back.setAttribute('aria-label', `Back to ${parentTitle}`);
  }

  // Restore focus on the now-active view:
  //  - If we recorded which link the user activated to drill out
  //    of this view, return focus there so a swipe-back lands them
  //    exactly where they left off.
  //  - Otherwise (a freshly-pushed drill-down view), move focus to
  //    the back button so keyboard users have an obvious next action.
  //  - preventScroll is REQUIRED: without it, .focus() scrolls the
  //    snap container to bring the focused element into view, which
  //    fights the snap and can land the user mid-snap.
  const stored = returnFocus.get(currentView);
  if (stored?.isConnected) {
    stored.focus({preventScroll: true});
    returnFocus.delete(currentView);
  } else if (currentView !== rootView) {
    currentView.querySelector('.back')?.focus({preventScroll: true});
  } else if (focusWasInStack && !currentView.contains(document.activeElement)) {
    // The root has no back button, and after a deep link or a pruned view
    // there is no stored link either, so focus the root's content. Otherwise
    // focus would stay in a removed or inert view and fall to <body>, and
    // keyboard and screen reader users would restart from the top of the page.
    currentView.querySelector('.Stack-viewContent')?.focus({preventScroll: true});
  }
}

stack.addEventListener('scrollsnapchange', (event) => {
  // snapTargetInline is the element that was just snapped to on the
  // inline (horizontal) axis. For this stack — where each view is one
  // horizontal snap stop — that's the new active view.
  onActiveViewChanged(event.snapTargetInline);
});
```

<a id="8-initialization-including-deep-links"></a>

### 8. 初始化（包括深链接）

页面加载时 URL 可能已指向深层视图（分享链接、书签或在深层页面刷新）。构建与 URL 匹配的唯一初始视图——根视图或深链接视图，但绝不同时构建两者——追加到空堆栈，初始化深度 0 的历史条目，并用 `behavior: 'instant'` 执行首次滚动，避免首帧绘制时视差动画。

```js
const initialUrlPath = getCurrentUrlPath();
const initialRouteData = resolveUrl(initialUrlPath);

// Build the initial view: a drill-down view if the URL maps to one,
// otherwise the root view. Whichever it is, that's the only view in
// the stack right now — the other will be created lazily by
// synthesizeRootEntry (step 5) or drillDown (step 4) if the user
// navigates to it.
let initialView;
if (initialRouteData) {
  initialView = createDrillDownView(initialRouteData);
} else {
  rootView = createRootView();
  initialView = rootView;
}
stack.appendChild(initialView);

entriesByDepth.set(0, {urlPath: initialUrlPath, view: initialView});
// replaceState attaches a `depth` to the entry the user landed on, so
// any subsequent pushState / popstate has a base depth to count from.
history.replaceState({depth: 0}, '');

updateFromHistoryState(history.state, 'instant');
```

<a id="best-practices"></a>

### 最佳实践

- **要**用 `scrollsnapchange`（配合 `IntersectionObserver` 回退，见“回退策略”）作为活动视图改变的真实依据，不用滚动事件坐标。吸附提交是唯一在滑动、点击、程序滚动与 `popstate` 路径上一致触发的事件。
- **要**将变换应用于吸附目标的子元素，绝不直接应用于目标。目标上的变换会反过来影响吸附几何，导致滚动器在手势中途异常。
- **要**为当前可见视图之外的每个视图应用 `inert`。否则焦点和屏幕阅读器导航会泄漏到视差后隐藏的视图；明眼用户看不见，却造成严重无障碍问题。
- **要**每次深入都推入历史条目，并处理 `popstate`，让操作系统级返回手势和浏览器前进后退按钮工作。这是原生应用感的关键。
- **要**在滑动返回落到深度与 `currentDepth` 不符的视图时，从活动视图改变处理器协调历史。否则浏览器历史游标与屏幕不同步，之后的系统返回会把用户带到意外位置。
- **要**从 DOM 移除用户滑过的视图，否则长时间深入操作会累积数十个脱离当前视图的子树。`entriesByDepth` 中缓存的 URL 路径足以在前进返回时重建。
- **要**确保每次活动视图变化后，焦点都在活动视图内，包括从深链接返回和跳回根视图。如果没有保存的链接也没有返回按钮，聚焦视图的 `.Stack-viewContent`（设置 `tabindex="-1"`）。留在已移除或 `inert` 视图中的焦点会落到 `<body>`。
- **要**每次活动视图变化都更新 `document.title`，用其命名活动视图。每次深入新增历史条目，浏览器历史列表、标签页和屏幕阅读器依靠标题区分它们。
- **要**在堆栈内恢复焦点时调用 `.focus({preventScroll: true})`。默认 `preventScroll: false` 会让浏览器将焦点目标滚入视图，与吸附容器争夺滚动，可能让用户停在吸附中间。
- **要**保留内部链接的 cmd/ctrl/中键点击，让 URL 可分享、可在新标签页打开。
- **要**对跨多步历史跳转和空间上向前的 popstate 转换（`toIdx > fromIdx`）使用 `behavior: 'instant'`。否则多步跳转每经过一个吸附点都触发 `scrollsnapchange`，执行 N 轮 inert、焦点和历史处理。向前 popstate 往往并非用户本意：即使设置 `overscroll-behavior-x: none`，iOS Safari 仍会把边缘滑动解释为浏览器前进；即时切换比为用户未发起的“深入”添加动画更不容易误导。用户主动深入路径（`drillDown`）直接滚动，不经过 `popstate`，不受影响。
- **要**尊重 `prefers-reduced-motion`：仅在 `@media (prefers-reduced-motion: no-preference)` 中声明 `scroll-behavior: smooth`，并对 `scrollTo` / `scrollBy` 使用 `behavior: 'auto'` 而非 `'smooth'`，让系统偏好自动生效，无需每次 JS 分支。硬编码 `behavior: 'smooth'` 会绕过用户设置。
- **要**使用真实 `<a href>` 作为深入触发器，不用 `<button onclick>` 或 `<div>`。真实锚点天然支持悬停 URL 预览、分享、中键、屏幕阅读器角色和 SEO。
- **要**为每个深入视图提供明确返回按钮。滑动手势不易发现，也并非人人可用；键盘、指针和桌面用户需要可见入口。水平箭头键和触控板滑动也可滚动堆栈。
- **不要**在 `popstate` 处理器中调用 `history.pushState`，这会在用户试图后退时添加新条目，破坏后退按钮。
- **不要**在可用滚动驱动动画时用 `scroll` 监听器驱动视差。CSS 路径运行在合成器上，JS 监听器在主线程上，手势中会出现可见掉帧。
- **不要**修改滑动返回后已移出 DOM 的视图。以 `entriesByDepth` 为标准记录：被剪除条目的 `view: null`，由 `updateFromHistoryState` 按需重建。

<a id="fallback-strategies"></a>

### 回退策略

Scroll snap 的 Baseline 状态：广泛可用。自 2020-01-15 起纳入 Baseline。
支持版本：Chrome 69（2018 年 9 月）、Edge 79（2020 年 1 月）、Firefox 68（2019 年 7 月）和 Safari 11（2017 年 9 月）。

Intersection observer 的 Baseline 状态：广泛可用。自 2019-03-25 起纳入 Baseline。
支持版本：Chrome 58（2017 年 4 月）、Edge 16（2017 年 10 月）、Firefox 55（2017 年 8 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

inert 的 Baseline 状态：广泛可用。自 2023-04-11 起纳入 Baseline。
支持版本：Chrome 102（2022 年 5 月）、Edge 102（2022 年 5 月）、Firefox 112（2023 年 4 月）和 Safari 15.5（2022 年 5 月）。

可能需要回退的是 scroll-snap-events 和 scroll-driven-animations。两者都有稳健回退或渐进增强方案，适合安全地用于此场景：

<a id="scroll-snap-events"></a>

#### 滚动吸附事件

Scroll snap events 的浏览器支持：有限可用。
支持版本：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

`scrollsnapchange` 是检测活动视图变化最简洁的方式：堆栈上一个监听器，每次吸附提交恰好触发一次。缺少它时，可用 `IntersectionObserver` 观察每个视图是否在堆栈内完全可见来补齐。回退调用与主要路径相同的 `onActiveViewChanged`，让所有状态转换逻辑仍集中一处。

```js
// MANDATORY when supporting browsers that haven't shipped scroll-snap-events
// yet. Check `HTMLElement.prototype` (not `window` or `document`) — the
// event handler IDL attribute is added to the prototype when the feature
// is supported, regardless of whether any element has the handler set.
if (!('onscrollsnapchange' in HTMLElement.prototype)) {
  const viewObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      // threshold:1 only fires for fully-visible entries, but the
      // observer also emits a "leaving" entry per view that drops below
      // ratio 1. Filter to the entering side, which is the snap-commit
      // moment we're trying to detect.
      if (entry.intersectionRatio === 1) {
        onActiveViewChanged(entry.target);
      }
    }
  }, {root: stack, threshold: 1});

  // Auto-observe every .Stack-view as it's added to the stack, and stop
  // observing as it's removed. Using a MutationObserver lets the primary
  // code (drillDown, updateFromHistoryState, synthesizeRootEntry, init)
  // stay free of fallback wiring.
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.classList?.contains('Stack-view')) viewObserver.observe(node);
      }
      for (const node of m.removedNodes) {
        if (node.classList?.contains('Stack-view')) viewObserver.unobserve(node);
      }
    }
  }).observe(stack, {childList: true});

  // Catch up to any views already in the stack at the time this code
  // runs (typically the initial view appended in step 8).
  for (const view of stack.children) viewObserver.observe(view);
}
```

<a id="scroll-driven-animations"></a>

#### 滚动驱动动画

Scroll-driven animations 的 Baseline 状态：新近可用。自 2026-10-27 起纳入 Baseline。
支持版本：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

滚动驱动的视差、变暗和阴影是导航核心之上的渐进增强。第 2 步的 `@supports (animation-timeline: view())` 将动画限定在支持的浏览器；其他浏览器只在吸附点之间切换，没有过渡。没有视差时组件仍功能完整：吸附、历史同步、焦点管理和 `inert` 都可用。

若旧 Baseline 目标必须提供视差回退，在堆栈上添加 `scroll` 监听器，写入描述各视图经过滚动可视区进度的 CSS 自定义属性，再用该属性驱动 `transform` 和 `filter`：

```js
if (!CSS.supports('animation-timeline: view()')) {
  stack.addEventListener('scroll', () => {
    const viewWidth = stack.clientWidth;
    for (const view of stack.children) {
      // Progress: 0 when this view is centered, 1 when it has fully
      // exited to the left. Matches the @keyframes mapping above.
      const offsetLeft = view.offsetLeft - stack.scrollLeft;
      const progress = Math.min(1, Math.max(0, -offsetLeft / viewWidth));
      const content = view.querySelector('.Stack-viewContent');
      content.style.transform = `translateX(${progress * 75}%)`;
      content.style.filter = `brightness(${1 - progress * 0.2})`;
    }
  });
}
```
