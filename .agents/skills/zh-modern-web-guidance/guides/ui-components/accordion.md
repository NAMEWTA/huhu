<a id="accordion"></a>

# 折叠面板

使用一组相邻的 `details` 元素构建折叠面板。

如果它是页面中的独立章节，将项目放入具有无障碍名称的分组元素，例如由组标题标记的 `section`。

```html
<section class="accordion" aria-labelledby="faq-heading">
	<h2 id="faq-heading">Frequently Asked Questions</h2>
	<details>
		<summary>Lorem ipsum dolor sit amet?</summary>
		<!-- answer 1 -->
	</details>
	<details>
		<summary>Consectetur adipiscing elit?</summary>
		<!-- answer 2 -->
	</details>
</section>
```

**警告：** 不要在 `summary` 内放标题。JAWS 和 TalkBack 会将 `summary` 暴露为按钮，并丢弃其中标题的语义，使用户无法按标题在项目间移动。如果每项都需要独立标题，改用下文的自定义折叠面板。

无障碍说明：
- 不要给每个小型折叠面板都套 landmark 或 `region`，否则会给屏幕阅读器导航增加噪声。
- 不要添加方向键导航、游走式 `tabindex` 或 `Home`/`End` 处理。折叠内容通常较长，需要滚动；触发器获得焦点时，键盘用户靠方向键滚动。
- 如果不希望为整个面板设置标题，在容器上使用 `aria-label` 提供组的无障碍名称。

<a id="exclusive-accordions"></a>

## 互斥折叠面板

互斥面板同一时间只允许打开一项。

给属于同一互斥组的 `details` 元素设置相同 `name`。确保页面其他地方不使用相同的 `name`，除非确实要加入同一互斥组。

```html
<section class="accordion" aria-labelledby="faq-heading">
	<h2 id="faq-heading">Frequently Asked Questions</h2>
	<details name="faq-question">
		<summary>Lorem ipsum dolor sit amet?</summary>
		<!-- answer 1 -->
	</details>
	<details name="faq-question">
		<summary>Consectetur adipiscing elit?</summary>
		<!-- answer 2 -->
	</details>
</section>
```

尽量避免互斥面板，因为体验可能不理想：
- 用户有时需要交叉参考多个项目的内容，而互斥会阻止这种操作。
- 内容还可能移出用户视野，给屏幕放大镜用户带来明显问题。

<a id="keeping-one-item-always-open"></a>

### 始终保持一项打开

如果要求始终打开一项，阻止当前打开项目的 `summary` 将自身关闭，并将其暴露为禁用状态。打开另一项时仍通过 `name` 关闭原项目。这会加重上述缺点，因为用户永远无法收回这部分空间，所以仅在布局依赖某项始终打开时使用。

```html
<section class="accordion always-open" aria-labelledby="plans-heading">
	<h2 id="plans-heading">Plans</h2>
	<details name="plan" open>
		<!-- Mirrors the open state; the script keeps it in sync -->
		<summary aria-disabled="true">Basic</summary>
		<!-- Basic plan -->
	</details>
	<details name="plan">
		<summary>Pro</summary>
		<!-- Pro plan -->
	</details>
</section>
```

```javascript
// Enter and Space on a summary also dispatch click, so this covers keyboard too
document.addEventListener("click", event => {
	if (event.target.closest(".accordion.always-open details[open] > summary")) event.preventDefault();
});

// toggle does not bubble, hence capture
document.addEventListener("toggle", event => {
	if (!event.target.matches(".accordion.always-open details")) return;
	event.target.querySelector(":scope > summary").setAttribute("aria-disabled", event.target.open);
}, { capture: true });
```

让禁用的 `summary` 保持可聚焦，以免用户刚打开的项目变为禁用时丢失焦点；但排除其 hover 和指针样式，避免看起来还能点击：

```css
/* :where() keeps the guard from raising specificity */
summary:where(:not([aria-disabled="true"])) {
	cursor: pointer;

	&:hover {
		background: var(--color-hover);
	}
}
```

<a id="optional-expandcollapse-all-button"></a>

## 可选：全部展开/折叠按钮

对非互斥面板，提供一个展开或折叠所有项目的按钮能改善体验。为它设置 `aria-expanded` 并随项目状态同步，让屏幕阅读器播报变化（VoiceOver 不能可靠地仅凭标签变化播报）。只有全部项目打开时才标记为展开；混合状态下显示“全部展开”，按下后打开全部。

```html
<section class="accordion" id="support-accordion" aria-labelledby="support">
	<h2 id="support">Support</h2>
	<button type="button" commandfor="support-accordion" command="--toggle-all" aria-expanded="false">
		<span class="expand">Expand all</span>
		<span class="collapse">Collapse all</span>
	</button>
	<!-- Accordion items -->
</section>
```

```css
/* Show the label for the action the button will perform */
[command="--toggle-all"][aria-expanded="true"] .expand,
[command="--toggle-all"][aria-expanded="false"] .collapse {
	display: none;
}
```

```javascript
document.addEventListener("command", event => {
	if (event.command !== "--toggle-all") return;
	const expand = event.source.getAttribute("aria-expanded") !== "true";

	// Command events fire on the commandfor target
	for (const details of event.target.querySelectorAll(":scope > details")) {
		details.open = expand;
	}
}, { capture: true }); // Command events do not bubble, hence capture

// Items also open and close individually, so derive the button state from them
document.addEventListener("toggle", event => {
	if (!event.target.matches(".accordion > details")) return;
	const accordion = event.target.parentElement;
	const button = accordion.querySelector(':scope > [command="--toggle-all"]');
	if (!button) return;

	const items = accordion.querySelectorAll(":scope > details");
	button.setAttribute("aria-expanded", Array.prototype.every.call(items, details => details.open));
}, { capture: true }); // toggle does not bubble, hence capture
```

也可以用两个独立按钮，提高可发现性，但会牺牲**反馈**：某些状态下，一个按钮不会产生可见结果，而以无障碍方式禁用它又会带来挑战和复杂度。

<a id="styling"></a>

## 样式

展开内容位于 `::details-content` 伪元素。关闭时通过 `content-visibility: hidden` 而非 `display: none` 隐藏，因此内容仍可被查找，也能进行尺寸动画。在 `details` 上设置项目样式，在 `summary` 上设置触发器样式，在 `details::details-content` 上设置内容样式。

<a id="customizing-the-marker"></a>

### 自定义标记

`summary` 作为列表项渲染，因此展开三角形是 `::marker`。用 `list-style: none` 移除，再用 `::before` 绘制；与 `::marker` 不同，后者可设置尺寸、定位和动画。
以 mask 渲染图标，使其跟随文字颜色；在关闭状态旋转它，让一个图标同时覆盖两种状态和两种书写方向。CSS 图标引入和定制见 `icons`（运行 `npx -y modern-web-guidance@latest retrieve "icons"`）。

优先将标记紧邻标签文字，而不是推到 summary 的另一侧，尤其是可能很宽的面板。距离标签太远会使用户难以判断对应关系，并超出低视力或放大镜用户的视野。放在文字前方优于后方，更便于垂直扫读。

```css
summary {
	/* Removes the default triangle */
	list-style: none;
	display: flex;
	align-items: center;
	gap: 0.5ch;

	&::before {
		content: "";
		inline-size: 1em;
		block-size: 1em;
		flex-shrink: 0;
		background-color: currentColor;
		/* Example chevron pointing down, the open state; any single-color SVG works */
		mask: url("icons/chevron-down.svg") no-repeat center / contain;
		/* Closed: point toward the inline end */
		rotate: -90deg;
	}

	&:dir(rtl)::before {
		rotate: 90deg;
	}

	/* Rotate rather than swap icons, so the change can animate */
	details[open] > &::before {
		rotate: 0deg;
	}

	@media (prefers-reduced-motion: no-preference) {
		&::before {
			transition: rotate 0.2s;
		}
	}
}
```

<a id="slide-updown-animation"></a>

### 上下滑动动画

打开/关闭动画让 `block-size` 在 `0` 与内在尺寸间过渡，并对 `content-visibility` 做离散过渡，使内容一直渲染到折叠结束。

```css
details::details-content {
	/* Lets block-size transition to and from its intrinsic auto size */
	interpolate-size: allow-keywords;
	overflow: clip;
	/* Keeps layout containment constant across states; otherwise content-visibility toggling it
	   makes the transition jitter when the content has outward margins (e.g. a nested p) */
	contain: layout;
}

details:not([open])::details-content {
	block-size: 0;
}

/* Only animate for users who have not asked for reduced motion */
@media (prefers-reduced-motion: no-preference) {
	details::details-content {
		transition: block-size, content-visibility, display;
		/* Example duration; match the surrounding motion design */
		transition-duration: 0.3s;
		transition-timing-function: ease-in-out;
		/* Defers content-visibility: hidden until the collapse ends */
		transition-behavior: allow-discrete;
	}
}
```

更多说明见 `animate-to-intrinsic-sizes`（运行 `npx -y modern-web-guidance@latest retrieve "animate-to-intrinsic-sizes"`）。

<a id="excluding-a-details-elements-contents-from-find-in-page"></a>

## 从页面内查找中排除 `details` 内容

如果不希望浏览器页面内查找匹配 `details` 内容，关闭时使用 `display: none` 隐藏。为了保留滑动动画，在 `@starting-style` 中设置折叠尺寸。详情见 `animate-element-entry-exit`（运行 `npx -y modern-web-guidance@latest retrieve "animate-element-entry-exit"`）。

```css
.accordion.unsearchable > details {
	/* Excludes the contents from find-in-page */
	&:not([open])::details-content {
		display: none;
	}

	/* Where the opening transition starts from, since display: none has no size */
	&[open]::details-content {
		@starting-style {
			block-size: 0;
		}
	}
}
```

<a id="custom-accordion"></a>

## 自定义折叠面板

只有每个项目都是需要独立标题的页面章节时，才使用自定义面板，例如 FAQ 或长参考页面，屏幕阅读器用户需按标题移动。所有行为（包括互斥）都需要 JavaScript，因此其他情况优先 `details`。

将 `button` 放在标题内部，以保留标题语义；内容元素紧跟标题。使用 `hidden="until-found"` 隐藏，使其仍可被查找；若要排除页面内查找，则使用普通 `hidden`。触发器上的 `aria-controls` 可选，屏幕阅读器不会从中获益。

```html
<section class="accordion" aria-labelledby="faq-heading">
	<h2 id="faq-heading">Frequently Asked Questions</h2>
	<h3>
		<button type="button" commandfor="answer-1" command="--toggle" aria-expanded="false">How do I reset my password?</button>
	</h3>
	<div id="answer-1" hidden="until-found"><!-- Answer --></div>
</section>
```

```javascript
document.addEventListener("command", event => {
	if (event.command !== "--toggle") return;
	const content = event.target;

	content.hidden = content.hidden ? false : "until-found";
	event.source.setAttribute("aria-expanded", !content.hidden);
}, { capture: true }); // Command events do not bubble, hence capture

// Find-in-page reveals the content directly, so mirror that into the trigger
document.addEventListener("beforematch", event => {
	document.querySelector(`[commandfor="${CSS.escape(event.target.id)}"]`)?.setAttribute("aria-expanded", "true");
});
```

要实现互斥，在两个处理器中都隐藏其他项目内容并重置其触发器，因为页面内查找也能打开项目。自定义命令见 `custom-button-actions`（运行 `npx -y modern-web-guidance@latest retrieve "custom-button-actions"`）；`hidden="until-found"` 见 `search-hidden-content`（运行 `npx -y modern-web-guidance@latest retrieve "search-hidden-content"`）。

<a id="fallback-strategies"></a>

## 回退策略

<a id="mutually-exclusive-details"></a>

### 互斥 `details`

互斥 <details> 的 Baseline 状态：新近可用。自 2024-09-03 起达到 Baseline。
支持：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 130（2024 年 9 月）和 Safari 17.2（2023 年 12 月）。

不支持 `details` 的 `name` 时，多项会同时保持打开，仍是可用的非互斥面板。若互斥对体验至关重要，可实现回退。它也让始终打开一项的面板继续工作，因为打开另一项时原项目仍会关闭：

```javascript
// Only needed where the name attribute is unsupported
if (!Object.hasOwn(HTMLDetailsElement.prototype, "name")) {
	document.addEventListener("toggle", event => {
		const details = event.target;
		if (!(details instanceof HTMLDetailsElement) || !details.open || !details.hasAttribute("name")) return;

		const name = CSS.escape(details.getAttribute("name"));
		for (const other of document.querySelectorAll(`details[name="${name}"]`)) {
			if (other !== details) other.open = false;
		}
	}, { capture: true }); // toggle does not bubble, hence capture
}
```

<a id="expand-all-and-collapse-all"></a>

### 全部展开与全部折叠

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起达到 Baseline。
支持：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

Baseline 目标不支持 invoker commands 时，按钮无效。用 `Object.hasOwn(HTMLButtonElement.prototype, "commandForElement")` 检测，并回退到执行同一循环的 `click` 监听器。详见 `custom-button-actions`（运行 `npx -y modern-web-guidance@latest retrieve "custom-button-actions"`）。

<a id="open-and-close-animation"></a>

### 打开与关闭动画

::details-content 的 Baseline 状态：新近可用。自 2025-09-16 起达到 Baseline。
支持：Chrome 131（2024 年 11 月）、Edge 131（2024 年 11 月）、Firefox 143（2025 年 9 月）和 Safari 18.4（2025 年 3 月）。

interpolate-size 的浏览器支持：有限可用。
支持：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

transition-behavior 的 Baseline 状态：新近可用。自 2024-08-06 起达到 Baseline。
支持：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.4（2024 年 3 月）。

动画属于渐进增强，无需回退。缺少 `interpolate-size` 时立即开关；缺少 `transition-behavior` 时，折叠开始就隐藏内容，空区域高度继续动画，而打开仍可动画。

<a id="custom-accordion-1"></a>

### 自定义折叠面板

hidden="until-found" 的浏览器支持：有限可用。
支持：Chrome 102（2022 年 5 月）、Edge 102（2022 年 5 月）和 Firefox 148（2026 年 2 月）。
不支持：Safari。

不支持 `until-found` 时，该属性表现为普通 `hidden`：内容隐藏且无法查找，但折叠面板仍可用。

