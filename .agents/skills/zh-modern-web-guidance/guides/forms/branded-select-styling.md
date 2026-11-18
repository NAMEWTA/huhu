<a id="branded-select-styling"></a>
# 为选择器设置品牌样式

可自定义 select API 提供了一种声明式、由 CSS 驱动的方式，为 `<select>` 元素设置样式，使其完整契合品牌设计系统。启用 `appearance: base-select` 后，可以访问 select 元素内部的 shadow DOM，使用标准 CSS 属性为按钮、选项选择列表、箭头图标和勾选指示器设置样式。

过去，要实现完全符合品牌的 select，必须使用 JavaScript 从头重建控件，这经常破坏无障碍能力、键盘导航和原生表单集成。使用 `appearance: base-select` 后，你可以实现自定义外观，同时让浏览器负责焦点管理、顶层渲染和无障碍关联。

<a id="how-to-implement"></a>
## 如何实现

为选择器实现品牌样式时：

1. **启用自定义：** 同时为 `<select>` 元素和 `::picker(select)` 伪元素设置 `appearance: base-select`，后者用于选中下拉选项列表。
2. **定义自定义按钮结构（可选）：** 在 `<select>` 内直接定义一个 `<button>` 元素，替换默认触发按钮。在按钮中使用 `<selectedcontent>` 元素，展示当前所选选项的文本或内容。
3. **设置选择列表样式：** 使用 `::picker(select)` 伪元素，为下拉列表设置字体排版、背景色、边框和阴影。浏览器会将其渲染在顶层，从而避免 `z-index` 冲突。
4. **设置内部图标样式：**
   - 使用 `select::picker-icon` 设置或替换箭头图标。
   - 使用 `option::checkmark` 设置当前选项旁边的勾选指示器样式。
5. **设置选项样式：** 为 `<option>` 元素设置悬停状态、内边距和布局。

<a id="example-code-branded-courier-select"></a>
## 代码示例：品牌化快递服务选择器

下面的示例使用等宽字体和虚线边框设置自定义选择器，以匹配特定的“包裹”品牌视觉风格。

```css
/* Enable customization for the select and its picker */
.brand-select,
.brand-select::picker(select) {
  appearance: base-select;
}

/* Style the visible trigger button */
.brand-select {
  font-family: 'Courier New', monospace;
  background-color: #fffaf0;
  color: #8b4513;
  border: 2px dashed #8b4513;
  border-radius: 4px;
  padding: 0.75rem;
  font-size: 1rem;
  cursor: pointer;
}

/* Style the dropdown options list */
.brand-select::picker(select) {
  font-family: 'Courier New', monospace;
  background-color: #fffaf0;
  border: 2px dashed #8b4513;
  border-radius: 4px;
  padding: 0.5rem;
}

/* Customize internal part colors to match text */
.brand-select::picker-icon {
  color: #8b4513;
}

.brand-select option::checkmark {
  color: #8b4513;
}

/* Style individual options and hover effects */
.brand-select option {
  padding: 0.5rem;
  border-radius: 4px;
  color: #8b4513;
  cursor: pointer;
}

.brand-select option:hover {
  background-color: #fdf5e6;
}
```

```html
<label for="preferences">Select shipping preference</label>
<select class="brand-select" id="preferences" name="preferences">
  <button>
    <selectedcontent></selectedcontent>
  </button>
  <option value="standard">Standard Shipping</option>
  <option value="express" selected>Express Shipping</option>
  <option value="overnight">Overnight Delivery</option>
</select>
```

<a id="strategic-implementation--best-practices"></a>
## 实施策略与最佳实践

- 当设计系统要求所有表单控件具有精细且一致的视觉效果，而标准的跨浏览器 select 覆盖样式无法满足时，**应当**使用 `appearance: base-select`。
- 如果依赖操作系统的原生选择体验，例如 iOS 设备上的标准滚轮选择器，**不要**使用此功能。启用 `base-select` 会退出原生移动界面控件，转而使用由网页渲染的顶层菜单。
- **应当**验证颜色对比度符合 WCAG 标准，与背景色至少达到 `3:1`。可自定义选择器允许自由指定颜色，但你有责任确保文本在自定义背景上仍然清晰可读。
- 测试布局行为。设置 `appearance: base-select` 会取消浏览器默认根据最长选项宽度确定 select 尺寸的行为。可能需要指定固定宽度，或使用 flex/grid 约束来防止布局偏移。
- 确保 `<select>` 具有 `name` 属性及关联的 `<label>`。这样即使使用自定义界面，组件仍可被屏幕阅读器访问，并能正确参与标准表单提交。
- 为选项使用标准的 `value` 属性，确保表单提交的行为与之前完全一致。

<a id="fallback-strategies"></a>
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
