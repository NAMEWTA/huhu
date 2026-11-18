<a id="build-a-carousel"></a>

# 构建轮播

针对有限的一组相关项目构建轮播，以原生滚动和 CSS scroll snap 为基础；加入 HTML 上一个/下一个及标记控件，用少量脚本连接行为并更新状态。这样没有 JavaScript 时，内容和基本滚动仍可用。

<a id="structure-and-accessibility"></a>

## 结构与无障碍

- 轮播是有意义的页面章节时，使用具名 `region` 和 `aria-roledescription="carousel"`。每张幻灯片设置 `role="group"`、`aria-roledescription="slide"`，及包含位置的 `aria-label`（如 `aria-label="2 of 4"`）。标签写入标记，并随页面一起本地化；运行时幻灯片变化时，从同一本地化字符串重新生成。位置是原始序列中的位置，不是当前视觉位置。让辅助技术始终能访问内容。
- 每个控件都提供明确无障碍名称：使用带文字或 `aria-label` 的原生 `<button>`，不要用无标签 chevron。
- 滚动结束后，在视觉隐藏的 polite 状态区域播报当前幻灯片。无论按钮、标记还是直接滚动导致可见项变化，都要更新，向辅助技术提供反馈。
- 尽可能使所有交互目标至少为 24×24 CSS 像素，便于快速跳到具体幻灯片。较小元素可留足间距，使以其为中心的 24px 圆不与邻近目标重叠。可通过 padding、伪元素或细透明边框稍微扩大目标（使用 `background-clip: padding-box` 让填充仍在可见形状上），剩余间距交给 gap。不要只依赖很宽的 gap，也不要让不可见区域大到远处点击仍触发控件。这样符合 WCAG 2.5.8 Target Size。
- 所有控件对比度足够；非文字内容与相邻颜色至少 3:1，符合 WCAG 1.4.11 Non-text Contrast。
- 上一个/下一个控件禁用导致焦点丢失时，将焦点移到其他位置，例如相反控件（“上一个”有焦点却变为禁用时移到“下一个”，反之亦然）。
- 活动幻灯片的控件不能仅用颜色表示活动，以符合 WCAG 1.4.1 Use of Color；还需轮廓、更大宽高等视觉提示。

<a id="scrolling-and-controls"></a>

## 滚动与控件

- 轨道使用原生滚动，在滚动轴上吸附幻灯片。横向轮播放成行，使用行内轴；纵向放成列，使用块轴。
- 在轨道滚动轴上将 `overscroll-behavior` 设为 `contain`（横向 `overscroll-behavior-x`，纵向 `overscroll-behavior-y`）。到达轨道端点的滚动会留在轮播内，而不滚动页面或触发前进/后退手势，让端点连续滑动更顺畅。不要使用 `overscroll-behavior` 简写，因为它也限制另一轴，可能在指针位于轮播上时阻止页面滚动。
- 所有浏览器都使用 HTML `<button>` 作为上一个/下一个控件，并为每张幻灯片提供标记按钮直接导航。暂不使用 `::scroll-button()` 或 `::scroll-marker`。
- 保持控件可见、可操作，并用 `:focus-visible` 清晰显示焦点。至少三张时，默认让上下项从末张循环到首张并反向循环（见循环章节）；只有明确要求有限导航时才在端点禁用。保留原生键盘行为，不拦截链接、表单字段或按钮的按键。只有明确交互需求时才添加自定义按键处理，避免覆盖嵌套控件。

<a id="related-patterns"></a>

## 相关模式

- 活动幻灯片自身样式见 `carousel-snap-highlights`（运行 `npx -y modern-web-guidance@latest retrieve "carousel-snap-highlights"`）。
- 用连续进度指示代替离散标记，见 `scroll-progress-indicator`（运行 `npx -y modern-web-guidance@latest retrieve "scroll-progress-indicator"`）。
- 滚动驱动的幻灯片效果见 `carousel-slide-effects`（运行 `npx -y modern-web-guidance@latest retrieve "carousel-slide-effects"`）。
- 通过吸附事件同步其他 UI，见 `scroll-snap-state-sync`（运行 `npx -y modern-web-guidance@latest retrieve "scroll-snap-state-sync"`）。

<a id="example-horizontal-carousel"></a>

## 示例：横向轮播

此例使用全宽横向幻灯片。可调整尺寸以露出相邻内容，或用块轴实现纵向轮播。每个标记名称应标明目的项。下面 CSS 按职责拆分，仅展示容易出错部分，其余用文字描述。尺寸、间距和颜色按设计调整。

```html
<section class="carousel" aria-roledescription="carousel" aria-label="Featured products">
  <div class="carousel-controls">
    <button type="button" data-direction="previous">Previous slide</button>
    <button type="button" data-direction="next">Next slide</button>
  </div>

  <div class="carousel-track" tabindex="0" role="group" aria-label="Slides">
    <div role="group" aria-roledescription="slide" aria-label="1 of 3"
        data-marker-name="Go to slide 1">
      <h3>Product one</h3>
    </div>
    <div role="group" aria-roledescription="slide" aria-label="2 of 3"
        data-marker-name="Go to slide 2">
      <h3>Product two</h3>
    </div>
    <div role="group" aria-roledescription="slide" aria-label="3 of 3"
        data-marker-name="Go to slide 3">
      <h3>Product three</h3>
    </div>
  </div>

  <p class="visually-hidden" role="status" aria-live="polite"></p>

  <nav class="carousel-markers" aria-label="Choose a slide"></nav>
</section>
```

<a id="track-and-snapping"></a>

### 轨道与吸附

轨道是一行 flex，沿行内轴滚动并吸附幻灯片。每张填满轨道，中心吸附。

```css
.carousel-track {
  display: flex;
  gap: 1rem; /* example value */
  overflow-x: auto;
  /* mandatory so the track always rests on a slide, which the settled-scroll status relies on */
  scroll-snap-type: x mandatory;
  /* keep a scroll that reaches either end on the carousel; only the scrolling axis, so the page still scrolls the other way */
  overscroll-behavior-x: contain;
}

.carousel-track > * {
  flex: 0 0 100%; /* one slide per view; use a smaller basis for a peek layout */
  scroll-snap-align: center;
}
```

<a id="controls"></a>

### 控件

将 Previous、Next 按钮放在轨道首尾边缘上方：容器使用 `position: absolute` 和 `z-index`，防止幻灯片遮挡；容器 `pointer-events: none`，按钮 `pointer-events: auto`，使按钮之间仍可滚动轨道。从幻灯片 `data-marker-name` 值构建标记按钮，通过 `[aria-current="true"]` 设置活动标记样式。

```css
.carousel-markers button[aria-current="true"] {
  background: #0a5; /* example color; any clear contrast with the other markers works */
}
```

<a id="supporting-styles"></a>

### 辅助样式

根据设计编写：

- 标记显示为居中 flex 行中的圆点，带 gap 和 pointer 光标。
- 控制按钮及标记按钮提供清晰 `:focus-visible` 轮廓。
- 轨道和按钮设置 `touch-action: manipulation`，防止触屏快速点击触发双击缩放。
- 状态区域视觉隐藏，但不从无障碍树移除。
- 仅在 `@media (prefers-reduced-motion: no-preference)` 内为轨道启用 `scroll-behavior: smooth`。

<a id="fallback-strategies"></a>

## 回退策略

控件是普通 HTML，因此以下只涉及脚本和 CSS 所依赖的平台特性。滚动、吸附保持原生，少量脚本补上控件行为和状态更新。

<a id="scrolling-and-completion"></a>

### 滚动与完成

scroll-behavior 的 Baseline 状态：广泛可用。自 2022-03-14 起达到 Baseline。
支持：Chrome 61（2017 年 9 月）、Edge 79（2020 年 1 月）、Firefox 36（2015 年 2 月）和 Safari 15.4（2022 年 3 月）。

平滑滚动可选。示例只在用户未要求减少动效时启用。

overscroll-behavior 的浏览器支持：有限可用。
支持：Chrome 144（2026 年 1 月）、Edge 144（2026 年 1 月）和 Firefox 150（2026 年 4 月）。
不支持：Safari。

限制 overscroll 是渐进增强，无需回退。不支持时，到达端点的滚动可能传给页面或触发滑动导航，轮播仍可工作。

scrollend 的 Baseline 状态：新近可用。自 2025-12-12 起达到 Baseline。
支持：Chrome 114（2023 年 5 月）、Edge 114（2023 年 6 月）、Firefox 109（2023 年 1 月）和 Safari 26.2（2025 年 12 月）。

没有 `scrollend` 时，用防抖 `scroll` 监听器运行滚动稳定处理。加载时执行一次初始标记、按钮和停放同步；polite 状态区保持空，直到用户发起滚动并稳定后再播报，避免打断页面加载。

Scroll snap events 的浏览器支持：有限可用。
支持：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

轮播不依赖吸附事件。没有这些事件时，用滚动稳定跟踪更新状态；只有其他 UI 必须跟随浏览器选定的吸附目标时，才使用 `scrollsnapchange`。

<a id="scroll-snap"></a>

### 滚动吸附

Scroll snap 的 Baseline 状态：广泛可用。自 2020-01-15 起达到 Baseline。
支持：Chrome 69（2018 年 9 月）、Edge 79（2020 年 1 月）、Firefox 68（2019 年 7 月）和 Safari 11（2017 年 9 月）。

轨道保持触摸、指针、键盘的原生滚动。JS 添加控件行为和播报，不替代基本滚动。将脚本放在 `<script type="module">` 中，使它在文档解析后运行。

<a id="looping"></a>

### 循环

sibling-count() 和 sibling-index() 的 Baseline 状态：新近可用。自 2026-08-18 起达到 Baseline。
支持：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 154（2026 年 8 月）和 Safari 26.2（2025 年 12 月）。

不支持 `sibling-count()` 时，由脚本提供幻灯片数量，循环仍可工作。仅当 `CSS.supports("order: sibling-count()")` 为 false 时，在轨道设置 `--children-count`，CSS 用 `var(--children-count, sibling-count())` 取代 `sibling-count()`。支持的浏览器不会得到该变量，继续原生计数。不要将停放规则包进 `@supports`。

```css
.carousel-track > :first-child {
  /* --children-count is only set where sibling-count() is unsupported */
  order: clamp(0, var(--current) - (var(--children-count, sibling-count()) - 3), 1);
}
```

```js
if (!CSS.supports("order: sibling-count()")) {
  track.style.setProperty("--children-count", track.children.length);
}
```

内容非静态时，幻灯片增删后更新该属性，例如通过 `MutationObserver`。

<a id="scroll-driven-effects"></a>

### 滚动驱动效果

滚动驱动动画的 Baseline 状态：新近可用。自 2026-10-27 起达到 Baseline。
支持：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

将幻灯片效果视为可选增强，放在 `@media (prefers-reduced-motion: no-preference)` 内。导航和当前项反馈不得依赖这些效果。

<a id="controls-and-status-updates"></a>

## 控件与状态更新

轨道滚动时更新活动标记（每动画帧最多一次），让圆点跟上可见项；滚动稳定后再播报并更新按钮状态。只测量轮播的滚动轴。

编写适配标记的小脚本，覆盖以下要求：

- **连接 HTML 控件。** Previous/Next 点击时，根据轨道滚动轴上的真实位置找到当前项，再按视觉顺序（循环时不同于 DOM 顺序）滚动到相邻项的吸附位置，例如使用该项相对轨道中心的偏移调用 `track.scrollBy()`。不要按固定视口宽度滚动，不维护可能与真实位置漂移的独立索引，也不要使用未限制到轨道的 `scrollIntoView()`，否则可能滚动页面。每张创建有名称的标记按钮，滚动到对应项。DOM 中 Previous、Next 放在轨道之前。
- **跟踪当前项**，只沿轮播滚动轴计算，兼容横向和纵向。
- **实时更新活动标记。** 在 `requestAnimationFrame` 节流的 `scroll` 监听器中计算最近项，立即设置其标记 `aria-current="true"`；标记或上下项按钮被点击时，也立即按待到达目标设置，使圆点在用户决定时而非移动后才变化。当前项未变化时不写入；点击/按键存在待到达目标期间，完全跳过监听器，因为脚本平滑滚动中逐帧重算会使 Safari 卡顿。
- **滚动稳定后更新其余状态**：由单个、基于稳定滚动位置的处理器更新按钮禁用状态（以及循环时的幻灯片停放），只有稳定项与上一次稳定项不同才在状态区播报“Slide N of M”；初始加载和补偿停放滚动保持静默。控件仅发起滚动，不直接更新状态。
- **通过 `scrollend` 处理稳定**，仅在不支持 `scrollend` 时使用防抖的 `scroll` 监听器。不要同时运行两个稳定处理器；滚动进行中不要重排或重新滚动轨道（例如停放幻灯片），否则会取消当前滚动。唯一例外是循环时点击标记，它自己的滚动会替代当前滚动（见循环章节）。
- **以待到达目标为起点解析连续点击。** 快速上下项点击应基于已正在前往的幻灯片累积，而非当前最近项；滚动稳定后清除目标。下一次滚动已开始后才到达的 `scrollend` 应忽略，否则停放等操作会取消新滚动。刚请求滚到另一项后，若稳定事件位置与请求时完全相同，也应忽略：它属于之前的滚动（如补偿滚动），新请求还没开始移动。
- 任何平滑滚动都要**尊重减少动效偏好**。

<a id="looping-continuous-navigation"></a>

## 循环（连续导航）

通过让轨道保持无尽，令上/下项从末张循环到首张再返回，而非在端点禁用（少于三张或明确要求有限导航时除外）。不要复制幻灯片或移动 DOM，这会与框架冲突，并给辅助技术重复内容。应仅在当前位置位于端点或距端点一步时，用 CSS `order` 将端点幻灯片停放到当前项旁。提前一步停放，使滚动到端点前邻项已就位，上下按钮不会中途禁用。这样轨道两侧始终有邻项，键盘滚动、触摸和吸附继续工作。只有首末项设置 `order`。因提前一步开始停放，短轮播可能每个位置都有端点项停放（4 张时始终如此；3 张时中间项两端都停放）。只有距两端均超过一步时，才完全保持 DOM 顺序，这至少需要 5 张。

- 在轨道维护 `--current`，表示当前项从零开始的索引。不要在 CSS 中给默认值：未定义时 `order` 回退为 0，不停放任何项，没 JS 时从第一项开始。脚本加载时设置。`--current` 为 `0` 或 `1` 时，将末项放到首项前（`order: -1`）；`--current` 为末项或倒数第二项索引时，将首项放到末项后（`order: 1`）。仅对 `:first-child`、`:last-child` 设置 `order`，不对每项设置。需要 `sibling-count()` 得到末尾索引。下方公式是最容易出错的部分。
- 滚动稳定时，根据位置更新 `--current`。如果停放发生变化，在前后测量当前项沿滚动轴的偏移，在同一任务内立即补偿滚动差值，使变化不可见。重排和补偿滚动期间关闭吸附（`scroll-snap-type: none`），结束后恢复，否则某些浏览器会重新吸附到其他项并继续滚动。同时锁住滚动轴 overflow（横向 `overflow-x: hidden`，纵向 `overflow-y: hidden`），两帧动画后恢复；否则 iOS Safari 会在补偿生效前先绘制一帧重排布局，产生闪烁。立即恢复会破坏循环，因此必须保留延迟。用户离开端点后释放已停放项时也如此。
- 标记必须按原始序列滚动。已停放端点项位于其序列位置相反的一侧，直接滚到它会走捷径（从首项点击末项标记会向后走一步）。点击任何非当前项标记时，先将轨道 `--current` 设为 `initial`，让途中全部恢复 DOM 顺序。采用与停放相同的测量和补偿步骤，但不锁 overflow，否则 Safari 不会启动接下来的滚动。稳定处理器随后重新设置 `--current`，恢复停放。上下项导航不要这样做，因为它必须到达停放项才能循环。DOM 顺序期间，端点没有可循环邻项，因此途中点击 Previous/Next 不能立即执行；应暂存，待滚动稳定且重新停放后重放，并出于同样原因跳过这次停放的 overflow 锁。
- 循环至少需要三张。补偿通过测量得到，因此各项尺寸可以不同。
- 上下控件与状态计算必须依据视觉顺序，而不是 DOM 兄弟顺序。每项标签（“2 of 4”）和状态区使用原始索引，停放不改变它。`--current` 改变时不要重新编号。
- 用户导航的 `scroll-behavior: smooth` 保持在 `prefers-reduced-motion: no-preference` 内；只有补偿滚动立即执行。

```css
/* The first slide parks after the last while --current is the last or second-to-last index. */
.carousel-track > :first-child {
  order: clamp(0, var(--current) - (sibling-count() - 3), 1);
}

/* The last slide parks before the first while --current is 0 or 1. */
.carousel-track > :last-child {
  order: calc(-1 * clamp(0, 2 - var(--current), 1));
}
```

停放只改变视觉顺序，DOM 仍决定阅读和焦点顺序，不将任何幻灯片设为 inert 或 aria-hidden。

