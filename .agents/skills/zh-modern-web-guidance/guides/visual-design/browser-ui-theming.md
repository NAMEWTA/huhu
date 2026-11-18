<a id="theming-browser-generated-ui"></a>
# 为浏览器生成的界面设置主题

大多数浏览器生成的界面，都可以通过 CSS 在一定程度上自定义。
即使需要现代特性，也能在旧浏览器中平稳降级，因此通常无需 polyfill 或回退。

重新实现浏览器界面，例如表单控件、滚动条、选区、错误消息等之前，先确认：
1. 即使使用现代 CSS，浏览器界面仍无法充分自定义以满足需求；
2. 所需定制足够关键，值得承担重建内置界面的取舍，尤其是失去原生界面免费提供的无障碍语义、键盘处理、IME 和辅助技术集成。

可实现的定制示例：
- 使用 `::selection` 自定义高亮选中文本的颜色。
- **不要**对正文应用 `user-select: none`，它会破坏复制粘贴、翻译工具和辅助技术的“从这里开始朗读”手势。将其限制在界面附属控件，例如拖动手柄、工具栏和冗余按钮标签。
- 使用 `accent-color`，将页面强调色应用到浏览器生成的界面。
- 使用 `color-scheme`，让浏览器界面适应浅色或深色模式。
- 使用 `scrollbar-color` 自定义滚动条颜色，保持滑块与轨道在视觉上明显不同，对比度至少为 3:1。
- **不要**将 `scrollbar-width` 设为 `auto` 以外的值，除非同时提供另一种可访问的内容滚动方式。虽然 `scrollbar-width: thin` 仍有滑块，但其目标尺寸对一些用户而言太小，难以操作。
- 使用 `:user-invalid` / `:user-valid` 设置有效性样式，**不要**使用 `:invalid` / `:valid`。前者只有在用户与字段交互后才匹配，避免页面加载时就将空的必填字段标为错误这一不友好的默认行为。广泛匹配 `input` 时应排除范围滑块，例如 `input:not(input[type="range"]):user-valid`，防止调整滑块时为它加上字段有效性的边框或背景。
- 按钮和文本字段，包括 `<textarea>`，通常可以像普通元素一样设置样式。
- 使用 `font-size` 调整大小，并通过其他文本属性控制字体排版。
- 普通字号文字的前景与背景颜色对比度至少为 4.5:1，大字号文字，即 18 点或 14 点粗体，至少为 `3:1`。
- 非文本内容的相邻颜色对比度至少为 `3:1`。

<a id="styling-textual-fields-input--textarea"></a>
### 为文本字段（`<input>` 和 `<textarea>`）设置样式

对于颜色、边框、背景、字体排版等大多数样式用途，将这些元素视为普通文本容器即可。

- 使用 `:placeholder-shown` 和 `::placeholder` 设置输入占位文本样式。
- 使用 `field-sizing: content`，让文本字段按内容调整尺寸。
- 对 `<textarea>` 使用 `resize: vertical`，禁用横向尺寸调整。
- 如果没有其他调整尺寸的机制，例如 `field-sizing: content;` 或自定义尺寸调整按钮，不要在 `<textarea>` 上使用 `resize: none` 禁用全部尺寸调整。

<a id="multiple-choice-controls-select-radios-checkboxes"></a>
### 多选项控件（select、单选按钮、复选框）

- 在下拉菜单展示的多个选项中选一个：使用 `<select>` + `appearance: base-select` + `::picker(select)`。更多信息见 `branded-select-styling`，可通过 `npx -y modern-web-guidance@latest retrieve "branded-select-styling"` 获取。
- 在页面内排列的多个选项中选一个或多个：为每个选项在 `<label>` 内放入 `<input type=checkbox>` 或 `<input type=radio>`，通过 `label:has(:checked)` 设置样式。
- 使用 `appearance: none` 配合生成内容（`::before`/`::after`）或背景图片，为复选框、单选按钮和开关绘制选中状态。
<!-- 可自定义 select 的 listbox 版本目前有缺陷，而且此方案的浏览器支持更好。 -->

<a id="non-textual-inputs-buttons-sliders-file-inputs-etc"></a>
### 非文本 `<input>`（按钮、滑块、文件输入等）

- 文件输入：使用 `::file-selector-button` 设置按钮样式。
- 不要使用 `type` 为 `button`、`submit` 或 `reset` 的 `<input>`。改用 `<button>`，并像普通元素一样设置样式。
- 滑块：使用 `appearance: none`，配合滑块伪元素（`::-webkit-slider-thumb`、`::-moz-range-thumb` 等）和轨道伪元素（`::-webkit-slider-runnable-track`、`::-moz-range-track` 等），进行更细粒度的控制。
