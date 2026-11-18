<a id="custom-text-decorations"></a>
# 自定义文字装饰

使用原生 `text-decoration` 属性设置下划线、上划线和删除线，不要用边框、背景渐变或伪元素模拟。原生装饰会随文字跨行延续，遵循字体度量，跳过字形降部，并通过嵌套元素继承，这些都无需重新实现。只有装饰必须勾勒文字轮廓或包围文字，而不是沿文字延伸时，才使用本指南后半部分基于盒子的技术。

文字装饰适用于任何文字，并不限于链接。如果带下划线的文字不是链接，确保不会被误认为链接。装饰链接时，使用真实指向目标的 `<a href>`，若要在新标签页打开，则添加 `target="_blank" rel="noopener"`；不要用 `href="javascript:void(0)"` 配合脚本处理器。真实链接能保留中键点击、复制链接和屏幕阅读器行为。

<a id="style-the-line"></a>
## 设置线条样式

使用 `text-decoration` 简写设置线条类型、样式、颜色和粗细，通过 `text-underline-offset` 设置与文字的间距。将选择器包裹在 `:where()` 中，使默认样式的优先级为零，后续任何覆盖都能胜出，无需自定义属性。

```css
:where(.decorated) {
  /* Thickness is relative to the font size (0.08em is an example value), so the line is not too heavy
     on small text or too light on large text, and max() keeps it at least 1px so it never disappears. */
  text-decoration: underline solid currentColor max(1px, 0.08em);
  /* Use em so the gap scales with the font size. 0.2em clears most descenders; example value. */
  text-underline-offset: 0.2em;
}

/* Example hover state: a softer line that firms up on hover and focus. The 50% mix and
   0.12em thickness are example values. */
:where(.decorated) {
  text-decoration-color: color-mix(in srgb, currentColor, transparent);
}

:where(.decorated:is(:hover, :focus-visible)) {
  text-decoration-color: currentColor;
  text-decoration-thickness: max(1px, 0.12em);
}

/* Other lines are a different text-decoration-line on the same properties */
.decorated-over    { text-decoration-line: overline; }
.decorated-through { text-decoration-line: line-through; }
```


`text-decoration-style` 接受 `solid`、`double`、`dotted`、`dashed` 和 `wavy`。`text-underline-offset` 只适用于下划线。

设计起点：

* **粗细：**正文约 `0.06em` 至 `0.1em`；标题和强调状态可以更粗，约 `0.1em` 至 `0.15em`。
* **偏移：**约 `0.15em` 至 `0.25em`。点线和波浪线比实线需要更多空间，应增大偏移。
* **颜色：**`currentColor` 使线条与文字匹配。用较柔和的文字混合色，在悬停时变得更清晰，可使大量链接保持平和。
* **样式：**链接用 `solid`，术语和缩写用 `dotted`，错误等注释用 `wavy`。

<a id="control-where-the-line-is-skipped"></a>
## 控制线条跳过的位置

<a id="ink-skipping"></a>
### 跳过字形笔画

默认情况下，下划线和上划线会绕开与其相交的字形部分，例如降部。通过 `text-decoration-skip-ink` 选择行为：

```css
.decorated {
  /* auto: skip ink for most scripts (default). none: draw straight through.
     all: also skip ink in scripts where auto does not, such as Japanese or Chinese. */
  text-decoration-skip-ink: all;
}
```


* 拉丁文字保持 `auto`，无需声明，因为它是默认值。
* 下划线足够接近基线而穿过表意字形，或混合文字必须保持一致外观时，使用 `all`。
* 对很粗或刻意装饰性的线条使用 `none`，避免间隙看起来像断裂。

<a id="skip-spaces"></a>
#### 跳过空格

`text-decoration-skip-spaces` 决定是否在空格下绘制线条。默认值 `start end` 不装饰前导和末尾空格。

```css
.decorated {
  /* Spaces collapse by default, so there is nothing to skip. Preserve them when the
     leading or trailing spaces are meaningful, such as padded input values. */
  white-space: pre;
  /* none: decorate every space. all: skip every space, so each word is underlined separately.
     start | end | start end: skip only leading, trailing, or both. */
  text-decoration-skip-spaces: all;
}
```


除非装饰需要明显覆盖内边距（`none`），或在每个单词之间断开（`all`），否则不要声明 `text-decoration-skip-spaces`。普通行内文本，例如链接文字，没有前导或末尾空格，因此该声明不起作用。

<a id="trim-or-extend-the-line-with-an-inset"></a>
## 通过内缩修剪或延长线条

`text-decoration-inset` 移动线条的起点和终点。正值将端点向内拉，负值将其向外推。一个值同时移动两端，两个值分别设置起端和末端。百分比相对于被装饰盒子的行内尺寸。

```css
/* Small insets soften the ends of the line; larger ones read as a deliberately short line.
   Both values are examples. */
.trimmed  { text-decoration-inset: var(--deco-inset, 0.1em); }
.extended { text-decoration-inset: calc(var(--deco-inset, 0.1em) * -1); }
```


要在悬停时显现下划线，而不用边框或背景渐变，将末端修剪 100%，再通过过渡恢复到 0：

```css
.reveal {
  text-decoration: underline; /* Always visible, including for reduced motion */
}

/* Only hide and animate the line when the user has not asked for reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .reveal {
    /* Trim the end by the full inline size so the line starts with zero length. */
    text-decoration-inset: 0 100%;
    /* 150ms to 300ms feels responsive without lagging; ease-out starts quickly. Example values. */
    transition: text-decoration-inset var(--reveal-duration, 0.25s) ease-out;
  }

  /* Include :focus-visible so keyboard users get the same reveal as pointer users. */
  .reveal:is(:hover, :focus-visible) {
    text-decoration-inset: 0 0;
  }
}
```


<a id="draw-a-custom-line-with-a-pseudo-element"></a>
## 使用伪元素绘制自定义线条

当线条必须是 `text-decoration` 无法绘制的形状，例如不规则曲线时，使用伪元素，并通过裁剪使其显现。不需要额外标记，链接仍是普通 `<a>`。

```html
<a class="draw" href="#">Hover to draw underline</a>
```


```css
.draw {
  position: relative;
  display: inline-block;
  color: inherit;
  text-decoration: none;
  padding-block-end: 0.4em; /* Space for the line below the text; example value */
}

.draw::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  block-size: 0.4em; /* Height of the squiggle; example value */
  pointer-events: none;
  border: var(--deco-thickness, max(1px, 0.08em)) solid var(--deco-color, currentColor);
  /* A single shape strokes along its path, using the border width as the stroke. Example squiggle. */
  border-shape: shape(from 0% 50%,
    curve to 20% 50% with 5% 0% / 15% 100%,
    smooth to 40% 50% with 35% 100%,
    smooth to 60% 50% with 55% 100%,
    smooth to 80% 50% with 75% 100%,
    smooth to 100% 50% with 95% 100%);
}

/* Only hide and animate the line when the user has not asked for reduced motion;
   otherwise it stays fully drawn. */
@media (prefers-reduced-motion: no-preference) {
  .draw::after {
    /* Clip the line away from the right edge. The negative block insets keep the stroke
       from being cut off vertically. */
    clip-path: inset(-1em 100% -1em 0);
    /* A slightly slower draw than a hover reveal reads as drawing; example duration. */
    transition: clip-path var(--draw-duration, 0.6s) ease-out;
  }

  .draw:is(:hover, :focus-visible)::after {
    clip-path: inset(-1em 0 -1em 0); /* Fully drawn */
  }
}
```


<a id="outline-text-with-a-box-instead"></a>
## 改用盒子勾勒文字轮廓

两种盒子属性可通过轮廓包围文字，而不是沿文字绘制线条。为文字添加内边距，防止轮廓碰到文字。

```css
/* Gradient outline with a see-through middle */
.ring {
  padding: 0.2em 0.75em; /* Example values: enough room that the outline does not touch the text */
  /* The border width is the visible outline thickness. Relative to the font size, with a 2px
     minimum so it stays visible on small text; example value. */
  border: var(--ring-width, max(2px, 0.12em)) solid transparent;
  background: linear-gradient(135deg, var(--ring-start, #2563eb), var(--ring-end, #db2777)) border-box;
  /* Paint the background only under the border, so the inside stays transparent. */
  background-clip: border-area;
}

/* Border that follows a shape that border-radius cannot draw, such as a tag with a pointed end */
.tag {
  padding: 0.2em 1.5em 0.2em 0.9em; /* Example values: extra room at the point so the text is not clipped */
  border: var(--shape-stroke, max(2px, 0.08em)) solid var(--shape-color, currentColor); /* Example stroke width */
  /* A single shape strokes along its path. Two shapes fill the area between them.
     This polygon is an example; use shape() for curves. */
  border-shape: polygon(0 0, 85% 0, 100% 50%, 85% 100%, 0 100%);
}
```


`border-shape` 只替换边框，背景仍是矩形盒子，因此不要依赖它填充形状。

如果只有角部需要不同形状，例如斜切、内凹或缺口标签，改用 `corner-shape` 配合 `border-radius`。它会让背景和边框都跟随角部形状，不支持的浏览器则回退为普通圆角。

```css
.label {
  padding: 0.2em 0.9em; /* Example values */
  border: var(--shape-stroke, max(2px, 0.08em)) solid var(--shape-color, currentColor);
  border-radius: 0.6em; /* Corner size; example value */
  corner-shape: bevel; /* round (default) | scoop | bevel | notch | square | squircle */
}
```


<a id="choose-a-technique"></a>
## 选择技术

* **`text-decoration`**，包括线条、跳过笔画、空格和内缩：线条应沿文字延伸、随文字换行并遵循字体度量。这是默认选择。
* **带 `border-shape` 和 `clip-path` 的伪元素**：线条需要自定义形状或逐步绘制动画。仅当 `text-decoration-style` 无法实现外观时才选它，因为它需要额外定位。
* **`background-clip: border-area`**：文字需要渐变轮廓。纯色轮廓已足够时，使用普通 `border-color`。
* **`corner-shape`**：只有角部需要斜切、内凹或缺口等不同形状。配合 `border-radius` 使用，后者设置角部尺寸。
* **`border-shape`**：轮廓需要标签或箭头等 `border-radius` 无法绘制的形状。圆角已足够时使用 `border-radius`。
* **通过内缩实现悬停显现**：当链接需要颜色变化之外的悬停提示时，值得添加。非交互文字则跳过。

<a id="fallback-strategies"></a>
## 回退策略

每种回退都保持文字可读，并保留核心装饰。根据 Baseline 目标判断需求：如果其中包含不支持某属性的浏览器，就应用对应回退。

<a id="ink-skipping-all"></a>
### 跳过笔画的 `all` 值

text-decoration-skip-ink: all 的 Baseline 状态：新近可用。自 2026-05-07 起纳入 Baseline。
支持的浏览器：Chrome 148（2026 年 5 月）、Edge 148（2026 年 5 月）、Firefox 75（2020 年 4 月）和 Safari 15.4（2022 年 3 月）。

如果 Baseline 目标不支持 `text-decoration-skip-ink: all`，声明会被忽略，浏览器保留 `auto`。拉丁字母降部仍会被跳过，只有日文等 `auto` 未覆盖的文字失去笔画避让。这是平稳降级，无需额外代码。

<a id="skip-spaces-1"></a>
### 跳过空格

如果 Baseline 目标不支持 `text-decoration-skip-spaces`，浏览器采用自身默认的空格处理。这是平稳降级：浏览器未跳过的空格下仍会绘制线条。

<a id="inset"></a>
### 内缩

如果 Baseline 目标不支持 `text-decoration-inset`，声明会被忽略，链接保留正常且完整可见的下划线，过渡没有可动画化的内容。这是平稳降级：悬停显现效果消失，链接始终带下划线，因此无需 `@supports` 检查。

<a id="border-area"></a>
### 边框区域

background-clip: border-area 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 150（2026 年 6 月）、Edge 150（2026 年 7 月）和 Safari 18.2（2024 年 12 月）。
不支持的浏览器：Firefox。

如果 Baseline 目标不支持 `background-clip: border-area`，声明会被忽略，背景会绘制在整个边框盒下方，填满文字区域，而不只是轮廓。如果渐变是设计的一部分，不要退而只用普通纯色边框。应复现渐变，并仅在 `@supports` 内应用 `background-clip: border-area`。

如果元素背景是已知的纯色，使用不透明图层。在内边距盒上绘制表面颜色，在边框盒下绘制渐变，使渐变只透过透明边框显示：

```css
.ring {
  border: var(--ring-width, max(2px, 0.12em)) solid transparent; /* Example width */
  /* Fallback: an opaque surface layer hides the gradient inside the border. */
  background:
    linear-gradient(var(--surface, canvas) 0 100%) padding-box,
    linear-gradient(135deg, var(--ring-start, #2563eb), var(--ring-end, #db2777)) border-box;
}

@supports (background-clip: border-area) {
  .ring {
    background: linear-gradient(135deg, var(--ring-start, #2563eb), var(--ring-end, #db2777)) border-box;
    background-clip: border-area; /* The inside stays transparent */
  }
}
```


如果内部必须保持透明，使用带遮罩的伪元素。伪元素承载渐变，遮罩裁去除内边距环之外的全部内容：

```css
@supports not (background-clip: border-area) {
  .ring {
    position: relative;
    border-color: transparent;
  }

  .ring::before {
    content: "";
    position: absolute;
    inset: calc(var(--ring-width, max(2px, 0.12em)) * -1); /* Cover the border box */
    padding: var(--ring-width, max(2px, 0.12em)); /* Ring thickness */
    border-radius: inherit;
    background: linear-gradient(135deg, var(--ring-start, #2563eb), var(--ring-end, #db2777));
    /* Keep only the area between the content box and the border box. */
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }
}
```


<a id="border-shape"></a>
### 边框形状

border-shape 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 147（2026 年 4 月）和 Edge 147（2026 年 4 月）。
不支持的浏览器：Firefox 和 Safari。

如果 Baseline 目标不支持 `border-shape`，声明会被忽略，元素保留矩形边框。只有形状纯属装饰时，圆角矩形才是可接受的回退。如果形状承载含义，例如标签、箭头或标注，应尽可能忠实复现，并仅在 `@supports` 内应用 `border-shape`。

使用裁剪后的伪元素绘制轮廓。保留透明边框，使盒子尺寸与支持场景相同；用轮廓色填充伪元素，再通过采用 `evenodd` 的 `clip-path` 将其裁成环：先定义外形，再定义按描边宽度内缩的同一形状。

```css
.tag {
  --stroke: max(2px, 0.08em); /* Example stroke width */
  position: relative;
  padding: 0.2em 1.5em 0.2em 0.9em; /* Example values */
  border: var(--stroke) solid transparent;
}

@supports not (border-shape: circle(50%)) {
  .tag::before {
    content: "";
    position: absolute;
    inset: calc(var(--stroke) * -1); /* Cover the border box */
    background: var(--shape-color, currentColor);
    pointer-events: none;
    /* Outer shape, then the inner shape inset by the stroke. The inner points are approximate on
       diagonal edges, so the stroke looks slightly thinner there. */
    clip-path: polygon(evenodd,
      0 0, 85% 0, 100% 50%, 85% 100%, 0 100%,
      var(--stroke) var(--stroke),
      calc(85% - var(--stroke)) var(--stroke),
      calc(100% - var(--stroke) * 2) 50%,
      calc(85% - var(--stroke)) calc(100% - var(--stroke)),
      var(--stroke) calc(100% - var(--stroke)));
  }
}

@supports (border-shape: circle(50%)) {
  .tag {
    border-color: var(--shape-color, currentColor);
    border-shape: polygon(0 0, 85% 0, 100% 50%, 85% 100%, 0 100%);
  }
}
```


如果需要实心形状而非轮廓，直接对元素应用具有相同顶点的 `clip-path: polygon(...)`。

对于伪元素下划线，在 `.draw::after` 上用 `border-block-end` 绘制直线，并仅在 `@supports (border-shape: circle(50%))` 内应用波浪线的 `block-size`、`border` 和 `border-shape`。回退线虽然是直的，但仍保留逐步绘制效果，因为 `clip-path` 动画不依赖形状。

`clip-path` 也会裁切焦点环和 `box-shadow`。不要依赖被裁剪元素上的轮廓显示焦点，应改用 `:focus-visible` 的颜色或背景变化。
