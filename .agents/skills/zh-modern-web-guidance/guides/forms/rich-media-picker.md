<a id="rich-media-picker-customizable-select"></a>
# 富媒体选择器（可自定义 Select）

原生 `<select>` 元素过去难以设置样式，而且选项只能包含纯文本。`appearance: base-select` 属性提供了一种声明式、仅用 CSS 即可将 `<select>` 切换到可自定义状态的方式。开发者可以在 `<option>` 元素中加入图像、SVG 和复杂布局等丰富 HTML 内容，同时保留原生键盘无障碍能力和表单集成。可用这一模式，以标准原生元素替代庞大的自定义 select 组件。

<a id="how-to-implement"></a>
## 如何实现

使用可自定义 Select API 实现富媒体选择器时：

1. **启用基础样式：** 同时为 `<select>` 元素和通过 `::picker(select)` 伪元素选中的内部面板应用 `appearance: base-select`。这会改变浏览器对 `<select>` 内部内容的 HTML 解析方式。
2. **定义按钮内容：** 在 `<select>` 中使用标准的 `<button>` 和 `<selectedcontent>` 元素，定义面板关闭时显示的内容。`<selectedcontent>` 会自动镜像已选选项的内容。如果希望在按钮中展示当前选中的富内容，这一步是必需的。
3. **在选项中使用富内容：** 此时可以在 `<option>` 内放置图像、SVG 和其他 HTML 标签。在此 API 出现之前，浏览器会剥离 `<option>` 中的标签，只渲染纯文本。
4. **设置弹出层样式：** 通过 `::picker(select)` 伪元素设置展开后的选项列表样式。它在顶层渲染，无需处理 `z-index` 冲突。选项原生使用锚点定位 API 定位。

<a id="example-code-rich-role-picker"></a>
## 代码示例：富内容角色选择器

```html
<label for="role-picker">Select your role</label>
<select class="custom-select" name="role" id="role-picker">
  <button>
    <selectedcontent></selectedcontent> <!-- Mirrors the selected option's content automatically so you do not need JS to update the button -->
  </button>

  <!-- Define concise aria-label values on options whose mirrored rich content would otherwise read awkwardly as a concatenated string -->
  <option value="frontend">
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    </svg>
    <div class="option-text">
      <span class="option-title">Frontend Developer</span>
      <span class="option-desc">React, Vue, CSS</span>
    </div>
  </option>

  <option value="backend">
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="2" y="12" width="20" height="14" rx="2" ry="2"></rect>
    </svg>
    <div class="option-text">
      <span class="option-title">Backend Developer</span>
      <span class="option-desc">Node.js, Python</span>
    </div>
  </option>
</select>
```

```css
select.custom-select,
select.custom-select::picker(select) {
  appearance: base-select; /* MUST opt-in both the select and its picker to enable the customizable state, otherwise browser standard rendering applies */
}

select.custom-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px;
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f1f5f9;
  cursor: pointer;
}

select.custom-select::picker(select) {
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  width: anchor-size(width); /* Uses Anchor Positioning API to keep the dropdown precisely aligned to the button trigger width */
}

select.custom-select option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
}

select.custom-select option:hover {
  background-color: #1e293b;
}

/* Remove standard OS checkmark for base-select */
select.custom-select option::checkmark {
  display: none;
}

/* MANDATORY: Provide multiple visual indicators (e.g., prominent background color and bold title font) to communicate the checked state cleanly */
select.custom-select option:checked {
  background-color: #3b82f6;
  color: #ffffff;
}
select.custom-select option:checked .option-title {
  font-weight: 700;
}
```

<a id="strategic-implementation--best-practices"></a>
## 实施策略与最佳实践

- 当需要带图标、说明或图像的复杂选项布局时，**应当**使用 `appearance: base-select`；过去，这类布局通常只能通过庞大的 JavaScript 界面框架实现。
- 即使观察到性能迟滞，也**不要**改用临时拼凑的元素；浏览器会原生处理键盘焦点。
- **不要**为选择面板使用 z-index。面板在顶层渲染，优先于页面内容的相对 `z-index`。
- 如果次要详情（例如描述）在按钮状态下占用过多空间，**应当**通过 `.custom-select selectedcontent .option-desc { display: none; }` 隐藏它们。
- 测试布局行为。设置 `appearance: base-select` 会取消浏览器默认根据最长选项宽度确定 select 尺寸的行为。可能需要指定固定宽度，或使用 flex/grid 约束来防止布局偏移。
- 确保 `<select>` 具有 `name` 属性及关联的 `<label>`。这样即使使用自定义界面，组件仍可被屏幕阅读器访问，并能正确参与标准表单提交。
- 为选项使用标准的 `value` 属性，确保表单提交的行为与之前完全一致。

<a id="accessibility-considerations"></a>
## 无障碍注意事项

强制要求：当 select 展开、选项列表可见时，必须有一种可见方式标明当前所选选项。例如使用自定义图标、添加具有足够对比度且明显区别于焦点或悬停指示的轮廓，或使用对比度充足的背景色。

确保富媒体选择器始终关联一个可见标签，说明所需信息的语境，让用户能独立选出所需选项。这符合 WCAG 3.3.2“标签或说明”，该准则要求在内容需要用户输入时提供标签或说明。同样，确保所有选项都包含可见文本，不只依赖图像或颜色，让用户容易选择所需选项。

确保选项即使单独阅读也有足够语境，尤其是不支持该特性的浏览器会默认将某个选项中的全部文本一起显示。例如，以下富内容选项，在不支持可自定义 select 的浏览器中会渲染成“Frontend Developer React, Vue, CSS”。缺少视觉设计时，这可能影响选项含义。

```html
<!-- Rich options -->
<option value="frontend">
  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
  <div class="option-text">
    <span class="option-title">Frontend Developer</span>
    <span class="option-desc">React, Vue, CSS</span>
  </div>
</option>
```

解决这一问题时，应确保内容无论有没有视觉样式都能正确表达含义；必要时使用仅在视觉上隐藏、仍可被辅助技术访问的文本。在前一个示例中，可以添加 `<span class="visually-hidden">Responsibilities include:</span>` 和句号，让不支持可自定义 select 的浏览器显示“Frontend Developer. Responsibilities include: React, Vue, CSS”，其含义就更清楚。句号还能提示屏幕阅读器在朗读时停顿，帮助用户理解选项文本的结构。更新后的选项 HTML 如下：

```html
<!-- Rich options -->
<option value="frontend">
  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
  <div class="option-text">
    <span class="option-title">
      Frontend Developer<span class="visually-hidden">.</span>
      <span class="visually-hidden">Responsibilities include:</span>
    </span>
    <span class="option-desc">React, Vue, CSS</span>
  </div>
</option>
```

这种方式有助于确保不同浏览器提供等价的信息，而不取决于是否支持该功能。

**不要**通过给选项设置 `aria-label` 来覆盖其文本，否则用户会错过未包含在 `aria-label` 中的可见文字；将来更新选项文本时，也可能再次出现不一致。应确保整个选项文本单独阅读时就有完整含义。

**不要**在 `<option>` 内加入可交互元素或交互语义。屏幕阅读器用户听不到相关声明，因此无法判断还有额外信息存在。

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
