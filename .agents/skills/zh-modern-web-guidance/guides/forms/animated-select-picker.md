<a id="animated-select-picker"></a>
# 带动画的选择器

可自定义 select API 提供了一种声明式、由 CSS 驱动的方式，为 `<select>` 元素及其下拉选择面板添加动画。将 `appearance: base-select` 与现代 CSS 动画技术（例如 `@starting-style` 和 `allow-discrete` 过渡行为）组合使用，可以为顶层元素实现流畅、精致的界面过渡，无需依赖庞大的 JavaScript 库。

过去，原生 select 下拉面板的界面渲染不受页面可访问视口范围的控制，因此无法为其制作动画。使用 `appearance: base-select` 后，选择面板可以像其他页面元素一样设置样式和动画。

<a id="how-to-implement"></a>
## 如何实现

实现带动画的选择器时：

1. **启用自定义：** 同时为 `<select>` 元素和 `::picker(select)` 伪元素设置 `appearance: base-select`。
2. **启用自动尺寸过渡（可选）：** 定义 `interpolate-size: allow-keywords`（通常设置在 `:root` 上），允许浏览器在 `height: auto` 与 `height: 0` 等离散尺寸值之间进行过渡。
3. **为顶层容器添加动画：** 为 `::picker(select)` 设置标准的进入和退出样式。在 `transition` 属性中包含 `display` 与 `overlay`，并设置 `transition-behavior: allow-discrete`，使选择面板在 `display: none` 与 `display: block` 之间过渡时仍保持在顶层渲染。
4. **用 `@starting-style` 定义打开时的初始状态：** 使用 `@starting-style` 指定浏览器在过渡开始*之前*应计算的起始样式。例如，要实现淡入效果，就在 `@starting-style` 块中把不透明度设为 `0`。
5. **旋转图标：** 使用 `:open::picker-icon` 等伪元素焦点或活动状态选择器，为箭头指示器应用旋转、平移等过渡。

<a id="example-code-smooth-select-scale-and-fade"></a>
## 代码示例：平滑缩放和淡入的选择器

下面的示例为自定义选择器的面板容器应用标准的页面动画。

```html
<!-- Always use a <label> linked via 'for' to the select for accessibility -->
<label for="theme-select">Visual Theme</label>
<select id="theme-select" class="animated-select" name="theme">
  <!-- The <button> inside <select> becomes the visible trigger when appearance: base-select is used -->
  <button>
    <!-- <selectedcontent> automatically displays the content of the chosen <option> -->
    <selectedcontent></selectedcontent>
  </button>
  <option value="system">
    <!-- MANDATORY: Decorative inline SVGs MUST set aria-hidden="true" to prevent redundant screen reader announcement -->
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
      <line x1="8" y1="21" x2="16" y2="21"></line>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
    System Default
  </option>
  <option value="light">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
    Light UI
  </option>
</select>
```

```css
/* Opt-in to customizable select */
.animated-select,
.animated-select::picker(select) {
  appearance: base-select;
}

/* Enable auto-keyword transitions (usually set globally at :root) */
:root {
  interpolate-size: allow-keywords;
}

/* Style the visible trigger and icon rotation */
.animated-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.875rem 1rem;
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.animated-select::picker-icon {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.animated-select:open::picker-icon {
  transform: rotate(180deg);
}

/*
 * The Picker Container
 * Uses top-layer animations with `allow-discrete` visibility hooks
 */
.animated-select::picker(select) {
  /* Set a text color with the background so options stay readable on pages with a dark color scheme */
  background: white;
  color: black;
  border-radius: 12px;
  box-shadow: 0 10px 25px -3px rgba(0,0,0,0.1);
  padding: 0.5rem;
  margin-top: 0.25rem;
  width: anchor-size(width);

  transition:
    display,
    overlay,
    opacity cubic-bezier(0.16, 1, 0.3, 1),
    height cubic-bezier(0.16, 1, 0.3, 1);
  transition-duration: 0.4s;
  /* Separate after transition so the shorthand doesn't reset it or fail in older browsers */
  transition-behavior: allow-discrete;
  opacity: 0;
  height: 0;
}

/* Open State */
.animated-select:open::picker(select) {
  opacity: 1;
  height: auto;
}

/* @starting-style to hook the transition on initial popover open */
@starting-style {
  .animated-select:open::picker(select) {
    opacity: 0;
    height: 0;
  }
}

/* Support for SVG inside Options and Selected Content */
.animated-select option svg,
.animated-select selectedcontent svg {
  flex-shrink: 0; /* Prevent icons from shrinking */
  width: 1.25rem;
  height: 1.25rem;
}

/* MANDATORY: Provide multiple indicators (e.g. bold font and distinct background) for the checked state to avoid color-only state communication */
.animated-select option:checked {
  font-weight: 700;
  background-color: #f1f5f9;
  color: black;
}

/* Ensure copy-paste safety for users with motion sensitivities */
@media (prefers-reduced-motion: reduce) {
  .animated-select::picker(select),
  .animated-select::picker-icon {
    transition: none !important;
  }
}
```

<a id="strategic-implementation--best-practices"></a>
## 实施策略与最佳实践

- **应当**在元素从 `display: none` 变为可见时需要准确触发动画的场景使用 `@starting-style`。
- **不要**在 `transition` 简写中使用 `allow-discrete`，否则旧浏览器会忽略整条 `transition` 声明。除非这正是所需行为，否则应使用单独的 `transition-behavior: allow-discrete` 声明。
- **不要**临时拼凑滚动锁定逻辑。由 ‘base-select’ 管理的顶层元素应允许自然的背景点击关闭行为。
- **不要**为 `::picker(select)` 设置 `overflow: hidden`。面板必须保持可滚动，以便用户在高缩放比例或较矮视口等可用空间不足的场景中，仍能访问未显示的选项。
- **应当**检查减少动态效果的偏好设置。始终把动画约束放在 `prefers-reduced-motion` 媒体查询中，为受动态效果影响、可能出现晕动不适的用户提供无障碍体验。
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
