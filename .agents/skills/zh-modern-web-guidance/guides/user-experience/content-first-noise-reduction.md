<a id="maximize-content-and-reduce-noise"></a>

# 让内容更突出，减少干扰

用户为内容而来。让页面外围框架保持精简，在阅读时让开空间，仅在用户需要时显示次要内容。

<a id="implementation"></a>

## 实现

<a id="dont-block-or-interrupt-the-user"></a>

### 不阻挡或打断用户

- 不要在页面加载时弹出订阅邮件模态框、插页或全屏推广。尽可能移除与主要内容争夺注意力的横幅和无关内容。
- 如果某项通知属于法律要求，例如 Cookie 同意，应使用小型、非模态通知栏，占据明显少于视口 15% 的空间，并提供可见的关闭按钮，文字可以是“接受”或“关闭”。
- 根据操作后果决定打断程度：只有删除账号、付款、编辑个人资料等后果重大的操作，才使用阻塞对话框。其他情况使用非阻塞消息。
- 不要在用户阅读时移动内容。在图片、广告和嵌入内容加载前预留空间，例如设置 `width` 和 `height`；不要在当前屏幕内容上方插入内容，也不要主动打开用户没有请求的弹出层。

<a id="keep-persistent-bars-compact"></a>

### 让常驻栏保持紧凑

每个固定或粘性栏都应低于视口高度的 12%。使用单行，不要堆叠多个粘性栏，例如公告、页头和二级导航。额外项目放入弹出菜单或抽屉，见下文。

<a id="hide-persistent-bars-while-the-user-scrolls-down"></a>

### 用户向下滚动时隐藏常驻栏

用户向下滚动时隐藏顶部栏，即网站页头或导航栏，一旦向上滚动就立即恢复。这样阅读时它不会挡路，轻轻回滑又能找到。滚动状态容器查询可以通过 CSS 跟踪滚动方向，无需脚本。底部栏，例如标签栏，也采用同样方式，但向下滑出而不是向上。

```css
/* The root scroller remembers the direction of the most recent scroll. */
html {
  container-type: scroll-state;
}
.top-bar {
  position: sticky;
  top: 0;
  z-index: 1; /* Example value: keeps positioned content from painting over the bar. */
}
/* Scrolling down: move the bar out of view. transform doesn't change layout, so content doesn't jump.
   (scrollable: top) shows the bar at the very top, even after jumps such as the Home key, which don't update "scrolled". */
@container scroll-state((scrolled: bottom) and (scrollable: top)) {
  .top-bar {
    transform: translateY(-100%);
  }
}
/* Keep the bar visible while it contains keyboard focus. */
.top-bar:focus-within {
  transform: none;
}
/* Example value: at least the bar's height, so in-page link targets don't land under the bar. */
:target {
  scroll-margin-top: 4rem;
}
```

另一种方式是在滚动时将栏高度缩小到原高度的 80% 以下，参见 `shrinking-header-on-scroll`（通过 `npx -y modern-web-guidance@latest retrieve "shrinking-header-on-scroll"` 获取）。

<a id="put-secondary-ui-in-popovers-and-drawers"></a>

### 将次要 UI 放入弹出层和抽屉

对菜单、更多操作、工具提示、悬浮卡片和新手引导提示使用 `popover` 属性，替代常驻工具栏或自定义 JavaScript 覆盖层。带 `popovertarget` 的按钮可以通过点击、<kbd>Enter</kbd> 或 <kbd>Space</kbd> 打开与关闭弹出层。默认的 `popover="auto"` 还会在按下 <kbd>Esc</kbd> 或点击外部时关闭。

```html
<button popovertarget="more-links">More</button>
<!-- Rendered in the top layer, so no z-index management is needed. -->
<nav id="more-links" popover aria-label="More links">
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
</nav>
```

- 弹出层默认在屏幕中央打开。若要放在对应按钮旁，参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。
- 按钮也可以通过 `commandfor` 和 `command="toggle-popover"` 打开弹出层，参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）。
- 对于较多选项，使用画布外抽屉：一个固定在屏幕一侧、滑入并覆盖页面的 `popover` 面板。滑动关闭和动画的实现，参见 `navigation-drawer`（通过 `npx -y modern-web-guidance@latest retrieve "navigation-drawer"` 获取）。将一组相关项目显示为可横向滚动的轮播，而不是很长的纵向堆叠列表。

<a id="collapse-secondary-content-with-details"></a>

### 使用 `details` 折叠次要内容

把规格、常见问题、细则等较长或不常需要的内容放入 `details` 元素。它默认关闭，`summary` 无需 JavaScript 即可通过键盘和屏幕阅读器操作。

```html
<details>
  <summary>Shipping and returns</summary>
  <p>Free returns within 30 days.</p>
</details>
```

<a id="fallback-strategies"></a>

## 回退策略

<a id="scroll-state-queries"></a>

### 滚动状态查询

Container scroll-state queries 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 144（2026 年 1 月）和 Edge 144（2026 年 1 月）。
不支持的浏览器：Firefox 和 Safari。

不支持滚动状态查询时，栏不会隐藏，但仍保持紧凑且可用。如果 Baseline 目标包含这些浏览器，添加一小段脚本，让它们也能隐藏栏。支持其他滚动状态查询但不支持 `scrolled` 的浏览器，也会让栏保持可见。

```css
/* Don't hide the bar while it contains keyboard focus. */
.top-bar.is-hidden:not(:focus-within) {
  transform: translateY(-100%);
}
```

```js
// Runs only where scroll-state queries aren't supported. Run it after .top-bar is parsed (for example, in a module script).
if (!CSS.supports('container-type', 'scroll-state')) {
  const bar = document.querySelector('.top-bar');
  let lastY = scrollY;
  addEventListener('scroll', () => {
    // Clamp so rubber-band overscroll at the top or bottom doesn't flip the scroll direction.
    const y = Math.max(0, Math.min(scrollY, document.documentElement.scrollHeight - innerHeight));
    if (y === lastY) return;
    // Hide only after scrolling down past the bar's own height, so it doesn't flicker near the top.
    bar?.classList.toggle('is-hidden', y > lastY && y > bar.offsetHeight);
    lastY = y;
  }, { passive: true });
}
```

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退与浏览器支持

Popover 的 Baseline 状态：Newly available。自 2025-01-27 起纳入 Baseline。
支持的浏览器：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 大体属于**渐进增强**，但它的核心行为，包括提升到顶层、轻量关闭和通过 `popovertarget` 调用，没有纯 CSS 等价实现。旧浏览器需要 polyfill；如果不想分发 polyfill，则需要手动回退。

**Polyfill**：要在旧浏览器中支持 `popover` 属性，应按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须**：检查 `HTMLElement.prototype` 上是否存在 `popover` 属性，仅在缺少原生支持时加载 polyfill，**不要**无条件加载。

使用打包器或 import map 时：

```js
// MANDATORY: Feature detect 'popover' on HTMLElement.prototype.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

不使用包管理器时，可以从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 的注意事项：

- 对可能在 polyfill 完全加载前执行的代码，不要使用 `popover` IDL 属性。它不会映射为 HTML 属性，polyfill 因此无法发现该弹出层，而且该属性会一直遮蔽 polyfill 后来添加的访问器。应使用 `setAttribute()` / `removeAttribute()`。
- **样式注意事项**：polyfill 无法定义真正的 `:popover-open` 伪类，因此使用 `.\:popover-open` 类替代。**必须**通过 `:is()` 或 `:where()` 组合两者，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```

<a id="invoker-commands"></a>

### Invoker commands

Invoker commands 的 Baseline 状态：Newly available。自 2025-12-12 起纳入 Baseline。
支持的浏览器：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

不支持 invoker commands 的浏览器会忽略 `commandfor`，所以按钮不会产生作用。优先使用 `popovertarget`，只要支持 popover 就能工作。如果使用 `commandfor`，仅当 `'commandForElement' in HTMLButtonElement.prototype` 为 false 时，才通过打包器动态导入 `invokers-polyfill`；没有打包器时可从 CDN 导入。
