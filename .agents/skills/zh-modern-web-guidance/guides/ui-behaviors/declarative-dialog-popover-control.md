<a id="declarative-dialog-and-popover-control"></a>

# 声明式对话框与浮层控制

使用 Invoker Commands API 直接从 HTML 按钮切换 `<dialog>` 和 `[popover]` 的可见性，无需自定义 JavaScript 事件监听。

在 `<button>` 上应用 `commandfor`（目标 ID）和 `command`（操作），浏览器会自动处理开关状态、焦点管理及无障碍绑定（例如 `aria-expanded`）。推荐声明式方式，因为它去除脆弱的样板代码，在 HTML 解析后立即可交互，并提供稳健的原生无障碍体验。

<a id="implementing-declarative-popovers"></a>

## 实现声明式浮层

单个按钮即可切换浮层打开与关闭。

```html
<!-- MANDATORY: The commandfor attribute links the invoker to the ID of the target element so the browser knows what to control. -->
<!-- MANDATORY: The command attribute specifies the action to perform. Use 'toggle-popover' to handle both open and close states automatically. -->
<button commandfor="my-popover" command="toggle-popover">
  Toggle Popover
</button>

<!-- MANDATORY: The target element must have the popover attribute to be controlled as a popover. -->
<div id="my-popover" popover>
  <p>Popover content goes here.</p>
</div>
```

需要分别用按钮打开和关闭时，可使用 `show-popover` 和 `hide-popover` 命令。

**重要：** 不要在同一个 `<button>` 上为同一浮层同时设置 `popovertarget` 和 `commandfor`，这会双重切换并破坏功能。

```html
<!-- MANDATORY: Use 'show-popover' to explicitly open the popover. It will not close the popover if clicked again. -->
<button commandfor="my-explicit-popover" command="show-popover">
  Show Popover
</button>

<div id="my-explicit-popover" popover="manual">
  <p>This popover is explicitly opened and closed by separate buttons.</p>

  <!-- MANDATORY: Use 'hide-popover' to explicitly close the targeted popover. -->
  <button commandfor="my-explicit-popover" command="hide-popover">
    Hide Popover
  </button>
</div>
```

通过浮层内部按钮隐藏自身会丢失焦点，因为按钮隐藏后无法保留焦点。这种情况下，需额外脚本将焦点返回触发/显示控件，让用户从原位置继续导航。

<a id="implementing-declarative-modal-dialogs"></a>

## 实现声明式模态对话框

与浮层不同，模态对话框通常用独立按钮打开和关闭。需要模态打开时使用 `show-modal`。

```html
<!-- MANDATORY: Use command="show-modal" to trigger the dialog as a modal, trapping focus and preventing interaction with the rest of the page. -->
<!-- MANDATORY: The commandfor attribute connects this button to the dialog ID. -->
<button commandfor="confirm-dialog" command="show-modal">
  Open Confirmation
</button>

<dialog id="confirm-dialog">
  <p>Are you sure you want to proceed?</p>

  <!-- MANDATORY: Use command="close" to dismiss the dialog safely. -->
  <!-- type="button" keeps this working if the dialog content is later wrapped in a <form>. -->
  <button type="button" commandfor="confirm-dialog" command="close">
    Cancel
  </button>
</dialog>
```

必须：任何位于 `<form>` 内、带 `commandfor` 和 `command` 的按钮（包括常见 `<form method="dialog">` 包装）都必须显式设置 `type`：用 `type="button"` 执行命令。不要把 `command="close"` 按钮放入 `<form method="dialog">`，只选一种策略。`type="submit"` 会提交表单，不会再执行命令。位于 `<form>` 内或带 `form` 属性且未设 `type` 的命令按钮不会执行任何操作，从而避免不支持命令的旧浏览器意外提交。

<a id="fallback-strategies"></a>

## 回退策略

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

Invoker Commands 和 Popover 尚未普遍支持，必须为旧浏览器使用 polyfill 回退。

<a id="polyfilling-invoker-commands"></a>

### 补齐 Invoker Commands

必须：通过检查 `HTMLButtonElement` 原型上的 `commandForElement` 属性检测支持，不要检查 window 或 document。仅在缺少原生特性时动态导入，绝不无条件加载。
必须直接在目标元素监听 `command`，因为原生事件不冒泡。

**方案 1：使用打包工具**
通过 npm 安装（`npm install invokers-polyfill`）。适用于 Vite、Webpack 等打包工具或 import map；其他环境使用下面的 CDN 方案。

```javascript
// MANDATORY: Feature detect 'commandForElement' on HTMLButtonElement.prototype.
// Conditionally load the invokers-polyfill only in browsers lacking native support.
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  import('invokers-polyfill');
}
```

**方案 2：使用 CDN**
没有打包工具时，在 `<script type="module">` 中直接从 CDN 动态导入。

```html
<script type="module">
  // MANDATORY: Feature detect 'commandForElement' on HTMLButtonElement.prototype.
  // Conditionally load the invokers-polyfill from a CDN only in browsers lacking native support.
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    import('https://esm.run/invokers-polyfill');
  }
</script>
```

**Invokers polyfill 限制**
必须：此 polyfill 不像原生浏览器那样处理命令按钮的 ARIA 状态（例如 `aria-expanded`）。强烈建议自行处理，确保站点完整无障碍。

```javascript
// 2. Manually manage ARIA states in your listener
document.getElementById('action-target').addEventListener('command', (event) => {
  const command = event.command;
  const target = event.target;
  const source = event.source; // The button that triggered the command

  if (command === '--spin') {
    const isSpun = target.classList.toggle('is-spun');
    
    // Polyfill tip: Manually update ARIA to match the new state
    source?.setAttribute('aria-pressed', isSpun);
  }
});
```

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
