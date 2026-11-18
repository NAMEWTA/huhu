<a id="single-line-text-overflow"></a>

# 单行文本溢出

必须保持单行的文本（标签页和标签片名称、表格单元格、侧栏项目、文件名、媒体标题）往往长于可用空间，尤其是用户内容和翻译文本。

在 DOM 中保留完整文本，只调整渲染方式：完整文本既是无障碍名称，也是页内查找、复制和搜索所看到的内容。

本指南不涵盖允许换行的场景。

处理单行文本溢出包含两部分：

1. 如何显示截断文本。
2. 用户如何得知完整文本。

<a id="how-to-display-truncated-text"></a>

## 如何显示截断文本

截断只影响视觉呈现。屏幕阅读器会朗读完整文本，页内查找会匹配完整文本，复制也会得到完整文本。因此绝不能用脚本裁掉字符串。

<a id="1-truncate-with-an-ellipsis-at-the-end-or-middle"></a>

### 1. 使用省略号截断（末尾或中间）

```css
.label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```


- 使用 `overflow: hidden`，不要用 `clip`。两者都能渲染省略号，但只有 `hidden` 会让元素成为滚动容器；下方渐隐、滚动显示和 CSS 截断检测都依赖它。
- 在 flex／grid 中：允许包含它的 flex 或 grid 项缩小。默认情况下，项目拒绝缩小到内容尺寸以下（`min-inline-size: auto`）。如果被截断元素就是项目自身，`overflow: hidden` 已允许缩小；如果是后代（如按钮内的标签），在项目上设置 `min-inline-size: 0`。
- 在表格中，为表格设置 `table-layout: fixed` 和 inline 尺寸。自动布局下，单元格会增长以容纳文本，而非截断。
- 元素自身的 `overflow: hidden` 不会裁切自己的焦点轮廓，因此按钮和链接可以直接截断文本。轮廓会被裁切溢出的祖先裁掉，例如可滚动的一排项目；应为这些项目设置内缩轮廓（`outline-offset: -2px`）。

<a id="keeping-the-end-visible"></a>

#### 保持末尾可见

将可能截断的部分包起来，例如文件扩展名前的所有内容，或最后几个字符之前的部分；末尾作为普通文本放在后面。分割发生在标记中（或渲染时由脚本执行一次），绝不是删除字符。

```html
<!-- No whitespace before the extension, or it renders as a space -->
<span class="filename"><span>quarterly-report-final-v2</span>.pdf</span>
```


```css
.filename {
  display: flex;
  white-space: nowrap;
}

/* The trailing text is an anonymous flex item, which never shrinks below its content */
.filename > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
```


<a id="2-fade-out-the-end"></a>

### 2. 让末尾渐隐

使用 mask 让文本末尾渐隐。仅在文本溢出时渐隐，否则放得下的文本也会无故变淡。具有 `overflow: hidden` 的元素是滚动容器，因此只有内容溢出时，其滚动时间线才活跃。该时间线上的动画恰好只在文本截断时应用：

```css
/* --truncated is the flag the animation sets, registered so it does not inherit into nested elements.
   --fade-size is the configured size, registered so it can transition. */
@property --truncated {
  syntax: "<integer>";
  inherits: false;
  initial-value: 0;
}

@property --fade-size {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

.label {
  white-space: nowrap;
  overflow: hidden;
  /* Example value: how much of the text fades */
  --fade-size: 2rem;
  /* Gradient directions and positions are physical, so flip them for right-to-left text */
  --fade-dir: right;
  --fade-pos: 100%;
  /* An opaque layer that is not clipped to the box, minus a band at the end.
     Masking only the band keeps everything else visible, including a focus outline outside the box.
     The band is --fade-size while truncated, 0 otherwise. */
  mask:
    linear-gradient(black, black) no-clip subtract,
    linear-gradient(to var(--fade-dir), transparent, black) var(--fade-pos) 0 / calc(var(--truncated) * var(--fade-size)) 100% no-repeat no-clip;
  /* Sets the flag only while the text overflows: with no overflow the timeline is inactive and the animation has no effect */
  animation: truncated linear both;
  animation-timeline: scroll(self inline);

  &:dir(rtl) {
    --fade-dir: left;
    --fade-pos: 0;
  }
}

@keyframes truncated {
  from, to {
    --truncated: 1;
  }
}
```


关键帧只设置标志，再从标志派生渐隐带。下方的显示效果会对 `--fade-size` 做过渡；如果关键帧直接设置带宽或 mask，就不能在所有浏览器中跟随该过渡。

不要将单个渐变作为 mask。Mask 默认裁切到 border box，因此也会隐藏盒子外的元素焦点轮廓。

<a id="3-replace-with-a-predefined-shorter-version"></a>

### 3. 替换为预定义的较短版本

把两个版本都放在标记中，通过单元格或项目上的容器查询切换。短版本只负责展示：对辅助技术和选择操作隐藏；长版本只在视觉上隐藏，不用 `display: none`，使完整文本仍作为无障碍名称，并保留给复制和页内查找。

```html
<!-- The wrapper is the container: size containment has no effect on table cells themselves -->
<td><div class="day"><span class="long">Saturday</span><span class="short" aria-hidden="true">Sat</span></div></td>
```


```css
.day {
  container-type: inline-size;
}

.short {
  display: none;
  user-select: none;
}

/* Example threshold: relative units resolve against the container's own font */
@container (inline-size < 6em) {
  /* Visually hidden, but still in the accessibility tree */
  .long {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .short {
    display: inline;
  }
}
```


<a id="reveal-full-text-on-demand"></a>

## 按需显示完整文本

在交互元素的 `:hover` 和 `:focus-visible` 状态显示，不要只靠 hover。只有 `prefers-reduced-motion` 为 `no-preference` 时移动文本，否则保留省略号。

悬停和焦点无法在触摸设备上显示内容。为完整文本提供另一条途径：选中项目以未截断形式显示（选中的标签页绝不缩小）、点击行打开详情视图，或在其他位置也显示完整文本。

根据元素是否可以增长来选择：

1. **在盒内滚动文本**：适合其他内容不能移动的情况，例如网格、表格、标签栏、密集列表。元素保持原尺寸。
2. **扩展元素**：适合允许增长以容纳文本的情况，例如设置了 `min-inline-size` 和 `max-inline-size` 的标签片或标签。同级元素会移动让位，因此不要用于网格或表格，否则会破坏对齐。
3. **使用工具提示**：适合提供标签之外的额外信息，或完整文本可能极长的情况（方法 1 和 2 对极端长度差异的容忍度较低）。

<a id="1-scroll-the-text-inside-its-box"></a>

### 1. 在盒内滚动文本

将文本移动元素宽度与自身宽度之间的差值：百分比 margin 相对于元素解析，百分比 translate 相对于文本自身解析。元素自身的滚动时间线通过自定义属性标记截断，基于该属性的样式查询将移动限定在截断文本，放得下的文本不动。内部 `span` 是唯一新增标记，它成为移动的盒子。同一个 class 也可用于列表项等非交互元素，悬停仍能显示。

```html
<a class="label" href="…"><span>Meeting notes from Tuesday afternoon</span></a>
```


```css
.label {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Active only while the text overflows */
  animation: truncated linear both;
  animation-timeline: scroll(self inline);
}

/* The same flag as the fade, registered there so it does not inherit */
@keyframes truncated {
  from, to {
    --truncated: 1;
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* Outside the query: a container cannot query itself */
  .label:is(:hover, :focus-visible) {
    text-overflow: clip;
  }

  @container style(--truncated: 1) {
    .label:is(:hover, :focus-visible) > span {
      /* Needs its own box to be moved. It stays inline otherwise, so the ellipsis renders. */
      display: inline-block;
      /* Forward by the element's width, then back by the text's own width */
      margin-inline-start: 100%;
      /* 1px short, so the text still overflows and the timeline stays active */
      translate: calc(1px - 100%);
      /* Example values. Set only here: when the pointer leaves, the text snaps back behind the ellipsis */
      transition: margin-inline-start 2s ease-in, translate 2s ease-in;
    }

    /* The overflow is on the left, so the text moves right */
    .label:is(:hover, :focus-visible):dir(rtl) > span {
      translate: calc(100% - 1px);
    }
  }
}
```


持续时间固定，因此文本越长滚动越快。CSS 无法测量文本；如果恒定速度很重要，在下方检测章节的 `ResizeObserver` 中，通过脚本将 `--scroll-width` 自定义属性设为隐藏宽度（`scrollWidth - clientWidth`，使用数值），并据此推导滚动与渐隐的持续时间：

```css
/* Example speed: 10ms per hidden pixel. Without script, assumes 200px. */
transition-duration: calc(var(--scroll-width, 200) * 10ms);
```


使用起步慢、随后加速的 timing function，例如 `ease-in`：指针只是经过时，文本几乎不动；而用户等待的末尾能快速到达。

如果使用渐隐而非省略号，文本会滚到渐隐下面，末尾仍然不可读。让渐隐与滚动同步缩小，使末尾到达时渐隐消失：

```css
@media (prefers-reduced-motion: no-preference) {
  .label:is(:hover, :focus-visible) {
    --fade-size: 0px;
    /* Same duration and easing as the scroll. Set only here, so the fade is back as soon as the text snaps back. */
    transition: --fade-size 2s ease-in;
  }
}
```


<a id="2-expand-the-element"></a>

### 2. 扩展元素

让元素增长到适合文本的尺寸，并为增长添加过渡。设置 `interpolate-size: allow-keywords`，让过渡能插值到 `max-content`。

```css
.chip {
  /* Example values */
  min-inline-size: 6rem;
  max-inline-size: 12rem;
  interpolate-size: allow-keywords;

  & > span {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:is(:hover, :focus-visible) {
    max-inline-size: var(--expanded-max-inline-size, max-content);
  }

  @media (prefers-reduced-motion: no-preference) {
    transition: max-inline-size .3s;
  }
}
```


<a id="3-use-a-tooltip"></a>

### 3. 使用工具提示

工具提示作为元素的描述暴露，而标签仍作为名称。
如果工具提示只是重复标签，应对辅助技术隐藏（`aria-hidden="true"`），否则屏幕阅读器会朗读两遍。
如果增加了信息，则保持可访问：名称和描述会作为不同内容朗读。如果其中也重复了标签，隐藏工具提示的那部分（设置 `aria-hidden="true"`），使描述只包含新增信息。
不要只依赖 `title`，键盘和触摸都无法访问它。
工具提示参见 `interest-triggered-tooltips`（通过 `npx -y modern-web-guidance@latest retrieve "interest-triggered-tooltips"` 获取）。

<a id="detecting-whether-the-text-is-truncated"></a>

## 检测文本是否截断

没有属性直接报告截断状态。可从溢出推导：元素能朝 inline 末端滚动时，文本即被截断。`text-overflow` 只改变绘制，因此存在省略号时也成立。

- **在 CSS 中**，像上面的渐隐一样，在元素自身 inline 滚动时间线上使用滚动驱动动画：仅在文本溢出时活跃。关键帧中的声明作用于元素自身。对后代和伪元素，在关键帧中设置自定义属性，再用样式查询读取。例如，提示悬停能显示更多内容：

  ```css
  /* Registered so the flag does not inherit into nested truncated elements */
  @property --truncated {
    syntax: "<integer>";
    inherits: false;
    initial-value: 0;
  }

  .label {
    animation: truncated linear both;
    animation-timeline: scroll(self inline);
  }

  @keyframes truncated {
    from, to {
      --truncated: 1;
    }
  }

  @container style(--truncated: 1) {
    .label > span {
      text-decoration: underline dotted;
    }
  }
  ```


  元素的 `animation` 承载检测：其他动画必须加入该列表，因为重新声明 `animation` 会替换它。
  不要为此使用滚动状态查询（`scrollable`）：规范排除了 `overflow: hidden` 容器，因此今天会匹配的浏览器，未来可能不再匹配。

- **在脚本中**，当结果需要驱动 CSS 无法执行的操作（添加工具提示、设置 attribute）时，在 `ResizeObserver` 中比较 `scrollWidth` 和 `clientWidth`。文本变化后再次检查，因为 `ResizeObserver` 只响应尺寸变化。

  ```js
  const observer = new ResizeObserver(entries => {
    for (const { target } of entries) {
      target.classList.toggle('truncated', target.scrollWidth > target.clientWidth);
    }
  });
  observer.observe(label);
  ```


<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-scroll-driven-animations"></a>

### 滚动驱动动画的回退与浏览器支持

滚动驱动动画的 Baseline 状态：新近可用。它自 2026-10-27 起进入 Baseline。
支持的浏览器：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

没有滚动驱动动画，渐隐和提示都不会显示，滚动显示也不会开始；文本会被裁切，却没有任何指示。如果目标 Baseline 不支持，用脚本切换 class：`ResizeObserver` 比较 `scrollWidth` 与 `clientWidth`，class 设置与关键帧相同的标志。文本变化后再次检查，因为 `ResizeObserver` 只响应尺寸变化。

```js
if (!CSS.supports('animation-timeline', 'scroll()')) {
  const observer = new ResizeObserver(entries => {
    for (const { target } of entries) {
      target.classList.toggle('truncated', target.scrollWidth > target.clientWidth);
    }
  });

  for (const label of document.querySelectorAll('.label')) {
    observer.observe(label);
  }
}
```


```css
/* Same as the keyframes */
.label.truncated {
  --truncated: 1;
}
```


<a id="fallbacks--browser-support-for-style-queries"></a>

### 样式查询的回退与浏览器支持

容器样式查询的 Baseline 状态：新近可用。它自 2026-05-19 起进入 Baseline。
支持的浏览器：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 151（2026 年 5 月）和 Safari 18（2024 年 9 月）。

没有样式查询，渐隐仍有效，因为它作用于元素自身；但提示和滚动显示永远不会应用。改用上方滚动驱动动画回退中的 class 作为条件，并且不经过 `CSS.supports` 防护就设置该 class，因为 at-rule 无法进行特性检测。

```css
/* Same as the style queries */
.label.truncated > span {
  text-decoration: underline dotted;
}

@media (prefers-reduced-motion: no-preference) {
  .label.truncated:is(:hover, :focus-visible) > span {
    display: inline-block;
    margin-inline-start: 100%;
    translate: calc(1px - 100%);
    transition: margin-inline-start 2s ease-in, translate 2s ease-in;
  }
}
```


<a id="fallbacks--browser-support-for-interpolate-size"></a>

### `interpolate-size` 的回退与浏览器支持

interpolate-size 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

没有它，`max-content` 无法插值，元素会瞬间展开。改为过渡到一个长度值，略宽于最长文本即可。文本一旦放得下，增长就停止，因此远大于文本的值会提前结束可见过渡。

```css
.chip {
  @supports not (interpolate-size: allow-keywords) {
    --expanded-max-inline-size: 20rem;
  }
}
```


<a id="fallbacks--browser-support-for-container-queries"></a>

### 容器查询的回退与浏览器支持

容器查询（尺寸）的 Baseline 状态：广泛可用。它自 2023-02-14 起进入 Baseline。
支持的浏览器：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 110（2023 年 2 月）和 Safari 16（2022 年 9 月）。

容器查询及其单位已广泛可用，无须回退。

<a id="fallbacks--browser-support-for-masks"></a>

### Mask 的回退与浏览器支持

Mask 的 Baseline 状态：广泛可用。它自 2023-12-07 起进入 Baseline。
支持的浏览器：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

Mask，包括 `mask-composite` 和 `mask-clip: no-clip`，已广泛可用，无须回退。
