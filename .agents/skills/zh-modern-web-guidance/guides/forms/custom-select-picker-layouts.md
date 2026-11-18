<a id="custom-select-picker-layouts"></a>
# 自定义选择面板布局

CSS 属性 `appearance: base-select` 允许像普通 HTML 元素一样，为 `<select>` 及其选择面板（通过 `::picker(select)`）设置样式。
结合 Grid 或 Flexbox 等现代 CSS 布局技术，无需自定义 JS 就能突破传统的垂直堆叠列表，创建丰富的视觉体验。
例如，可以通过 `display: grid` 把选项排成二维卡片网格。

这非常适合颜色选择器、表情选择器或商品规格选择等场景；在这些场景中，丰富的视觉菜单比纯列表更有效。

<a id="how-to-implement"></a>
## 如何实现

<a id="1-activate-base-styling"></a>
### 1. 启用基础样式

同时为 `<select>` 元素及其内部选择面板伪元素 `select::picker(select)` 应用 `appearance: base-select`：

```css
select.grid-picker {
  &, &::picker(select) {
    appearance: base-select;
  }
}

```

<a id="2-style-the-picker-container"></a>
### 2. 设置面板容器样式

选中 `select:open::picker(select)`，并应用 `display: grid`（或 `display: flex`）。
像其他容器一样定义列和间距。

```css
select.grid-picker:open::picker(select) {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
```

重要：必须包含 `:open`。如果直接设置 `select::picker(select)` 的样式，即使 select 已关闭，面板也会变为可见！

<a id="3-style-the-options"></a>
### 3. 设置选项样式

选中 `<option>` 元素，将其设置为网格项或卡片。
可以在其中加入图像、SVG 或复杂布局。

```css
/* Style options as grid cards */
.grid-picker option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* padding, border-radius, background, etc. */
}
```

<a id="4-style-the-selected-option"></a>
### 4. 设置已选选项样式

为已选的*选项*设置样式时，使用 `option:checked`。例如：

```css
.grid-picker option:checked {
  position: relative;
  border: 2px solid var(--primary-color);
  background-color: oklab(from var(--primary-color) l a b / 8%);
}
```

与所有界面控件一样，不要只用颜色表达状态；应结合多种视觉指示，例如颜色、边框粗细和勾选标记，表示当前选项。确保至少有一种已选状态指示与背景色的对比度达到 3:1。

<a id="5-optional-style-the-selected-option-checkmark"></a>
### 5. 设置已选选项的勾选标记样式（可选）

默认情况下，浏览器会把勾选标记渲染为每个 `<option>` 的第一个子项。

它的行为类似于设置了 `content: "✓" / ""` 的 `::before`；如果作者也提供了 `::before`，勾选标记会渲染在它之前。

选项未选中时，勾选标记通过 `visibility: hidden` 隐藏。

可以通过 `::checkmark` 伪元素设置其样式；如果希望只通过其他样式或自定义指示器表达选中状态，也可以完全隐藏它。

例如，要把它放在选项右上角，可以这样做：

```css
select.grid-picker {
  > option::checkmark {
    /* Hide the checkmark for unselected options */
    display: none;
  }

  > option:checked {
    position: relative;

    &::checkmark {
      position: absolute;
      inset-block-start: -.4em;
      inset-inline-end: -.5em;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-inline-size: 1.6em;
      aspect-ratio: 1;
      padding-right: 0.12em;
      padding-left: 0.05em;
      border-radius: 50%;
      background: var(--primary-color);
      color: white;
      font-size: 70%;
      font-weight: bold;
    }
  }
}
```

**提示：** 在勾选标记周围绘制容器（例如圆形）时，应把它稍微向上调整（本例通过 `padding-bottom` 与 `padding-left` 实现），以结合标记形状达到视觉居中。
**不要**为此使用 `padding-inline-start` 或 `padding-block-end`，因为它们会随书写模式改变，而勾选标记的形状不会。

<a id="6-optional-customize-the-selected-option-display"></a>
### 6. 自定义当前选项的显示（可选）

默认情况下，`<select>` 只展示已选选项的纯文本版本。
如果要为当前值展示丰富内容，或以不同形式显示所选项（例如隐藏某些详情），应在 `<button>` 中使用 `<selectedcontent>`。

**不要**在未包裹 `<button>` 的情况下使用 `<selectedcontent>`，否则 `<selectedcontent>` 只会像其他内容元素一样成为选择面板的一部分。

<a id="best-practices"></a>
### 最佳实践

- 测试布局行为。设置 `appearance: base-select` 会取消浏览器默认根据最长选项宽度确定 select 尺寸的行为。可能需要指定固定宽度，或使用 flex/grid 约束来防止布局偏移。
- 确保 `<select>` 具有 `name` 属性及关联的 `<label>`。这样即使使用自定义界面，组件仍可被屏幕阅读器访问，并能正确参与标准表单提交。
- 为选项使用标准的 `value` 属性，确保表单提交的行为与之前完全一致。

<a id="accessibility"></a>
## 无障碍

原生 `<select>` 只处理线性的上下方向键导航，所以面板打开时，左右方向键不会起作用；无论布局有多少行和列，上下方向键仍按顺序访问选项。

要增加符合网格布局的横向导航，可以拦截 `Left` 和 `Right` 方向键的 `keydown`，并将焦点移到对应方向上最近的选项，例如通过 `getBoundingClientRect()` 计算。
确定合适的下一个或上一个选项时，应使用基于真实几何位置的 DOM 方法，例如 `getBoundingClientRect()`，而不是解析 `grid-template-columns` 或 `grid-column` 等 CSS 字符串；在复杂网格、subgrid、RTL 和其他布局场景下，解析字符串既脆弱又容易出错。
同时，不要不必要地过度设计；利用已知始终成立的布局条件简化逻辑。

**注意：** 这*仅仅*解决键盘导航问题。`<select>` 及其 `::picker()` 仍保留默认角色（`menu` 或 `listbox`），这些角色不能覆盖，其中也不允许包含 `role="grid"` 的元素。
为 `::picker()` 伪元素应用网格语义是不合法的，因为这违反了它的内容模型。
网格角色不会传达给屏幕阅读器用户，因此即使通过脚本实现了 `Left` 和 `Right`，也应确保 `Down` 和 `Up` 仍分别按顺序移到下一个和上一个选项，例如让网格按列流动，或使用 `<optgroup>` 将列分组，使屏幕阅读器用户能够访问列表中的所有选项。
否则，为了实现所需的屏幕阅读器体验，最终可能必须改用结合 popover API、锚点定位与 `role="grid"` 的自定义方案。

确保选项之间移动时的焦点指示器，与背景色或相邻颜色的对比度至少达到 3:1。

<a id="fallback-strategy"></a>
## 回退策略

<a id="fallbacks--browser-support-for-customizable-select"></a>
### 可自定义 `<select>` 的回退方案与浏览器支持

可自定义 <select> 的浏览器支持：可用性有限。
支持：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

在尚不支持 `appearance: base-select` 的浏览器中，`<select>` 元素会平稳退回操作系统提供的标准下拉控件。

- **非文本内容会被忽略：** 旧浏览器会去掉 `<option>` 内的 HTML 标签（例如 `<svg>` 或 `<div>`），仅渲染文本节点。确保 `<option>` 的文本内容本身可读且有意义。
- **HTML 结构处理：** 标准解析器可能忽略 `<select>` 内的 `<button>` 和 `<selectedcontent>` 标签，或把它们视为无效内容。如果接受标准文本作为可读的回退内容，渐进增强就不一定需要庞大的 JavaScript polyfill。


```javascript
document.addEventListener("DOMContentLoaded", () => {
  // Check if browser supports base-select value
  if (!CSS.supports("appearance", "base-select")) {
    // Custom select overrides are not supported natively.
  }
});
```
