<a id="css-layouts-and-responsive-design"></a>

# CSS 布局与响应式设计

1. [1 基础](#1-fundamentals)
   1. [选择哪种布局模式？](#11-which-layout-mode-to-use)
   2. [工作原则](#12-working-principles)
2. [2 Flexbox](#2-flexbox)
3. [3 Grid 与 subgrid](#3-grid-and-subgrid)
   1. [代码示例：grid 与 subgrid](#31-code-example-grid-and-subgrid)
4. [4 容器查询](#4-container-queries)
   1. [代码示例：使用容器查询单位的流式排版](#41-code-example-fluid-typography-using-container-query-units)
5. [5 原生浮层、锚点定位与层叠上下文](#5-native-overlays-anchor-positioning-and-stacking-contexts)
6. [6 溢出跟踪与布局稳定性](#6-overflow-tracking-and-layout-stability)
7. [7 视口机制与轨道分配](#7-viewport-mechanics-and-track-distribution)
8. [8 Grid lanes（又称 masonry）](#8-grid-lanes-aka-masonry)

<a id="1-fundamentals"></a>

## 1 基础

尽可能依靠浏览器的布局引擎，以获得更好性能。在采用硬编码尺寸或复杂媒体查询前，优先考虑内在尺寸、逻辑属性和 `aspect-ratio`。

<a id="11-which-layout-mode-to-use"></a>

### 1.1 选择哪种布局模式？

从上到下检查以下决策树，在第一个匹配处停止。布局可以互相嵌套，每次决定都基于该容器的使用场景。

1. **只是简单的一行或一列项目？** 使用 **flexbox**：一维、内容优先，内容沿单轴分布。
2. **嵌套元素需要与祖父级网格的轨道对齐？** 使用 **subgrid**：二维、关系优先，继承父轨道，使孙级内容跨兄弟元素对齐。
3. **是同时包含行和列的复杂页面或组件结构？** 使用 **grid**：二维、布局优先，先定义骨架，再由内容填充。
4. **内容是需要拆成均衡多列的长篇正文？** 使用 **multi-column**：一维流，类似报纸排版。
5. **项目高度不同，需要紧密排列？** 当前使用 **grid** 配合 `grid-auto-flow: dense`；只有原生 masonry（又称“grid lanes”）进入你的 Baseline 目标后才采用它（见[第 8 节](#8-grid-lanes-aka-masonry)）。
6. **元素需要浮在页面上方，并始终在空间上连接触发器，即使跨 DOM 边界或层叠上下文？** 使用**锚点定位**：触发器设置 `anchor-name`，浮层设置 `position-anchor`（见[第 5 节](#5-native-overlays-anchor-positioning-and-stacking-contexts)）。

<a id="12-working-principles"></a>

### 1.2 工作原则

- 布局尺寸和间距使用逻辑属性（`inline-size`、`block-size`、`margin-inline`、`padding-block`、`inset-inline-start`）；完整说明见 `css`（运行 `npx -y modern-web-guidance@latest retrieve "css"`）。
- 运用“内容优先”和“布局优先”的思路：项目决定流动时使用 flexbox，先定义骨架时使用 grid。
- 使用 `place-*` 简写（`place-content`、`place-items`、`place-self`），通过一条声明同时处理两轴对齐。
- 在固定 `width`/`height` 前，先用内在尺寸（`min-content`、`max-content`、`fit-content()`）和弹性轨道（`fr`、`minmax()`），以减少媒体查询、增强布局适应性。
- 不要用 `overflow: hidden` 掩盖布局问题，应从源头修复。例如 `<canvas>`、`<img>`、`<svg>`、`<video>`、`<iframe>` 等替换元素默认使用 `display: inline`，在某些布局中会产生空隙。不要用 `overflow` 裁切空隙，而要应用块级 display-outside 值（例如 `display: block`、`grid`、`flex` 等）消除它。
- 使用 `aspect-ratio` 为媒体预留空间，防止资源加载前发生布局偏移。

```css
.sidebar       { inline-size: max-content; }    /* Size to longest unbreakable token. */
.main-content  { inline-size: fit-content; }    /* Grow to available space, no further. */
.media         { aspect-ratio: 16 / 9; inline-size: 100%; block-size: auto; }
body.centered  { display: grid; place-content: center; min-block-size: 100dvb; }
```

> `calc-size()` 与考虑约束的内在尺寸详见 `calculate-with-intrinsic-sizes`（运行 `npx -y modern-web-guidance@latest retrieve "calculate-with-intrinsic-sizes"`）。

<a id="2-flexbox"></a>

## 2 Flexbox

flex-wrap: balance 的浏览器支持：有限可用。
支持：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

一维布局：项目沿单一**主轴**流动，在**交叉轴**上对齐。适用于导航栏、工具栏、项目行，以及任何单行或单列分布。

**应当：**

- 用 `display: flex` 建立上下文，用 `flex-direction` 设置主轴（默认 `row`）。
- 可能溢出时使用 `flex-wrap: wrap`；`nowrap` 若没有 `overflow: auto/hidden`，会在窄视口溢出。
- 对由紧凑项目组成的换行行（如标签云、筛选胶囊、按钮组、导航链接），在 `flex-wrap: wrap` 后再声明 `flex-wrap: balance`，让项目均衡分配到各行，避免最后一行只剩一个项目；不支持的浏览器回退到 `wrap`。
- 对项目使用 `flex` 简写 `<grow> <shrink> <basis>`（例如 `flex: 1 1 250px`），而不是分别设置 `flex-grow`/`flex-shrink`/`flex-basis`。
- 用 `gap`（或 `row-gap`/`column-gap`）设置项目间距，不用子元素 margin。
- 在位置对齐前加 `safe`（例如 `align-items: safe center`），避免容器小于内容时裁切可聚焦内容。
- 用 `margin-inline-start: auto`（或 `margin-block-start: auto`）把单个项目推到主轴末端，这是标准处理方式。
- 用 `align-self` 覆盖单个项目的交叉轴对齐。
- 用 `align-items` 让全部项目在交叉轴居中；用单个项目上的 `margin: auto` 让它独立在两轴居中；只有容器换行且多行之间有额外空间时才用 `align-content`。
- 对包含不可断开长内容（URL、代码、长字符串）的 flex 项目设置 `min-inline-size: 0`（或 `min-width: 0`）；默认情况下 flex 项目不会缩到内容尺寸以下，因而溢出。

**不要：**

- 不要对 flex 项目使用 `justify-self`，它仅适用于 grid、block 和绝对定位布局。使用自动 margin。
- 不要通过 `order` 或 `flex-direction: *-reverse` 重排交互内容；它们只改变视觉顺序，连续焦点仍遵循 DOM 顺序，因此键盘 Tab 顺序会与画面不一致。
- 不要混淆 `space-around`（两端半间距）和 `space-evenly`（前、后及项目之间的间距相等）。
- 不要忘记轴向变化：`flex-direction: column` 时，`justify-content` 在块轴对齐，`align-items` 在行内轴对齐，与默认情况相反。
- 不要让容器和子元素都以填满对方为尺寸依据，这容易造成溢出和意外结果。给其中一方明确尺寸。
- 不要同时为同一项目设置 `flex-basis` 和 `width`/`inline-size`；flex 上下文中 `flex-basis` 优先，`width` 会被忽略。将 `flex-basis`（或 `flex` 简写）作为 flex 项目尺寸的唯一依据。

```css
.card-grid        { display: flex; flex-flow: row wrap; gap: 1rem; }
.card-item        { flex: 1 1 250px; }                  /* grow, shrink, basis */
.card-item-action { margin-inline-start: auto; }        /* Push to main-axis end. */
.toolbar          { display: flex; align-items: safe center; }
.tag-list         { display: flex; flex-wrap: wrap; flex-wrap: balance; gap: 0.5rem; }
```

<a id="3-grid-and-subgrid"></a>

## 3 Grid 与 subgrid

Subgrid 的 Baseline 状态：广泛可用。自 2023-09-15 起达到 Baseline。
支持：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 71（2019 年 12 月）和 Safari 16（2022 年 9 月）。

二维布局：显式定义行与列，或由引擎推导。Subgrid 让嵌套网格继承父级轨道，使孙级元素跨兄弟元素对齐。

**选择 grid 特性：**

- 是否明确知道需要多少列？
  - **是**：使用显式轨道（`grid-template-columns: 200px 1fr`、`repeat(3, 1fr)` 等）。
    - 不同列需要不同尺寸（侧边栏 + 主区、页头横跨全部列）？使用 `grid-template-areas`，得到命名清晰的区域。
    - 所有列相同，或完全按网格线编号定位？使用 `repeat(N, ...)` 或命名网格线。
  - **否**（响应式、项目数量未知）：使用 `repeat(auto-fit, minmax(min, 1fr))`。
    - 最后一行的项目应伸展以填满剩余空间？使用 `auto-fit`。
    - 最后一行的空轨道应保持最小尺寸，保留空列槽位？使用 `auto-fill`。
- 是否需要把项目放到特定位置？
  - **是**：使用 `grid-column: <start> / <end>` 或 `grid-area: <name>`。
  - **否**（只是跨多条轨道，不关心流动位置）：使用 `grid-column: span <n>`。
- 子元素是否需要继承父网格轨道尺寸（解决兄弟元素之间参差不齐的对齐）？
  - **是**：在相关轴上使用 subgrid。
    - 每个单元格子元素数量可变？只对**一个轴**使用 subgrid，另一轴使用 `grid-auto-rows`/`grid-auto-columns`。
    - 子元素数量固定？可以在两个轴上都使用 subgrid。
  - **否**：使用标准 grid，无需 subgrid。

**应当：**

- 用 `display: grid` 建立上下文。
- 复杂页面级布局使用 `grid-template-areas`，区域名可自我说明，声明可按行列排齐，便于一眼理解。
- 响应式卡片网格使用 `repeat(auto-fit, minmax(200px, 1fr))`，使有内容的轨道伸展填满整行；希望空的重复轨道保持最小尺寸时使用 `auto-fill`。
- 使用 `fr` 按比例分配轨道，使用 `minmax(min, max)` 定义弹性但有边界的轨道。
- 用 `grid-column: span <n>` 跨轨道定尺寸，用 `grid-column: <start> / <end>` 放到特定网格线，用 `grid-area: <name>` 放到命名区域。
- 使用 subgrid（`grid-template-columns: subgrid` 或 `grid-template-rows: subgrid`）解决卡片列表边缘参差问题，让标题、元数据和操作按钮等内部元素跨卡片对齐。
- 在 subgrid 声明前提供显式的 `grid-template-rows`/`-columns`，作为同一层叠位置的旧浏览器回退。

**不要：**

- 不要期待 `auto-fit`/`auto-fill` 轨道尺寸来自项目内容，它来自 `repeat()` 的尺寸参数。
- 不要对交互内容使用 `grid-auto-flow: dense`。它能紧密填充，却会改变视觉顺序，破坏按 DOM 顺序进行的键盘 Tab 操作。
- 子元素数量可变时，不要对两个轴同时使用 subgrid。多出的元素会落到最后一条轨道；隐式轴应使用 `grid-auto-rows`/`grid-auto-columns`。
- 不要混淆 `justify-items`/`align-items`（在**轨道内**对齐项目内容）与 `justify-content`/`align-content`（在**容器内**对齐网格轨道）。用错会静默无效。
- 容器没有确定 `inline-size` 时，不要使用 `repeat(auto-fit/auto-fill, ...)`；在 `display: inline-grid` 或未指定尺寸的 flex 项目中，容器没有可分配宽度，轨道数量会难以预测。

<a id="31-code-example-grid-and-subgrid"></a>

### 3.1 代码示例：grid 与 subgrid

页面外壳：`<main class="page-layout">` 包含 `<header>`、`<aside>`、带有 `<div class="card">` 子项的 `<section class="card-grid">`，以及 `<footer>`。

```css
/* Align grid-template-areas in rows and columns for readability. */
.page-layout {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-areas:
    "header  header  header"
    "sidebar main    main"
    "footer  footer  footer";
  gap: 1.5rem;
}

header  { grid-area: header; }
aside   { grid-area: sidebar; }
footer  { grid-area: footer; }

.card-grid {
  grid-area: main;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-template-rows: auto 1fr; /* title block, body block */
  gap: 1rem;
}

.card {
  grid-row: span 2;
  display: grid;
  /* Same-cascade fallback: ignored when subgrid is supported. */
  grid-template-rows: auto 1fr;
  grid-template-rows: subgrid;
}
```

<a id="4-container-queries"></a>

## 4 容器查询

尺寸容器查询的 Baseline 状态：广泛可用。自 2023-02-14 起达到 Baseline。
支持：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 110（2023 年 2 月）和 Safari 16（2022 年 9 月）。

查询祖先容器的尺寸或计算样式，而不是视口。可这样理解：容器查询对应组件上下文；媒体查询对应全局页面布局和用户偏好（`prefers-color-scheme`、`prefers-reduced-motion`）。

**应当：**

- 在包裹元素上使用 `container-type: inline-size`（只查宽度）或 `container-type: size`（两轴）建立包含上下文，然后后代才能使用查询。
- 嵌套上下文可能冲突时，用 `container-name` 或 `container` 简写（`container: card / inline-size`）命名容器。
- 计算流式字号与间距时使用容器查询单位：`cqi`/`cqb`（逻辑行内/块轴）、`cqw`/`cqh`（物理轴）、`cqmin`/`cqmax`。
- 使用 `container-type: size` 时始终给容器明确的 `block-size`；否则尺寸包含要求容器忽略内容，后代会塌缩。

**不要：**

- 不要将 `block-size` 用作 `container-type` 值，它无效。两轴都查询时用 `size`。
- 声明 `container-type` 后，不要期待子元素内在尺寸影响容器。一旦包含生效，容器会被当成没有子元素来计算。
- 不要依赖不符合条件祖先下的容器查询单位；它们会回退到小视口单位（`svw`/`svh`）。

<a id="41-code-example-fluid-typography-using-container-query-units"></a>

### 4.1 代码示例：使用容器查询单位的流式排版

```css
.card-wrapper {
  container: card / inline-size; /* shorthand for container-name / container-type */
}

@container card (inline-size > 400px) {
  .content {
    display: flex;
    gap: 2rem;
  }
}

.title {
  /* Fluid type bound to the container width, not the viewport. */
  font-size: clamp(1rem, 4cqi, 2rem);
}
```

> 组件驱动的响应式样式模式见 `size-aware-styling`（运行 `npx -y modern-web-guidance@latest retrieve "size-aware-styling"`）和 `fluid-scaling`（运行 `npx -y modern-web-guidance@latest retrieve "fluid-scaling"`）。

<a id="5-native-overlays-anchor-positioning-and-stacking-contexts"></a>

## 5 原生浮层、锚点定位与层叠上下文

<dialog> 的 Baseline 状态：广泛可用。自 2022-03-14 起达到 Baseline。
支持：Chrome 37（2014 年 8 月）、Edge 79（2020 年 1 月）、Firefox 98（2022 年 3 月）和 Safari 15.4（2022 年 3 月）。

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起达到 Baseline。
支持：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

锚点定位的浏览器支持：有限可用。
支持：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

**何时使用各类浮层基础能力：**

- 临时的非模态 UI（浮出菜单、toast、tooltip）使用 `popover`；它位于顶层，无需管理 `z-index`。
- 需要焦点约束与惰性背景的模态交互，使用 `<dialog>` 配合 `.showModal()`。
- 不要在同一元素上结合 `popover` 与 `.showModal()`，它们是互斥的运行时状态。

**锚点定位（浮层的空间布局）：**

- 使用 `position-area`（或 inset 上的 `anchor()`）及 `anchor-size()`，相对于触发器定位浮层并设置尺寸。
- 使用 `position-try-fallbacks`，让浏览器在浮层溢出视口时重新定位。`flip-block, flip-inline, flip-block flip-inline` 是合理默认值，也可以按具体场景定义回退。
- 不要在同一个 `position-area` 值中混用物理与逻辑关键字，应选定一个坐标系。
- 通过 `@supports (anchor-name: --x)` 检测特性，并提供绝对定位回退。

> 完整实现、polyfill 策略和 `popover` 值参考见 `declarative-dialog-popover-control`（运行 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"`）及 `position-aware-tooltips`（运行 `npx -y modern-web-guidance@latest retrieve "position-aware-tooltips"`）。锚点定位在下拉菜单、浮出菜单、标签页指示器中的应用见 `viewport-aware-dropdowns`（运行 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"`）及 `anchor-positioning-tab-underline`（运行 `npx -y modern-web-guidance@latest retrieve "anchor-positioning-tab-underline"`）。

<a id="6-overflow-tracking-and-layout-stability"></a>

## 6 溢出跟踪与布局稳定性

scrollbar-gutter 的 Baseline 状态：新近可用。自 2024-12-11 起达到 Baseline。
支持：Chrome 94（2021 年 9 月）、Edge 94（2021 年 9 月）、Firefox 97（2022 年 2 月）和 Safari 18.2（2024 年 12 月）。

目前没有主流浏览器原生支持 line-clamp。

以可预测的方式管理布局偏移、滚动条和裁切。

**应当：**

- 使用 `overflow: auto`，仅当内容实际溢出时显示滚动条。
- 使用 `overflow: clip` 裁切内容，而**不**建立滚动容器；通过 `overflow-clip-margin` 允许向外显示。
- 使用 `scrollbar-gutter: stable` 预留滚动条空间，防止内容增长时发生布局偏移。
- 在嵌套滚动区域（侧边栏、模态框、列表等）上使用 `overscroll-behavior: contain`（或 `none`），阻止滚动链传播到页面；若多余滚动需要传到祖先滚动容器，且不触发本地橡皮筋回弹，在中间滚动包裹层（例如滑动显露操作的轨道）上使用 `overscroll-behavior: chain`。
- 多行截断使用 `-webkit-line-clamp` + `display: -webkit-box` + `-webkit-box-orient: vertical` 三件套；虽然带前缀，但这套模式已完整写入规范，并未弃用。同时声明无前缀的 `line-clamp` 简写，不支持它的浏览器会无害地忽略。
- 必须保持单行的文本（标签、表格单元格、文件名），参见 `single-line-overflow`（运行 `npx -y modern-web-guidance@latest retrieve "single-line-overflow"`），了解如何截断，并顺畅地按需展示完整文本。

**不要：**

- `auto` 足够时，不要用 `overflow: scroll`，因为 `scroll` 会在没有可滚内容时也强制显示滚动条。
- 仅需裁切时不要用 `overflow: hidden`；`hidden` 会建立可由程序滚动的滚动容器。

```css
.scrollable-list {
  max-block-size: 400px;
  overflow-y: auto;
  scrollbar-gutter: stable;       /* Reserve scrollbar space. */
  overscroll-behavior: contain;   /* No scroll chaining into the page. */
}

.snippet {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-clamp: 3;                  /* Ignored where unsupported. */
  overflow: clip;
}
```

> `overflow: clip` 和 `overflow-clip-margin` 深入说明见 `overflow-clipping-control`（运行 `npx -y modern-web-guidance@latest retrieve "overflow-clipping-control"`）。滑动显露 UI 中使用 `overscroll-behavior: chain` 交接嵌套滚动，见 `swipe-to-reveal`（运行 `npx -y modern-web-guidance@latest retrieve "swipe-to-reveal"`）。滚动条配色、尺寸、主题见 `customize-scrollbar-color-and-thickness`（运行 `npx -y modern-web-guidance@latest retrieve "customize-scrollbar-color-and-thickness"`）、`dark-mode`（运行 `npx -y modern-web-guidance@latest retrieve "dark-mode"`）和 `adapt-scrollbar-to-contrast-preferences`（运行 `npx -y modern-web-guidance@latest retrieve "adapt-scrollbar-to-contrast-preferences"`）。

<a id="7-viewport-mechanics-and-track-distribution"></a>

## 7 视口机制与轨道分配

小、大和动态视口单位的 Baseline 状态：广泛可用。自 2022-12-05 起达到 Baseline。
支持：Chrome 108（2022 年 11 月）、Edge 108（2022 年 12 月）、Firefox 101（2022 年 5 月）和 Safari 15.4（2022 年 3 月）。

- 对需要适应浏览器 UI 变化（地址栏收缩/展开）的移动布局容器使用 `dvh`/`dvw`。
- 不要用 `100vw` 实现全宽布局，它忽略滚动条宽度，会造成横向溢出。改用 `100%`、`100dvw` 或 `100svw`。

> 响应式设计入口（动态视口单位、为媒体预留空间、流式排版）见 `responsive-design`（运行 `npx -y modern-web-guidance@latest retrieve "responsive-design"`）。

<a id="8-grid-lanes-aka-masonry"></a>

## 8 Grid lanes（又称 masonry）

Grid lanes 的浏览器支持：有限可用。
支持：Safari 27.2。
不支持：Chrome、Edge 和 Firefox。

规范以“grid lanes”为名开发中（例如 `display: grid-lanes`），早期实验原型则使用 `grid-template-rows: masonry`。

**应当：**

- 当前使用 grid 配合 `grid-auto-flow: dense` 实现紧密排列，并接受 DOM 顺序可能与视觉顺序不同。
- 当项目是文档片段而非同等权重卡片时，内容密集的类瀑布流采用多列（`columns: 3; column-gap: 1rem`）。
- 只将 `grid-template-rows: masonry` 作为渐进增强，使用 `@supports` 检测。

**不要：**

- 在 Baseline 目标满足之前，不要将 `grid-template-rows: masonry` 作为硬性依赖发布。

```css
.gallery       { columns: 3 200px; column-gap: 1rem; }
.gallery > *   { break-inside: avoid; margin-block-end: 1rem; }

@supports (grid-template-rows: masonry) {
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    grid-template-rows: masonry;
    gap: 1rem;
    columns: unset;
  }
}
```

