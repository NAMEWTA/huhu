<a id="responsive-site-navigation"></a>

# 响应式站点导航

构建在所有尺寸下共用一棵语义导航树的站点导航栏：链接放不下时呈现原生浮层，放得下时成为行内导航，并标识当前页面。

本指南介绍站点导航的整合。这属于导航，而非应用菜单：链接保留在 `Tab` 顺序中，不使用 `focusgroup`、`role="menubar"`、`role="menu"`、`role="menuitem"`、`aria-haspopup="menu"` 或方向键处理。应用命令菜单参见 `menu`（通过 `npx -y modern-web-guidance@latest retrieve "menu"` 获取）；菜单栏参见 `app-menus`（通过 `npx -y modern-web-guidance@latest retrieve "app-menus"` 获取）。菜单和 V 形箭头图标参见 `icons`（通过 `npx -y modern-web-guidance@latest retrieve "icons"` 获取）。

组件驱动布局、流式尺寸和排版换行分别参见 `size-aware-styling`（通过 `npx -y modern-web-guidance@latest retrieve "size-aware-styling"` 获取）、`fluid-scaling`（通过 `npx -y modern-web-guidance@latest retrieve "fluid-scaling"` 获取）和 `improve-text-layout-and-legibility`（通过 `npx -y modern-web-guidance@latest retrieve "improve-text-layout-and-legibility"` 获取）。

<a id="core-markup"></a>

## 核心标记

窄布局与宽布局共用一个 `<nav>` 地标。将它包在语义 `<header>` 中，由 `is-wide` 类选择行内布局。默认采用折叠布局，因此没有脚本时也得到这一布局。

```html
<header class="site-header">
  <div class="header-inner">
    <a class="site-logo" href="index.html">Acme</a>

    <nav class="site-nav" aria-label="Primary">
      <button
        class="menu-button"
        type="button"
        popovertarget="site-menu"
        popovertargetaction="toggle"
        aria-controls="site-menu"
      >
        <!-- Decorative menu icon: insert as described in the icons guide -->
        <span>Menu</span>
      </button>

      <ul id="site-menu" class="site-menu" popover="auto">
        <li><a href="index.html" aria-current="page">Home</a></li>
        <li><a href="about.html">About</a></li>
        <li class="nav-dropdown">
          <button
            class="dropdown-trigger"
            type="button"
            aria-expanded="false"
            aria-controls="services-menu"
            popovertarget="services-menu"
          >
            Services
          </button>
          <ul id="services-menu" class="dropdown-list">
            <li><a href="design.html">Design</a></li>
            <li><a href="development.html">Development</a></li>
          </ul>
        </li>
      </ul>
    </nav>
  </div>
</header>
```

按钮通过 `popovertarget` 和 `aria-controls` 声明式控制菜单。菜单关闭时 `nav` 仍是导航地标。触发器图标是装饰，可见“菜单”文字作为无障碍名称，因此应对辅助技术隐藏图标。插入和隐藏图标的方法参见 `icons`（通过 `npx -y modern-web-guidance@latest retrieve "icons"` 获取）。通用浮层控制约定参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）。与菜单指南不同，此处使用 `popovertarget`：单个切换无需 Invoker Commands。与菜单指南一样，每个浮层（菜单列表、子菜单列表）都紧跟其触发器，避免浏览器添加隐式 `aria-details`。

<a id="narrow-layout-popover-navigation"></a>

## 窄布局：浮层导航

折叠时在导航列表上保留 `popover="auto"`。把固定定位的浮层锚定到菜单按钮，并限制高度，让长导航可滚动而不超出视口。

不使用硬编码断点。脚本只在行内一行（品牌、操作和全部链接）放不下时折叠导航，因此添加链接、翻译或放大文字会自动改变切换点。一行放得下时，为 header 添加 `is-wide`；没有脚本时，所有宽度都保持折叠布局。

```css
/* Keep the row's natural width measurable */
.header-inner > * {
  flex-shrink: 0;
  white-space: nowrap;
}

.site-header {
  .menu-button {
    anchor-name: --menu-button;
  }

  .site-menu {
    position: fixed;
    inset: auto;
    inset-block-start: anchor(--menu-button bottom);
    inset-inline-end: 1rem;
    inline-size: min(80dvw, 24rem);
    max-inline-size: calc(100dvw - 2rem);
    block-size: fit-content;
    max-block-size: calc(100dvh - 6rem);
    margin-block-start: 0.5rem;
    overflow: auto;
  }
}
```

`anchor()` 声明将菜单位于按钮下方；不支持 Anchor Positioning 的浏览器参见回退部分。靠近视口边缘时感知碰撞的定位参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。

<a id="wide-layout-inline-navigation"></a>

## 宽布局：行内导航

一行放得下时，隐藏折叠布局的触发器，并重置浮层呈现，让同一个列表作为行内导航参与 header 布局。

```css
.site-header.is-wide {
  .menu-button {
    display: none;
  }

  .site-menu {
    position: static;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    inline-size: auto;
    max-inline-size: none;
    block-size: auto;
    max-block-size: none;
    overflow: visible;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .site-menu::backdrop {
    display: none;
  }
}
```

CSS 改变呈现，但 JavaScript 决定应用哪个布局，也必须同步 `popover` 属性。测量行内行：先行内显示，比较 header 内部行的 `scrollWidth` 和 `clientWidth`，再切换 `is-wide`。测量时临时添加 `is-measuring` 类，为后代设置 `transition: none`，在 `requestAnimationFrame` 中移除；否则每次调整尺寸都会从行内样式开始动画并闪烁。仅在折叠布局保留导航浮层；行内布局移除属性。移除属性会关闭已打开浮层，因此要记录菜单是否原本打开，若布局仍折叠则再次 `showPopover()`，否则调整尺寸会关闭已打开菜单。用 header 和导航列表上的 `ResizeObserver` 调用同一个共享函数，无需特殊处理即可捕捉字体加载和文本变化。行内时每次通知都重测；折叠时只有 header 变宽才重测。每次缩小时都切到行内测量会导致布局反复抖动。其取舍是：折叠菜单自身缩短时（例如更短的译文），会继续折叠直到 header 变宽。不要通过隐藏的触发器推断布局。

<a id="nested-site-navigation"></a>

## 嵌套站点导航

使用带 `aria-expanded` 和 `aria-controls` 的 `<button>` 触发嵌套站点导航，紧跟子菜单列表。不要使用 `<details>` 和 `<summary>`：`<summary>` 应映射为 `button` 角色，但浏览器实现不一致，屏幕阅读器播报也不一致（例如“summary”或“disclosure triangle”）。

同一个列表必须在窄布局中作为行内展开内容，在宽布局中作为浮动浮层。顶层浮层无法参与正常流，因此仅在宽布局设置 `popover`，由 `popovertarget` 原生打开。标记中的子菜单不要设置 `popover`：无脚本时它保持菜单内嵌套列表，与窄布局一致。窄布局中用一个简短点击处理器切换 `hidden` 和 `aria-expanded`。通过脚本隐藏窄布局子菜单，不要在标记中隐藏。

由处理导航列表的同一个函数同步布局状态。行内布局时，为子菜单设置 `popover="auto"`、清除 `hidden`，让原生 `toggle` 事件驱动 `aria-expanded`。窄布局时，移除 `popover`，通过脚本设置 `hidden`，并用点击处理器切换 `hidden` 和 `aria-expanded`：

```js
const wide = inner.scrollWidth <= inner.clientWidth; // measured with is-wide set
if (wide) submenu.setAttribute("popover", "auto");
else submenu.removeAttribute("popover");
submenu.hidden = !wide;
trigger.setAttribute("aria-expanded", "false");
```

> [!NOTE]
> 使用 `setAttribute()`/`removeAttribute()`，不要使用 `popover` JS 属性，因为通过 polyfill 使用浮层时可能产生竞态条件。

不要添加文档级外部点击、Escape 或焦点恢复处理器。宽布局由原生浮层提供这些交互，窄布局的展开内容只需要点击处理器。声明式 `popovertarget` 会让按钮成为子菜单隐式锚点，因此宽布局定位可使用 `position-area`，无需独立 `anchor-name` 或 `position-anchor` 声明。

<a id="hover-preview"></a>

### 悬停预览

宽布局中，当 `matchMedia("(hover: hover)").matches` 且 `event.pointerType !== "touch"` 时，在父 `<li>` 的 `pointerenter` 打开子菜单（`submenu.showPopover({ source: trigger })`）；`pointerleave` 时，如果仍只是悬停预览则隐藏（用户在预览时点击触发器，要清除预览标志并调用 `event.preventDefault()`，使点击将它固定打开，而非切换关闭）。触发器获得键盘焦点时不要打开；只有 `Enter` 或 `Space` 切换。焦点移到子菜单整个列表项之外时关闭（`focusout` 的非空 `relatedTarget` 位于外部），使 `Tab` 或 `Shift`+`Tab` 离开时关闭。

用 CSS Anchor Positioning 将宽布局子菜单位于触发器下方（`position-area: block-end span-inline-end` 和 `position-try-fallbacks: flip-block, flip-inline`）。普通浮层的感知碰撞定位参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。用 `::before` 桥接子菜单上方的 margin 间隙（浮层设置 `overflow: visible`），避免指针从触发器移入子菜单时触发 `pointerleave`；设置 `height: auto`，避免 Safari 将定位浮层拉伸到整个放置区域：

```css
.site-header.is-wide {
  .dropdown-list[popover] {
    position: absolute;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-block, flip-inline;
    inset: auto;
    height: auto;
    inline-size: max-content;
    min-inline-size: 12rem;
    margin-block-start: 0.5rem;
    overflow: visible;
  }

  .dropdown-list::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    inset-block-end: 100%;
    block-size: 0.5rem;
  }

  /* Also hides the list before script sets popover, so an open narrow disclosure cannot widen the measured row */
  .dropdown-list:not(:is(:popover-open, .\:popover-open)) {
    display: none;
  }

  .dropdown-list:is(:popover-open, .\:popover-open) {
    display: grid;
  }
}
```

<a id="indicating-the-current-page"></a>

## 标识当前页面

使用 `aria-current="page"` 标识当前页面。在构建时或通过 JavaScript 设置，并用 `[aria-current="page"]` 作为 CSS 样式钩子。视觉处理属于设计决策；不要假定特定伪元素、边框或方向。不要仅用颜色标识当前页面（WCAG 1.4.1）。确保视觉指示颜色与背景的对比度至少为 `3:1`。

<a id="transitions-and-accessibility"></a>

## 过渡与无障碍

如果导航需要动画（可选；突然打开关闭显得不协调时才添加），对移动菜单和宽布局浮动子菜单都使用 `@starting-style`，在 `transition` 中包含 `display` 与 `overlay`，并在 `transition` 之后独立声明 `transition-behavior: allow-discrete`（不要把 `allow-discrete` 放入 `transition` 简写，旧浏览器会忽略整个 `transition` 声明）。只对 `opacity` 和 `translate` 添加动画，并尊重 `prefers-reduced-motion`。可复用的过渡模式参见 `animate-element-entry-exit`（通过 `npx -y modern-web-guidance@latest retrieve "animate-element-entry-exit"` 获取）。

<a id="optional-narrow-submenu-slide-down"></a>

### 可选：窄布局子菜单向下滑动

可选。窄布局子菜单是通过 `hidden` 切换的行内列表，默认即时打开，这样已具备完整功能。如果要滑动打开和关闭：

- 通过 `display: grid` 和 `block-size: 0` 保持 `[hidden]` 列表渲染，再用 `interpolate-size: allow-keywords` 将 `block-size` 过渡到 `auto`，并用 `clip-path: inset(-6px)` 裁剪滑动且不截断焦点环（不要用会裁掉焦点环的 `overflow: clip`；`6px` 只是示例，至少使用轮廓宽度加偏移量）。
- 为 `[hidden]` 列表设置 `content-visibility: hidden`，将 `content-visibility` 加入 `transition`，再在 `transition` 之后独立声明 `transition-behavior: allow-discrete`，让内容保持渲染直到关闭结束。
- 限定为折叠布局且 `prefers-reduced-motion: no-preference`；范围外 `[hidden]` 必须继续为 `display: none`。宽布局中子菜单是浮层，不得裁剪。
- 通用技术参见 `animate-to-intrinsic-sizes`（通过 `npx -y modern-web-guidance@latest retrieve "animate-to-intrinsic-sizes"` 获取）。

尺寸、间距和定位使用逻辑属性。视口相关限制使用 `dvw` 和 `dvh`，提供可见 `:focus-visible` 指示，并在 `forced-colors: active` 下适配自定义边框和当前页面指示。

<a id="fallbacks"></a>

## 回退方案

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退方案和浏览器支持

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起纳入 Baseline。
支持版本：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 主要属于**渐进增强**，但其核心行为——提升到顶层、轻触关闭和 `popovertarget` 调用——没有纯 CSS 等价实现。旧浏览器需要 polyfill；如果不希望引入，也可以手动实现回退。

**Polyfill：** 要在旧浏览器支持 `popover` 属性，按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须：** 检测 `HTMLElement.prototype` 是否具有 `popover` 属性，**仅在**缺少原生支持时加载 polyfill，不得无条件加载。

使用打包工具或 import map 时：

```js
// MANDATORY: Feature detect 'popover' on HTMLElement.prototype.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

如果不使用包管理器，可以从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 时的注意事项：
- 对于可能在 polyfill 完全加载前运行的代码，不要使用 `popover` IDL 属性。它不会映射成 HTML 属性，浮层不会被 polyfill 识别，而且该属性会永久遮蔽 polyfill 添加的访问器。改用 `setAttribute()`/`removeAttribute()`。
- **样式注意事项：** polyfill 无法定义真正的 `:popover-open` 伪类，因此改为应用 `.\:popover-open` 类。**必须：** 用 `:is()` 或 `:where()` 组合两者，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```

<a id="fallbacks--browser-support-for-anchor-positioning"></a>

### 锚点定位的回退方案和浏览器支持

Anchor positioning 的浏览器支持：有限可用。
支持版本：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

移动菜单在 `anchor()` 声明前放置绝对值回退声明。不要为这个简单回退包裹 `@supports`：不支持的 `anchor()` 声明会被丢弃，而前面的声明仍有效。没有 Anchor Positioning 时，菜单仍以浮层打开，位于距视口顶部的固定偏移处。

```css
.site-header {
  .site-menu {
    /* Example-only offset: use roughly your header height. Browsers without anchor() keep this one. */
    inset-block-start: 4.75rem;
    inset-block-start: anchor(--menu-button bottom);
  }
}
```

宽布局浮动子菜单若没有 CSS Anchor Positioning，会回退到视口居中，脱离导航栏触发器。在 `@supports not (position-area: block-end)` 中把子菜单覆盖为 `position: fixed; margin: 0`；在子菜单 `toggle` 处理器中，当 `event.newState === "open" && !CSS.supports("position-area", "block-end")` 时，从 `trigger.getBoundingClientRect()` 和 `submenu.getBoundingClientRect()` 计算 `top` 和 `left`（放在触发器下方，若 `top + size.height > innerHeight` 则翻到上方，并将 `left` 约束到 `[0, innerWidth - size.width]`）。

<a id="transitions"></a>

### 过渡

`@starting-style` 的 Baseline 状态：新近可用。自 2024-08-06 起纳入 Baseline。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.5（2024 年 5 月）。

transition-behavior 的 Baseline 状态：新近可用。自 2024-08-06 起纳入 Baseline。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.4（2024 年 3 月）。

interpolate-size 的浏览器支持：有限可用。
支持版本：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

content-visibility 的 Baseline 状态：新近可用。自 2025-09-15 起纳入 Baseline。
支持版本：Chrome 108（2022 年 11 月）、Edge 108（2022 年 12 月）、Firefox 130（2024 年 9 月）和 Safari 26（2025 年 9 月）。

用 `@supports (interpolate-size: allow-keywords)` 限定将 `[hidden]` 覆盖为 `display: grid` 的可选窄布局子菜单滑动规则。没有此条件，不支持关键字插值的浏览器会直接跳到关闭而非滑动；加上后，它们保留原生 `[hidden]` 行为。没有 `@starting-style` 或 `transition-behavior: allow-discrete` 时，可选浮层进入或退出过渡会回退为即时打开或关闭。

没有脚本就不会添加 `is-wide`，因此 header 保持折叠：菜单按钮打开原生浮层，子菜单是嵌套列表。不要另写无脚本布局或 `no-js` 类。
