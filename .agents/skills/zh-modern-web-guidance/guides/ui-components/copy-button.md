<a id="copy-button"></a>

# 复制按钮

构建一个按钮，用于复制另一个元素（代码块、行内值、只读字段）的文本或当前选区。使用 Invoker Commands（`command` + `commandfor`）声明目标，避免为每个按钮单独绑定 JavaScript，并用 Async Clipboard API 写入剪贴板。

<a id="implementation"></a>

## 实现

<a id="1-markup"></a>

### 1. 标记

```html
<!-- Custom commands MUST start with "--". commandfor is the id of the element whose text is copied. -->
<span class="copy"> <!-- positioning context for the bubble -->
  <!-- aria-label names the content being copied; several bare "Copy" buttons are indistinguishable to screen readers -->
  <button type="button" class="copy-button" command="--copy" commandfor="snippet" aria-label="Copy CSS code">
    <!-- Decorative icon, rendered however the codebase renders icons -->
    <span class="icon" aria-hidden="true"></span>
  </button>
  <!-- The confirmation bubble IS the live region. Keep it empty until a copy, and outside the button:
       a button's children are presentational, so a live region inside one is not reliably announced -->
  <span class="tip" role="status"></span>
</span>
<pre><code id="snippet">…</code></pre>
```

- 使用 `type="button"`，确保按钮永远不会提交表单。
- 使用 `min-inline-size`/`min-block-size`（而非 `inline-size`/`block-size`）把按钮设为至少 24×24 CSS px，让内容可以扩大目标，但不能把它缩小。
- 用 `aria-label` 为仅含图标的按钮命名。如果按钮有可见文字，该文字就是名称；不要添加与其不同的 `aria-label`。
- 按代码库现有的图标方式绘制图标（参见 `icons`，通过 `npx -y modern-web-guidance@latest retrieve "icons"` 获取），并将其标记为装饰性；按钮的无障碍名称来自 `aria-label`，而非图标。

<a id="2-copying-logic"></a>

### 2. 复制逻辑

将复制逻辑放在同一个函数中，供原生与回退路径共用。

```js
let selectedText = ''; // set by the optional selection popover (step 3)

async function copy(button, target, command = '--copy') {
  // Form controls expose text via .value; innerText (unlike textContent) keeps rendered line breaks
  const text = command === '--copy-selection'
    ? selectedText
    : target.matches('input, textarea') ? target.value : target.innerText.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    report(button, true); // see Feedback below
  } catch {
    report(button, false); // clipboard access can be denied: show the failure too, not only announce it
  }
}

// `command` events do not bubble: listen in the capture phase on document.
// event.source is the clicked button; event.target is the commandfor element.
document.addEventListener('command', (event) => {
  if (event.command.startsWith('--copy')) copy(event.source, event.target, event.command);
}, true);
```

- **为明眼用户和屏幕阅读器用户使用同一个元素：** `report()` 在按钮上设置 `data-copied`（或 `data-failed`），并把消息写入气泡；气泡同时提供可见反馈和实时区域。这样，两类用户在成功和失败时都收到相同消息。消息应简短，例如“已复制”“复制失败”。
- **使用 `opacity` 显示和隐藏气泡，** 不要用 `display: none` 或 `visibility: hidden`；后两者会将其从无障碍树移除，导致文字无法播报。
- **清理状态：** 短暂超时后移除状态属性并清空气泡文本，避免在屏幕阅读器浏览模式中留下过时的“已复制”。
- **不要只靠颜色：** 成功时切换图标（从复制变为对勾），并为两种结果提供气泡文本。
- **重复点击：** 清除待执行的超时并重新开始动画，不要堆叠定时器。显示反馈时不要禁用按钮：复制是幂等操作，禁用会丢失键盘焦点、播报具有误导性的不可用状态，并阻止失败后的重试。
- **减少动态效果：** 在 `prefers-reduced-motion: reduce` 下，将图标和气泡动画替换为透明度淡入淡出。

```js
const timers = new WeakMap();

function report(button, ok) {
  const tip = button.nextElementSibling; // the role="status" bubble
  clearTimeout(timers.get(button));
  button.removeAttribute('data-copied');
  button.removeAttribute('data-failed');
  const message = ok ? 'Copied' : 'Copy failed';
  tip.textContent = '';
  void button.offsetWidth; // restart the CSS animation
  button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
  requestAnimationFrame(() => (tip.textContent = message));
  timers.set(button, setTimeout(() => { // 2000ms is an example value
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    tip.textContent = '';
  }, 2000));
}
```

<a id="3-copy-the-current-selection-optional"></a>

### 3. 复制当前选区（可选）

只对用户希望选中文字后出现浮动按钮的长篇文本添加此功能。代码块、行内值和字段应跳过。

- 使用 `popover="manual"` 元素（不轻触关闭，以便保留选区），其中包含带有 `command="--copy-selection" commandfor="<container id>"` 的按钮。
- 在 `selectionchange` 时显示（进行防抖；拖动期间等待 `pointerup`），且仅在选区未折叠并位于容器内时显示。三击选区会在下一个元素的开头结束，因此不要要求结束节点必须在容器内：把范围末端裁剪到容器，当裁剪后的文本等于所选文本时即可接受。依据裁剪后的范围复制并定位，使用其 `getBoundingClientRect()`：在行内轴上居中，在块轴上置于选区上方，确保不遮挡选中文字。仅在 `matchMedia('(pointer: fine)').matches` 时启用此浮层：触摸浏览器的原生选区菜单已有复制功能，浮层会重复并与其冲突。
- 显示浮层时将选中文字赋给 `selectedText`；`copy()` 对 `--copy-selection` 读取这个保存的字符串，因为与按钮交互可能使实时选区折叠。
- 在浮层的 `pointerdown` 上调用 `preventDefault()` 保持选区。这也会阻止按钮在点击或轻触时取得焦点，因此 `:focus-within` 无法判断按压是否进行中。应在浮层的 `pointerdown` 设置标志；标志存在期间，即使选区折叠也不要隐藏浮层（某些触摸浏览器仍会清除选区）。复制反馈结束时（以及 `pointercancel` 时）清除标志并重新检查。其他情况下，在 `Escape` 时隐藏；选区折叠时也隐藏，但键盘焦点位于浮层内时除外（焦点离开后重新检查）。
- 不要在复制反馈超时结束时隐藏浮层：键盘用户的焦点位于按钮上，隐藏会把焦点丢到页面，使下一次 `Tab` 从顶部开始。如果 `Escape` 隐藏浮层时焦点在其中，先将焦点移到容器：移动前为其设置 `tabindex="-1"`，在 `blur` 时移除。不要把它永久留在标记中，因为在 Firefox 中点击文本后，可聚焦容器会让 `Tab` 跳过复制按钮。

<a id="4-repeated-copyable-elements-optional"></a>

### 4. 重复出现的可复制元素（可选）

当页面重复包含可复制元素（代码块、列表行、令牌或 ID 单元格）时，每项都显示按钮会增加干扰。可以默认隐藏按钮，在元素悬停时显示，同时也要为键盘用户显示，绝不能只支持悬停。

```css
/* Touch devices (no hover): the button stays visible, so keep it in flow where it cannot cover content */
.copyable { display: flex; align-items: start; gap: .5rem; }
.copyable .copy { flex: none; order: 1; }

/* Only hide where hover exists; the overlay is then revealed on demand */
@media (hover: hover) {
  .copyable { display: block; position: relative; }
  .copyable .copy { position: absolute; inset-block-start: .5rem; inset-inline-end: .5rem; } /* .copy is the bubble's positioning context, so move it, not the button */
  .copyable .copy-button { opacity: 0; transition: opacity .15s; }
  .copyable:hover .copy-button,
  .copyable:focus-within .copy-button,
  .copyable .copy-button:focus-visible,
  .copyable .copy-button[data-copied],
  .copyable .copy-button[data-failed] { opacity: 1; }
}
```

- 只用 `opacity` 隐藏。`display: none` 和 `visibility: hidden` 会将按钮移出 Tab 顺序，使键盘用户无法到达。
- 除容器的 `:hover` 外，也在其 `:focus-within` 时显示；这样焦点位于按钮或块内可聚焦内容（例如可滚动的 `<pre tabindex="0">`）上时，按钮会出现。
- 在 `(hover: none)` 设备上始终显示，因为这些设备无法通过悬停使按钮出现。此时把按钮放在内容旁的正常流中，确保不遮挡内容。
- 反馈显示期间（`data-copied` / `data-failed`）保持按钮可见，避免指针离开时状态消失。
- 保持按钮至少 24×24 px 并提供无障碍名称；仅通过透明度隐藏的按钮仍会被屏幕阅读器播报。
- 不要为了“隐藏”而给按钮添加 `aria-hidden`、`inert` 或 `hidden`，也不要在悬停时切换它们。屏幕阅读器用户（包括 VoiceOver）必须无需悬停就能到达按钮，而焦点移入（包括会移动焦点的屏幕阅读器光标）正是让按钮显示的机制。
- 为 `<pre>` 添加 `padding-inline-end`，让静止时的代码避开按钮。在水平滚动的 `<pre>` 上，该内边距只有滚动到末端才会到达，因此长行滚动时可能从按钮下方经过。为按钮设置大致不透明的背景和可见边框，确保覆盖代码时仍清晰；不要预留永久边距而压缩小屏幕上的代码区域。

<a id="fallbacks-and-browser-support"></a>

## 回退方案和浏览器支持

<a id="invoker-commands"></a>

### Invoker Commands

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

如果目标 Baseline 不包含 Invoker Commands，保留相同标记，并添加调用同一个 `copy()` 函数的点击监听器。这是一种简短、稳健的回退方式（以渐进增强提供同样的体验）：

```js
// Detect on the interface, not an instance
if (!('CommandEvent' in window)) {
  // Resolve the target from commandfor, as the browser does for command events
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[command^="--copy"]');
    if (!button) return;
    const target = document.getElementById(button.getAttribute('commandfor'));
    if (target) copy(button, target, button.getAttribute('command')); // a missing target would throw inside copy()
  });
}
```

两条路径只注册其中一条，避免一次点击复制两次。

<a id="async-clipboard"></a>

### Async Clipboard

api.Clipboard.writeText 能力的 Baseline 状态：广泛可用。自 2020-03-24 起纳入 Baseline。
支持版本：Chrome 66（2018 年 4 月）、Edge 79（2020 年 1 月）、Firefox 63（2018 年 10 月）、Safari 13.1（2020 年 3 月）和 Safari iOS 13.4（2020 年 3 月）。

`navigator.clipboard` 仅在安全上下文（`https:` 或 `localhost`）可用，权限被拒绝时写入会失败。`copy()` 已涵盖这两种情况：缺失的 `navigator.clipboard` 会在 `try` 内抛错，于是显示并播报失败消息。通过 HTTPS 提供页面才是真正的解决办法。

仅当无法控制宿主页面协议（例如嵌入第三方站点的组件）且别无选择时，才回退到已废弃的 `document.execCommand('copy')`，让用户仍能复制。它必须在用户点击处理器内同步执行，因此仅在缺少 `navigator.clipboard` 或写入被拒绝时使用：

```js
function legacyCopy(text) {
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try { return document.execCommand('copy'); } finally { field.remove(); }
}

// In copy(), replace the plain write with:
try {
  await navigator.clipboard.writeText(text);
} catch {
  if (!legacyCopy(text)) throw new Error('Copy failed'); // reaches the existing failure path
}
```

只有可选的选区按钮（第 3 步）使用 Popover。

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

<a id="repeated-announcements-voiceover"></a>

### 重复播报（VoiceOver）

VoiceOver 会跳过同一区域中与上一条相同的消息，即使中间清空过该区域。用变量记录上一条消息（不要读取会被清空的气泡）；消息重复时追加不换行空格（`\u00A0`），使它有所不同。这个空格不会被读出。最简单的方式是使用一个页面级变量：其他按钮气泡的消息也可能得到该空格，但没有影响。不要为此使用 `ariaNotify()`。

```js
let lastMessage = '';

// In report(), replace `const message` with `let message`, then:
if (message === lastMessage) message += '\u00A0'; // differs from the last one, so it is announced
lastMessage = message;
```
