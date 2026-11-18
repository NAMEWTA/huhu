<a id="position-aware-tooltips"></a>

# 感知位置的工具提示

用 CSS Anchor Positioning 构建工具提示或弹出层时，如果元素原本会溢出视口，浏览器可以自动将其“翻转”到回退位置。发生这种情况时，可能希望调整被定位内容的样式，例如重新放置从内容指向锚点的箭头。

**锚定容器查询**允许查询元素当前使用的定位状态，并据此应用样式。关于普通锚定下拉面板和浮出面板的位置，以及与视口碰撞时的翻转（不涉及方向箭头重新设样式），参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。

<a id="the-problem"></a>

## 问题

设想一个默认显示在锚点上方的工具提示，底部带有向下箭头。用户滚动后，如果工具提示翻转到锚点下方，箭头就会指错方向，也处于工具提示错误的一侧。

<a id="the-solution-anchored-container-queries"></a>

## 解决方案：锚定容器查询

在被定位元素上设置 `container-type: anchored`，即可将它转为知道自身锚定定位状态的查询容器。然后通过 `@container anchored()` 查询更新它的后代或伪元素。

<a id="1-create-the-tooltip-and-trigger"></a>

### 1. 创建工具提示和触发控件

使用 Popover API 创建工具提示。通过 `popovertarget` 调用弹出层，会自动与触发按钮建立**隐式锚点连接**，因此无须显式设置 `anchor-name` 或 `position-anchor`。

```html
<button popovertarget="tooltip" id="anchor" aria-describedby="tooltip">anchor</button>
<div id="tooltip" popover role="tooltip"></div>
```


为使用锚定定位，重置弹出层的 inset 和 margin 样式，但仅在支持锚定定位时这样做。

```css
@supports (anchor-name: --my-anchor) {
  [popover] {
    inset: auto;
    margin: unset;
  }
}
```


<a id="2-set-up-the-container"></a>

### 2. 设置容器

对被定位元素应用 `container-type: anchored`。该元素还必须定义 `position-try-fallbacks`，才能启用翻转行为。

```css
#tooltip {
  position: fixed;
  position-area: block-start;
  position-try-fallbacks: flip-block;

  /* Enable anchored container queries */
  container-type: anchored;
}
```


<a id="3-style-based-on-the-fallback"></a>

### 3. 根据回退位置设置样式

使用 `@container anchored(fallback: <value>)`，在特定回退位置生效时应用样式。

与所有容器查询一样，`@container` 只能为容器的**后代**设置样式。常见箭头实现方式是使用 `::before` 和 `::after` 伪元素，它们视为后代，可以直接设置样式。不过，为了给工具提示本身设置样式（见第 4 步），这里将在工具提示内添加子元素，并在其 `::before` 伪元素中创建箭头。

```html
<div id="tooltip" popover role="tooltip">
  <div class="tooltip-content">Tooltip</div>
</div>
```


```css
.tooltip-content::before {
  /* Default "down" arrow for the 'top' position */
  content: "▼" / "";
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 1rem;
}

/* Update to an "up" arrow when the 'flip-block' fallback (bottom) is active */
@container anchored(fallback: flip-block) {
  .tooltip-content::before {
    content: "▲" / "";
    inset-block-start: 0;
    inset-block-end: auto;
  }
}
```


<a id="4-styling-the-container-itself"></a>

## 4. 为容器本身设置样式

如果翻转时需要改变容器自身属性（如 `margin` 或 `background-color`），应使用**内部包装元素**。

1. 将 `container-type: anchored` 应用于外层被定位元素。
2. 在 `@container` 规则块中选择内层元素。

```css
@container anchored(fallback: flip-block) {
  .tooltip-content {
    border-radius: 0 0 .5rem .5rem;
    margin-block-start: 0.25rem;
  }
}
```


<a id="5-styling-the-inner-container-optional"></a>

## 5. 为内部容器设置样式（可选）

如果工具提示文本特别长，使用内部容器，确保显示时始终能放在触发控件与视口某一侧之间。例如，下列代码在用 `position-try: flip-block` 沿 block 轴翻转工具提示内容时，会满足这一条件。

```html
<button popovertarget="tooltip" id="anchor" aria-describedby="tooltip">anchor</button>
<div id="tooltip" popover role="tooltip">
  <div class="tooltip-content-inner"></div>
</div>
```


```css
.tooltip-content-inner {
  max-block-size: calc(50dvb - var(--trigger-height));
  overflow-block: auto;
} 
```


<a id="best-practices"></a>

## 最佳实践

- **优先逻辑回退**：在 `position-try-fallbacks` 中使用 `flip-block`、`flip-inline` 等关键字，让查询更简单，并自动处理 RTL 和不同书写模式。
- **用伪元素创建箭头**：工具提示箭头纯属装饰，非常适合用 `::before` 或 `::after`，可以通过锚定容器查询设置样式，无须额外 DOM。

<a id="accessibility-considerations"></a>

## 无障碍注意事项

使用这些工具提示，可能导致控件获得焦点时被遮挡，从而不满足 WCAG 2.4.11 焦点不被遮挡（最小值，AA 级），因为获得焦点的项目不能被完全遮住。虽然可能没有能彻底解决问题的通用指导，但应考虑调整工具提示位置或显示状态的策略。

键盘导航不会关闭 `popover=auto` 工具提示，因此要确保交互元素通过键盘获得焦点时，不会被工具提示遮挡。如果工具提示可能遮住获得焦点的交互元素，应改变位置以避免焦点被遮挡，或在提示对用户不再相关时将其关闭。

<a id="fallback-strategies"></a>

## 回退策略

锚点位置容器查询的浏览器支持状态：有限可用。
支持的浏览器：Chrome 143（2025 年 12 月）和 Edge 143（2025 年 12 月）。
不支持：Firefox 和 Safari。

根据实际应用的回退位置放置箭头属于渐进增强，目前没有其他方式响应回退位置。要在不支持锚点位置容器查询的浏览器中隐藏箭头，通过 `@supports (container-type: anchored)` 检测 CSS 支持。

```css
@supports (container-type: anchored) {
  .tooltip-content::before {
    content: "▼" / "";
  }
}
```


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


不支持 Popover API 的浏览器也不支持锚定定位，因此工具提示会显示在屏幕中央。