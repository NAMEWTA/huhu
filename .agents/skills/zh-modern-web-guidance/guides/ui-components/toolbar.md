<a id="build-a-toolbar"></a>

# 构建工具栏

工具栏把相关控件（格式、对齐、视图选项）组成具有**单个 Tab 停靠点**的复合控件。用户按一次 `Tab` 进入，用方向键在控件间移动，再用 `Tab` 离开。仅用于作用于其他对象（编辑器、预览、画布）的控件。站点导航参见 `navbar`（通过 `npx -y modern-web-guidance@latest retrieve "navbar"` 获取）；没有常驻控件行的下拉或上下文命令菜单参见 `menu`（通过 `npx -y modern-web-guidance@latest retrieve "menu"` 获取）。

<a id="structure-and-semantics"></a>

## 结构与语义

必须为容器设置 `role="toolbar"` 和 `aria-label`。相关控件用具有自身 `aria-label` 的 `role="group"` 包裹，用 `role="separator"` 和 `aria-orientation="vertical"` 分隔组。换行后的分隔符若独处行尾，用 `opacity: 0` 视觉隐藏，不用会将其移出无障碍树的 `display: none` 或 `visibility: hidden`。可选添加指向受控元素的 `aria-controls`，仅在工具栏控制单个具体元素时值得添加。

* 使用真实 `<button type="button">`。
* 仅含图标的按钮需要 `aria-label`，工具提示不能替代。装饰图标用 `<svg aria-hidden="true">` 和 `currentColor`，或 CSS `mask`、`background-color: currentColor` 及 `forced-color-adjust: none`，防止强制颜色模式去掉填充。可复用 CSS 图标令牌系统参见 `icons`（通过 `npx -y modern-web-guidance@latest retrieve "icons"` 获取）。
* 切换按钮（粗体、斜体）使用 `aria-pressed="true|false"`。切换时不改变标签。
* 互斥组（左/中/右）每个按钮使用 `aria-pressed`，脚本保证恰好一个为 `true`。
* 操作按钮（复制、撤销、保存）执行一次，没有开关状态，因此不要添加 `aria-pressed`。只在持续开启或关闭的按钮上标记 `aria-pressed`。
* 用 `aria-disabled="true"` 而非 `disabled` 禁用，让控件保持可聚焦并可由方向键到达。设置期间忽略点击。

```html
<div role="toolbar" focusgroup="toolbar wrap" aria-label="Text formatting" aria-controls="preview">
  <div role="group" aria-label="Style">
    <button type="button" aria-pressed="false" aria-label="Bold" title="Bold"></button>
  </div>
  <span role="separator" aria-orientation="vertical"></span>
  <!-- Overflow trigger: the last item in the toolbar -->
  <button type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded="false"
    popovertarget="more-menu" title="More actions"></button>
</div>
```

<a id="action-buttons-and-feedback"></a>

## 操作按钮与反馈

切换按钮通过 `aria-pressed` 展示结果。操作没有状态可显示，若不提供反馈，屏幕阅读器用户就没有确认。结果无法通过其他方式看到或听到时（复制、保存），在工具栏外实时区域写入简短消息。若操作改变的内容已经被播报或聚焦，则跳过消息。

```html
<!-- Always present in the DOM so the announcement is reliable; keep it outside the toolbar -->
<p role="status"></p>
```

```js
// Report the outcome, including failure; clipboard access can be denied
try {
  await navigator.clipboard.writeText(text);
  status.textContent = "Text copied";
} catch {
  status.textContent = "Copy failed";
}
```

<a id="keyboard-navigation"></a>

## 键盘导航

必须同时只让一个项目处于 Tab 顺序中。在 `role="toolbar"` 容器上设置 `focusgroup="toolbar wrap"`，浏览器提供游动 Tab 停靠点、跨所有组的方向键移动（首尾循环、RTL 反向）、`Home`/`End` 和点击后的焦点恢复。不要并行添加另一套 roving-tabindex。不支持 `focusgroup` 时安装下文回退。

<a id="vertical-toolbar"></a>

## 垂直工具栏

控件沿侧边堆叠（工具面板或画布旁缩放控件）时选垂直工具栏，否则用水平。前文全部适用，以下例外：

* 设置 `aria-orientation="vertical"`，使用 `focusgroup="toolbar wrap block"`，让 `ArrowDown`/`ArrowUp` 在项目间移动。
* 项目按列布局（`flex-direction: column`，不换行）。
* 堆叠项目间分隔符是水平的：使用 `aria-orientation="horizontal"`（分隔符默认），而非 `vertical`。
* 工具提示在按钮旁打开（`position-area: inline-end`），不在下方；见下文工具提示部分。

<a id="visible-states"></a>

## 可见状态

* 用 `min-inline-size`/`min-block-size` 而非 `inline-size`/`block-size`，让每个按钮至少 24×24 CSS px，内容可扩大但不能缩小目标。在 `@media (pointer: coarse)` 下加大。`2.5rem` 和 `3rem` 只是示例。
* 保留清晰且带偏移的 `:focus-visible` 轮廓，绝不移除。
* 依据 ARIA 属性（`[aria-pressed="true"]`）而非独立类设置切换状态，确保视觉与无障碍一致。
* 通过改变按钮背景显示切换状态；若在任一支持配色中，按钮背景与相邻背景对比小于 3:1，则增加达到 3:1 的视觉线索，例如围绕背景的轮廓或内阴影。详见 `color`（通过 `npx -y modern-web-guidance@latest retrieve "color"` 获取）。
* `forced-colors: active` 下使用系统颜色（`ButtonText`、`Highlight`）。
* 分隔符和提示框使用边框绘制（`transparent` 透明边框也可），不要只用会被强制颜色替换为页面颜色的 `background`。
* 悬停样式放在 `@media (hover: hover)`，过渡放在 `@media (prefers-reduced-motion: no-preference)`。

<a id="tooltips-for-icon-only-buttons"></a>

## 仅含图标按钮的工具提示

为每个图标按钮设置 `title` 作为基础提示。只有同时支持 Interest Invokers 与锚点定位时，才升级为 `popover="hint"` 的兴趣调用器，让提示显示时不关闭已打开的菜单浮层。其他环境保留原生 `title` 提示。

必须将提示定位到工具栏非堆叠轴：水平工具栏用 `position-area: block-end`（回退 `flip-block`），垂直工具栏用 `position-area: inline-end`（回退 `flip-inline`）。沿堆叠轴放置会覆盖下一个控件并吞掉点击，因为指针停在提示上会使它保持打开。

```html
<button type="button" aria-label="Bold" title="Bold">…</button>
```

```js
// Upgrade title tooltips only when interest invokers and anchor positioning both work
if ("interestForElement" in HTMLButtonElement.prototype && CSS.supports("position-area", "block-end")) {
  document.querySelectorAll('[role="toolbar"] button[title]').forEach((b, i) => {
    const tip = Object.assign(document.createElement("div"), { id: `tip-${i}`, textContent: b.title });
    tip.popover = "hint";
    b.setAttribute("interestfor", tip.id);
    b.removeAttribute("title"); // avoid a second, native tooltip
    document.body.append(tip); // keep open hint nodes out of role="group" / role="toolbar"
  });
}
```

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

```css
[popover="hint"] {
  inset: auto;
  /* Anchor to the invoker; flip to the other side if there is no room */
  position-area: block-end;
  position-try-fallbacks: flip-block;
}
```

<a id="overflow-menu-for-secondary-actions-optional"></a>

## 次要操作的溢出菜单（可选）

两种模式可让工具栏适应窄空间：更适合桌面的溢出菜单，或更适合移动端的可水平滚动工具栏，隐藏滚动条并提供滚动提示。可滚动模式使用 `overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity`，通过边缘淡出（`mask-image`）或部分可见的末项提示隐藏控件。按输入类型（`@media (pointer: coarse)`）或容器宽度选择。

工具栏有次要操作或必须适应窄容器时，在末尾加入“更多操作”菜单；全部控件常用且放得下时跳过。若空间不足时需要动态移入菜单，自行构建溢出行为。

* 触发器作为最后一个工具栏项目（`aria-label="More actions"`、`aria-haspopup="menu"`、`aria-expanded="false"`，以及指向菜单浮层的 `popovertarget`），使用惯常竖向三点图标（`⋮`）。仅在激活时打开，方向键经过工具栏时绝不因聚焦预览。
* 将 `popover` 容器锚定到触发器（`inset: auto; position-area: block-end span-inline-start; position-try-fallbacks: flip-block, flip-inline`），内部嵌套 `<div focusgroup="menu nomemory" aria-label="More actions">`；仅在 `'focusGroup' in HTMLElement.prototype` 为 false 时添加 `role="menu"`、`role="menuitem"`、`tabindex="-1"` 和 `ArrowDown`/`ArrowUp`/`Home`/`End`。在 `toggle` 同步 `aria-expanded` 并聚焦第一项；`Tab` 关闭浮层且不困住焦点；`role="menuitemcheckbox"` 上 `Space` 切换 `aria-checked` 而不关闭。嵌套子菜单或单选组参见 `menu`（通过 `npx -y modern-web-guidance@latest retrieve "menu"` 获取）。
* 在工具栏实时区域播报每次菜单激活结果，例如 `"Strikethrough on"`（“删除线已开启”）或 `"Formatting cleared"`（“格式已清除”）。菜单关闭将焦点返回触发器时，稍延迟写入实时区域，例如 `500ms`，防止焦点变化播报抢先打断它。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-focusgroup"></a>

### `focusgroup` 的回退方案和浏览器支持

focusgroup 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

保留标记中的 `focusgroup`。仅当 `'focusGroup' in HTMLElement.prototype` 为 false 时加载 roving-tabindex 回退；存在原生支持时绝不安装。回退实现原生 focusgroup 的行为：

* 活动项 `tabindex="0"`，其余 `tabindex="-1"`，初始第一项活动。
* 在 `focusin` 将 `tabindex="0"` 移到聚焦项，让返回工具栏（包括点击后）恢复位置。
* 水平工具栏用 `ArrowRight`/`ArrowLeft` 跨所有组移动到下一/上一项，首尾循环；RTL 反向。不绑定 `ArrowUp`/`ArrowDown`。
* 垂直工具栏改用 `ArrowDown`/`ArrowUp`，`ArrowLeft`/`ArrowRight` 不做任何事。
* `Home`/`End` 移到首/末项。
* 只对工具栏处理的键调用 `preventDefault()`，让 `Tab` 继续工作。

```js
if (!('focusGroup' in HTMLElement.prototype)) {
  // items = every toolbar control across all groups, in DOM order
  items.forEach((b, i) => (b.tabIndex = i ? -1 : 0));
  bar.addEventListener("focusin", ({ target }) => {
    if (items.includes(target)) items.forEach((b) => (b.tabIndex = b === target ? 0 : -1));
  });
  // Read direction and orientation at event time so runtime changes are honored
  const vertical = bar.getAttribute("aria-orientation") === "vertical";
  // Only horizontal toolbars flip with direction: RTL does not flip Up/Down
  const rtl = getComputedStyle(bar).direction === "rtl";
  const steps = vertical
    ? { ArrowDown: 1, ArrowUp: -1 }
    : { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
  // keydown: look up steps[key] (or Home/End), move focus, preventDefault only for handled keys
}
```

<a id="fallbacks--browser-support-for-interest-invokers"></a>

### Interest invokers 的回退方案和浏览器支持

Interest invokers 的浏览器支持：有限可用。
支持版本：Chrome 149（2026 年 6 月）和 Edge 149（2026 年 6 月）。
不支持：Firefox 和 Safari。

此处不要加载 `interestfor` polyfill：缺少原生兴趣调用器或锚点定位时跳过升级脚本，按钮保留基础 `title` 提示。

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

Popover polyfill 不添加 `popover="hint"`。有 `popover` 但没有 `hint` 时，两个提示可能同时打开（例如一个由焦点、一个由悬停打开）。将其视为优雅降级：升级仅在支持兴趣调用器时运行，其他浏览器保留原生 `title` 提示。

<a id="fallbacks--browser-support-for-clipboard-api"></a>

### Clipboard API 的回退方案和浏览器支持

api.Clipboard.writeText 能力的 Baseline 状态：广泛可用。自 2020-03-24 起纳入 Baseline。
支持版本：Chrome 66（2018 年 4 月）、Edge 79（2020 年 1 月）、Firefox 63（2018 年 10 月）、Safari 13.1（2020 年 3 月）和 Safari iOS 13.4（2020 年 3 月）。

Clipboard API 不可用时，`navigator.clipboard` 为 undefined，调用会抛错，反馈示例中的 `catch` 分支会报告失败。

<a id="fallbacks--browser-support-for-anchor-positioning"></a>

### 锚点定位的回退方案和浏览器支持

Anchor positioning 的浏览器支持：有限可用。
支持版本：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

没有锚点定位时，用户代理将浮层放在视口中央。工具提示无需回退，因为上面的 `title` 升级会被跳过。溢出菜单则通过脚本定位以贴近触发器。把 CSS 放在 `@supports not (position-area: block-end)` 内，避免影响支持的浏览器。

```css
@supports not (position-area: block-end) {
  #more-menu {
    /* Viewport coordinates are set from script when the menu opens */
    position: fixed;
    inset: auto;
    margin: 0;
  }
}
```

```js
// Only needed without anchor positioning; place the menu below its trigger
// and flip above it when it would overflow the viewport.
menu.addEventListener("toggle", ({ newState }) => {
  if (newState !== "open" || CSS.supports("position-area", "block-end")) return;
  const t = more.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const below = t.bottom + m.height <= innerHeight;
  menu.style.top = `${below ? t.bottom : t.top - m.height}px`;
  // Right-align with the trigger, clamped to the viewport
  menu.style.left = `${Math.max(0, Math.min(t.right - m.width, innerWidth - m.width))}px`;
});
```
