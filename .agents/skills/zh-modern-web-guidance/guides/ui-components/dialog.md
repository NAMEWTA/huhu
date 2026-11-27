<a id="dialog"></a>

# 对话框

<a id="overview"></a>

## 概述

模态和非模态对话框都使用原生 `<dialog>` 元素。它提供无障碍语义、焦点处理、顶层渲染和 `Esc` 处理，而自定义覆盖层必须手工重新实现这些行为。

<a id="choose-the-overlay-type"></a>

## 选择覆盖层类型

选择第一条匹配的规则。不确定时使用规则 1。

<a id="rule-1-the-overlay-interrupts-the-user-and-blocks-the-page-default"></a>

### 规则 1：覆盖层中断用户并阻止页面操作（默认）

用于确认、表单、登录、破坏性操作，以及未另行说明的任何“模态”“对话框”“灯箱”或“弹窗”需求。

使用以模态方式打开的 `<dialog>`，可通过 `command="show-modal"` 声明式打开（参见 `declarative-dialog-popover-control`，通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取），或在脚本中调用 `showModal()`。

```html
<button type="button" command="show-modal" commandfor="confirm">Delete</button>

<!-- 必须：不要添加 role="dialog" 或 aria-modal，原生模态已提供这些语义。 -->
<dialog id="confirm" aria-labelledby="confirm-title">
  <h1 id="confirm-title">Delete this item?</h1>
  <form method="dialog">
    <button value="cancel" autofocus>Cancel</button>
    <button value="delete">Delete</button>
  </form>
</dialog>
```

浏览器会提供：使页面不可交互、焦点约束、顶层、`::backdrop`、`Esc` 和返回手势关闭，以及将焦点返回调用者。

- **不要**添加 `role="dialog"`、`aria-modal`、焦点陷阱、`inert` 切换或 `Esc` 处理器。
- **不要**用 `show()` 或 `open` 属性打开。
- **要**用以下 CSS 阻止背后的页面滚动。详见 `prevent-page-scroll-under-modal-dialog`（通过 `npx -y modern-web-guidance@latest retrieve "prevent-page-scroll-under-modal-dialog"` 获取）。
- **不要**在 `html` 或 `body` 上使用 `overflow: hidden` 或 `position: fixed` 锁定滚动。

```css
/* 必须同时使用两条规则：否则在背景遮罩或对话框内滚动时，会滚动后方页面。 */
dialog:modal {
  overscroll-behavior: contain; /* 阻止对话框中的滚动手势沿链传递到页面。 */
}
dialog::backdrop {
  overflow: hidden; /* ::backdrop 默认不是滚动容器，因此会忽略 overscroll-behavior。 */
  overscroll-behavior: contain;
}
```

不适用于菜单或工具提示：参见规则 3。

<a id="rule-2-the-user-keeps-working-in-the-page-while-the-panel-is-open"></a>

### 规则 2：面板打开时，用户继续在页面中操作

用于查找栏、检查器、调色板和撰写面板，它们在语义上仍属于对话框。

使用 `<dialog popover>` 创建具有浮层关闭行为的顶层面板（`auto` 会轻触关闭，`manual` 不会）。只有面板必须不处于顶层时，才使用 `dialog.show()`。

```html
<button type="button" popovertarget="find">Find</button>
<dialog id="find" popover="manual" aria-labelledby="find-title">
  <h2 id="find-title">Find</h2>
  <input type="search" aria-label="Search">
  <button type="button" popovertarget="find" popovertargetaction="hide">Close</button>
</dialog>
```

页面保持可交互，不会变为 inert。

- **要**提供可见关闭按钮。
- **不要**用会阻止页面操作的 `showModal()`。

不适用于阻塞式确认：参见规则 1。

<a id="rule-3-the-overlay-is-not-a-dialog"></a>

### 规则 3：覆盖层不是对话框

用于菜单、下拉列表、工具提示、悬停卡片和 toast。

使用带 `popover` 属性的语义元素，不要使用 `<dialog>`。

```html
<button type="button" popovertarget="menu">Actions</button>
<ul id="menu" popover>
  <li><a href="/rename">Rename</a></li>
</ul>
```

<a id="choose-how-it-can-be-dismissed"></a>

## 选择关闭方式

默认行为取决于对话框如何打开。若 `closedby` 缺失或无效，`showModal()` 的行为等同 `closerequest`，其他打开方式等同 `none`。

- **仅 Esc 和返回手势（模态默认行为）：** 不设置，或设置 `closedby="closerequest"`。
- **也允许点击外部关闭：** 使用 `closedby="any"`。
- **仅由开发者关闭（例如有未保存更改的表单）：** 使用 `closedby="none"` 并添加确认路径。参见下文“关闭”。

<a id="guidelines"></a>

## 指南

<a id="accessible-name-and-initial-focus"></a>

### 无障碍名称与初始焦点

- **要**为每个对话框命名：用 `aria-labelledby` 指向其标题，没有可见标题时用 `aria-label`。
- **要**在主要控件或第一个字段上设置 `autofocus`。
- **要**在破坏性确认中，将 `autofocus` 放在安全操作上，例如取消或保留。
- **不要**编写关闭后恢复焦点的代码。浏览器会将焦点返回调用者。

<a id="opening"></a>

### 打开

- **要**在 `<button>` 上用 `command="show-modal"` 和 `commandfor` 声明式打开。参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）。
- **要**在脚本打开时使用 `dialog.showModal()`。

<a id="closing"></a>

### 关闭

- **要**通过 `<form method="dialog">` 中的按钮或 `command="close"` 关闭。
- **要**明确选择 `closedby`：`any`（轻触关闭和 `Esc`）、`closerequest`（仅 `Esc`，模态默认值）或 `none`（仅由开发者控制关闭）。
- **要**为必须遵守未保存更改逻辑的取消按钮使用 `command="request-close"` 或 `requestClose()`。它们先触发 `cancel`，且忽略 `closedby`。
- **要**将 `closedby` 视为渐进增强。即使没有它，`Esc` 和移动端返回手势也能关闭模态对话框。

<a id="hooking-into-close"></a>

### 接入关闭过程

- **要**在 `close` 监听器中读取 `dialog.returnValue`，了解使用了哪个按钮，然后用 `dialog.returnValue = ''` 重置。`Esc` 和其他关闭请求不会设置值，而浏览器是否清除上一个值存在差异，因此不重置可能泄漏旧值。将 `''` 视为“未选择任何操作而关闭”。
- **要**用 `cancel` 拦截 `Esc` 和 `request-close`，但不要依赖 `preventDefault()` 阻止没有用户激活的连续 `Esc` 按键。
- **要**为已修改的表单使用 `closedby="none"`，并提供明确确认步骤。
- **要**在阻止 `cancel` 后告诉用户对话框为何仍保持打开：显示可见消息，并从获得焦点的控件（例如放弃）用 `aria-describedby` 引用该消息，让屏幕阅读器在焦点移动时读出。否则焦点移到新按钮时只会播报按钮名称。
- **不要**让确认步骤移动指针下方的控件。预留消息空间（用 `visibility` 隐藏，不用 `display` 或 `hidden`），并把破坏性按钮加入不会移动现有按钮的位置（例如右对齐行的最前面），避免在同一位置第二次点击就丢弃用户更改。

<a id="non-modal-dialogs"></a>

### 非模态对话框

- **要**为顶层面板使用 `<dialog popover>`（`auto` 或 `manual`），不需要顶层时用 `dialog.show()`。
- **要**为每个非模态对话框提供可见关闭按钮。

<a id="backdrop-and-styling"></a>

### 背景遮罩与样式

- **要**为 `::backdrop` 设置样式，使用 `dialog:modal` 限定仅模态适用的样式。
- **要**参照 `animate-to-from-top-layer`（通过 `npx -y modern-web-guidance@latest retrieve "animate-to-from-top-layer"` 获取）处理动画，参照 `drag`（通过 `npx -y modern-web-guidance@latest retrieve "drag"` 获取）处理拖动，参照 `persistent-top-layer-ui`（通过 `npx -y modern-web-guidance@latest retrieve "persistent-top-layer-ui"` 获取）处理重新挂载父节点。
- **不要**无条件设置 `dialog` 的 `display`。这会覆盖关闭状态。用 `dialog[open]` 限定范围。

<a id="accessibility"></a>

### 无障碍

- **不要**向原生模态对话框添加 `role="dialog"`、`aria-modal`、手动焦点陷阱或 `inert` 切换。
- **要**用具有无障碍名称的原生 `<button>` 作为关闭控件。
- **要**让对话框标题使用一致的标题级别。
- **要**在模态对话框中为主标题使用一级标题，因为它是该作用域内的第一个标题。
- **要**确保非模态对话框显示在没有内容或内容极少的位置。为符合 WCAG 2.4.11，确保获得焦点的元素被非模态对话框完全遮挡。

<a id="fallback-strategies"></a>

## 回退策略

<a id="closedby-dialog-closedby"></a>

### `closedby`（`dialog-closedby`）

`<dialog closedby>` 的浏览器支持：有限可用。
支持版本：Chrome 134（2025 年 3 月）、Edge 134（2025 年 3 月）和 Firefox 141（2025 年 7 月）。
不支持：Safari。

没有 `closedby` 时，模态仍可通过 `Esc` 和返回手势关闭；仅失去点击外部关闭，因此属于优雅降级。`closedby="none"` 也同样被忽略：`Esc` 会触发 `cancel`，随后关闭对话框。将未保存更改的保护逻辑保留在 `cancel` 处理器中，不要只依靠 `closedby="none"`，这样缺少 `closedby` 时也能保护。如果目标 Baseline 要求轻触关闭，在缺少 `closedby` 时添加：

```js
if (!('closedBy' in HTMLDialogElement.prototype)) {
  // 检测指针位置，而非 event.target：对话框自身的内边距
  // 和子元素间隙也会以 <dialog> 为目标，检查目标会误把这些点击当成关闭。
  const outside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => { pressedOutside = outside(e, dialog); });
    // 按下和释放都必须位于外部，避免文本选择拖拽结束在背景上时关闭。
    dialog.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e, dialog)) dialog.close(); });
  }
}
```

<a id="overscroll-behavior"></a>

### `overscroll-behavior`

overscroll-behavior 的浏览器支持：有限可用。
支持版本：Chrome 144（2026 年 1 月）、Edge 144（2026 年 1 月）和 Firefox 150（2026 年 4 月）。
不支持：Safari。

将滚动约束视为渐进增强。不要做特性检测：即使不可滚动容器忽略此属性，`@supports` 仍会报告支持。在未实施约束的环境中，只要对话框自身内容溢出，它仍能约束滚动，而 `showModal()` 仍会使页面不可交互。不要回退到在 `html` 或 `body` 上使用 `overflow: hidden` 或 `position: fixed`，这会移除根滚动条并导致布局偏移。

<a id="invoker-commands-command--commandfor"></a>

### Invoker Commands（`command` / `commandfor`）

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

如果目标 Baseline 不包含 Invoker Commands，保留相同标记并按条件加载 polyfill（通过渐进增强提供相同体验）。检测接口，绝不无条件加载：

```js
// 必须：检测 HTMLButtonElement.prototype，仅在缺少原生支持时加载。
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  import('invokers-polyfill'); // npm install invokers-polyfill
}
```

只有规则 2 和规则 3 使用 Popover。

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
