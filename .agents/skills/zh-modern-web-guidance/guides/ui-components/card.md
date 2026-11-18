<a id="build-a-card"></a>

# 构建卡片

<a id="overview"></a>

## 概述

卡片将一块相关内容或一个选择组合在一起。它是视觉模式，而非固定的语义或交互模型，因此应保留内容含义，并采用符合用途的原生交互。

<a id="guidelines"></a>

## 指导原则

分别选择内容语义与交互语义：

- 无论是否链接到目标，都使用 `<article>` 作为卡片根元素。
- 导航使用原生链接。整张卡片只对应一个目标时，仅当内部没有其他交互元素（`a`、`button`、`input`、`select`、`textarea`），才可用单个链接包裹 `<article>`。
- 独立操作的链接和按钮保留为独立原生控件。
- 卡片作为选择项时，使用单选按钮或复选框及关联 `<label>`，或原生 `<select>` 中的 `option`。

媒体、标题、辅助内容、操作保持有意义的源码顺序，不要用 CSS `order` 与之矛盾（见 `css-layout`，运行 `npx -y modern-web-guidance@latest retrieve "css-layout"`）。

<a id="implementation"></a>

## 实现

保持标记精简，让 CSS 选择器识别各区域，使简单卡片保持简单，也允许更丰富的卡片。卡片最多四个区域，按以下源码顺序排列，均可省略。各区域都是卡片直接子元素，不要放进 `.card__body` 等包裹层，否则无法按选择器定位和设样式。区域只有一个元素时，直接使用该元素，不另包裹：单段正文就是 `<p>`。只有区域包含多个元素时才使用包裹层。

- **媒体**：第一子元素为 `<img>`、`<picture>`、`<video>` 或 `<svg>`。只有不属于这些元素的任意主视觉内容才添加 `.media` 类，绝不要为了 `.media` 再包裹普通 `<img>`。
- **页头**：可以只有一个标题。标题带副标题或标语时才使用 `<hgroup>`；区域还有署名、徽章等内容时使用 `<header>`。卡片有主要目标时，链接放在标题内部。
- **内容**：单个 `<p>`、`<ul>`、`<dl>` 独立存在。多段正文、正文加列表等多元素内容，用一个 `<div>` 分组，使区域成为单个网格项。
- **页脚**：用 `<footer>` 包含独立操作的原生链接和按钮。“read more”可以与标题链接使用同一 URL，但要通过视觉隐藏文本提供以可见文字开头的描述性无障碍名称，例如 `Read more<span> about poached eggs</span>`；多个相同“read more”在屏幕阅读器链接列表中含义不清。不要添加其他重复标题 URL 的页脚链接。

最简单的卡片是一个包含标题和段落的 `<article>`。根据行为选择链接与操作模式，见[交互模型](#interaction-models)。

图片或视频需要填满固定比例区域时，直接在 `<img>` 或 `<video>` 上设置 `aspect-ratio` 和 `object-fit: cover`，使其不变形地填满（可能裁切）。只有其他主视觉内容才在 `.media` 容器上设置 `aspect-ratio`。否则保留媒体内在比例。信息性图片提供合适替代文本，装饰图片使用 `alt=""`。

<a id="adapt-to-available-space"></a>

### 适应可用空间

布局依据卡片可用空间，而非视口。要调整媒体、文字、操作等后代，令卡片本身成为尺寸容器（`container-type: inline-size`），针对子元素编写 `@container` 规则。避免以网格或列表父元素为尺寸依据，因为卡片实际宽度受列数、gap 等影响，基于父级的断点不准确。

窄容器中按源码顺序堆叠各区；宽容器中将媒体放侧列，其他区域放旁边，但仅对有媒体的卡片如此。通过媒体子元素上的 `:has()` 限定规则（例如 `.card:has(> img)`），确保列定义和 `grid-column` 放置不会用于无媒体卡片。没有媒体的卡片在所有宽度下都保持单列，不预留空媒体列。

<a id="align-cards-in-a-grid"></a>

### 对齐网格中的卡片

同一行卡片需要共享各区域高度时，使用 `subgrid`：每张卡片跨四条共享行轨道（媒体、页头、内容、页脚），按元素选择器放置区域，媒体、标题、`<footer>` 之外都视为内容。省略区域时对应轨道留空，其余仍与邻卡对齐。每轨道容纳一个网格项，因此只有内容区域有多个元素且卡片共享轨道时，才用 `<div>` 包裹。不需要与兄弟对齐的卡片无需该包裹或 subgrid。

<a id="interaction-models"></a>

## 交互模型

<a id="content-cards"></a>

### 内容卡片

以 `<article>` 为根，链接和按钮保留为独立原生控件。

<a id="single-destination-cards"></a>

### 单目标卡片

整张卡片只有一个导航目标且无独立操作时，使用一个原生链接，可包裹 `<article>`。其中不得再嵌套链接、按钮或表单控件，“read more”文字保留为普通 `<p>` 或 `<span>`。链接的无障碍名称包含卡片全部文字，因此内容应简短；若文字较多或有其他操作，使用下文的拉伸链接模式，让只有标题成为链接：

```html
<a href="/recipes/poached-eggs">
  <article class="card">
    <h3>Poached eggs</h3>
    <p>Two poached eggs served on toasted sourdough.</p>
  </article>
</a>
```

<a id="clickable-cards-with-independent-actions"></a>

### 带独立操作的可点击卡片

点击卡片触发操作而非导航时，使用 `<button>`，不要使用链接。

内容卡片链接到主要目标、还包含其他交互元素，并需要整卡可点击时：
- 仅在主要链接上明确启用：每卡恰好一个链接（标题链接）设置 `.card-link`。页脚或其他链接不能设置，否则每个都会拉伸覆盖层，最后一个捕获整张卡片。
- 将标题设为链接，用 `::after` 将指针命中区域扩展到整卡。

```css
.card:has(a.card-link) {
	position: relative;
}

.card a.card-link::after {
	content: "";
	position: absolute;
	inset: 0;
}
```

- 通过 `position: relative; z-index: 1` 抬高交互元素，使其仍可操作。按元素类型（例如 `a, button`）选择，不要求逐个加类。
- 不要对整个容器应用 `z-index`，否则它会捕获不会产生任何操作的指针事件。

```css
.card:has(a.card-link) {
	/* Keep other interactive elements above the overlay */
	a:not(.card-link), button, input, x-button {
	    position: relative;
	    z-index: 1;
	}
}
```

- hover/focus 时为卡片自身设样式，而非拉伸链接：

```css
.card {
	a.card-link {
		&:focus-visible {
			outline: none; /* Draw it on the card instead */
		}
	}
	
	&:has(a.card-link:focus-visible) {
		/* Focus ring */
	}

	&:has(a.card-link:hover) {
		/* Hover styles */
	}
}

```

<a id="choice-cards"></a>

### 选择卡片

预定义选择项卡片使用 `<label class="card">`，将复选框或单选按钮作为直接子元素。

使用 `:has(:checked)` 设置选中样式。选中时绝不改变 `border-width`、`padding`、`font-weight` 等影响布局的属性，否则卡片及邻居会跳动。通过 `outline`、`box-shadow` 或只改变颜色的透明边框强调：

```css
.card {
  border: 2px solid transparent;

  &:has(> :checked) {
    border-color: var(--accent);
  }
}
```

可见复选框或单选按钮本身就是非颜色选择指示，因此额外仅改变颜色即可。若视觉隐藏控件（必须保持可聚焦并留在无障碍树中，绝不 `display: none`），应添加不影响布局的非颜色指示，例如勾选图标或更粗的 `outline`。

若选择项属于下拉选择器，选项以卡片排列，使用原生 `<select>` 配合 `appearance: base-select`，为 `::picker(select)` 和 `<option>` 设样式，不要用 `<div>` 卡片替代 select；详情和回退见 `custom-select-picker-layouts`（运行 `npx -y modern-web-guidance@latest retrieve "custom-select-picker-layouts"`）。

