<a id="tabbed-interfaces"></a>

# 标签页界面

<a id="basic-markup"></a>

## 基础标记

不必手动实现 roving tabindex 或 ARIA activedescendant 模式来满足 ARIA `tablist` 的焦点管理要求；可以使用具有 `tablist` 行为的 `focusgroup`，它会自动分配正确角色（容器为 `tablist`，可聚焦子元素为 `tab`）。

```html
<div class="tabs">
  <div focusgroup="tablist" aria-label="Web platform technologies">
      <button type="button" id="html-tab" aria-selected="true" focusgroupstart>HTML</button>
      <button type="button" id="css-tab">CSS</button>
      <button type="button" id="js-tab">JavaScript</button>
  </div>
  <div role="tabpanel" aria-labelledby="html-tab" tabindex="0"><!-- content for HTML tab --></div>
  <div role="tabpanel" aria-labelledby="css-tab" hidden="until-found"><!-- content for CSS tab --></div>
  <div role="tabpanel" aria-labelledby="js-tab" hidden="until-found"><!-- content for JavaScript tab --></div>
</div>
```

不要将此模式或 WAI-ARIA 标签页模式用于页面导航，即使视觉上打算呈现为标签页。

标签列表：
- 标签优先用 `<button>`，避免重写按钮行为。添加 `type=button`，防止嵌在表单中时意外提交。
- 用 `aria-labelledby` 或 `aria-label` 为标签列表提供无障碍名称。
- 用 `aria-selected` 指明当前选中的标签。

标签面板：
- 设置 `role=tabpanel`，并用 `aria-labelledby` 或 `aria-label` 命名（例如 `aria-labelledby` 引用关联标签）。
- 不要为标签添加 `aria-controls`：没有屏幕阅读器使用它。
- 用 `hidden="until-found"` 隐藏未选中标签的面板，同时让浏览器页内查找仍能搜索。若要同时从页内搜索中移除，则使用无值 `hidden`。
- 使用 `hidden="until-found"` 时，在 `beforematch` 事件中同步标签与面板选择状态，以响应页内查找激活不同标签。
- 可见面板若无可聚焦元素，设置 `tabindex=0`；隐藏面板移除此属性。

- 必须在 HTML 中渲染初始状态：除选中面板外全部有 `hidden`，选中标签有 `aria-selected="true"`。否则脚本运行前所有面板都会显示，共用网格单元格时还会重叠。

<a id="keyboard-interaction"></a>

## 键盘交互

标签选择可以采用_选择跟随焦点_，或允许用户先移动焦点再_通过激活选择_。

默认使用_选择跟随焦点_。
每个标签少按一次键，更容易发现，也符合原生单选组行为。
若显示面板有应由用户主动承担的成本，则使用激活选择；否则从第一个标签按方向键到第五个，会让每个中间标签都产生该成本：
- 面板无法即时显示：内容按需获取，或渲染明显较慢。
- 选择标签有副作用：改变 URL 或历史、发送分析事件、启动媒体或保存状态。
- 面板明显改变布局，例如高度差很大的面板推动页面其他内容。

无论哪种模式，焦点进入组时都必须落在选中项。默认返回上次聚焦项；当选择可在焦点不变时改变（页内查找、脚本），这就不正确。
使用 `nomemory`，并把 `focusgroupstart` 移到选中标签：

```html
<div focusgroup="tablist nomemory" aria-label="Web platform technologies">
```

```js
for (const tab of tabs) {
  tab.ariaSelected = tab === selected;
  tab.toggleAttribute('focusgroupstart', tab === selected);
}
```

<a id="styling"></a>

## 样式

<a id="indicating-the-selected-tab"></a>

### 指示选中标签

依据 `aria-selected` 设置选中样式，让视觉与无障碍状态不会分歧。
不要应用改变标签尺寸的样式，例如 `padding`、`border`、`margin`、`font-size`、`font-weight` 等。

- 必须：不要只用颜色表示选中（WCAG 1.4.1）。增加形状，例如下划线。
- 用伪元素边框绘制下划线。不要使用 `box-shadow` 或背景，强制颜色模式会移除两者，导致指示消失。

```css
[role="tab"] {
  position: relative;
}

[aria-selected="true"] {
  color: var(--accent);

  /* Example: a 3px underline that takes no space */
  &::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    border-block-end: 3px solid var(--accent);
  }
}
```

要让下划线在标签之间动画移动，将伪元素移到标签列表，并用锚点定位关联选中标签。详见 `anchor-positioning-tab-underline`（通过 `npx -y modern-web-guidance@latest retrieve "anchor-positioning-tab-underline"` 获取）。

- 不要在面板元素本身设置内边距、边框、外边距或背景。`hidden=until-found` 不使用 `display: none`，只隐藏内部内容，因此隐藏面板仍会把这些样式渲染为空条带。应将样式放在面板内部的包装子元素上。
- `hidden=until-found` 面板仍参与 grid 和 flex 布局，因此 `gap` 会为每个隐藏面板增加空间。把所有面板放在同一网格单元格，或避免面板之间使用 `gap`。

更多细节参见 `search-hidden-content`（通过 `npx -y modern-web-guidance@latest retrieve "search-hidden-content"` 获取）。

<a id="handling-tabs-that-dont-fit"></a>

## 处理放不下的标签

让标签保持单行。不要换成多行，换行会让标签顺序和选中项难以跟踪。
标签总宽超出可用空间时，可滚动标签列表，或把放不下的标签移入弹出菜单。
也可额外缩小未激活标签，让触发上述机制前能容纳更多标签。

1. **滚动**保留全部标签及键盘顺序，并支持触摸滑动。除选择之外无需脚本。默认使用，触摸优先界面始终使用。
2. **溢出菜单**在列表中一次显示全部隐藏标签名称，无需滚动。适合少数主要标签加一批较少使用的标签，且用户主要用指针操作的场景。需要脚本检测溢出。
3. **缩小未激活标签**会截断标签文字，因此更适合用户创建的标签（例如编辑器打开文档），而非短标签组成的固定 UI。与滚动或溢出菜单组合。

<a id="strategy-1-scrolling"></a>

### 策略 1：滚动

1. 将标签列表设为水平滚动容器：`display: flex`、`overflow-x: auto`，标签设为 `flex: none`，避免缩小（除非结合策略 3）。
2. 可选：列表设 `scroll-snap-type: inline proximity`，标签设 `scroll-snap-align: start`，吸附到标签边缘。使用 `proximity` 而非 `mandatory`，让用户仍能停在标签之间。
3. 隐藏滚动条，并按下文对仍有更多标签的各边缘淡出。淡出比阴影更适合一排标签，也适用于任何背景。更多滚动提示参见 `scrollability-affordance-hints`（通过 `npx -y modern-web-guidance@latest retrieve "scrollability-affordance-hints"` 获取）。
4. 每次选择改变，用 `scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' })` 将选中标签滚入视野。`container: 'nearest'` 只滚动标签列表，不滚动页面。点击部分可见标签会显示完整标签及下一个标签的一部分，让没有水平滚轮的鼠标用户也能到达全部标签，也涵盖页内查找等不伴随焦点的选择变化。

<a id="fading-the-edges"></a>

#### 边缘淡出

在滚动器自身用遮罩淡出内容：一个不透明层减去两端各一条渐变带。仅遮罩条带，其他内容全部保留，包括滚动器的焦点轮廓；单个裁剪到边框盒的渐变会隐藏它。用滚动器自身滚动位置驱动动画，改变每条带的尺寸：离开某端时淡出从 0 增长，到达另一端时相应缩回 0。内容放得下时滚动时间轴不活动，没有淡出。

```css
@property --fade-start {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

@property --fade-end {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

.scroller {
  overflow-x: auto;
  /* Example value: how far each fade reaches */
  --fade-size: 3rem;
  /* Gradient directions and positions are physical, so flip them for right-to-left content */
  --fade-dir: right;
  --fade-start-pos: 0;
  --fade-end-pos: 100%;
  mask:
    linear-gradient(black, black) no-clip subtract,
    linear-gradient(to var(--fade-dir), black, transparent) var(--fade-start-pos) 0 / var(--fade-start) 100% no-repeat no-clip,
    linear-gradient(to var(--fade-dir), transparent, black) var(--fade-end-pos) 0 / var(--fade-end) 100% no-repeat no-clip;
  animation: reveal-fade-start linear both, hide-fade-end linear both;
  animation-timeline: scroll(self inline);
  /* Each fade animates over the first or last --fade-size of scrolling */
  animation-range: 0 var(--fade-size), calc(100% - var(--fade-size)) 100%;

  &:dir(rtl) {
    --fade-dir: left;
    --fade-start-pos: 100%;
    --fade-end-pos: 0;
  }
}

@keyframes reveal-fade-start {
  to {
    --fade-start: var(--fade-size);
  }
}

@keyframes hide-fade-end {
  from {
    --fade-end: var(--fade-size);
  }
}
```

- 必须用 `@property` 注册 `--fade-start` 和 `--fade-end`。未注册的自定义属性不插值，淡出会跳变。
- 滚动器使用吸附或包含可聚焦项时，将 `scroll-padding-inline`（或 `scroll-padding-block`）设为淡出尺寸，避免吸附项或聚焦项停在淡出区域内。
- 垂直滚动器使用 `to bottom`，两条带分别位于 `0 0` 与 `0 100%`，尺寸为 `100% var(--fade-start)` 与 `100% var(--fade-end)`，并使用 `scroll(self block)` 和 `overflow-y`。
- 从右到左内容需翻转 `--fade-dir` 并交换条带位置，如上面的 `:dir(rtl)` 规则。滚动时间轴跟随书写方向，但渐变方向和遮罩位置使用物理方向。

<a id="strategy-2-overflow-menu"></a>

### 策略 2：溢出菜单

隐藏放不下的标签，在标签列表后放“更多”按钮打开菜单列出它们。
按菜单按钮构建按钮和菜单；结构、定位与键盘行为参见 `menu`（通过 `npx -y modern-web-guidance@latest retrieve "menu"` 获取）。
本节其余内容仅介绍标签特有部分。

- **把“更多”按钮放在标签列表之外。** 标签列表只能包含标签。它因此成为独立 `Tab` 停靠点，方向键不可达。若方向键访问更重要，可在最后一个可见标签按 `ArrowRight`/`End` 时移到“更多”，按 `ArrowLeft` 返回。列表本身在最后标签不会处理这些动作，所以不冲突，但属于标签模式用户可能不预期的自定义按键处理。
- **让“更多”外观区别于标签。** 使用带无障碍名称的图标（例如水平省略号），不用文字标签，否则看起来像又一个标签页。
- **用 `IntersectionObserver` 检测溢出**，以标签列表为 root，`threshold: 1`，使部分可见项也算溢出。它直接报告每个标签何时放得下或放不下，无需布局数学。
- **用 `visibility: hidden` 隐藏溢出标签**，不要用 `display: none` 或 `hidden`。这样保留布局盒，观察器仍可报告何时重新放得下，同时移出焦点顺序和无障碍树。列表设 `overflow: clip`，避免溢出页面。
- **把每个标签映射为 `menuitem`。** 只显示标签已隐藏的项目。激活项目选择并聚焦对应标签。先聚焦标签，再隐藏浮层，否则浮层会将焦点返回先前聚焦标签，再次选中旧项。
- **无标签溢出时隐藏“更多”。** 这不会形成循环：显示按钮只会缩窄列表，因此至少仍有一个标签溢出。
- **保持选中标签位于标签列表中。** 不要把它留在菜单，也不要把“更多”标为选中，因为它是按钮而非标签。当选中标签溢出（从菜单选择、页内查找或尺寸变化后），从最近的前置标签开始设置 `display: none`，直到选中项放得下。观察器会将这些项报告为溢出，使其出现在菜单。不要通过 DOM 或 CSS `order` 重排标签：被移除项同时退出视觉和焦点顺序，两者仍一致。溢出标签在选中或聚焦时保持可见：观察器更新前就可聚焦选中项，而尺寸变化使聚焦项溢出时也能保留焦点。

```html
<div class="tabs">
  <div class="tablist" focusgroup="tablist nomemory" aria-label="Product details">
    <button type="button">Overview</button>
    <button type="button">Specifications</button>
    <!-- … -->
  </div>
  <!-- Outside the tablist: a tablist may only contain tabs.
       Icon, not text, so it does not read as another tab. -->
  <button type="button" class="more" hidden aria-label="More tabs" aria-haspopup="menu" aria-expanded="false">⋯</button>
  <!-- Menu: see the menu guide. One menuitem per tab. -->
  <!-- Tab panels -->
</div>
```

```js
const observer = new IntersectionObserver(entries => {
  for (const { target: tab, intersectionRatio } of entries) {
    const overflowed = intersectionRatio < 1;
    // CSS: .clipped:not([aria-selected="true"], :focus) { visibility: hidden; }
    tab.classList.toggle('clipped', overflowed);
    menuItemFor(tab).hidden = !overflowed;
  }
  more.hidden = !tabs.some(tab => tab.classList.contains('clipped'));
  reveal();
}, { root: tablist, threshold: 1 });

tabs.forEach(tab => observer.observe(tab));

// Also call after every selection change.
// CSS: .displaced { display: none; }
function reveal() {
  const tab = tabs.find(tab => tab.ariaSelected === 'true');
  const before = tabs.slice(0, tabs.indexOf(tab));
  tabs.forEach(tab => tab.classList.remove('displaced'));
  while (before.length && !fits(tab)) {
    before.pop().classList.add('displaced');
  }
}

// Checks both edges, so it works in either writing direction
function fits(tab) {
  const list = tablist.getBoundingClientRect();
  const { left, right } = tab.getBoundingClientRect();
  return left >= list.left && right <= list.right;
}
```

<a id="strategy-3-making-inactive-tabs-smaller"></a>

### 策略 3：缩小未激活标签

可以与前述溢出处理组合，让滚动或菜单出现之前容纳更多标签。
它更适合用户驱动的标签列表（例如文档编辑器），而非硬编码 UI 标签列表。

- 允许未激活项缩小，选中项保持完整宽度：标签设 `flex: 0 1 auto`，选中项设 `min-inline-size: max-content`；后者也覆盖任何 `max-inline-size`，确保文字永不截断。不要用 `flex-shrink: 0`，它不能平滑过渡（见下文）。
- 为标签设置 `min-inline-size`。所有未激活项达到最小值后，剩余溢出由滚动或菜单处理。
- 用 `text-overflow: ellipsis` 截断缩小后的文字。把标签文字放在独立元素中，让 `overflow: hidden` 只影响文字，不裁剪旁边图标。
- DOM 保留完整文字，确保无障碍名称和页内查找不受影响。悬停时在标签内部滚动文字显示全称；手动激活模式下聚焦时也如此（自动激活时聚焦标签已选中，宽度完整）。详见 `single-line-overflow`（通过 `npx -y modern-web-guidance@latest retrieve "single-line-overflow"` 获取）。
- 有图标时保留图标，仅截断文字，使最小宽度标签仍可识别。
- 对 `min-inline-size` 添加过渡，让选择变化时平滑缩放而非跳变。标签列表设 `interpolate-size: allow-keywords`，允许与 `max-content` 相互插值；无需视图过渡。仅在 `prefers-reduced-motion` 为 `no-preference` 时过渡。过渡 `flex-shrink` 无效：溢出时任何大于 0 的值都会让标签一直缩到最小。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-focusgroup"></a>

### focusgroup 的回退方案和浏览器支持

focusgroup 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

仅在缺少原生支持时加载 `@microsoft/focusgroup-polyfill`：

```js
if (!(Object.hasOwn(HTMLElement.prototype, 'focusGroup'))) {
  const { polyfill } = await import('@microsoft/focusgroup-polyfill');
  polyfill();
}
```

- 使用 `focusgroup` 和 `focusgroupstart` 属性，不用 polyfill 未添加的 `focusGroup` JS 属性。
- polyfill 不会察觉稍后隐藏或显示的项目：项目隐藏期间添加 `focusgroup="none"`。

<a id="fallbacks--browser-support-for-hiddenuntil-found"></a>

### `hidden=until-found` 的回退方案和浏览器支持

hidden="until-found" 的浏览器支持：有限可用。
支持版本：Chrome 102（2022 年 5 月）、Edge 102（2022 年 5 月）和 Firefox 148（2026 年 2 月）。
不支持：Safari。

将 `hidden=until-found` 视为增强。不要补齐它，页内查找无法跨浏览器复现。
脚本设置时无需检测：不支持的浏览器中，`panel.hidden = 'until-found'` 会设置布尔 `hidden`，面板只是隐藏且不可搜索。

<a id="fallbacks--browser-support-for-interpolate-size"></a>

### `interpolate-size` 的回退方案和浏览器支持

interpolate-size 的浏览器支持：有限可用。
支持版本：Chrome 129（2024 年 9 月）和 Edge 129（2024 年 9 月）。
不支持：Firefox 和 Safari。

无需回退：没有 `interpolate-size` 时，标签即时改变尺寸而非过渡。

<a id="fallbacks--browser-support-for-scroll-driven-animations"></a>

### 滚动驱动动画的回退方案和浏览器支持

Scroll-driven animations 的 Baseline 状态：新近可用。自 2026-10-27 起纳入 Baseline。
支持版本：Chrome 115（2023 年 7 月）、Edge 115（2023 年 7 月）、Firefox 159（2026 年 10 月）和 Safari 26（2025 年 9 月）。

没有滚动驱动动画时不显示淡出；若也不支持滚动状态查询，阴影也不显示。采用以下最后回退之一。

<a id="shadows-on-a-solid-background-background-attachment"></a>

#### 纯色背景上的阴影：background attachment

滚动器为纯色背景时，改用背景绘制阴影，所有浏览器都可用且无需 JavaScript。
每条阴影是 `scroll` 背景，固定在滚动可视区边缘。
每条阴影上有一层遮盖：使用滚动器自身颜色的 `local` 背景，随内容滚动。
位于内容任一端时，遮盖位于阴影上方并隐藏它；滚离该端后遮盖移开，阴影出现。

```css
@supports not ((container-type: scroll-state) or (animation-timeline: scroll())) {
  .scroller {
    background:
      /* Covers: scroll with the content. Must use the scroller's own background color. */
      linear-gradient(var(--surface) 30%, transparent) top / 100% 2.5rem no-repeat local,
      linear-gradient(transparent, var(--surface) 70%) bottom / 100% 2.5rem no-repeat local,
      /* Shadows: stay at the edges of the scrollport */
      radial-gradient(farthest-side at 50% 0, rgb(0 0 0 / .15), transparent) top / 100% .75rem no-repeat,
      radial-gradient(farthest-side at 50% 100%, rgb(0 0 0 / .15), transparent) bottom / 100% .75rem no-repeat,
      var(--surface);
  }
}
```

阴影绘制于内容之后，因此具有不透明自身背景的内容会遮住它。此时使用下面的 `IntersectionObserver` 回退。

<a id="fades-or-shadows-on-any-background-intersectionobserver"></a>

#### 任意背景上的淡出或阴影：`IntersectionObserver`

用 `IntersectionObserver` 标记哪些边缘还有内容，再根据属性显示提示。观察滚动器第一个和最后一个子元素，root 为滚动器，`threshold: 1`：子元素未完全可见意味着其外还有内容。

```js
if (!CSS.supports('animation-timeline', 'scroll()')) {
  for (const scroller of document.querySelectorAll('.scroller')) {
    const [first, last] = [scroller.firstElementChild, scroller.lastElementChild];
    // rootMargin: without it, sub-pixel widths can leave an edge child a fraction of a pixel short of fully visible
    const observer = new IntersectionObserver(entries => {
      for (const { target, intersectionRatio } of entries) {
        scroller.classList.toggle(target === first ? 'more-start' : 'more-end', intersectionRatio < 1);
      }
    }, { root: scroller, threshold: 1, rootMargin: '1px' });

    observer.observe(first);
    observer.observe(last);
  }
}
```

```css
/* Shadows */
.scroller.more-start::before,
.scroller.more-end::after {
  opacity: 1;
}

/* Fades */
.scroller {
  transition: --fade-start .2s, --fade-end .2s;

  &.more-start {
    --fade-start: var(--fade-size);
  }

  &.more-end {
    --fade-end: var(--fade-size);
  }
}
```

若单个子元素可能大于滚动器（例如一篇长文章），它永远不会完全可见，导致两端提示总是出现。改为观察哨兵：由脚本在滚动器两端加入的空元素。哨兵不可见意味着该方向还有内容。

```js
// Must be valid children of the scroller (e.g. <li aria-hidden="true"> in a list)
const [start, end] = [document.createElement('div'), document.createElement('div')];
for (const sentinel of [start, end]) {
  // A zero-size sentinel at the very edge never counts as intersecting
  sentinel.style.cssText = 'min-inline-size: 1px; min-block-size: 1px';
}
scroller.prepend(start);
scroller.append(end);
// Observe them as above, with the default threshold, using !isIntersecting instead of intersectionRatio < 1
```
