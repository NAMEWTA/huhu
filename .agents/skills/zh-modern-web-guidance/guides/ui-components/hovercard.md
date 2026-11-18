<a id="build-an-interactive-hovercard"></a>

# 构建交互式悬停卡片

悬停卡片会在用户通过悬停或聚焦表达对链接的兴趣时，提供可交互的内容预览。它在导航前显示，既可以直接提供用户需要的内容，也可以帮助用户确认链接包含其正在寻找的信息。

如果需要纯文本、不可交互的工具提示，而非结构化链接预览，参见 `interest-triggered-tooltips`（通过 `npx -y modern-web-guidance@latest retrieve "interest-triggered-tooltips"` 获取）。

<a id="1-triggering-the-hovercard"></a>

## 1. 触发悬停卡片

使用 **Interest Invokers** API 触发悬停卡片，确保卡片在悬停和聚焦时都能出现。

- 为卡片容器添加 `popover="hint"`。使用 `hint` 可避免关闭其他可能已打开且不相关的浮层菜单。
- 为触发链接添加 `interestfor`，指向卡片的 `id`。

```html
<a href="/article" interestfor="article-preview">Article title</a>

<!-- The `id` must match the `interestfor` value on the trigger. -->
<div id="article-preview" popover="hint" class="hovercard">
  <h2>The buzz on hummingbirds</h2>
  <p class="byline">By Delphi Aguilar</p>
  <div>
    <img src="bird.jpg" alt="A vibrant hummingbird">
    <p>Brief summary of the article...</p>
  </div>
</div>
```

不需要在悬停卡片内部再放一个指向该内容的链接，因为它与触发链接重复。

<a id="accessibility"></a>

### 无障碍

规范规定，`interestfor` 会根据目标内容自动为辅助技术连接提示浮层（`popover="hint"`）。**普通提示**（仅含文本和图片）成为触发器的无障碍描述；如果触发器没有名称，则成为名称。**丰富提示**（含标题、链接或其他可交互内容）至少获得 `tooltip` 角色；提示打开时，触发器获得 `aria-expanded` 和 `aria-details` 关联，已打开提示在 Tab 顺序中紧跟触发器，便于键盘用户到达其内容。

浏览器和屏幕阅读器尚未一致地暴露这些信息，因此还要添加明确的 ARIA：

- **提示重复触发器的无障碍名称**（例如有 `aria-label="Bold"` 的图标按钮配一个“Bold”提示）：什么都不添加。与名称相同的描述会被读两遍。
- **触发器自身没有可见标签的提示**（例如没有 `aria-label` 的图标按钮）：在触发器上用 `aria-labelledby` 指向提示，让提示成为名称。
- **触发器激活时也会打开的提示**（切换提示，或唯一用途是显示提示的按钮：为它设置 `popovertarget` 和 `popovertargetaction="show"`）：提示上设置 `role="tooltip"`，触发器上设置 `aria-expanded`，并根据浮层的 `toggle` 事件同步。紧跟“按钮”播报的描述会暗示还有其他操作，混淆角色；展开状态则告诉用户有内容可显示以及是否已打开，按下按钮就能获取。将提示放在 DOM 中紧跟触发器的位置，打开后阅读按键才能到达内容。
- **触发器激活时执行其他操作的提示**（链接，或有自身操作的按钮）：提示上设置 `role="tooltip"`，触发器上设置 `aria-describedby`，绝不要设 `aria-expanded`。播报“已折叠”会暗示 `Enter` 将展开，但实际 `Enter` 会导航或执行操作。提示必须是用户可以错过的内容：悬停卡片预览目的地，操作按钮上的工具提示描述该操作。
- **不要**把通过激活打开的提示挂在已经为其他功能使用 `aria-expanded` 的控件上（例如菜单按钮）。为该提示提供独立触发器。
- **不要**在表达兴趣时把焦点移入目标（不要用 `autofocus`，不要在 `interest` 监听器中调用 `focus()`）。单纯悬停或聚焦就会触发兴趣，因此移动焦点会违反 WCAG 3.2.1（获得焦点）。

并非每种屏幕阅读器都会在浏览页面时读出描述（NVDA 在浏览模式中有意跳过），因此以描述暴露的提示只能包含用户可以错过的内容。链接预览和操作控件的工具提示符合此要求；用户必需的信息应放在切换提示或行内。

使用短脚本连接这些属性，而非手动编写，以保持标记声明式并让所有提示遵循相同规则。脚本应：

1. 在每种浏览器中，DOM 解析完成后、加载 `interestfor` polyfill 之前运行，并暴露一个可为稍后插入内容再次调用的函数。必须预先扫描：浏览模式的屏幕阅读器用户在任何交互前就需要这些属性，因此等到 `focus` 或 `interest` 再懒连接太迟；等待 polyfill 也太迟，它只在 `load` 时连接 ARIA，并且不会给普通提示添加 `role="tooltip"`。
2. 对每个目标为 `popover="hint"` 的 `[interestfor]` 触发器，规范化空白并比较提示文本与触发器无障碍名称（依次取 `aria-labelledby` 的目标、`aria-label`、包括图片 `alt` 在内的文本内容、`title`）。相同则不处理。否则，如果提示没有角色，为其设置 `role="tooltip"`。
3. 触发器没有名称时，用 `aria-labelledby` 指向提示，除非已有该属性。否则，如果触发器激活时也会打开提示（`popovertarget` 或 `commandfor` 指向提示），将 `aria-expanded` 设为浮层当前状态（`:popover-open`），但不覆盖已有的 `aria-expanded`，并记录由脚本管理的触发器；其他情况用 `aria-describedby` 指向提示，除非已有该属性。
4. 在每种浏览器中，用 `document` 上单个捕获阶段监听器根据浮层 `toggle` 事件同步 `aria-expanded`，更新所有 `interestfor` 匹配且由脚本管理的触发器（`interestfor` polyfill 不会为纯文本提示同步 `aria-expanded`，也不会在切换提示通过 `popovertarget` 打开时同步）。

容易出错的地方：

- `toggle` 不冒泡。`document` 上的冒泡监听器永远不会触发；使用捕获阶段，或为每个浮层分别监听。
- 根据 `toggle` 同步 `aria-expanded`，不要根据 `interest`/`loseinterest`。浮层才是真实依据：它可能被 `Escape`、轻触关闭或另一个调用器关闭，而且多个触发器可能共享一个提示。
- 隐藏的浮层仍是有效的 `aria-describedby` 或 `aria-labelledby` 目标。不要为了让其“可见”而强行打开提示或复制文本。
- 不要为任何提示添加 `aria-haspopup` 或实时区域。
- 不要覆盖作者提供的 ARIA：触发器已有的 `aria-describedby`、`aria-labelledby` 或 `aria-expanded` 优先。

> [!IMPORTANT]
> 悬停卡片只能提供补充信息（例如可通过点击链接获取的信息预览），绝不能承载没有其他获取途径的信息。

<a id="2-positioning-with-anchor-positioning"></a>

## 2. 使用锚点定位

用 **CSS Anchor Positioning** 相对触发器定位悬停卡片。使用 `interestfor` 时，触发器会成为浮层的隐式锚点。

```css
[popover].hovercard {
  /* Position the card below the trigger, aligned with its inline-start edge
     and spanning toward the inline-end, flipping if it overflows the viewport. */
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
}
```

<a id="3-animating-entry-and-exit"></a>

## 3. 进入与退出动画

默认情况下，键盘和鼠标用户表达和失去兴趣都有半秒延迟。这可避免在按 Tab 浏览页面或移动鼠标时打开目标浮层，也可避免鼠标从触发器移向浮层时将其关闭。使用 CSS `interest-delay` 属性调整时机。

```css
[interestfor]{
  /* Shorthand for interest-delay-start and interest-delay-end */
  interest-delay: 0.2s 0.1s;
}
```

如果用户可能快速连续移过多个触发器，当已有兴趣触发的浮层打开时，将初始延迟设为 `0s`。为避免 `:has()` 性能问题，选择子节点较少的附近容器，并尽可能直接地选中触发器。

```css
.container:has( > li > a:interest-source) [interestfor] {
  interest-delay-start: 0s;
}
```

用 `@starting-style` 定义进入动画，用 `transition-behavior: allow-discrete`（配合 `display` 和 `overlay`）为退出顶层添加动画，并且只在 `@media (prefers-reduced-motion: no-preference)` 条件内启用这些过渡。将 `transition-behavior: allow-discrete` 作为独立属性放在 `transition` 之后，而不要写入 `transition` 简写，避免旧浏览器忽略整个 `transition` 声明。

```css
[popover].hovercard {
  opacity: 0;
  transform-origin: top;
}

[popover].hovercard:popover-open {
  opacity: 1;
  transform: translateY(0) scale(1);
}

@starting-style {
  [popover].hovercard:popover-open {
    opacity: 0;
    transform: translateY(-10px) scale(0.95);
  }
}

/* MANDATORY: Respect user preference for reduced motion by selectively applying transitions. */
@media (prefers-reduced-motion: no-preference) {
  [popover].hovercard {
    transition:
      opacity,
      transform,
      display,
      overlay;
    transition-duration: 0.4s;
    /* Separate after transition so the shorthand doesn't reset it or fail in older browsers */
    transition-behavior: allow-discrete;
  }
}
```

<a id="4-optional-seamlessly-morphing-to-the-next-page"></a>

## 4. 可选：无缝变形到下一页

可以选择使用**跨文档视图过渡**，在悬停卡片与目标页面之间创建无缝“变形”动画。实现指导参见 `consistent-cross-document-transitions`（通过 `npx -y modern-web-guidance@latest retrieve "consistent-cross-document-transitions"` 获取）。

为悬停卡片中的元素与下一页对应元素分配相同的 `view-transition-name`，浏览器就会在导航时为它们添加动画。可以为多个元素命名（例如标题、图片、作者署名），形成复杂的多元素变形效果。用 `:popover-open` 给已打开浮层中的元素设置 `view-transition-name`，避免产生重复的 `view-transition-name`，也无需为每个链接设置专用的 `view-transition-name`。

```css
/* Opt-in to cross-document transitions on both pages */
@view-transition {
  navigation: auto;
}

/* Don't show transitions when loading this page */
::view-transition-group(*) {
  animation-duration: 0s;
}

/* Assign names ONLY when the popover is open to ensure only the correct elements are selected. */
[popover]:popover-open {
  view-transition-name: --hovercard;
  view-transition-class: morph;

  h2 {
    view-transition-name: --title;
    view-transition-class: morph;
  }

  img {
    view-transition-name: --image;
    view-transition-class: morph;
  }
}
```

**必须：** 为确保过渡稳定且不闪烁，目标页面应使用 `blocking="render"` 和 `<link rel="expect">`，等待关键内容解析后再渲染首帧。

```html
<!-- On the destination page: -->
<head>
  <!-- Block rendering until the hero image and title are parsed,
       ensuring the view transition snapshot is taken at the right time. -->
  <link rel="expect" href="#main-content" blocking="render">
</head>
<body>
  <main id="main-content">
    <h1>The buzz on hummingbirds</h1>
    <img src="bird.jpg">
  </main>
</body>
```

```css
/* On the destination page: */
main {
  view-transition-name: --hovercard;
  view-transition-class: morph;
}
h1 {
  view-transition-name: --title;
  view-transition-class: morph;
}
img {
  view-transition-name: --image;
  view-transition-class: morph;
}

/* By default no transition */
::view-transition-group(*) {
  animation-duration: 0s;
}
/* Short transition for morphing elements */
::view-transition-group(.morph) {
  animation-duration: 0.4s;
}
/* Disable transition if no `old` view */
::view-transition-new(.morph):only-child {
  animation-duration: 0s;
}
```

<a id="fallback-strategies"></a>

## 回退策略

触发器是标准 `<a href="...">` 链接，因此如果将悬停卡片视为渐进增强，不支持的浏览器仍可点击导航。需要跨浏览器支持悬停卡片时，按需条件加载 polyfill。

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

<a id="fallbacks--browser-support-for-popoverhint"></a>

### `popover="hint"` 的回退方案和浏览器支持

popover="hint" 的浏览器支持：有限可用。
支持版本：Chrome 151（2026 年 7 月）、Edge 151（2026 年 7 月）和 Firefox 153（2026 年 7 月）。
不支持：Safari。

`@oddbird/popover-polyfill` 包不会在已原生支持 `popover`（`auto` 和 `manual`）的浏览器中补齐 `popover="hint"`。这些浏览器将无法识别的 `"hint"` 值按默认无效值规则处理为 `popover="manual"`，因此通过键盘焦点打开的悬停卡片，在指针悬停打开第二张卡片后可能仍保持打开，除非调用器在失去兴趣时显式关闭它。

<a id="fallbacks--browser-support-for-interest-invokers"></a>

### Interest invokers 的回退方案和浏览器支持

Interest invokers 的浏览器支持：有限可用。
支持版本：Chrome 149（2026 年 6 月）和 Edge 149（2026 年 6 月）。
不支持：Firefox 和 Safari。

必须用 NPM 上的 `interestfor` polyfill 包按条件补齐 Interest invokers。优先将 polyfill 打包，而非从 CDN 加载。

**必须：** 检测 `HTMLButtonElement.prototype` 是否具有 `interestForElement` 属性，**仅在**缺少原生支持时加载 polyfill。

```html
<script type="module">
  if (!("interestForElement" in HTMLButtonElement.prototype)) {
    // CDN link only used for example, prefer bundling.
    await import("https://unpkg.com/interestfor@latest");
  }
</script>
```

<a id="css-polyfill-caveats"></a>

### CSS polyfill 注意事项

使用 polyfill 时，CSS API 会略有变化，以适应缺少原生伪类和属性支持的情况：

- **伪类：** polyfill 无法定义真正的 `:interest-source` 和 `:interest-target` 伪类，因此改用 `.interest-source` 和 `.interest-target` 类。**必须：** 用 `:is()` 组合原生与 polyfill 状态。

```css
/* Styles to apply when the effect is being previewed */
:is(:interest-source, .interest-source) { /* ... */ }
:is(:interest-target, .interest-target) { /* ... */ }
```

- **CSS 属性：** 对 `interest-delay`、`interest-delay-start` 和 `interest-delay-end`，polyfill 要求使用 CSS 变量，因为它无法在所有浏览器中直接读取这些自定义属性。

```css
/* Adjust the start and end delay for interest invokers */
[interestfor] {
  --interest-delay-start: 0.2s;
  interest-delay-start: var(--interest-delay-start);
  --interest-delay-end: 0.1s;
  interest-delay-end: var(--interest-delay-end);
}
```

如果已有兴趣触发的浮层打开，且用户可能快速连续移过多个触发器，将初始延迟设为 `0s`。

```css
.container:has([interestfor]:is(:interest-source, .interest-source)) [interestfor] {
  --interest-delay-start: 0s;
}
```

<a id="fallbacks--browser-support-for-anchor-positioning"></a>

### 锚点定位的回退方案和浏览器支持

Anchor positioning 的浏览器支持：有限可用。
支持版本：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

没有 CSS Anchor Positioning 时，`[popover]` 覆盖层等关联元素会回退到用户代理默认位置（浮层默认在视口居中）。根据用例是否要求空间关联，选择按条件加载 polyfill，或使用 `@supports` 限定定位规则。

<a id="option-1-polyfill-oddbirdcss-anchor-positioning"></a>

#### 方案 1：Polyfill（`@oddbird/css-anchor-positioning`）

如果不支持的浏览器也必须让定位元素在空间上跟随触发器，按条件加载 `@oddbird/css-anchor-positioning` 包。

**必须：** 通过 `CSS.supports("anchor-name: --a")`（或 `"anchorName" in CSSStyleDeclaration.prototype`）检测支持，**仅在**缺少原生支持时加载 polyfill，不得无条件加载。

使用打包工具或 import map 时：

```js
// MANDATORY: Feature-detect anchor positioning support before loading the polyfill.
if (!CSS.supports("anchor-name: --a")) {
  import("@oddbird/css-anchor-positioning");
}
```

没有打包工具时，在 `<script type="module">` 内从 CDN 导入：

```html
<!-- MANDATORY: Conditionally install the anchor positioning polyfill -->
<script type="module">
  if (!CSS.supports("anchor-name: --a")) {
    import("https://unpkg.com/@oddbird/css-anchor-positioning");
  }
</script>
```

**Polyfill 注意事项：**
- **不支持隐式锚点：** polyfill 不支持隐式锚点关联（例如由 `popovertarget`、`commandfor`、`interestfor` 或 `showPopover({ source })` 创建的关联）。**必须**为每个触发器设置唯一的显式 `anchor-name`，并为定位元素设置匹配的 `position-anchor`。
- **不支持 `position-area` 配合 `position-try-fallbacks`：** polyfill 不支持 `position-area` 与 `position-try-fallbacks` 的组合。为需要回退的元素使用 polyfill 时，用 inset 属性（`top`、`left`、`right`、`bottom`）上的 `anchor()` 函数配合 `inset: auto` 定位，替代 `position-area`。
- **不要将 polyfill 处理的规则包在 `@supports` 中：** 没有原生锚点定位的浏览器会把 `@supports (position-area: ...)` 和 `@supports (anchor-name: --a)` 计算为 `false`，在 polyfill 处理前就丢弃该代码块。

```css
.trigger {
  /* MANDATORY: Each trigger and positioned element pair must share a unique anchor name. */
  anchor-name: --my-trigger;
}

[popover].anchored-overlay {
  position-anchor: --my-trigger;
  /* MANDATORY: Use anchor() on inset properties rather than position-area when using the polyfill on elements needing position-try-fallbacks. */
  inset: auto;
  top: anchor(bottom);
  left: anchor(left);
  margin: 0;
}
```

<a id="option-2-progressive-enhancement-with-supports-no-polyfill"></a>

#### 方案 2：用 `@supports` 渐进增强（无 polyfill）

如果不提供 polyfill，**不要**无条件为依赖 `position-area` 或 `anchor()` 的 `[popover]` 元素设置 `inset: auto` 或 `margin: 0`。在不支持锚点定位的浏览器中，`inset: auto` 会覆盖用户代理居中样式（`inset: 0; margin: auto`），而 `position-area` 被忽略，导致浮层停在 `(0, 0)` 或与触发器重叠。

应把 `inset: auto` 和 `margin: 0` 放入针对具体定位特性的 `@supports` 中（例如 `@supports (position-area: block-end)` 或 `@supports (top: anchor(bottom))`），让不支持的浏览器保留默认居中浮层；或提供匹配的 `@supports not (...)` 回退布局（例如固定在底部的面板）：

```css
@supports (position-area: block-end) {
  [popover].anchored-overlay {
    inset: auto;
    margin: 0;
    position-area: block-end span-inline-end;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
  }
}

@supports not (position-area: block-end) {
  /* Optional: override default popover centering with a fixed bottom bar */
  [popover].anchored-overlay {
    position: fixed;
    inset: auto 0 0 0;
    width: auto;
    margin: 0;
  }
}
```

<a id="fallbacks--browser-support-for-cross-document-view-transitions"></a>

### 跨文档视图过渡的回退方案和浏览器支持

Cross-document view transitions 的浏览器支持：有限可用。
支持版本：Chrome 126（2024 年 6 月）、Edge 126（2024 年 6 月）和 Safari 18.2（2024 年 12 月）。
不支持：Firefox。

跨文档视图过渡属于渐进增强。不支持 `@view-transition { navigation: auto; }` 的浏览器会优雅降级该规则（以及目标页面上的 `blocking="render"` 和 `<link rel="expect">`），点击链接时执行标准页面导航，而不显示变形动画。
