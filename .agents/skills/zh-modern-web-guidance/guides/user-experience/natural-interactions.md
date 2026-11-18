<a id="implement-natural-interactions"></a>

# 实现自然交互

当每次输入都得到立即响应、运动像真实物体一样、内容跟随用户手指、所有操作都不依赖鼠标时，界面就会显得自然。

<a id="implementation"></a>

## 实现

<a id="give-every-control-hover-press-and-focus-feedback"></a>

### 为每个控件提供悬停、按压和焦点反馈

```css
:where(button) {
  /* example durations */
  transition: box-shadow 150ms ease-out, scale 150ms ease-out;
}
button:hover { box-shadow: 0 2px 8px rgb(0 0 0 / 0.2); }
a:hover { text-decoration-thickness: 2px; }
button:active { scale: 0.97; } /* example value */

:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid CanvasText;
  outline-offset: 3px;
}
```

- 使用 `:focus-visible`，让键盘用户始终看到清晰的焦点环，而鼠标点击时不显示。
- 不要通过 `outline: none` 或 `outline: 0` 移除焦点轮廓，除非提供同样清晰、与页面对比度至少为 3:1 的替代方案（WCAG 1.4.11）。`CanvasText` 是页面 `color-scheme` 对应的文字颜色，因此在浅色模式、设置了 `color-scheme: light dark` 的深色模式，以及强制颜色模式中，都能与默认页面背景形成对比。如果自定义页面背景，应选择与之对比度达到 3:1 的焦点环颜色。按钮文字颜色与页面相同时，`currentColor` 就会失效。
- 每种交互状态及其组合都应有不同外观：悬停、按压、悬停时按压、键盘焦点。示例中，悬停添加阴影、按压改变缩放、焦点添加轮廓，因此任何组合都能显示各自效果。

<a id="open-disclosures-from-their-trigger"></a>

### 从触发控件处展开内容

弹出层和下拉内容应当在视觉上从触发控件处展开：从接触触发器的角落向外缩放，或从其侧边滑出。菜单和悬浮卡片有自己的展开动画，应遵循 `menu`（通过 `npx -y modern-web-guidance@latest retrieve "menu"` 获取）和 `hovercard`（通过 `npx -y modern-web-guidance@latest retrieve "hovercard"` 获取）。其他弹出层应放在触发器旁，并将 `transform-origin` 对齐到接触触发器的角落。视口边缘的下拉翻转方法参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。

```css
.dropdown {
  /* popovertarget makes the trigger the popover's anchor. */
  position-area: bottom span-right;
  inset: auto;
  margin: 0;
  /* The corner touching the trigger; change it whenever the placement changes. */
  transform-origin: top left;
}
/* example durations */
.dropdown:is(:popover-open, .\:popover-open) { animation: fade-in 150ms ease-out both; }
@media (prefers-reduced-motion: no-preference) {
  .dropdown:is(:popover-open, .\:popover-open) {
    /* optional example spring curve, written inline */
    animation: grow 300ms linear(0, 0.45 15%, 1.08 35%, 0.97 55%, 1.01 75%, 1) both, fade-in 150ms ease-out both;
  }
}
@keyframes grow { from { scale: 0.9; } }
@keyframes fade-in { from { opacity: 0; } }
```

- 让动画使用合成器支持的属性，包括 `transform`、它的独立属性和 `opacity`，并尊重减少动态效果的偏好，参见 `motion`（通过 `npx -y modern-web-guidance@latest retrieve "motion"` 获取）。此示例只为打开添加动画；退出过渡参见 `animate-to-from-top-layer`（通过 `npx -y modern-web-guidance@latest retrieve "animate-to-from-top-layer"` 获取）。
- 通过 `<button popovertarget="dropdown-id">` 声明式触发弹出层，无需 JavaScript 即可获得原生点击、键盘和关闭行为，参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）。
- 如果需要有弹性的展开效果，使用先略微越界、再稳定下来的 `linear()` 曲线，越界输出值大于 1，参见 `physics-based-easing`（通过 `npx -y modern-web-guidance@latest retrieve "physics-based-easing"` 获取）。

<a id="make-horizontal-scrollers-swipeable"></a>

### 让横向滚动区域支持滑动

轮播、图库或标签条等任何横向项目列表，都应使用原生滚动，并吸附到各个项目。

```css
.scroller {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}
.scroller > * {
  flex: 0 0 85%; /* example item width */
  scroll-snap-align: start;
}
```

- 原生 overflow 滚动提供滑动的物理感与惯性，吸附让每次滑动停在一个项目上，无需触摸监听器。
- 如果滚动区域的项目没有链接、按钮或其他可聚焦元素，应让滚动区域本身可聚焦且有标签，例如 `<div class="scroller" role="region" aria-label="Featured items" tabindex="0">`，让键盘用户能够到达并使用方向键滚动。如果项目可聚焦，通过 Tab 导航到它们就会自动滚入视图。
- 高亮当前吸附项目的方法参见 `carousel-snap-highlights`（通过 `npx -y modern-web-guidance@latest retrieve "carousel-snap-highlights"` 获取）。侧滑列表项显示操作的方法参见 `swipe-to-reveal`（通过 `npx -y modern-web-guidance@latest retrieve "swipe-to-reveal"` 获取）。通过滑动关闭侧菜单的方法参见 `navigation-drawer`（通过 `npx -y modern-web-guidance@latest retrieve "navigation-drawer"` 获取）。
- 上一页、下一页按钮和滚动标记等轮播控件，参见 `carousel`（通过 `npx -y modern-web-guidance@latest retrieve "carousel"` 获取）。

<a id="add-motion-blur-to-large-fast-movements-optional"></a>

### 为大幅快速运动添加动态模糊（可选）

对于全屏面板滑入等大幅快速平移，可以短暂加入细微模糊，让运动更柔和。`filter` 并非只在合成器上运行，因此模糊仅用于大幅、短暂运动，不用于小控件或缓慢过渡，并且始终用减少动态效果的媒体查询保护。

```css
@media (prefers-reduced-motion: no-preference) {
  .sheet.is-open { animation: sheet-in 300ms ease-out both; } /* example duration */
}
@keyframes sheet-in {
  from { translate: 0 100%; filter: blur(6px); } /* example blur radius */
}
```

<a id="make-every-action-reachable-without-a-mouse"></a>

### 让所有操作无需鼠标也能到达

- 操作用 `<button>`，导航用带 `href` 的 `<a>`。两者都可获得键盘焦点并通过 <kbd>Enter</kbd> 激活，按钮还可通过 <kbd>Space</kbd> 激活。
- 菜单和下拉内容可以在悬停时打开，但绝不能只能悬停打开；也必须支持点击、轻触和键盘激活，指针移入时保持打开，并可通过 <kbd>Esc</kbd> 关闭（WCAG 2.1.1、1.4.13）。
- 在悬停时原地显示的控件或详情，例如卡片操作，也必须在键盘焦点到达时出现，并在不支持悬停的设备上默认可见：

```css
.card .actions {
  opacity: 0;

  .card:hover &,
  .card:focus-within & { opacity: 1; }

  @media (hover: none) { opacity: 1; }
}
```

悬停、焦点或长按触发的工具提示和预览，参见 `interest-triggered-tooltips`（通过 `npx -y modern-web-guidance@latest retrieve "interest-triggered-tooltips"` 获取）和 `interest-triggered-action-previews`（通过 `npx -y modern-web-guidance@latest retrieve "interest-triggered-action-previews"` 获取）。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退与浏览器支持

Popover 的 Baseline 状态：Newly available。自 2025-01-27 起纳入 Baseline。
支持的浏览器：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 大体属于**渐进增强**，但提升到顶层、轻量关闭和通过 `popovertarget` 调用等核心行为，没有纯 CSS 等价实现。旧浏览器需要 polyfill；如果不想分发 polyfill，则需要手动回退。

**Polyfill**：要在旧浏览器中支持 `popover`，应按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须**检查 `HTMLElement.prototype` 上是否存在 `popover` 属性，**仅**在缺少原生支持时加载 polyfill，不要无条件加载。

使用打包器或 import map 时：

```js
// MANDATORY: Feature detect 'popover' on HTMLElement.prototype.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

不使用包管理器时，可以从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 的注意事项：

- 对可能在 polyfill 完全加载前执行的代码，不要使用 `popover` IDL 属性。它不会映射为 HTML 属性，polyfill 无法发现该弹出层，而且该属性会一直遮蔽 polyfill 添加的访问器。应使用 `setAttribute()` / `removeAttribute()`。
- **样式注意事项**：polyfill 无法定义真正的 `:popover-open` 伪类，因此使用 `.\:popover-open` 类替代。**必须**通过 `:is()` 或 `:where()` 组合两者，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```

<a id="anchor-positioning"></a>

### 锚点定位

html.elements.button.popovertarget.implicit_anchor_reference 能力的 Baseline 状态：Newly available。自 2026-01-13 起纳入 Baseline。
支持的浏览器：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）、Firefox 147（2026 年 1 月）和 Safari 26（2025 年 9 月）。

不支持时，`inset: auto` 会让弹出层停留在视口左上角。当 `CSS.supports('position-area: bottom')` 为 false 时，在 `beforetoggle` 事件监听器中，根据触发器的 `getBoundingClientRect()` 设置弹出层的 `top` 与 `left`。

<a id="linear-easing"></a>

### Linear 缓动

linear() 缓动的 Baseline 状态：Widely available。自 2023-12-11 起纳入 Baseline。
支持的浏览器：Chrome 113（2023 年 5 月）、Edge 113（2023 年 5 月）、Firefox 112（2023 年 4 月）和 Safari 17.2（2023 年 12 月）。

不支持 `linear()` 的浏览器会丢弃使用它的声明，因此应先写一条使用 `ease-out` 等关键字的声明，如上面的淡入示例。直接内联写 `linear()`，不要通过自定义属性间接设置，否则前面的声明也会被丢弃。
