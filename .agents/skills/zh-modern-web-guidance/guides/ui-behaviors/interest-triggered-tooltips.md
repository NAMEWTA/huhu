<a id="show-a-tooltip-when-hovering"></a>

# 悬停时显示工具提示

用户希望在不完全改变上下文的情况下获取相关补充信息。用户对更多信息表现兴趣时显示工具提示，可以解释术语、澄清仅图标按钮的操作，或补充表单字段指导。

<a id="should-you-use-a-tooltip"></a>

## 是否应使用工具提示？

切换提示（toggletip）是在控件或内容旁的小按钮，通常为“i”或“?”图标，唯一用途是显示更多信息。工具提示、切换提示和行内内容的选择取决于信息重要性和长度：

- **工具提示**（位于控件自身）：简短澄清控件作用。错过它影响很小。
- **切换提示**（控件或内容旁的“i”或“?”）：用户可能想知道，但大多数人不必每次看到的信息，例如字段为何必填、总额如何计算、政策含义，或任何长于一个短语的内容。行内展示会杂乱，但它值得明确可见入口，让所有用户都能主动发现，而非碰巧悬停，包括触摸和屏幕阅读器用户。实现见下文。
- **行内内容：** 大多数用户执行操作前或过程中需要的信息，例如输入时的密码规则、要复制的值。浮层在用户点击或聚焦其他位置后就会关闭。

<a id="creating-the-tooltip"></a>

## 创建工具提示

为 `<div>` 或其他语义合适的元素添加 `popover="hint"`，即可获得所需行为。用户打开提示时，会隐藏其他 `popover="hint"`，但不隐藏 `auto` 或 `manual` 提示；也会处理嵌套提示的关闭。

它还提供轻触关闭，用户点击或以其他方式聚焦浮层之外时关闭。

工具提示必须具有唯一 `id`：

```html
<!-- 必须：工具提示元素具有 popover="hint"，使轻触关闭不会关闭无关的 auto 或 manual 浮层。 -->
<div popover="hint" id="tooltip">Tooltip content</div>
```

用户通过悬停或聚焦 `<a>` 或 `<button>` 表达兴趣。触发元素的 `interestfor` 必须匹配提示的 `id`。

```html
<!-- interestfor 属性可应用到 <button> 元素： -->
<button interestfor="tooltip">Tooltip trigger</button>

<!-- interestfor 属性也可应用到 <a> 元素，href 是示例： -->
<a interestfor="tooltip" href="/docs/dom">Tooltip trigger</a>
```

触发器必须有视觉指示，表明与之交互可获得更多信息。

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

<a id="accessibility-constraints-wcag-1413"></a>

### 无障碍约束（WCAG 1.4.13）

即使 `interestfor` 已处理上述语义，实现仍必须满足 WCAG 1.4.13（悬停或聚焦内容）：
- **可关闭：** 用户无需移动指针或键盘焦点就能关闭，例如按 `Escape`。原生 `popover` 自动管理此绑定。
- **可悬停：** 指针能移到提示内容上且提示不消失，让放大工具用户安全阅读。
- **持续显示：** 提示保持可见，直到悬停/聚焦触发条件移除、用户明确关闭，或内容不再有效。

<a id="positioning-the-tooltip"></a>

### 定位工具提示

用 **CSS Anchor Positioning** 定位。通过 `interestfor` 打开时，触发器自动成为浮层的**隐式锚点**。

支持原生锚点定位的现代浏览器中，**无需**为触发器定义 `anchor-name` 或为提示定义 `position-anchor`。直接用 `position-area` 相对隐式锚点定位，用 `position-try-fallbacks` 处理碰撞翻转：

```css
[popover] {
  /* interestfor 提供隐式锚点，无需 anchor-name 或 position-anchor。 */
  position-area: block-start;
  position-try-fallbacks: flip-block;
  /* 覆盖用户代理的浮层居中设置（inset: 0; margin: auto），让提示贴近锚点。 */
  inset: auto;
  margin: 0;
}
```

<a id="toggletips-an-i-or--button"></a>

## 切换提示：“i”或“?”按钮

为切换提示同时提供两个触发方式：`interestfor` 在悬停、聚焦、长按时打开；`popovertarget` 在点击、轻触和 `Enter` 时打开。

```html
<label>Shipping <input name="shipping"></label>
<!-- 名称应说明按钮揭示的内容；单独的问号不是名称。 -->
<button type="button" interestfor="shipping-help" popovertarget="shipping-help" popovertargetaction="show" aria-label="More about shipping">?</button>
<!-- 紧接触发器放置，保持阅读顺序。 -->
<div id="shipping-help" popover="hint">Free shipping applies to orders over $50. Orders placed before 2pm ship the same day.</div>
```

- 使用 `popovertargetaction="show"`，不要默认 `toggle`：悬停通常已打开，随后的点击切换反而关闭。由 `Escape`、轻触关闭或失去兴趣来关闭。
- 保留 `popover="hint"`：悬停经过切换提示不能像 `auto` 浮层那样关闭已打开菜单。
- 与普通工具提示同样定位。任一属性都会让按钮成为隐式锚点。

<a id="fallback-strategies"></a>

## 回退策略

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
    // CDN 链接仅用于示例，优先打包。
    await import("https://unpkg.com/interestfor@latest");
  }
</script>
```

<a id="css-polyfill-caveats"></a>

### CSS polyfill 注意事项

使用 polyfill 时，CSS API 会略有变化，以适应缺少原生伪类和属性支持的情况：

- **伪类：** polyfill 无法定义真正的 `:interest-source` 和 `:interest-target` 伪类，因此改用 `.interest-source` 和 `.interest-target` 类。**必须：** 用 `:is()` 组合原生与 polyfill 状态。

```css
/* 预览效果时应用的样式。 */
:is(:interest-source, .interest-source) { /* ... */ }
:is(:interest-target, .interest-target) { /* ... */ }
```

- **CSS 属性：** 对 `interest-delay`、`interest-delay-start` 和 `interest-delay-end`，polyfill 要求使用 CSS 变量，因为它无法在所有浏览器中直接读取这些自定义属性。

```css
/* 调整兴趣调用器的开始和结束延迟。 */
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

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退方案和浏览器支持

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起纳入 Baseline。
支持版本：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 主要属于**渐进增强**，但其核心行为——提升到顶层、轻触关闭和 `popovertarget` 调用——没有纯 CSS 等价实现。旧浏览器需要 polyfill；如果不希望引入，也可以手动实现回退。

**Polyfill：** 要在旧浏览器支持 `popover` 属性，按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须：** 检测 `HTMLElement.prototype` 是否具有 `popover` 属性，**仅在**缺少原生支持时加载 polyfill，不得无条件加载。

使用打包工具或 import map 时：

```js
// 必须：检测 HTMLElement.prototype 上的 popover 特性。
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

为防止 polyfill 加载前显示浮层，请用 CSS 将它们隐藏：

```css
@supports not selector(:popover-open) {
  [popover]:not(.\:popover-open) {
    display: none;
  }
}
```

<a id="fallbacks--browser-support-for-popoverhint"></a>

### `popover="hint"` 的回退方案和浏览器支持

popover="hint" 的浏览器支持：有限可用。
支持版本：Chrome 151（2026 年 7 月）、Edge 151（2026 年 7 月）和 Firefox 153（2026 年 7 月）。
不支持：Safari。

`@oddbird/popover-polyfill` 不会在已原生支持 `popover`（`auto` 和 `manual`）的浏览器中补齐 `popover="hint"`。这些浏览器将未知 `"hint"` 按 HTML 无效值默认规则处理为 `popover="manual"`，因此键盘聚焦打开的提示，可能在指针悬停打开第二个提示后仍存在，除非调用器在失去兴趣时显式关闭。

切换提示也可仅通过点击打开，没有兴趣可失去，因此 `manual` 回退永远不会关闭。缺少 `hint` 时，在打开过程中将其改为 `popover="auto"`。**必须**在 `beforetoggle` 执行：浏览器在该事件后读取类型，而改变已打开浮层类型会使其关闭。`beforetoggle` 不冒泡，因此用捕获监听器委托：

```js
// popover property 报告浏览器实际采用的状态，不支持 hint 时为 manual。
const probe = document.createElement("div");
probe.popover = "hint";
if (probe.popover !== "hint") {
  document.addEventListener("beforetoggle", ({ target, newState }) => {
    const toggletip = target.getAttribute("popover") === "hint"
      && document.querySelector(`[popovertarget="${CSS.escape(target.id)}"]`);
    if (newState === "open" && toggletip) {
      target.popover = "auto";
    }
  }, true);
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
// 必须：加载 polyfill 前检测锚点定位支持。
if (!CSS.supports("anchor-name: --a")) {
  import("@oddbird/css-anchor-positioning");
}
```

没有打包工具时，在 `<script type="module">` 内从 CDN 导入：

```html
<!-- 必须：按条件安装锚点定位 polyfill。 -->
<script type="module">
  if (!CSS.supports("anchor-name: --a")) {
    import("https://unpkg.com/@oddbird/css-anchor-positioning");
  }
</script>
```

**Polyfill 注意事项：**
- **不支持隐式锚点：** polyfill 不支持隐式锚点关联（例如由 `popovertarget`、`commandfor`、`interestfor` 或 `showPopover({ source })` 创建的关联）。**必须**为每个触发器设置唯一的显式 `anchor-name`，并为定位元素设置匹配的 `position-anchor`。
- **不支持 `position-area` 配合 `position-try-fallbacks`：** polyfill 不支持将 `position-area` 与 `position-try-fallbacks` 组合使用。为需要回退的元素使用 polyfill 时，用 inset 属性（`top`、`left`、`right`、`bottom`）上的 `anchor()` 函数配合 `inset: auto` 定位，替代 `position-area`。
- **不要将 polyfill 处理的规则包在 `@supports` 中：** 没有原生锚点定位的浏览器会把 `@supports (position-area: ...)` 和 `@supports (anchor-name: --a)` 计算为 `false`，在 polyfill 处理前就丢弃该代码块。

```css
.trigger {
  /* 必须：每对触发器与定位元素共用一个唯一锚点名称。 */
  anchor-name: --my-trigger;
}

[popover].anchored-overlay {
  position-anchor: --my-trigger;
  /* 必须：对需要 position-try-fallbacks 的元素使用此 polyfill 时，在 inset 属性上使用 anchor()，不要使用 position-area。 */
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
  /* 可选：用固定底栏覆盖浮层默认居中行为。 */
  [popover].anchored-overlay {
    position: fixed;
    inset: auto 0 0 0;
    width: auto;
    margin: 0;
  }
}
```
