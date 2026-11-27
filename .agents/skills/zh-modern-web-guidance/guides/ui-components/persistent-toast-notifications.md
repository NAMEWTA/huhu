<a id="creating-toast-notifications"></a>

# 创建 Toast 通知

Toast 通知是短暂的状态消息。与菜单不同，用户操作页面其他部分时不应关闭。popover="manual" 状态没有“轻触关闭”行为，并允许多条通知共存，因此很适合。

<a id="when-to-use"></a>

## 使用时机

Toast 必须用于提供关于交互结果或事件（例如收到邮件）的非关键补充信息，例如确认表单提交成功。需要立即关注的通知应使用其他组件，例如行内横幅、对话框或模态对话框；这些组件能以所有人更容易识别的方式呈现信息。应克制使用 Toast，因为要让所有人都能访问，需要处理复杂考量，这也是一些公司不再使用 Toast、转而使用上述替代组件的原因。

<a id="implementation-guidelines"></a>

## 实现指南

优先使用持续显示、直到用户关闭的 Toast；只有频繁且低重要性的事件例外，此时常驻带来的操作负担可能大于信息价值。即使在这种情况下，也应评估 Toast 是否改善整体体验，有时完全不显示更合适。如果采用短时间后自动关闭的模式，关闭前检查焦点是否在 Toast 控件上。用户聚焦其中控件时，应暂停关闭直到焦点离开。

* **必须：** 使用 popover="manual"，让通知保持可见，直到明确关闭或由脚本超时关闭。
* **必须：** 确保 Toast 信息也可通过其他方式获取；若它会短时间后消失，用户仍能在 Toast 不在时识别这些信息。
* **要**使用容器管理多个 Toast 的堆叠。顶层浮层会忽略父级 z-index，因此必须逐个定位，或放入共同布局组。
* **要**始终将通知添加到页面同一个容器，方便辅助技术用户稳定定位。
* **要**将容器设为有无障碍名称的区域，让屏幕阅读器易于识别。例如：`<div role="region" aria-label="Notifications"></div>`。
* **要**用 `ariaNotify()` 播报显示的 Toast 内容，确保看不到屏幕的屏幕阅读器用户知道通知出现。
* **要**确保 `ariaNotify()` 只播报 Toast 可见文字，不播报控件名称。若 Toast 提供操作（关闭控件之外），在播报末尾追加“有可用操作”。
* **要**在 Toast 内提供明确的“关闭”按钮，并使用 popovertargetaction="hide"。
* **要**确保关闭按钮可通过键盘聚焦，但 Toast 出现时不自动抢夺焦点，让键盘用户可以导航到通知区域并关闭。
* **要**在用户手动关闭当前聚焦的 Toast 时管理焦点：移到堆叠中下一条剩余通知；若已无通知，返回用户先前的焦点位置或触发该 Toast 的控件。
* **要**在 `transition` 后独立声明 `transition-behavior: allow-discrete`，不要放入 `transition` 简写；这样可为进入和退出顶层添加动画，而不让旧浏览器忽略整个 `transition` 声明。
* **要**通过 `prefers-reduced-motion` 媒体查询提供无动画版本。
* **要**确保文字缩放到 200% 时 Toast 随之缩放且全部内容仍可见，以满足 WCAG 1.4.4 文本缩放（AA 级）。
* **要**确保通过 CSS 调整文本样式和间距时全部内容仍可见，以满足 1.4.12 文本间距（AA 级）。
* **要**确保在 320×256 CSS 像素视口中全部内容仍可见或可访问，以满足 1.4.10 重排（AA 级）。

* **不要**在可能同时重定向焦点的场景显示 Toast。焦点重定向可能取消播报，导致用户漏掉信息。
* **不要**在模态对话框中使用 Toast。对话框外的内容会成为 inert，辅助技术不可访问；把 Toast 放到模态内、脱离现有通知容器，又会难以定位，甚至让用户无法找到。
* **不要**在模态对话框打开期间于后台显示 Toast，通知很可能被错过。应抑制显示，直到模态关闭。
* **不要**在 Toast 中放入执行独有操作的控件，这些操作必须已在 Toast 外永久可用。应少用 Toast 控件，只作为 UI 中已有操作的快捷入口。

<a id="optional-usability--accessibility-improvements"></a>

## 可选：可用性与无障碍改进

* **显示历史 Toast：** 提供过去消息的列表，帮助难以记住通知内容的用户，也能减轻误关通知者的焦虑。
* **自定义 Toast 通知：** 让用户选择接收哪些通知，以确保信息相关，减少分心和困惑。
* **通过其他方式告知 Toast 出现：** 建议用多种方式传达通知已显示，例如可关闭的短音效。这有助于使用屏幕放大软件、可能难以发现 Toast 的用户。

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

<a id="fallbacks--browser-support-for-arianotify"></a>

### ariaNotify() 的回退方案和浏览器支持

ariaNotify() 的 Baseline 状态：新近可用。自 2026-09-14 起纳入 Baseline。
支持版本：Chrome 141（2025 年 9 月）、Edge 141（2025 年 10 月）、Firefox 150（2026 年 4 月）和 Safari 27（2026 年 9 月）。

ariaNotify() 的 Baseline 状态：新近可用。自 2026-09-14 起纳入 Baseline。
支持版本：Chrome 141（2025 年 9 月）、Edge 141（2025 年 10 月）、Firefox 150（2026 年 4 月）和 Safari 27（2026 年 9 月）。

使用 ARIA 实时区域，确保容器在页面加载时已存在，并在需要时将消息加入其中。

```html
<!-- 预先填充的隐藏实时区域容器。 -->
<div id="notification" aria-live="assertive"></div>
```

这些内容会保留在 DOM 中，消息播报后屏幕阅读器仍可阅读。因此，当实时区域有内容时，应在容器紧前方添加说明文本，为播报提供上下文。这有助于用户在阅读页面时理解这些内容的用途。

```html
<p class="inclusively-hidden">Screen reader announcements</p>
<!-- 预先填充的隐藏实时区域容器。 -->
<div id="notification" aria-live="assertive">
  Dynamic announcement injected into the existing container.
</div>
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

<a id="sibling-index"></a>

#### sibling-index()

* **指导：** 不支持 sibling-index() 时，用 `+` 运算符手动添加外边距，例如 `popover + popover { margin-top: 1rem }`。

<a id="transition-behavior"></a>

#### transition-behavior

* **指导：** 不支持 transition-behavior 时，在 Toast 进入和退出过程中，用 JavaScript 通过类添加动画。
