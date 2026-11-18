<a id="build-breadcrumbs"></a>

# 构建面包屑导航

面包屑显示用户在站点层级中的位置，并链接到每个祖先页面。

它不用于同页不同视图之间切换（tabs），也不是站点全局导航（navbar）。

<a id="1-semantics"></a>

## 1. 语义

- 用 `<nav aria-label="Breadcrumbs">` 包裹路径，其中包含 `<ol>` 有序列表，每个 `<li>` 内有一个 `<a>`。顺序表达层级，因此用 `ol`，不用 `ul`。
- 页面有多个导航 landmark 时，给每个 `<nav>` 唯一标签，例如“Breadcrumbs”。
- 最后一项即当前页面，保留为链接，并标记 `aria-current="page"`。不要改为纯文本，以保持结构一致。
- 分隔符属于装饰，不要作为文本放入标记。通过 CSS 生成并提供空 alt，使其不进入无障碍树：

```css
/* The empty alt text after the slash hides the divider from screen readers; li + li skips the first item */
.breadcrumb > ol > li + li::before { content: "/" / ""; }
```

- 如上生成的样式化字符（`/`、`›`、`>`）是最简单分隔符。若采用 chevron 等图标，沿用代码库的图标渲染方式，并保持装饰性；见 `icons`（运行 `npx -y modern-web-guidance@latest retrieve "icons"`）。

<a id="2-styling"></a>

## 2. 样式

- 在 `<ol>` 上使用 `display: flex; flex-wrap: wrap; align-items: center; gap`，并重置列表样式。
- 无论视觉风格如何，路径都必须让人看出前后关系：各步通过斜线/chevron 分隔，或箭头/斜切形状相连。带分隔符的普通链接是默认且最稳妥选择。
- **不要**在类似 chip 的样式中省略分隔符。无分隔符的胶囊、标签、分段栏像同级 tabs 或筛选器，而非层级。无分隔符的纯文本也弱，因为只剩顺序这一线索，应避免。
- 选择视觉变体：
  - **普通链接（斜线或 chevron）：** 适合视觉上低调的路径。常态显示下划线，或至少 hover/focus 时显示，避免仅靠颜色。
  - **栏：** 一个带边框、分段的容器，设置 `overflow: clip`，适合需要较大清晰触摸目标的场景。第一段之后每段保留分隔符。栏不能换行；一行容纳不下时，在略大于其自然宽度的容器查询断点中改为纵向堆叠（测量后向上取整，只有放不下才堆叠），减小块方向 padding，使行紧凑，用 1px `border-block-start` 分隔，将 chevron 转向下。连体胶囊采用固定 `border-radius`，因为变高后 `999px` 会成为椭圆。连体胶囊的容器本身设圆角（`border-radius: 999px`），段间用 1px `border-inline-start`、无 gap 分隔。当前页 `<li>` 与其链接使用相同背景，避免链接外的 chevron 落在栏背景上。给容器而非每个链接设圆角，让裁切处理两端；同时给末端链接同样的端部圆角，使内嵌焦点环顺着圆角，而不是被裁掉。
  - **胶囊/标签：** 路径是突出控件时，用圆角或异形链接，仍在彼此之间保留分隔符。标签仅在 hover 时显示背景。
- 通过字重、颜色区分当前页，为非当前链接提供 hover 状态。
- 自定义配色需确保链接、hover、当前页与各自实际背景（如浅灰上的深红）满足 WCAG AA 对比度，文字至少 4.5:1。当前页保留字重等非颜色线索。
- 提供清晰的 `:focus-visible` 轮廓，与背景对比度至少 `3:1`。异形或裁切段使用负 `outline-offset` 或背景/颜色变化，因为外轮廓会被裁切。
- 将焦点链接抬到邻居之上（`a:focus-visible` 上设置 `position: relative; z-index: 1`）。重叠邻居会稍后绘制，遮住外侧焦点环。
- 在 `forced-colors: active` 下恢复边框，并为 `[aria-current="page"]` 加下划线，因为背景会被移除。mask 背景绘制的分隔图标还需要 `forced-color-adjust: none` 和 `CanvasText` 等系统色，因为强制颜色会替换背景。

<a id="shaped-segments"></a>

### 异形分段

选择能产生所需形状的最简单技术，每条路径只使用**一种**形状。各代码片段是替代方案，不应混用。

- 选择器只是示意，使用自己的 hook（这里是 `.breadcrumb`），范围限定为 `> ol > li > a`。
- 用 `clamp()` 和容器单位（`cqi`）让斜切或尖角尺寸响应空间。
- 状态配色应与形状结合：hover、当前页用背景或文字颜色，不用边框色。焦点样式要明显区别于 hover。
- 焦点使用负 `outline-offset`，因为外侧轮廓会被邻居遮挡。

<a id="overlapping-segments"></a>

#### 重叠分段

即使没有分隔符，重叠分段也能传达层级。用负的行内 margin 将各段拉入前一段下面，再按源码逆序堆叠，使前段高于后段。`sibling-index()`、`sibling-count()` 可避免逐项写规则：

```css
.breadcrumb > ol > li { position: relative; z-index: calc(sibling-count() - sibling-index()); }
/* The focused segment sits above every other segment (the li is the stacking context, so lift it, not the link) */
.breadcrumb > ol > li:has(> a:focus-visible) { z-index: calc(sibling-count() + 1); }
```

<a id="simple-irregular-shapes-corner-shape"></a>

#### 简单不规则形状（`corner-shape`）

平行四边形和箭头优先用 `corner-shape: bevel` 搭配不规则 `border-radius`。它比 `border-shape` 支持更好，并保留普通边框的灵活性（各边不同宽度、颜色、样式）；`border-shape` 则需要显式内外形状，或只能统一描边。使用逻辑圆角属性，让 RTL 自动镜像，无需 `:dir(rtl)`。

斜切（`/`）：对 start-start 和 end-end 角使用 bevel，水平半径为斜切尺寸，垂直半径为 100%。

箭头（`>`）：对两个 end 角使用 bevel，水平半径为尖角尺寸，垂直半径为 50%。让下一段重叠，使每段尖端覆盖下一段平直起边。

```css
.breadcrumb { --slant: clamp(.4rem, 2cqi, .75rem); }
.breadcrumb > ol, .breadcrumb > ol > li { gap: 0; }
.breadcrumb > ol > li > a {
  display: block;
  corner-shape: bevel;
  /* Extra inline padding equal to the slant keeps text out of the angled corners */
  padding: .55rem calc(var(--slant) + .8rem);
}
/* The shape shows direction, so drop the separator */
.breadcrumb > ol > li + li::before { content: none; }

/* SLANT ONLY: leans like "/" in LTR and "\" in RTL */
.breadcrumb > ol > li > a {
  border-start-start-radius: var(--slant) 100%;
  border-end-end-radius: var(--slant) 100%;
}
/* Overlap by the slant, minus a small visible gap (example .25rem), so the angled edges run parallel */
.breadcrumb > ol > li + li { margin-inline-start: calc(.25rem - var(--slant)); }

/* ARROW ONLY: tip on the end side; a contrasting segment border separates the overlapped edges */
.breadcrumb > ol > li > a {
  border-start-end-radius: var(--slant) 50%;
  border-end-end-radius: var(--slant) 50%;
}
.breadcrumb > ol > li + li { margin-inline-start: calc(var(--slant) * -1); }
```

<a id="fully-irregular-shapes-border-shape"></a>

#### 完全不规则形状（`border-shape`）

仅对 `corner-shape` 无法构造的形状使用 `border-shape`，例如前缘凹入的缺口箭头。在自定义属性 `--shape` 定义多边形，通过 `border-shape` 应用，使边框和焦点轮廓随形状变化。多边形具有物理方向，逻辑属性不会翻转 `polygon()` 坐标，因此每个形状需要显式 `:dir(rtl)` 镜像。

```css
/* The first item drops the inner notch vertex so its leading edge stays flat */
.breadcrumb > ol > li > a {
  --shape: polygon(0 0, calc(100% - var(--point)) 0, 100% 50%, calc(100% - var(--point)) 100%, 0 100%, var(--point) 50%);
  padding: .55rem calc(var(--point) + .8rem);
  border-shape: var(--shape);
}
.breadcrumb > ol > li:first-child > a {
  --shape: polygon(0 0, calc(100% - var(--point)) 0, 100% 50%, calc(100% - var(--point)) 100%, 0 100%);
}
/* Overlap by slightly less than --point so the notch and tip interlock */
.breadcrumb > ol > li + li { margin-inline-start: calc(.25rem - var(--point)); }
/* RTL mirror: swap 0 with 100% and calc(100% - var(--point)) with var(--point) in each x coordinate */
.breadcrumb:dir(rtl) > ol > li > a {
  --shape: polygon(100% 0, var(--point) 0, 0 50%, var(--point) 100%, 100% 100%, calc(100% - var(--point)) 50%);
}
.breadcrumb:dir(rtl) > ol > li:first-child > a {
  --shape: polygon(100% 0, var(--point) 0, 0 50%, var(--point) 100%, 100% 100%);
}
```

<a id="3-optional-ux-enhancements"></a>

## 3. 可选体验增强

以下均可选，仅在路径确有需要时实现，并自行选择实现方式。

- **同级菜单：** 祖先存在有意义的同级页面（例如文档章节）时，允许通过菜单展示其同级。祖先链接仍负责导航，另放独立切换按钮，不要放进 `<a>`。菜单机制见 `menu`（运行 `npx -y modern-web-guidance@latest retrieve "menu"`）。
- **长路径：** 窄容器中超过 3 项时，折叠中间部分而不是换行，保留第一项和最后两项。隐藏链接放进“…”按钮打开的弹出层；无脚本时保留完整路径。
- **长标签：** 每项保持一行，绝不截断当前页。祖先标签截断与顺畅地按需显示完整内容见 `single-line-overflow`（运行 `npx -y modern-web-guidance@latest retrieve "single-line-overflow"`）。

<a id="fallback-strategy"></a>

## 回退策略

<a id="corner-shape"></a>

### `corner-shape`

corner-shape 的浏览器支持：有限可用。
支持：Chrome 139（2025 年 8 月）和 Edge 139（2025 年 8 月）。
不支持：Firefox 和 Safari。

- 圆角不是斜切和箭头可接受的回退。基础样式应保留带边框的普通矩形段和分隔符（`li + li::before`）；所有产生形状的声明（`corner-shape`、圆角半径、padding、重叠 margin、分隔符 `content: none`）都放入 `@supports (corner-shape: bevel)`，使不支持的分段不重叠、不丢分隔符。

<a id="sibling-index-and-sibling-count"></a>

### `sibling-index()` 和 `sibling-count()`

sibling-count() 和 sibling-index() 的 Baseline 状态：新近可用。自 2026-08-18 起达到 Baseline。
支持：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 154（2026 年 8 月）和 Safari 26.2（2025 年 12 月）。

- 不支持时，后面的段绘制在上方；斜切不受影响，但箭头尖端会隐藏。将堆叠规则放入 `@supports (z-index: sibling-index())`，并同时检查 `corner-shape` 和 `sibling-index()` 才启用箭头，否则保留带分隔符的普通形式：

```css
@supports (corner-shape: bevel) and (z-index: sibling-index()) {
  /* Arrow-only shape, overlap and stacking rules from above */
}
```

<a id="border-shape"></a>

### `border-shape`

border-shape 的浏览器支持：有限可用。
支持：Chrome 147（2026 年 4 月）和 Edge 147（2026 年 4 月）。
不支持：Firefox 和 Safari。

- 基础样式使用相同多边形的 `clip-path: var(--shape)`；在 `@supports (border-shape: polygon(0 0, 100% 0, 100% 100%))` 中设置 `clip-path: none` 并应用 `border-shape` 增强。
- `clip-path` 会裁切边框和轮廓，因此回退时使用颜色/背景变化与负 `outline-offset` 表示焦点，不使用外侧轮廓。
- `clip-path` 也会切掉边框斜边，而 `forced-colors: active` 会移除绘制形状的背景，导致裁切段失去外形。强制颜色模式下取消裁切，改用带文本分隔符的普通边框段，使其仍呈现路径：

```css
@media (forced-colors: active) {
  /* Only without border-shape: with it, the border follows the shape and needs no change */
  @supports not (border-shape: polygon(0 0, 100% 0, 100% 100%)) {
    .breadcrumb > ol > li > a { clip-path: none; border: 2px solid LinkText; }
    .breadcrumb > ol > li + li { margin-inline-start: 0; } /* undo the shape overlap */
    .breadcrumb > ol > li + li::before { content: "›" / ""; } /* the shape no longer shows direction */
  }
}
```

- 路径功能保持完整，只有边框和轮廓不同。

