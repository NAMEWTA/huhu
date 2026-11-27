<a id="creating-persistent-app-tours"></a>

# 创建持续显示的应用引导

新手引导需要覆盖层在用户与高亮功能交互时保持显示。与自动浮层不同，手动浮层不会在用户点击页面其他位置时关闭。组合 `popover="manual"` 与 CSS Anchor Positioning，可以创建非模态且锚定到目标的引导步骤。此模式用于介绍新增或更新内容。浮层之间没有明确关联，因此关闭第一个浮层不意味着用户必须立即转到第二个浮层了解相关功能；他们可以在导航到该页面区域时再了解。

<a id="recommended-implementation"></a>

## 推荐实现

<a id="html"></a>

### HTML
```html
<div id="feature-target">Highlight this feature</div>

<dialog id="tour-step" popover="manual" aria-labelledby="tour-title">
  <!-- 假定完整文档大纲中，此元素之前已有一个 <h1>。 -->
  <h2 id="tour-title">Start a review</h2>
  <p>Begin the process by starting a review of the submitted document.</p>
  <button popovertarget="tour-step" popovertargetaction="hide">Got it</button>
</dialog>
```

<a id="css"></a>

### CSS
```css
#feature-target {
  anchor-name: --feature-target;
}

#tour-step {
  popover: manual;
  position-anchor: --feature-target;
  position-area: right center;
  inset: auto;
  margin: 1rem;
  padding: 1rem;
  border: 1px solid blue;
  border-radius: 0.5rem;
  background: aliceblue;
}
```

<a id="javascript"></a>

### JavaScript
```javascript
const tourStep = document.getElementById('tour-step');
tourStep.showPopover();

// 此时显示的是首次引导浮层，应将文档其余部分设为 inert。确保引导用模态浮层不是该元素的子元素，否则它也会变成 inert 而无法访问。
// 首次引导完成后，确保移除 inert。
const main = document.querySelector("main");
main.inert = true;

// 必须：以程序方式将焦点导入非模态浮层，让键盘和辅助技术用户立即感知新上下文。
tourStep.querySelector('button').focus();
```

<a id="implementation-guidelines"></a>

## 实现指南

* **必须：** 使用 `popover="manual"`，防止用户交互期间意外关闭引导步骤。
* **必须：** 为容器标记 `role="dialog"`，并用 `aria-labelledby` 关联标题。
* **必须：** 打开后立即通过程序将焦点移入浮层，防止焦点遗失。
* **要**用 CSS Anchor Positioning 将引导步骤锚定到正在解释的具体功能。
* **要**在浮层内提供明确的“关闭”或“下一步”按钮，并使用 `popovertargetaction="hide"`。

<a id="accessibility-considerations"></a>

## 无障碍考量

浮层应为所介绍功能提供足够上下文，使其可以独立理解。**不要**让内容严重依赖浮层之外的信息。例如，“新功能。点击这里”高度依赖用户可能看不到或无法访问的视觉信息（尤其是浮层外内容为 `inert` 时）。相比之下，“新增聊天功能。发起聊天，与其他成员一起审阅项目”就更易独立理解。引导浮层应从标题开始，为内部内容提供上下文，也让屏幕阅读器用户在非模态使用时容易导航到它。

页面加载时不得把焦点移到这些浮层，避免劫持焦点造成困惑。用户访问页面时很可能已有要完成的目标，因此新功能引导应视为补充信息，不应分散注意力。

为保持补充性质，浮层应在 DOM 中紧放在相关功能或控件之前。这有助于屏幕阅读器用户按顺序阅读页面时识别浮层与相关内容的关系。关闭浮层后，应将焦点移到相关控件或功能。

浮层内容在文字缩放到 200% 时必须能随之缩放并保持可见，以满足 WCAG 1.4.4 文本缩放（AA 级）。通过 CSS 调整文本样式和间距时，内容必须保持可见，以满足 1.4.12 文本间距（AA 级）。在 320×256 CSS 像素视口中，浮层内容必须保持可见或仍可访问，以满足 1.4.10 重排（AA 级）。

非模态浮层可能遮挡获得焦点的控件，导致违反 WCAG 2.4.11 焦点未被遮挡（最低要求，AA 级），因为聚焦项不能完全被遮挡。虽然没有通用方案能彻底消除此问题，但应考虑调整提示位置或是否显示的策略。确保提示不会遮挡通过键盘获得焦点的交互元素。如果提示可能遮挡正在聚焦的元素，应改变其位置避免遮挡，或在提示已与用户无关时关闭。

<a id="fallback-strategies"></a>

## 回退策略

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
- **不支持 `position-area` 配合 `position-try-fallbacks`：** polyfill 不支持 `position-area` 与 `position-try-fallbacks` 的组合。为需要回退的元素使用 polyfill 时，用 inset 属性（`top`、`left`、`right`、`bottom`）上的 `anchor()` 函数配合 `inset: auto` 定位，替代 `position-area`。
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
