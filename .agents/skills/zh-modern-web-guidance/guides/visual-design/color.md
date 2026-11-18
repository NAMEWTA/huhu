<a id="color"></a>
# 颜色

<a id="accessible-color"></a>
## 可访问的颜色

**不要仅用颜色表示界面组件是否存在或其状态**：通过图标和/或形状帮助区分。不要仅用颜色表示成功或错误，应使用图标或文本（WCAG 1.4.1 颜色的使用）。

```html
<!-- Good: Denotes state without colors alone -->
<div class="error-msg">
  <span aria-hidden="true">❌</span>
  <span>The password entered was invalid.</span>
</div>
```


<a id="contrast"></a>
### 对比度

- **最低对比度标准**：普通文字保持 4.5:1；大号文字，即至少 24px，或至少 18.66px 的粗体，以及图标，保持 3:1。文字适用 WCAG 1.4.3 对比度〔最低要求〕，图标适用 WCAG 1.4.11 非文本对比度。
- **确保非文本对比度达标**：界面组件的边界和状态至少保持 3:1 对比度（WCAG 1.4.11 非文本对比度）。
  - 这包括构成组件边界或表示组件存在的视觉元素，如边框、背景、盒阴影和下划线，例如输入框边框。
  - 也包括表示组件内活动状态的视觉元素，例如复选框勾选标记、开关滑块或自定义焦点指示器。
  - **注意**：达到 3:1 的非文本对比度可能给极简设计带来挑战。柔和渐变或细微的内凹、外凸阴影，可在满足无障碍要求的同时柔化视觉边界。
- **只在有必要时使用 `prefers-contrast`**：设计中有低对比度强调元素需要加强时，例如细微边框、淡化的次要文字，才使用 `@media (prefers-contrast: more)`；大多数已满足基础对比度的网站无需它。它用于强化已经达到上述最低要求的颜色，无法修复默认不达标的问题，因为它只影响已开启该设置的用户。

<a id="light-and-dark-color-schemes"></a>
### 浅色与深色配色方案

- **支持浅色与深色配色方案**：遵循 `@media (prefers-color-scheme: dark)`，并配合 CSS 的 `color-scheme` 属性，让表单控件、滚动条和其他由用户代理渲染的界面表面保持一致。
详细说明见 `dark-mode`，可通过 `npx -y modern-web-guidance@latest retrieve "dark-mode"` 获取。

<a id="forced-colors-mode"></a>
### 强制颜色模式

- **支持强制颜色模式**：在强制颜色模式，即 Windows 高对比度模式中，浏览器用系统关键字覆盖作者指定的颜色，移除 `box-shadow`、`text-shadow` 和渐变背景，也可能移除 `border-image`。`url()` 背景图片也不可依赖：它们可能被移除，也可能保留自身颜色，从而无法与系统颜色形成足够对比。使用 `@media (forced-colors: active)` 为颜色令牌定义系统颜色回退。
- **只有颜色本身是必要信息时，才使用 `forced-color-adjust: none`**，例如语法高亮器或颜色选择器色块。**不要**仅为保留美观而使用 `forced-color-adjust: none`。如果元素包含文字，应同时设置文字色和背景色，采用满足上述最低要求的配色，因为透明背景会显示后面的颜色，通常是用户的系统 `Canvas` 色，它可能是浅色，也可能是深色。
- **不要依赖 `background-image`、`box-shadow` 或 `border-image` 表达边界、分隔或状态**：在强制颜色模式下，它们会消失或保持自身颜色，可能无法与系统颜色形成对比，而且打印时也常会消失。如果必须使用，确保在强制颜色模式中有替代方式，例如配合系统颜色关键字的 `outline` 或 `border`，系统色包括 `CanvasText`、`LinkText`、`ButtonText`、`Highlight`、`GrayText` 等。

<a id="generating-tints"></a>
## 生成浅色调

动态生成浅色调之前，先检查能否使用现有的预定义设计令牌。这让设计师有更大控制力，并能保证一致性。

如果需要动态生成更亮或更暗的颜色：
- **不要**仅调整 `oklch`/`oklab` 或 `lch`/`lab` 的明度通道，例如 `oklab(from var(--primary) 0.9 a b)`。虽然理论上这是正确方式，但浏览器尚未实现色域映射，因此最终颜色不可预测。
- 可以使用 `color-mix()` 与白色或黑色混合；除非有理由采用其他混色空间，否则默认使用 `in oklab`。这样能安全地将颜色保持在色域内，但往往会过度降低饱和度，产生发灰的浅色调和深色调。与中性色混合时，绝不要使用 `in oklch`；这种情况下 `oklch` 没有好处，而且由于 Chromium 缺陷 565837690，低色度颜色（`chroma < 0.02`）会被视为色相无效，并在 Chromium 中解析为 `0deg`，即洋红偏红，产生意外的红色或粉色色调。
- 可以将明度调整与其他方法结合，例如 `color-mix(in oklab, oklch(from var(--primary) 0.9 c h), white 30%)`，以兼顾两者，但明度调整幅度应避免超过 30%。
