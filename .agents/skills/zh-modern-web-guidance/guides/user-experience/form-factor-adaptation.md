<a id="adapt-to-the-form-factor"></a>

# 适应设备形态

同一界面会运行在手机、笔记本电脑和折叠设备上，接受触摸、鼠标或键盘输入。根据输入方式确定控件尺寸，让组件适应容器，并让文字与控件避开系统 UI。

页面级响应式技术，包括动态视口单位、宽高比和流式字体，参见 `responsive-design`（通过 `npx -y modern-web-guidance@latest retrieve "responsive-design"` 获取）。

<a id="implementation"></a>

## 实现

<a id="size-targets-for-the-input-method"></a>

### 根据输入方式设置目标尺寸

每个控件至少为 24×24 CSS 像素（WCAG 2.5.8），触摸屏上至少为 44×44（WCAG 2.5.5），因为指尖不如鼠标指针精确。句子中的链接不受此限制。复选框和单选按钮应将输入元素包裹在 `<label>` 内，并设置 label 的尺寸。小图标可以通过伪元素扩展命中区域，在视觉上继续保持紧凑。控件周围留出足够空间，避免扩展后的命中区域互相重叠或超出屏幕边缘。

```css
:root { --target-size: 24px; }
@media (pointer: coarse) {
  :root { --target-size: 44px; }
}
:where(button, select, textarea, input:not([type="checkbox"], [type="radio"]), [role="button"], nav a, label:has(input[type="checkbox"], input[type="radio"])) {
  min-block-size: var(--target-size);
  min-inline-size: var(--target-size);
}
:where([role="button"], nav a, label:has(input[type="checkbox"], input[type="radio"])) { display: inline-flex; align-items: center; }
.icon-button { position: relative; }
.icon-button::after {
  content: "";
  position: absolute;
  inset: -10px;
}
```

<a id="let-components-respond-to-their-container"></a>

### 让组件响应容器

组件布局使用容器查询，而不是按视口宽度的媒体查询，使组件无论放在哪里都能适应。媒体查询留给容器无法感知的信息，例如输入设备（触摸屏的 `pointer: coarse`）和用户设置（`prefers-color-scheme`）。

```css
.product-list {
  /* Name containers so queries inside nested containers target the right ancestor. */
  container: products / inline-size;
}
/* A container query styles the container's descendants, never the container itself. */
@container products (inline-size > 40rem) {
  .product-card { display: grid; grid-template-columns: 10rem 1fr; }
}
```

不要对 `inline-size` 容器查询 `height` 或 `block-size`，因为它只能测量宽度。只有高度明确的容器才使用 `container-type: size`。

- 更多容器查询模式，例如卡片布局，参见 `size-aware-styling`（通过 `npx -y modern-web-guidance@latest retrieve "size-aware-styling"` 获取）。
- 要根据子元素改变组件布局，例如卡片包含图片时改为并排布局，参见 `content-based-styling`（通过 `npx -y modern-web-guidance@latest retrieve "content-based-styling"` 获取）。

<a id="keep-ui-clear-of-notches-and-system-bars"></a>

### 让 UI 避开刘海与系统栏

使用 `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` 进行边到边绘制时，按安全区域 inset 为固定和贴边 UI 添加内边距。

```css
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
  padding-left: max(0.75rem, env(safe-area-inset-left, 0px));
  padding-right: max(0.75rem, env(safe-area-inset-right, 0px));
}
```

贴顶 UI 同样使用 `safe-area-inset-top` 添加内边距。

固定栏会遮挡从其下方滚过的内容，因此焦点元素可能隐藏在栏后。在滚动容器上设置 `scroll-padding-bottom`，顶部栏则使用 `scroll-padding-top`，其值至少等于栏高，包括安全区域内边距，让浏览器将焦点元素滚动到不受遮挡的位置。WCAG 2.4.11“焦点未被遮挡（最低要求）”要求焦点元素至少部分可见。

```css
html {
  scroll-padding-bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px));
}
```

<a id="balance-headings-and-prettify-body-text"></a>

### 平衡标题并优化正文换行

对短标题（`h1, h2, h3`）使用 `text-wrap: balance`，正文（`p, li`）使用 `text-wrap: pretty`，避免排版孤词。完整文本换行规则参见 `improve-text-layout-and-legibility`（通过 `npx -y modern-web-guidance@latest retrieve "improve-text-layout-and-legibility"` 获取）。不要将两者应用到 `*`：它们都会增加布局开销，而且 `balance` 只对短文本块有帮助。

<a id="label-icon-only-buttons"></a>

### 为纯图标按钮提供标签

通过 `aria-label`、`<img alt>` 或视觉隐藏文本，为每个纯图标按钮提供可访问名称，并用 `aria-hidden="true"` 隐藏装饰图标。更多可访问命名模式参见 `accessibility`（通过 `npx -y modern-web-guidance@latest retrieve "accessibility"` 获取）。

<a id="keep-content-inside-its-box"></a>

### 让内容保持在盒子内

确保视口宽度缩小到 320 CSS 像素时，文字与控件在任意宽度下都不会被裁切、挤成零尺寸或溢出（WCAG 1.4.10）。数据表、地图和图表等必须通过二维布局理解的内容，可以在自己的容器内横向滚动，而页面本身不横向滚动。为容器设置 `tabindex="0"`，使键盘能够滚动，并添加 `role="region"` 和可访问名称。让数据表适应小视口的方法参见 `responsive-table`（通过 `npx -y modern-web-guidance@latest retrieve "responsive-table"` 获取）。

```css
/* Media never overflows its column. */
img, video { max-inline-size: 100%; block-size: auto; }
/* Long words and URLs wrap instead of widening the page. */
body { overflow-wrap: break-word; }
/* Long URLs and code also wrap inside flex items and table cells. */
:where(a, code) { overflow-wrap: anywhere; }
/* Flex and grid items don't shrink below their content by default. Let non-control items shrink so controls keep their minimum size. */
:where(.toolbar > :not(button, input, select, textarea, a, [role="button"], label)) { min-inline-size: 0; }
.toolbar { display: flex; }
/* The target-size minimum lets controls in a crowded row shrink below their text, so let nav bars and toolbars that are already rows wrap. */
:where(nav, nav ul, .toolbar) { flex-wrap: wrap; }
```

- 包含文字的内容使用 `min-block-size`，不要固定 `height`。
- 普通文字使用 `overflow-wrap: break-word`；只有包含链接、代码等长且不可断字符串的元素才使用 `anywhere`。`anywhere` 还会允许 flex 项和表格单元格缩得比最长单词更窄，从而把普通单词从中间断开。
- 不要用 `text-overflow: ellipsis` 截断标题，也不要给父元素设置 `overflow: hidden` 来裁切控件。
- 不要为阻止页面横向滚动而在 `html` 或 `body` 上设置 `overflow-x: hidden` 或 `clip`，否则边缘之外的内容会被截掉，用户无法滚动过去。应调整真正过宽的元素，使其适配。
- 要让文字与布局随操作系统无障碍设置缩放，参见 `respect-os-text-scale`（通过 `npx -y modern-web-guidance@latest retrieve "respect-os-text-scale"` 获取）。要在用户输入时动态调整表单控件尺寸，参见 `form-fields-automatically-fit-contents`（通过 `npx -y modern-web-guidance@latest retrieve "form-fields-automatically-fit-contents"` 获取）。

<a id="fallback-strategies"></a>

## 回退策略

<a id="text-wrapping"></a>

### 文本换行

text-wrap: balance 的 Baseline 状态：Newly available。自 2024-05-13 起纳入 Baseline。
支持的浏览器：Chrome 114（2023 年 5 月）、Edge 114（2023 年 6 月）、Firefox 121（2023 年 12 月）和 Safari 17.5（2024 年 5 月）。

text-wrap: pretty 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）和 Safari 26（2025 年 9 月）。
不支持的浏览器：Firefox。

不支持的浏览器会忽略 `text-wrap: balance` 和 `text-wrap: pretty`，按常规方式换行，无需回退。
