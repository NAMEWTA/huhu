<a id="rearrange-items-with-drag-and-drop"></a>

# 通过拖放重新排列项目

为现有垂直列表或水平行添加重排。重排真实 DOM 子节点，不用 CSS `order` 或 `flex-direction: *-reverse`，以保持视觉、键盘和阅读顺序一致。对话框或工具栏等浮动元素的自由二维移动参见 `drag`（通过 `npx -y modern-web-guidance@latest retrieve "drag"` 获取）。本指南一次处理一个轴，不涵盖网格、换行布局或跨列表移动。

项目包含交互控件或可选文本时，提供专用拖动手柄，不要让整个项目可拖动。然后设置指针拖动：

- 仅响应主按钮开始拖动，并记录初始指针偏移。
- 在手柄上应用 `cursor: grab`/`grabbing`、`touch-action: none` 和 `user-select: none`，保持项目文字可选、手柄外页面可滚动。`touch-action: none` 仅限手柄：它禁用该元素上的触摸滚动，小专用手柄可以接受（其余项目和页面仍可滚动），若施于整项或列表则会困住滚动。
- 拖动一开始指针就可能离开手柄，仅靠其 `:active` 无法保持抓取光标。拖动期间在根元素切换类，结束清理时移除，并对根及后代设 `cursor: grabbing`。

<a id="keep-movement-active-while-reordering"></a>

## 重排期间保持移动

保持拖动活动，并可靠确定目标：

- **捕获指针。** `pointerdown` 时用 `handle.setPointerCapture(event.pointerId)`，指针离开手柄后仍拖动。在 `lostpointercapture` 清理，除非 `before()` 移动后故意重新建立捕获（见 `moveBefore()` 部分）。
- **只跟踪一个指针。** 记住启动拖动的 `pointerId`，忽略其他指针的 `pointerdown`、`pointermove`、`pointerup` 和 `pointercancel`，避免第二次意外触摸（例如握手机的拇指）启动竞争拖动或结束当前拖动。
- **允许 `Escape` 取消。** 按 `Escape` 时记录当前矩形，不移动 DOM 地清除拖动 `translate`；容器若已滚动，将原槽位滚回视野，从记录矩形动画返回，并播报取消。
- **从布局而非 `event.target` 确定目标。** 指针捕获会将 `pointermove` 的 `event.target` 重定向到捕获指针的手柄。沿列表轴将指针约束在容器边界，比较各兄弟项布局中点。垂直列表使用 `offsetTop + offsetHeight / 2`，容器设置 `position: relative`，并计入 `clientTop` 和 `scrollTop`。落点在首个中点位于指针下方的兄弟项之前；没有则为末尾。水平行使用 `offsetLeft + offsetWidth / 2`，计入 `clientLeft` 与 `scrollLeft`：两种书写方向中 `offsetLeft` 与 `scrollLeft` 共用坐标空间（RTL 滚动后 `scrollLeft` 为负），因此同样求和适用。RTL DOM 顺序从右向左，应插在首个中点已被指针越过的兄弟项前，而非尚未到达者前。
- **为何用布局中点。** 布局位置忽略运行中的 `translate` 动画和内边距间隙，因此越过边缘的指针可靠对应首位或末位。`document.elementFromPoint()` 测试绘制位置，兄弟项动画时可能漏判。只有目标可能属于多个容器（例如看板列）时才用 `document.elementFromPoint(event.clientX, event.clientY)`。

拖动时要传达落点，可预留空间、显示明确标记，或在目标位置显示克隆。使用标记时考虑折叠源槽位，让标记单独表达目标；避免同时保留空隙，让人误以为有第二个落点。

不要在指针移动时重排，兄弟项不断移动会显得抖动。保留源项目槽位并显示落点标记，这是单轴列表默认方式：

- **绘制标记，不移动兄弟项。** 拖动期间给列表设 `data-drop`，用其 `::before`（圆环）和 `::after`（线）绘制，两者均为 `position: fixed; pointer-events: none`。不要向 `<body>` 追加元素。
- **放在间隙中。** 每次落点更新和滚动步骤，都根据相邻项 `getBoundingClientRect()` 设置 `--drop-x`、`--drop-y`、`--drop-w`、`--drop-h`，让线在前后项目间居中（水平行沿行内轴，RTL 翻转）。不要用 CSS 锚点定位，它在自动滚动时会漂移；列表及祖先不要有 `transform`、`filter` 和 `contain`。
- **跳过无变化落点。** 落点就是自身槽位时不显示标记。拖动结束移除 `data-drop` 和相关自定义属性。
- **支持主题化。** 用自定义属性（例如 `--drop-marker-color`）控制颜色、线宽、圆环尺寸、间隙、抬起项透明度和阴影，默认值匹配宿主设计系统；`forced-colors: active` 下使用 `Highlight`。
- **释放时只移动一次。** `pointerup` 时，落点不同于当前下一兄弟项才调用 `container.moveBefore(item, referenceNode)` 原子移动现有节点，不重新创建，保留内部状态（聚焦控件、输入值、滚动、媒体、自定义元素实例）和活动指针捕获。键盘每步移动也使用同一调用。之后添加动画：

- **每次移动都动画。** 包括释放和键盘移动，项目应可见地移动而非跳变。移动前记录各兄弟项的 `getBoundingClientRect()`，之后对 `translate` 从旧偏移（两轴，修正期间滚动）动画到 `0 0`，即 FLIP。
- **为释放添加动画。** 释放时从拖动位置动画到最终矩形；测量前完成该项进行中的动画（`item.getAnimations().forEach((animation) => animation.finish())`），否则矩形包含动画偏移。动画结束前保持抬起效果。
- **尊重减少动态效果。** `prefers-reduced-motion: reduce` 下跳过动画。
- **抬起真实项目，不克隆。** 保留 DOM 与布局槽位，通过 `translate` 跟随指针（加上抓取以来列表滚动变化，自动滚动时仍在指针下）。设置 `position: relative`、较高 `z-index`、轻微 `scale`、阴影和 `pointer-events: none`。空槽位表示抓取来源。克隆会重复 ID、丢失状态、破坏后代选择器、框架绑定和 `idref`，追加到列表外还可能形成无效标记。释放时从拖动位置动画到新位置。
- **处理快速重新抓取。** 若该项已开始新拖动，不要从旧动画完成回调清除其拖动状态。

<a id="scroll-while-dragging"></a>

## 拖动时滚动

项目位于滚动容器时，指针接近或越过列表轴首末边缘（垂直为上下，水平为左右，使用 `scrollTop` 或 `scrollLeft`）时滚动，让屏外项目可达，尤其小视口。拖动期间运行 `requestAnimationFrame` 循环，根据指针进入边缘区域的深度调整速度；区域大小为拖动项沿列表轴的尺寸，上限容器三分之一，避免两区域重叠；越过边缘后速度继续增加直到上限，并用帧时间而非固定步长。每次滚动后，用最后指针位置（约束到容器边界）重新检测落点，因为指针本身未动。容器不要用 `scroll-behavior: smooth`。四周留空间避免焦点环和抬起阴影被裁剪：应覆盖轮廓宽度、偏移和缩放增长（3px 轮廓、2px 偏移、`scale(1.02)` 时约 1rem）；`overflow-y: auto` 也会裁剪 x 轴。末端空间（底部或水平行行内末端）放在最后一项外边距，而非容器内边距，因为某些引擎不把 grid/flex 容器末端内边距计入滚动溢出。拖动结束取消循环。

<a id="support-keyboard-reordering"></a>

## 支持键盘重排

为指针重排提供键盘替代。按重排频率和可发现性需求选择交互：

- **可见移动控件或操作菜单：** 默认最佳，容易发现且兼容屏幕阅读器；标准按钮在浏览模式下可激活，无需拦截方向键。常驻行内按钮太杂乱时使用操作菜单。
- **在可聚焦手柄或项目上直接用方向键，或修饰键 + 方向键（如 `Alt`）：** 适合频繁重排且要求简洁 UI。手柄无障碍名称同时标明项目与重排操作。屏幕阅读器浏览模式可能拦截 `<button>` 手柄上的裸方向键，应配合明确移动控件或修饰键。
- **抓取—移动—放下模式（`Space` 或 `Enter` 抓取，沿列表轴方向键移动，`Space` 或 `Enter` 放下，`Escape` 取消）：** 抓取前方向键不做任何事，避免与屏幕阅读器导航冲突。切换手柄 `aria-pressed`，抓取时播报状态和按键；`Escape` 恢复原 DOM 位置；手柄自身失焦就放下（不只是焦点离开整列表，因为下一站常是同一项其他控件），忽略移动本身引起的 blur。

按键跟随列表轴：垂直用 `ArrowUp`/`ArrowDown`，水平用 `ArrowLeft`/`ArrowRight`。方向键遵循视觉方向，因此 RTL 行中 `ArrowLeft` 在 DOM 向后移，`ArrowRight` 向前移。忽略另一轴的键，为移动按钮使用匹配方向标签和图标，并在播报中指明方向。

无论哪种方式，都在礼貌实时区域播报项目和新位置；先清空再短暂延迟更新（见 `moveBefore()` 回退），确保重新聚焦手柄的移动仍被播报。只在位置确实改变时播报（点击或原地放下不播报），但取消仍要播报。焦点和抓取状态应显示在被移动的整项上，而不只是手柄：

- **保持项目可见。** 每次键盘移动（包括 `Escape` 恢复原位置）和指针放下后，在移动之后、动画开始之前调用 `item.scrollIntoView({ block: 'nearest', inline: 'nearest' })`，避免运行中 `translate` 扭曲滚动目标。之后用 `focus({ preventScroll: true })` 恢复焦点，避免再次滚动；项目 `scroll-margin` 与容器周围空间匹配。
- **键盘聚焦时显示整项。** 否则浏览器只把手柄滚入视野，其他内容和焦点环仍裁剪。键盘焦点进入项目（例如按 `Tab`）时，从检查 `:focus-visible` 并跳过运行中动画项目的 `focusin` 处理器，以同样的参数滚动整项：`block` 和 `inline` 都设为 `'nearest'`。
- **在整项绘制焦点环，** 使用 `.item:has(.handle:focus-visible)`。抓取—移动—放下手柄，在聚焦项显示可见按键提示（项目内 `aria-hidden="true"` 元素，平时为“空格键重排”，抓取时为“方向键移动 · 空格键放下 · Esc 取消”；说明文字放 DOM 而非 CSS `content`，便于翻译）。静止时略淡化手柄，表达可重排。也把手柄悬停样式应用到 `:focus-visible`（`.handle:is(:hover, :focus-visible)`），让明眼键盘用户知道可激活；用填充而非轮廓，避免像第二个焦点环，并为 `aria-pressed` 抓取状态提供独立按下外观。
- **抬起抓取项，** 用完整透明度、轻微 `scale()` 和 `box-shadow`。避免旋转，尤其单轴移动时。
- **保持布局可收缩。** 每行弹性列用 `minmax(0, 1fr)`，表单控件 `width: 100%`，让窄视口下移动控件仍可见且无需横向滚动。

<a id="align-reading-order-with-visual-layout"></a>

### 让阅读顺序与视觉布局一致

DOM 和键盘焦点顺序应相对视觉布局易于理解。通过独立控件重排时，确保控件前或旁边已有项目上下文。可聚焦手柄应有标明项目及重排功能的无障碍名称。根据布局和书写方向摆放控件，不要造成阅读或焦点顺序混乱。

复杂布局中视觉与 DOM 顺序无法自然一致时，可在 grid/flex 容器使用 CSS **`reading-flow`**，指示浏览器 Tab 顺序跟随视觉坐标而非源码顺序：
```css
.task {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto; /* minmax(0, ...) lets the middle column shrink at narrow widths */
  reading-flow: grid-rows; /* Follows visual layout and tab order by row */
}
```

<a id="disable-boundaries-and-safeguard-focus"></a>

### 禁止越界并保护焦点
移动限于有效目标。若支持跨容器，键盘用户也必须可到达这些目标。只有某方向不存在有效目标时，才在容器边界阻止继续移动。

移动后焦点留在手柄。使用独立移动按钮时，保留在激活按钮上；若按钮变为禁用，则移到同一项目的另一移动控件。

<a id="decide-on-fallback-behavior"></a>

## 决定回退行为

重排只是补充功能时，没有 JavaScript 仍应按默认 DOM 顺序保持集合可读可用。若顺序代表用户控制的数据或直接影响行为，例如任务优先级、播放顺序或工作流步骤，则视为核心功能，提供所需指针和键盘交互，不要把静态顺序当作等价行为。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

<a id="movebefore"></a>

### `moveBefore()`

moveBefore() 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 144（2025 年 10 月）。
不支持：Safari。

目标 Baseline 不支持 `moveBefore()` 时，通过 `'moveBefore' in Element.prototype` 检测，回退为对现有节点调用 `referenceNode.before(item)`，没有参考节点则 `container.append(item)`。`before()` 会移除再插入节点，有两个副作用：

- **丢失活动指针捕获。** `pointermove`、`pointerup`、`pointercancel` 监听器放在 `document`，捕获事件仍会冒泡到那里。移动后若 `hasPointerCapture()` 为 false，重新调用 `handle.setPointerCapture(event.pointerId)`；只有未重新建立捕获时才在 `lostpointercapture` 结束拖动。
- **聚焦后代失焦。** 移动后显式 `.focus()` 当前手柄或移动按钮。实时区域更新延迟约 500 ms（防抖并先清空上一消息），否则焦点重新播报会在 Safari VoiceOver 等屏幕阅读器中吞掉位置播报。

<a id="reading-flow"></a>

### `reading-flow`

reading-flow 的浏览器支持：有限可用。
支持版本：Chrome 137（2025 年 5 月）和 Edge 137（2025 年 5 月）。
不支持：Firefox 和 Safari。

不支持 `reading-flow` 的浏览器中，顺序焦点导航遵循 DOM 源码顺序。每项 DOM 应让交互控件具有合理阅读与 Tab 顺序，不依赖 CSS 视觉重排。

<a id="user-select"></a>

### `user-select`

user-select 的浏览器支持：有限可用。
支持版本：Chrome 54（2016 年 10 月）、Edge 79（2020 年 1 月）和 Firefox 69（2019 年 9 月）。
不支持：Safari。

手柄上在 `user-select: none` 前添加 `-webkit-user-select: none`，确保 Safari 拖动期间抑制文本选择。
