<a id="viewport-aware-dropdowns"></a>

# 感知视口的下拉面板

展开的操作面板或弹出按钮组是一种实用模式，用户能以很少的空间访问更多功能。这种浮层模式带来布局复杂性，因为面板既要与触发元素保持关联，又要适应视口约束。过去通常需要 Popper.js 或 Floating UI 等复杂 JavaScript 库来计算位置和处理碰撞。

CSS Anchor Positioning 提供声明式、经过性能优化的方式，完全通过 CSS 处理这些关系，让浏览器原生管理定位和溢出逻辑。

> [!NOTE]
> 本指南演示锚定定位与弹出层机制，并不规定某一种具体的无障碍 UI 模式。下方触发控件和面板展示的是普通的**按钮展开按钮组**。如果需要真正的 ARIA 菜单（`role="menu"` 配合方向键导航）、组合框、展开折叠组件或其他命名模式，请在此处定位技术之上，补齐该模式完整的语义和键盘交互约定。

<a id="1-define-the-button-and-panel-relationship"></a>

### 1. 定义按钮与面板的关系

第一步是创建触发按钮，通过 Popover API 打开浮层容器。

**必须遵守的无障碍区别：**此模式明确表示**弹出层中展开的按钮组**，不是真正的 ARIA 菜单。除非完整实现相应键盘导航约定（如项目之间的空间方向键导航），否则不要添加 `role="menu"` 或 `role="menuitem"`。同样，不要给触发按钮添加 `aria-haspopup`：其值（`menu`、`listbox`、`tree`、`grid` 或旧值 `true`）承诺目标具有匹配角色，而本模式并不具备。

```html
<button popovertarget="action-panel">
  Open Actions
</button>
<!-- Use the Popover API (`popover="auto"`) for the overlay to ensure it is placed in the top layer and handled accessibly by the browser. -->
<div id="action-panel" popover="auto" class="panel">
  <button class="action-item" type="button">Edit</button>
</div>
```


这样会在按钮与面板之间建立隐式锚点关联，面板能够原生相对按钮定位，无须在按钮上设置 `anchor-name`，或在面板上设置 `position-anchor`。

<a id="2-positioning-with-position-area"></a>

### 2. 使用 `position-area` 定位

使用 `position-area`，将目标放在相对锚点的 3×3 网格中，替代手动 `top` / `left` 偏移。

```css
.panel {
  /* 
     Position the panel below the anchor (block-end), 
     aligned to the start of the anchor and spanning to its end (span-inline-end).
  */
  position-area: block-end span-inline-end;
  
  /* Reset insets to allow the grid to take control */
  inset: auto;
}
```


优先逻辑关键字（`span-inline-end`、`block-start`），而非物理关键字（`left`、`top`），自动支持 RTL 和不同书写模式。

**必须遵守**：不要在 `position-area` 中混用物理与逻辑关键字。

<a id="3-implement-edge-resilience-fallbacks"></a>

### 3. 实现边缘适应（回退）

为防止面板在屏幕边缘被裁切，定义默认位置溢出时浏览器应尝试的“尝试策略”。

```css
.panel {
  /* 
     If the panel overflows the bottom, flip it to the top (flip-block).
     If it overflows the inline edges, flip it horizontally (flip-inline).
     If it overflows both (e.g., in a corner), flip on both axes (flip-block flip-inline).
  */
  position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
}
```


如果下拉或浮出面板包含方向箭头或边框，需要依据所选回退位置改变样式，参见 `position-aware-tooltips`（通过 `npx -y modern-web-guidance@latest retrieve "position-aware-tooltips"` 获取）。关于无 JavaScript 的声明式对话框和弹出层调用，参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退与浏览器支持

Popover 的 Baseline 状态：新近可用。它自 2025-01-27 起进入 Baseline。
支持的浏览器：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 主要属于**渐进增强**，但其核心行为——提升到顶层、轻触关闭和通过 `popovertarget` 调用——没有纯 CSS 等效方案。旧浏览器需要 polyfill；如果不想引入，也可以手动实现回退。

**Polyfill：**为在旧浏览器支持 `popover` 属性，按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须**通过检查 `HTMLElement.prototype` 上的 `popover` property 进行特性检测，**仅**在缺少原生支持时加载 polyfill，不要无条件加载。

使用打包器或 import map 时：

```js
// MANDATORY: Feature detect 'popover' on HTMLElement.prototype.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```


如果不使用包管理器，可从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 的注意事项：

- 对可能在 polyfill 完全加载前运行的代码，不要使用 `popover` IDL property。它不会映射为 attribute，polyfill 也不会识别该弹出层，而这个 property 会一直遮蔽 polyfill 添加的访问器。应改用 `setAttribute()` / `removeAttribute()`。
- **样式注意事项：**polyfill 无法定义真正的 `:popover-open` 伪类，因此改为添加 `.\:popover-open` class。**必须**通过 `:is()` 或 `:where()` 将两者组合，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```


<a id="fallbacks--browser-support-for-anchor-positioning"></a>

### 锚定定位的回退与浏览器支持

锚定定位的浏览器支持状态：有限可用。
支持的浏览器：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

没有 CSS Anchor Positioning 时，`[popover]` 浮层等关联元素会回退到用户代理默认位置（弹出层位于视口中央）。依据用例是否要求空间关联，选择按条件加载 polyfill，或用 `@supports` 限制定位规则。

<a id="option-1-polyfill-oddbirdcss-anchor-positioning"></a>

#### 方案 1：Polyfill（`@oddbird/css-anchor-positioning`）

如果不支持的浏览器中，被定位元素也必须在空间上紧邻触发控件，按条件加载 `@oddbird/css-anchor-positioning` 包。

**必须**通过 `CSS.supports("anchor-name: --a")`（或 `"anchorName" in CSSStyleDeclaration.prototype`）进行特性检测，**仅**在缺少原生支持时加载 polyfill，不要无条件加载。

使用打包器或 import map 时：

```js
// MANDATORY: Feature-detect anchor positioning support before loading the polyfill.
if (!CSS.supports("anchor-name: --a")) {
  import("@oddbird/css-anchor-positioning");
}
```


不使用打包器时，在 `<script type="module">` 内从 CDN 导入：

```html
<!-- MANDATORY: Conditionally install the anchor positioning polyfill -->
<script type="module">
  if (!CSS.supports("anchor-name: --a")) {
    import("https://unpkg.com/@oddbird/css-anchor-positioning");
  }
</script>
```


**Polyfill 注意事项：**

- **不支持隐式锚点：**polyfill 不支持隐式锚点关联（例如由 `popovertarget`、`commandfor`、`interestfor` 或 `showPopover({ source })` 建立的关联）。**必须**为每个触发控件设置唯一、显式的 `anchor-name`，并在被定位元素上设置匹配的 `position-anchor`。
- **不支持 `position-area` 配合 `position-try-fallbacks`：**polyfill 不支持二者组合。在需要回退的元素上使用 polyfill 时，设置 `inset: auto`，并在 inset 属性（`top`、`left`、`right`、`bottom`）上使用 `anchor()` 函数定位，不要使用 `position-area`。
- **不要把 polyfill 规则包在 `@supports` 中：**缺少原生锚定定位的浏览器会将 `@supports (position-area: ...)` 和 `@supports (anchor-name: --a)` 计算为 `false`，在 polyfill 有机会处理之前就丢弃规则块。

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

#### 方案 2：通过 `@supports` 渐进增强（无 polyfill）

如果不提供 polyfill，**不要**在依赖 `position-area` 或 `anchor()` 的 `[popover]` 元素上无条件设置 `inset: auto` 或 `margin: 0`。不支持锚定定位的浏览器中，`inset: auto` 会覆盖用户代理的居中规则（`inset: 0; margin: auto`），而 `position-area` 被忽略，导致弹出层停在 `(0, 0)` 或覆盖触发控件。

应当针对实际使用的定位功能，把 `inset: auto` 和 `margin: 0` 限定在 `@supports` 内（例如 `@supports (position-area: block-end)` 或 `@supports (top: anchor(bottom))`），使不支持的浏览器保留默认居中弹出层位置；或者提供匹配的 `@supports not (...)` 回退布局，例如固定在底部的面板：

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

