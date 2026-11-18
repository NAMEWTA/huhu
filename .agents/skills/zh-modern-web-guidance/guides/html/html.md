<a id="html"></a>

# HTML

<a id="table-of-contents"></a>

## 目录

1. 基本语义与验证
2. 内容分组与来源标注
3. 资源优先级与性能
4. 原生浮层：对话框与弹出层
5. 展开与折叠：Details 和 Summary
6. 焦点边界与可见性
7. HTML API 与表单分组
8. 原生媒体元素
9. 动态样式与交互

<a id="1-fundamental-semantics-and-validation"></a>

## 1. 基本语义与验证

<a id="guidelines"></a>

### 指南

- **应当**使用标准 HTML5 doctype `<!DOCTYPE html>`，防止进入怪异渲染模式。
- **应当**在 `<html>` 元素上将 `lang` 属性设为文档主要语言，并在使用不同语言的元素上设置相应 `lang`，供屏幕阅读器发音、翻译工具及语言区域敏感功能（例如 CSS `hyphens`）使用。
- **应当**使用 `<meta name="viewport">`，并将 `content` 设为 `"width=device-width, initial-scale=1.0"`，确保页面具备响应式表现。
- **应当**在每个页面／视图中使用一个 `<h1>` 表示主题。模态对话框可以例外，也可使用一个 `<h1>`。
- **应当**保持连续、不跳级的标题层次（从 `<h2>` 到 `<h3>`，不要从 `<h2>` 跳到 `<h4>`）。
- **应当**使用语义地标（`<header>`、`<nav>`、`<main>`、`<aside>`、`<footer>`），为辅助技术提供区域导航。
- **应当**用 `<search>` 包裹搜索和筛选机制，这样就无须 `role="search"`。
- **应当**用 `<button>` 触发操作（JS、模态框、表单），严格将 `<a>` 用于 URL 导航。表单中不负责提交的按钮应设为 `type="button"`，防止意外提交。
- **应当**使用 `<ul>`、`<ol>` 和 `<dl>` 表示列表内容。
- **应当**确保链接、按钮等所有交互元素具有无障碍名称。
- 确保所有交互元素的角色与所提供交互匹配，无论角色是隐含的，还是通过 `role` 属性设置。在同一页面／视图触发交互的控件应具有 `button` 角色，将用户重定向到其他位置的控件应具有 `link` 角色。
- **应当**使用 `aria-hidden="true"`，对辅助技术隐藏纯装饰性 SVG 图像。装饰性 `<img>` 必须包含空 `alt` 属性（如 `alt=""`）。
- **应当**确保 logo、数据可视化或图标按钮等传达信息的 SVG 具有适当的无障碍名称；更复杂的视觉内容还应配有文本替代，提供与视觉表达相同的信息。

- **不要**在存在语义元素时使用通用 `<div>` 或 `<span>`，例如用于交互元素、标题或独立可复用的自包含内容。
- **不要**给布尔属性添加冗余值（例如用 `disabled`，而不是 `disabled="disabled"`）。
- **不要**在已有原生元素提供内置语义和行为时，改用添加了 ARIA 角色或状态的通用元素。
- **不要**通过 ARIA 改变元素原生语义，除非确有关键需求。
- **不要**在可聚焦元素，或其父级、祖先上使用 `role="presentation"` 或 `aria-hidden="true"`。
- **不要**禁用页面缩放。
- **不要**在同一页面使用多个 `banner`、`main` 或 `contentinfo` 地标。

<a id="code-example"></a>

### 代码示例

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard | Platform</title>
</head>
<body>
  <header>
    <nav>
      <ul>
        <li><a href="#">About</a></li>
        <li><a href="#">Contact</a></li>
      </ul>
    </nav>
  </header>
  <main>
     <h1>Analytics</h1>
    <search>
      <form action="/filter" method="GET">
        <label for="search-input">Scan items:</label>
        <input type="search" id="search-input" name="q">
        <button type="submit">Search</button>
      </form>
    </search>
    <article>
      <h2>First post</h2>
    </article>
  </main>
  <footer>
    Platform - Policies and legal information
  </footer>
</body>
</html>
```


<a id="2-content-grouping-and-attribution"></a>

## 2. 内容分组与来源标注

<a id="guidelines-1"></a>

### 指南

- **应当**用 `<blockquote>` 表示来自其他来源的较长引用，并用 `cite` 属性提供机器可读的来源 URL。
- **应当**用 `<figure>` 将自包含内容（图像、代码片段或引用）分组；这些内容会在正文中被引用，但移到附录或侧栏也不影响文档含义。
- **应当**把 `<figcaption>` 作为 `<figure>` 的第一个或最后一个子元素，提供人类可读的说明或来源标注。
- **应当**在说明或来源标注中用 `<cite>` 标识作品的**标题**（如书名或网站名），而不是作者姓名。
- **应当**用 `<code>` 表示简短的计算机代码片段（例如变量名、文件路径或内联片段）。
- **应当**在显示代码块时，用 `<pre>` 包裹 `<code>`，以保留空白和换行。
- **应当**在 `<pre>` 变为可滚动时添加 `tabindex="0"`，让键盘用户能够访问内容，确保代码块可访问。
- **应当**给可滚动代码块的 `<pre>` 添加 `role="region"`，并通过 `aria-labelledby`（引用为代码块命名的元素 ID）或 `aria-label` 提供无障碍名称，确保可访问。

- **不要**仅为了视觉缩进，就把非引用文本放入 `<blockquote>`。
- **不要**给每一张图像都使用 `<figure>`；只有需要说明，或内容是独立且被引用的单元时才使用。
- **不要**用不包含 `<code>` 的 `<pre>` 表示代码块；单独的 `<pre>` 只能保留格式，无法传达内容是计算机语言。

<a id="code-example-1"></a>

### 代码示例

```html
<!-- Quote with attribution using Figure -->
<figure>
  <blockquote cite="https://html.spec.whatwg.org/">
    <p>The figure element represents some flow content, optionally with a caption, that is self-contained and is typically referenced as a single unit from the main flow of the document.</p>
  </blockquote>
  <figcaption>
    Definition of the &lt;figure&gt; element from the <cite>HTML Living Standard</cite>
  </figcaption>
</figure>

<!-- Image with caption -->
<figure>
  <img 
    src="architecture-diagram.webp" 
    alt="Diagram showing the flow between Client, API Gateway, and Microservices"
    width="800"
    height="450"
    loading="lazy"
  >
  <figcaption>Figure 1: High-level system architecture overview.</figcaption>
</figure>

<!-- Code block with accessibility and language hint -->
<figure>
  <figcaption id="code-block-caption">Example configuration:</figcaption>
  <pre role="region" aria-labelledby="code-block-caption" tabindex="0"><code class="language-json">
{
  "name": "gemini-cli",
  "version": "1.0.0",
  "private": true
}
  </code></pre>
</figure>

<!-- Inline code -->
<p>To initialize the project, run the <code>npm install</code> command.</p>
```


<a id="3-resource-prioritization-and-performance"></a>

## 3. 资源优先级与性能

<a id="guidelines-2"></a>

### 指南

- **应当**为最大内容绘制（LCP）元素（如首屏主图）设置 `fetchpriority="high"`，提高网络优先级。
- **应当**对 CSS 中定义的 LCP 背景图，使用带 `fetchpriority="high"` 的 `<link rel="preload" as="image">`。
- **应当**给屏幕外的图像和 iframe 应用 `loading="lazy"`，延后带宽消耗。
- **应当**为所有 `<img>` 指定 `width` 和 `height`，保留宽高比并避免布局偏移（CLS）。
- **应当**通过 `<img>` 的 `srcset` 属性提供同一图像的多种尺寸版本。
- **应当**使用包含回退 `<img>` 的 `<picture>`，更精细地控制图像，例如切换图像格式、尺寸，以及在不同设备尺寸下使用不同裁剪。

- **不要**给首屏或主视觉图像应用 `loading="lazy"`，这会延迟 LCP。
- **不要**过度使用 `fetchpriority="high"`，优先级是零和机制。使用 `fetchpriority="low"` 降低非关键追踪器或靠后的轮播项目的优先级。

<a id="code-example-2"></a>

### 代码示例

```html
<!-- High-priority hero image with responsive sizes -->
<img 
  src="hero-large.webp" 
  srcset="hero-small.webp 480w, hero-medium.webp 800w, hero-large.webp 1200w"
  sizes="(max-width: 600px) 100vw, (max-width: 1200px) 80vw, 70vw"
  alt="Main product view" 
  fetchpriority="high" 
  width="1200" 
  height="600"
>

<!-- Art direction and format switching with <picture> -->
<picture>
  <!-- Mobile Art Direction: Different aspect ratio (square) and format (AVIF) -->
  <source 
    media="(max-width: 600px)" 
    srcset="hero-mobile.avif 1x, hero-mobile-2x.avif 2x" 
    type="image/avif"
    width="600" 
    height="600"
  >
  <source 
    media="(max-width: 600px)" 
    srcset="hero-mobile.webp 1x, hero-mobile-2x.webp 2x"
    width="600" 
    height="600"
  >
  
  <!-- Desktop: Modern format for primary layout -->
  <source srcset="hero-desktop.avif" type="image/avif">

  <!-- Fallback img defines the default aspect ratio (2:1) -->
  <img 
    src="hero-desktop.webp" 
    alt="Platform dashboard overview" 
    width="1200" 
    height="600"
    loading="lazy"
  >
</picture>

<!-- Low-priority decorative footer image -->
<img 
  src="footer-art.png" 
  alt="" 
  loading="lazy" 
  width="200" 
  height="100"
>
```


<a id="4-native-overlays-dialogs-and-popovers"></a>

## 4. 原生浮层：对话框与弹出层

<a id="guidelines-3"></a>

### 指南

关于跨浏览器使用 Popover API 的回退策略，参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）。

- **应当**使用 `<dialog>` 实现模态浮层（需要 JS `.showModal()`），自动限制焦点、调暗背景并支持按 `Esc` 关闭。用 `closedby="any"` 启用原生“轻触关闭”（点击背景关闭），无须自定义 JavaScript。
- **应当**为模态浮层提供可见关闭控件，让使用语音控制软件的人容易判断如何关闭模态对话框。
- **应当**对不需要限制焦点的非模态 UI（菜单、工具提示）使用 Popover API（`popover` 属性）。
- **应当**用 `::backdrop` 设置模态背景样式。
- **应当**用 `<form method="dialog">` 关闭对话框，无须手写 JS 处理器。结合按钮的 `formmethod="dialog"`，可将按钮值传给对话框的 `.returnValue`。

- **不要**在需要键盘焦点限制的模态框中使用 `show()`，应使用 `showModal()`。
- **不要**在带有 `popover` 属性的元素上调用 `showModal()`，这两种编程状态互斥。不过，`<dialog popover="auto">` 是一种有效的声明式结构，可结合对话框语义与轻触关闭机制。

<a id="code-example-3"></a>

### 代码示例

```html
<!-- Popover (No JS required for toggle) -->
<button popovertarget="help-menu">Info</button>
<div id="help-menu" popover="auto">
  <p>Standard help text.</p>
</div>

<!-- Modal Dialog with Form-based closing -->
<button id="show-dialog">Open dialog</button>
<dialog id="fav-modal">
  <!-- method="dialog" closes the dialog natively and sets the returnValue -->
  <form method="dialog">
    <p>Confirm action?</p>
    <button value="cancel">Cancel</button>
    <button value="confirm">Confirm</button>
  </form>
</dialog>

<script>
  const dialog = document.getElementById("fav-modal");
  const openModal = document.getElementById("show-dialog");
  
  // Show modal dialog
  openModal.addEventListener('click', () => dialog.showModal());
  
  // Listen for the 'close' event to retrieve the user's choice (returnValue)
  dialog.addEventListener('close', () => {
    console.log(dialog.returnValue); // "confirm" or "cancel"
  });
</script>
```


<a id="native-ui-overlay--disclosure-matrix"></a>

### 原生 UI 浮层与展开折叠矩阵

| 功能 | 模态性 | 焦点 | 关闭机制 | 用途 |
| :--- | :--- | :--- | :--- | :--- |
| **`<dialog>`** | 模态／非模态 | 自动限制焦点（模态） | Esc／表单／`closedby` | 重要操作、设置 |
| **`[popover]`** | 非模态 | 标准 Tab 顺序 | 轻触关闭（点击外部） | 菜单、工具提示、Toast |
| **`<details>`** | 行内展开折叠 | 标准 Tab 顺序 | 切换 summary | 手风琴、常见问题 |

**经验规则**：需要用户操作的中断使用 `<dialog>`；临时信息使用 `popover`；行内内容展开使用 `<details>`。

<a id="5-disclosures-details-and-summary"></a>

## 5. 展开与折叠：Details 和 Summary

<a id="guidelines-4"></a>

### 指南

- **应当**用 `<details>` 和 `<summary>` 实现无 JS 的原生展开折叠模式。
- **应当**用 `<details>` 和 `<summary>` 实现无 JS 的原生手风琴模式。互斥手风琴可在 `<details>` 上使用 `name` 属性。用 `<section>` 包裹整个手风琴，通过 `aria-labelledby`（引用命名该手风琴的元素的 `id`）或 `aria-label` 提供无障碍名称。
- **应当**把 `<summary>` 放在 `<details>` 的第一个子元素位置。
- 如果必须在 `<summary>` 内使用标题，考虑该标题是否对理解或导航文档结构至关重要。如果是，应使用更稳健的展开折叠方式，让标题包裹触发控件（例如 `<h2><button type="button" aria-expanded="false" aria-controls="significant-section-content">Significant section</button></h2>`）。这能确保标题语义不丢失，同时朗读按钮及其状态。
- **应当**使用 `details[open]` 属性选择器设置展开状态样式。
- **应当**用 `details::details-content` 为 `<details>` 内容设置样式。

- **不要**在 `<summary>` 文本内部直接嵌套其他交互元素（链接、按钮），这可能破坏预期焦点行为和屏幕阅读器播报。
- **不要**通过 `list-style: none` 隐藏可见三角标记，却不提供明确的方向提示（可用 `::before` / `::after` 伪元素）。
- **不要**用 `title` 属性创建工具提示效果，因为键盘无法访问。应使用可由键盘触发、且屏幕阅读器能一致播报的无障碍工具提示模式。
- **不要**为自定义状态指示图标（用 `<img>` 或 `<svg>` 实现）提供文本替代，因为状态应由 `<summary>` 元素传达，文本替代会重复信息。

<a id="code-example-4"></a>

### 代码示例

```html
<!-- Exclusive Accordion Set -->
<section aria-label="Frequently asked questions">
  <details name="faq">
    <summary>Item 1</summary>
    <p>Contents...</p>
  </details>
  <details name="faq">
    <summary>Item 2</summary>
    <p>Contents...</p>
  </details>
</section>
```


<a id="6-focus-boundaries-and-visibility"></a>

## 6. 焦点边界与可见性

<a id="guidelines-5"></a>

### 指南

- **应当**为整块隐藏区域（屏幕外菜单、自定义模态框打开时的背景）使用全局 `inert` 属性，将其移出 Tab 顺序和无障碍树。
- **应当**将 `[inert]` 与 CSS（`opacity: 0.5`）结合，从视觉上表示不可操作。
- **应当**依赖自然 DOM 顺序实现顺序导航。
- **应当**确保可聚焦元素获得焦点时不被任何内容遮挡（例如焦点应进入模态对话框并被限制在其中，而不是仍可访问模态框后面被遮挡的内容）。
- **应当**在当前聚焦元素隐藏或移除时维护焦点，将其移到逻辑上相邻的元素，或返回触发控件。
- **应当**在新内容直接响应用户操作插入，且工作流随之进入该内容时（例如打开对话框或导航到新视图），把焦点移到新内容开头；后台更新或 live region 更新则不应这样做。

- **不要**使用正 `tabindex` 值（如 `1`、`2`）。用 `0` 将元素加入 Tab 顺序，用 `-1` 支持 JS 程序聚焦。
- **不要**在不调整 DOM 结构的情况下，通过 CSS 属性（`flex-flow: row-reverse`、`order`）改变焦点流程。
- **不要**在没有可用性验证的情况下使用 `node.focus({ preventScroll: true })`，它可能使获得焦点的元素留在屏幕外。

<a id="code-example-5"></a>

### 代码示例

```html
<!-- De-tabbing a background app shell while custom drawer is open -->
<main id="app-shell" inert>
  <a href="/">Dashboard</a>
</main>
<aside id="drawer">
  <button>Close</button>
</aside>
```


```css
[inert], [inert] * {
  opacity: 0.5;
  cursor: default;
  user-select: none;
}
```


<a id="7-html-apis-and-forms-grouping"></a>

## 7. HTML API 与表单分组

<a id="guidelines-6"></a>

### 指南

创建现代 Web 表单的更多细节，参见 `forms`（通过 `npx -y modern-web-guidance@latest retrieve "forms"` 获取）。

- **应当**利用 `form="form-id"` 属性，将输入控件与物理 `<form>` 树解耦。
- **应当**将 `<datalist>` 与 `<input list="id">` 配合，实现轻量自动建议（注意：视觉样式不可定制，屏幕阅读器支持也有特殊行为）。
- **应当**为请求个人信息的输入字段设置适当的 `autocomplete` 值（合并的姓名字段用 `autocomplete="name"`，名用 `autocomplete="given-name"`，姓用 `autocomplete="family-name"`）。
- **应当**区分 `autocomplete="current-password"`（登录）和 `autocomplete="new-password"`（注册／修改密码），让密码管理器提供正确操作。
- **应当**将 `autocomplete` token 与恰当的 `inputmode` 和 `type` 配合（`type="email"` + `inputmode="email"` + `autocomplete="email"`）。它们分别控制不同方面，即键盘、验证与自动填充，彼此配合加强。

- **不要**在凭据、地址、付款或联系信息字段使用 `autocomplete="off"`。浏览器和密码管理器会按设计忽略它。应使用具体 token（`autocomplete="email"`、`"street-address"`、`"cc-number"` 等）。
- **不要**使用 `autocomplete="off"`，除非处理高度敏感的跟踪令牌（它与标准密码管理器覆盖行为冲突）。使用标准输入 `type="email"`、`type="tel"`。

<a id="code-example-6"></a>

### 代码示例

```html
<form>
  <fieldset>
    <legend>Address Information</legend>
    <label for="city">City:</label>
    <input type="text" id="city" list="cities" autocomplete="address-level2">
    <datalist id="cities">
      <option value="New York">
      <option value="London">
    </datalist>
  </fieldset>
</form>
```


<a id="8-native-media-elements"></a>

## 8. 原生媒体元素

<a id="guidelines-7"></a>

### 指南

- **应当**为 `<video>` 设置 `width` 和 `height`，避免布局偏移（CLS）。
- **应当**为视频提供 `poster` 图片作为回退。
- **应当**通过 `<track>` 提供字幕和说明字幕。
- **应当**确保背景视频设置 `muted`，让用户完整控制播放，并使用 `role="none"` 或 `aria-hidden="true"`。还必须省略 `controls` 属性，确保视频不可聚焦。

- **不要**在原生 `controls` 已足够时，用 JS 实现基本视频控制。
- **不要**给可聚焦元素（如嵌入的交互式 `<iframe>` 组件）应用 `role="none"` 或 `aria-hidden="true"`。从辅助技术树隐藏元素、却仍允许顺序键盘导航访问，违反核心无障碍原则。背景视频例外仅成立于省略 `controls` 属性后，`<video>` 完全不可聚焦的情况。
- **不要**在页面打开时自动播放音频，除非有可访问的停止或暂停控件，或者有独立于操作系统音量的音频音量调节方式，以满足 WCAG 1.4.2 音频控制（A 级）。

<a id="code-example-7"></a>

### 代码示例

```html
<video 
  controls 
  width="800" 
  height="450" 
  poster="poster.webp"
>
  <source src="intro.webm" type="video/webm">
  <source src="intro.mp4" type="video/mp4">
  <track src="caps.vtt" kind="captions" srclang="en" label="English">
</video>
```


<a id="9-dynamic-styles-and-interactivity"></a>

## 9. 动态样式与交互

<a id="guidelines-8"></a>

### 指南

- **应当**使用 `style` 属性，通过**自定义属性**向 CSS 传递状态。这样视觉逻辑仍留在样式表中，JavaScript 只提供原始数据。
- **应当**通过文本替代、恰当的无障碍名称、角色和程序可读取的状态信息，确保屏幕阅读器用户能够获取信息。

- **不要**用内联样式定义本应属于样式表的静态设计（颜色、内边距、外边距）。
- **不要**使用内联事件处理器（如 `onclick`）。通过 `addEventListener()` 触发操作。
- **不要**只靠颜色传达状态、交互或信息。

<a id="code-example-8"></a>

### 代码示例

```html
<body>
  <!-- Progress with style-driven color data -->
  <label for="upload-progress">Upload status:</label>
  <progress id="upload-progress" class="loading-bar" value="0" max="100" style="--brand-hue: 200;"></progress>

  <script>
    const updateProgress = (percent, hue) => {
      const bar = document.querySelector('.loading-bar');
      bar.value = percent;
      
      // Update dynamic style variable 
      if (hue) bar.style.setProperty('--brand-hue', hue);
    };

    // Example: Move to 85% and shift color to green (120)
    setTimeout(() => updateProgress(85, 120), 1000);
  </script>
</body>
```

```css
.loading-bar {
  accent-color: hsl(var(--brand-hue, 200) 80% 50%);
  transition: accent-color 0.3s ease;
}
```

