<a id="build-a-popup-menu"></a>

# 构建弹出菜单

本指南介绍单个弹出菜单：用户用方向键浏览的一组命令或链接。打开方式并不重要：可以是按钮（“操作”或更多按钮）、另一个菜单中的项（子菜单），也可以没有可见触发器（上下文菜单）。

同一页面的多个触发器分别属于独立菜单，除非把它们构建成菜单栏：每个都有自己的 `Tab` 停靠点，彼此没有联系。作为一个控件运作的一排菜单（文件、编辑、视图：一个 `Tab` 停靠点，用 `ArrowLeft`/`ArrowRight` 切换，支持悬停切换）是应用菜单栏。按本文构建每个菜单，再参见 `app-menus`（通过 `npx -y modern-web-guidance@latest retrieve "app-menus"` 获取）了解如何连接它们。

<a id="commands-links-and-what-makes-a-menu"></a>

## 命令、链接与菜单的定义

这是两个独立的选择。本文其余内容对两者都适用。

* **每个项目的元素。** 命令使用 `<button type="button">`；目的地使用 `<a href>`，仍可在新标签页打开、复制 URL，并在无脚本时工作。菜单可自由混合两者：两个链接加六个命令，或一个命令加六个链接，都不影响下文。
* **每个菜单的交互模型。** 方向键、`Home`/`End` 和 `Esc` 使其成为菜单：添加 focusgroup，让它为每个按钮或链接推断 `menuitem`，并让外观符合菜单（带下拉指示的触发器，或应用菜单栏中的连续栏）。用户通过 `Tab` 浏览的简短链接列表是导航：不使用 focusgroup、`role="menu"`、`role="menuitem"` 或 `aria-haspopup="menu"`，但保留浮层、`Esc` 和焦点恢复。导航参见 `navbar`（通过 `npx -y modern-web-guidance@latest retrieve "navbar"` 获取）。

内容从不决定角色。由链接组成的“产品”下拉列表可以是菜单；由命令组成的“账户”下拉列表不能是导航。

只有具备一个 Tab 停靠点和方向键导航的复合控件才使用菜单模式。使用 `<div focusgroup="menu nomemory">`，而非 HTML `<menu>` 元素。不要在共享标记中添加 `role="menu"` 或 `role="menuitem"`：原生 focusgroup 会推断这些角色，显式角色会阻止推断。仅在下述不支持浏览器的回退中添加。`nomemory` 让重新打开时从第一项开始。Focusgroup 移动焦点；脚本处理激活、子菜单预览和焦点恢复。

<a id="open-and-position-the-menu"></a>

## 打开并定位菜单

用 `commandfor` 和 `command="toggle-popover"` 将每个触发器设为命令调用器。浏览器在点击、Enter 和 Space 时打开或关闭浮层，并将触发器保留在所属浮层的轻触关闭组内，因此点击已打开的触发器会关闭菜单。不要使用 `popovertarget` 或 `popovertargetaction`；此模式使用 `commandfor`。

将每个浮层紧接其触发器放置。只有浮层不是下一个兄弟元素时，浏览器才添加隐式 `aria-details` 关系，因此这种位置无需额外属性即可避免它。

没有触发按钮的菜单通过脚本 `showPopover({ source })` 打开。`source` 设置隐式锚点，因此应传入菜单所属元素：被右键点击的卡片，或通过键盘快捷键打开时的当前焦点元素。如果要在某个点打开（指针位置，或 `@` 提及选择器的光标位置），锚点定位仍需要元素，因此使用占位元素：一个空的、零尺寸的 `position: fixed` 元素，紧放在菜单前，每次打开时用 `left` 和 `top` 移到该点，并作为 `source` 传入。零尺寸锚点让菜单角落落在该点，如同原生上下文菜单，下面的翻转回退仍适用。用 `aria-label` 为菜单命名，而非 `aria-labelledby`。本指南其余内容保持适用；定位说明中提到“触发器”时，理解为该占位元素。

```html
<!-- Command invoker: the browser toggles the popover on click, Enter, and Space -->
<button id="actions-trigger" class="trigger" type="button" aria-haspopup="menu" aria-expanded="false"
  commandfor="actions-menu" command="toggle-popover">
  Actions
</button>
<!-- Immediately after its trigger, so browsers add no implicit aria-details -->
<div id="actions-menu" popover="auto">
  <!-- Nested, not on the popover: Chromium otherwise drops focusgroup keyboard behavior -->
  <div focusgroup="menu nomemory" aria-labelledby="actions-trigger">
    <button type="button">Duplicate</button>
    <button type="button">Rename</button>
    <button id="export-trigger" type="button" aria-haspopup="menu" aria-expanded="false"
      commandfor="export-menu" command="toggle-popover">
      Export <span aria-hidden="true">›</span>
    </button>
    <!-- Submenu: popover="auto" directly after its trigger, inside the parent focusgroup -->
    <div id="export-menu" popover="auto">
      <div focusgroup="menu nomemory" aria-labelledby="export-trigger">
        <button type="button">PDF</button>
        <button type="button">Plain Text</button>
      </div>
    </div>
  </div>
</div>
```

用指向触发器的 `aria-labelledby` 为每个菜单命名。装饰性子菜单指示符放在 CSS 中，或添加 `aria-hidden="true"`。为 `aria-expanded="true"` 的触发器提供可见激活样式，让用户知道哪个菜单已打开。菜单栏之外，每个触发器应呈现为独立按钮：它有自己的 `Tab` 停靠点，样式必须体现这一点。任何连接触发器的行为（`role="menubar"`、触发器之间的方向键、聚焦预览）都属于应用菜单栏。

<a id="position-the-menu-with-css-anchor-positioning"></a>

### 使用 CSS Anchor Positioning 定位菜单

使用 CSS 锚点定位，不用 JavaScript 坐标。`command="toggle-popover"` 和 `showPopover({ source: trigger })` 都会设置隐式锚点，因此不要为每个菜单单独添加 `anchor-name` 或 `position-anchor` 规则。菜单行为不得依赖锚点定位。

```css
/* Top-level menus sit below their trigger, flipping when they would overflow. The implicit anchor comes from the invoker or source. */
[popover]:has(> [focusgroup~="menu"]) {
  position-area: block-end span-inline-end;
  position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
  inset: auto;
}

/* A popover directly inside a menu is a submenu: beside its parent item, flipping when it would overflow. */
[focusgroup~="menu"] > [popover] {
  position-area: inline-end span-block-end;
  position-try-fallbacks: flip-inline, flip-block, --below;
}

/* Last resort for narrow viewports: directly below the trigger, indented, so the submenu never
   covers its trigger. */
@position-try --below {
  position-area: block-end span-inline-end;
  margin-inline-start: 1rem;
  /* Fit the area: the submenu's minimum width must not stop this fallback from fitting. */
  min-inline-size: 0;
  max-inline-size: calc(100% - 1rem);
}
```

将 `--below` 放在最后，仅在两侧都容纳不下时使用。它会在触发器正下方打开，因此窄屏上会覆盖触发器下方的兄弟项；这是为了贴近触发器而接受的取舍。也要允许子菜单缩小以适应区域（`min-inline-size: 0`，`max-inline-size` 减去缩进）。容纳不下的回退会被跳过；若全部不合适，浏览器保留基础位置，所以仅宽出几像素的子菜单就可能悄然覆盖触发器。

普通浮层的翻转回退机制参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。该指南定位的是按钮组而非菜单；对于菜单，以本文子菜单位置和 `--below` 回退为准。

<a id="animate-open-and-close"></a>

### 打开和关闭动画

可选。时长低于 150 ms，仅使用 `opacity` 和少量 `translate`，子菜单相同，并放在 `@media (prefers-reduced-motion: no-preference)` 内。焦点在 `toggle` 时移动，因此过渡不会耽误键盘用户。

```css
@media (prefers-reduced-motion: no-preference) {
  /* Closing: this rule is in effect once :popover-open is removed. */
  [popover]:has(> [focusgroup~="menu"]) {
    opacity: 0;
    translate: 0 -.25rem;
    transition: opacity, translate, display, overlay;
    transition-duration: .15s;
    /* Separate after transition so the shorthand doesn't reset it or fail in older browsers */
    transition-behavior: allow-discrete;
  }
  /* Opening: faster. */
  [popover]:has(> [focusgroup~="menu"]):popover-open {
    opacity: 1;
    translate: 0 0;
    transition-duration: .1s;
    @starting-style { opacity: 0; translate: 0 -.25rem; }
  }
}
```

`@starting-style` 不是重复 `[popover]`：关闭的浮层为 `display: none`，过渡不会从未渲染状态开始，因此它为打开过程提供起始值。缺少它时，打开会直接跳变，只有关闭有动画。`display` 和 `overlay` 配合 `transition-behavior: allow-discrete`（作为独立声明放在 `transition` 之后，避免旧浏览器忽略整个 `transition`）让浮层保持渲染和顶层位置，直到关闭过渡结束。

<a id="keyboard-and-focus"></a>

## 键盘与焦点

不要在 focusgroup 内再添加一套 roving-tabindex 系统。脚本仅覆盖调用器和 focusgroup 未提供的行为：

* **触发器是普通按钮。** `Tab` 像到达其他按钮一样到达它，聚焦不会打开菜单。`Enter`、`Space` 和点击会原生切换菜单，脚本不得拦截这些按键。
* **键盘打开后进入菜单。** 用 `Enter` 或 `Space` 打开时聚焦第一个可用项目。在触发器上按 `ArrowDown`，若菜单关闭就打开，并无论如何聚焦第一项，因此指针打开后方向键也可工作。
* **指针点击关闭的触发器。** 原生打开菜单。焦点留在触发器，没有项目获得焦点。只有键盘打开才进入菜单。
* **指针点击已打开的触发器。** 原生关闭菜单，不进入菜单。
  * **子菜单触发器的已知差异。** 指针点击子菜单触发器同样会原生切换，因此可能关闭悬停已预览的子菜单，或打开尚未出现的子菜单。原生菜单只会打开而不关闭。这没有危害，故本指南接受该差异。
* **指针移到项目上。** 不带焦点环地聚焦，让悬停与焦点对应同一项目。
* **菜单内部。** `ArrowUp` 和 `ArrowDown` 在可用项目间移动。`Home` 和 `End` 移到首尾可用项目，由脚本处理。
* **子菜单预览。** 通过方向键或指针聚焦子菜单触发器（指针需短暂延迟后聚焦），会显示其子菜单并设置 `aria-expanded="true"`。焦点留在触发器，没有子菜单项获得焦点。移到兄弟项会关闭预览。
* **在已预览的子菜单触发器上按 Enter 或 Space。** 关闭预览，焦点留在触发器。由原生 `toggle-popover` 操作处理。
* **在子菜单触发器上按 ArrowRight。** 必要时打开子菜单，并聚焦其第一项。
* **在子菜单中按 ArrowLeft 或 Escape。** 仅关闭该子菜单，并将焦点恢复到其触发器。父菜单保持打开。
* **在顶层菜单中按 Escape。** 关闭菜单并将焦点恢复到触发器。
* **在命令上按 Enter 或 Space。** 激活命令并关闭所有打开的菜单。
* **Tab。** 离开菜单系统。不要困住焦点，也不要逐个遍历所有命令。关闭时不得把焦点留在隐藏内容中。
* **没有触发按钮。** 通过脚本打开的菜单，若由键盘打开则聚焦第一项；关闭时恢复到打开前拥有焦点的元素。

`command` 事件在 `toggle-popover` 打开菜单之前触发，因此不能在那里将焦点移入菜单。应在 `toggle` 事件中移动。HTML 仅为堆栈中的第一个 `popover="auto"` 恢复焦点，因此嵌套层级必须显式恢复到自己的触发器。

<a id="implementing-the-interaction"></a>

## 实现交互

为自己的标记实现上述行为。方向键、`Home`/`End`、循环移动和 `Tab` 退出都是普通 `keydown` 代码。下面按输入类型列出容易出错的部分。

<a id="keyboard-and-focus-handling"></a>

### 键盘与焦点处理

1. **单一打开路径。** 键盘打开调用 `trigger.click()`，使调用器的 `toggle-popover` 成为唯一打开方式。标记菜单，让 `toggle` 处理器仅在键盘打开时进入它。指针打开时，`toggle` 改为不带焦点环地聚焦触发器，因为 `pointerdown` 阻止了焦点，而方向键仍必须可用。
2. **聚焦时预览子菜单。** 聚焦子菜单触发器时调用 `showPopover({ source: trigger })`，使子菜单锚定它。忽略从触发器自己的子菜单内部返回的焦点（按 `Escape` 后），或从另一个窗口返回的焦点（在窗口 `blur` 设置标志，窗口 `focus` 一个 tick 后清除）。除非焦点移入预览子菜单，否则在 `blur` 时隐藏它。顶层触发器没有预览：聚焦不执行任何操作。
3. **在 `toggle` 而非 `command` 中移动焦点。** `command` 在菜单打开前触发。
4. **自行将焦点恢复到触发器。** 在 `hidePopover()` 前聚焦触发器。指针激活后，不带焦点环地恢复（`focus({ focusVisible: false })`），否则鼠标点击后触发器会出现键盘焦点轮廓；键盘激活保留焦点环。`event.detail === 0` 的点击来自键盘。
5. **一次关闭一层。** 子菜单中的 `Escape` 和 `ArrowLeft` 调用 `stopPropagation()`，否则父级监听器也会关闭父菜单。

<a id="pointer-handling"></a>

### 指针处理

1. **指针点击切换。** 在 `pointerdown` 调用 `preventDefault()`，避免点击移动焦点。记录按下了哪个触发器。点击关闭的触发器会原生打开且不进入菜单；只有键盘打开才进入。不要拦截点击。
2. **悬停跟随焦点。** 分别设置 `:hover` 和 `:focus-visible` 样式。项目上的 `pointermove` 调用 `focus({ focusVisible: false })`；忽略此选项的浏览器本来也不会为指针聚焦绘制焦点环。指针聚焦子菜单触发器时，运行与键盘聚焦相同的子菜单预览，但略作延迟，避免指针穿过项目时闪现子菜单。
3. **安全三角区。** 静态 CSS 桥接区域太窄，仅在指针从靠近父菜单边缘处出发时有效。让 CSS 从指针离开触发器的位置绘制三角形，脚本只负责定位：
   * 仅在 `matchMedia('(hover: hover)').matches` 时运行，与触摸和键盘无关。
   * 当子菜单已打开，在其触发器的 `pointerleave` 事件坐标处开始。跳过没有侧边的 `--below` 子菜单。
   * 在子菜单上设置 `--pointer-x` 和 `--pointer-y`（指针相对子菜单盒子的 px 坐标），并用 `data-bridge` 启用桥接。CSS 推导其余信息：根据 `--pointer-x` 符号判断指针所在侧，并根据伪元素自身盒子的百分比计算子菜单近侧两个角。
   * 指针在桥上移动时，事件目标是子菜单，因此在那里监听：指针向子菜单移动时保持桥接；静止约 300 ms 后、水平远离子菜单时、到达子菜单项目时或子菜单关闭时移除属性。从离开时固定计算 300 ms 对从容的斜向移动太短；忽略反向运动的桥接又会让改变主意的用户等待。
   * CSS 给子菜单添加 `::before`，裁剪成从起点到近侧两个角的三角形，并在起点周围保留几 px 余量（下文 `--bridge-slack`），使指针自身位于形状内部而非边缘。顶点不跟随指针：若顶点一直在指针处，每次移动都变为方向测试，稍一偏离直线就关闭子菜单。三角形覆盖指针路径上的兄弟项，使它们收不到会关闭子菜单的悬停。`clip-path` 也限制命中测试，因此父菜单其余部分仍可交互。
   * 子菜单需要 `overflow: visible`（浮层默认裁剪）。伪元素向各边延伸 `100vw`/`100vh`，所以形状坐标需加上该偏移，其盒子的 `100%` 是子菜单加上两倍延伸量。
   * 后续改进：曲线路径（`shape()` 的曲线命令）比直角三角区更贴近真实指针弧线。

```css
[focusgroup~="menu"] > [popover] {
  overflow: visible;

  &[data-bridge]::before {
    content: "";
    position: absolute;
    inset: -100vh -100vw; /* Room for the triangle. In this box the submenu runs from 100vw/100vh to 100% - 100vw/100vh. */
    --bridge-slack: 5px; /* The apex moves away from the submenu by this much and is twice this tall. */
    --bridge-side: sign(var(--pointer-x)); /* -1: pointer left of the submenu, 1: right. */
    --bridge-edge: calc(50% + var(--bridge-side) * (50% - 100vw)); /* The submenu's near edge. */
    --bridge-apex: calc(100vw + var(--pointer-x) + var(--bridge-side) * var(--bridge-slack));
    clip-path: polygon(
      var(--bridge-apex) calc(100vh + var(--pointer-y) - var(--bridge-slack)),
      var(--bridge-edge) 100vh,
      var(--bridge-edge) calc(100% - 100vh),
      var(--bridge-apex) calc(100vh + var(--pointer-y) + var(--bridge-slack))
    );
  }
}
```

```js
const canHover = matchMedia('(hover: hover)');

// Call on pointerleave of a submenu trigger, with its submenu.
function startBridge(submenu, event) {
  if (!canHover.matches || !submenu.matches(':popover-open')) return;
  const rect = submenu.getBoundingClientRect();
  const left = event.clientX < rect.left;
  if (!left && event.clientX <= rect.right) return; // --below: no side edge.
  submenu.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
  submenu.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
  submenu.dataset.bridge = '';
  let timer;
  let lastX = event.clientX;
  const stop = () => {
    clearTimeout(timer);
    submenu.removeEventListener('pointermove', extend);
    submenu.removeAttribute('data-bridge');
  };
  const extend = ({ target, clientX }) => {
    // Reached an item, or turned away from the submenu.
    if (target !== submenu || (left ? clientX < lastX : clientX > lastX)) return stop();
    lastX = clientX;
    clearTimeout(timer);
    timer = setTimeout(stop, 300);
  };
  timer = setTimeout(stop, 300);
  submenu.addEventListener('pointermove', extend);
  submenu.addEventListener('toggle', stop, { once: true });
}
```

悬停跟随焦点（第 2 项）还需要一个保护条件。离开触发器的那次移动，在桥接存在前已完成命中测试，因此目标仍是指针下的兄弟项。如果 `document.elementFromPoint(event.clientX, event.clientY)` 不在该项目内，就跳过聚焦；之后路径上的移动会命中桥接，其目标是子菜单而非项目。

此外：

* **外部焦点。** 当焦点落到菜单系统外时关闭全部打开的菜单（使用 `document` 的 `focusin` 监听器）。
* **命令激活。** 先播报，再隐藏根菜单并将焦点恢复到触发器；指针激活则不显示焦点环。对于可勾选项（`menuitemcheckbox`、`menuitemradio`），关闭前等待约 300 ms，让更改后的勾选标记可见。关闭的触发器仅在 `:focus-visible` 时呈现激活样式，否则指针选择后恢复的不带环焦点会使其继续高亮。
* **`aria-expanded`。** 只在 `toggle` 监听器设置。它涵盖预览和打开状态，菜单预览或打开期间，触发器的 `aria-expanded` 始终为 `"true"`。
* **辅助函数。** 下述回退假定你为自己的标记定义了：`triggers`（全部 `[commandfor]` 按钮）、`menuFor(trigger)`、`isOpen(menu)`、`closeAndRestore(menu, { fromPointer })`（先聚焦触发器，`fromPointer` 时不带环，再调用 `menu.hidePopover()`）、`enterOnOpen`（打开后要进入的菜单组成的 `WeakSet`）和 `pointerTrigger`（最近被指针按下的触发器）。

<a id="submenus"></a>

### 子菜单

* 子菜单使用 `popover="auto"`，放在父级 `focusgroup` 内、紧跟子菜单触发器。绝不用 `popover="manual"`。
* 嵌套让浏览器保持父菜单打开、关闭兄弟子菜单、根菜单关闭时关闭子菜单，并处理外部点击轻触关闭。
* 子菜单触发器保留 `aria-haspopup="menu"` 和 `aria-expanded`；用 `toggle` 监听器同步 `aria-expanded`。
* 键盘脚本按前文处理嵌套的 `Escape` 和 `ArrowLeft`。
* 子菜单触发器绝不能同时执行命令：同一个控件不能既激活又打开，`Enter` 不能同时表示两者。将默认操作放为子菜单第一项，或在触发器旁添加独立命令项。若被迫使用组合控件，应记录其无障碍取舍。

<a id="separators-and-checkable-items"></a>

### 分隔线和可勾选项

* 在 focusgroup 内用 `<hr>` 分隔项目组：它是原生 `separator`，不可聚焦，会被 focusgroup 和回退跳过。绝不用带样式的 `<div>`。
* 布尔选项使用带 `aria-checked` 和显式 `role="menuitemcheckbox"` 的 `<button type="button">`。Focusgroup 不会推断这些角色，因此这是共享标记中唯一设置项目角色的位置。
* 一组选项中的单选项使用带 `role="menuitemradio"` 和 `aria-checked` 的 `<button type="button">`，放在同一个 focusgroup 内、具有 `aria-label` 的 `role="group"` 中。
* 脚本切换 `aria-checked`。
* 在复选项上按 `Enter` 切换并关闭菜单；按 `Space` 切换但保持打开（APG）。单选项按任一键都会关闭。
* 用 `[aria-checked="true"]::before` 绘制勾选标记，不用独立图标元素（参见下文 CSS）。

<a id="not-covered-here"></a>

### 本文未涵盖的内容

* **激活反馈。** 原生菜单会在关闭前闪烁所选项。如需要，可在 `hidePopover()` 前显示约 100 ms 视觉确认；不要延迟焦点恢复或播报。
* **按字查找。** Focusgroup 不提供此功能。如需要，在可打印字符的 `keydown` 中匹配当前层级可用项目的标签，从当前项之后循环找到下一匹配项并聚焦。不要拦截 `Space`。

<a id="verify-before-finishing"></a>

## 完成前验证

指令不能保证行为正确，因此要测试结果。打开页面，用真实键盘和鼠标逐项检查；失败时修复并重测：

* **键盘。** `Tab` 到达触发器但不打开菜单；`ArrowDown` 打开并进入；`Escape` 关闭一层并返回其触发器；`Tab` 关闭全部菜单。
* **指针打开。** 点击触发器打开菜单，焦点在触发器且无焦点环；随后 `ArrowDown` 进入；再次点击关闭。
* **指针命令。** 点击命令关闭全部菜单，触发器不出现焦点环。
* **子菜单。** 从子菜单触发器中部斜向移到子菜单项时保持打开；移到无关兄弟项时关闭。
* **窄屏。** 在 375 px 宽度下，子菜单不覆盖自身触发器。
* **勾选标记。** 选中项显示勾选标记。
* **没有残留。** 无控制台错误，触发器上没有 `popovertarget`、`popovertargetaction` 或 `aria-details`。

<a id="align-menu-item-content"></a>

## 对齐菜单项内容

一行包含图标、标签以及快捷键或子菜单指示时，为图标或勾选标记预留固定尺寸的前置槽位，并将尾部内容推到行内末端。图标尺寸已知，固定槽位能让有无图标的项目标签保持对齐。不要为行使用 `subgrid`：额外的行内子元素（例如徽章）会成为独立网格项并破坏布局。快捷键文本如果只是重复已经操作该项的按键，应对辅助技术隐藏。

```css
[focusgroup~="menu"] {
  --menu-icon-size: 1.25rem;
}

/* Target items only. A closed submenu popover inside the focusgroup must keep display: none. */
[focusgroup~="menu"] > button,
[focusgroup~="menu"] > [role="group"] > button {
  display: flex;
  align-items: center;
  gap: .5rem;
}

/* The leading slot holds the icon or check mark. */
[focusgroup~="menu"] button::before {
  content: "";
  flex: none;
  inline-size: var(--menu-icon-size);
}

/* Check mark for checked items. This selector must be at least as specific as the base
   ::before rule above, or the empty content wins and the check mark never shows. */
[focusgroup~="menu"] button[aria-checked="true"]::before {
  content: "✓";
}

/* Shortcut or submenu indicator at the inline end. */
[focusgroup~="menu"] .hint {
  margin-inline-start: auto;
}
```

在按钮内部用 `<span class="hint" aria-hidden="true">` 放置尾部指示或快捷键；子菜单触发器已经会播报其弹出内容。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-focusgroup"></a>

### focusgroup 的回退方案和浏览器支持

focusgroup 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

在标记中保留 `focusgroup="menu nomemory"`。如果 `'focusGroup' in HTMLElement.prototype` 为 false，安装上、下、Home、End 行为，为每个菜单容器设置 `role="menu"`，为没有角色的按钮设置 `role="menuitem"`；不改动可勾选项、`<hr>` 和 `role="group"`。存在原生 focusgroup 时绝不安装。无论哪种路径，子菜单预览、打开和关闭都由作者脚本负责。

```js
if (!('focusGroup' in HTMLElement.prototype)) {
  document.querySelectorAll('[focusgroup~="menu"]').forEach(group => {
    group.setAttribute('role', 'menu');
    group.querySelectorAll('button:not([role])').forEach(item => {
      item.setAttribute('role', 'menuitem');
    });
    group.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      // Own items only: a nested submenu has its own focusgroup, a role="group" wrapper does not.
      const items = [...group.querySelectorAll('button')]
        .filter(item => item.closest('[focusgroup]') === group)
        .filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
      const current = items.indexOf(document.activeElement);
      if (current < 0) return;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
        (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      items[next].focus({ preventScroll: true });
    }, true);
  });
}
```

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退方案和浏览器支持

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起纳入 Baseline。
支持版本：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 主要属于**渐进增强**，但其核心行为——提升到顶层、轻触关闭和 `popovertarget` 调用——没有纯 CSS 等价实现。旧浏览器需要 polyfill；如果不希望引入，也可以手动实现回退。

**Polyfill：** 要在旧浏览器支持 `popover` 属性，按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须：** 检测 `HTMLElement.prototype` 是否具有 `popover` 属性，**仅在**缺少原生支持时加载 polyfill，不得无条件加载。

使用打包工具或 import map 时：

```js
// MANDATORY: Feature detect 'popover' on HTMLElement.prototype.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

如果不使用包管理器，可以从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 时的注意事项：
- 对于可能在 polyfill 完全加载前运行的代码，不要使用 `popover` IDL 属性。它不会映射成 HTML 属性，浮层不会被 polyfill 识别，而且该属性会永久遮蔽 polyfill 添加的访问器。改用 `setAttribute()`/`removeAttribute()`。
- **样式注意事项：** polyfill 无法定义真正的 `:popover-open` 伪类，因此改为应用 `.\:popover-open` 类。**必须：** 用 `:is()` 或 `:where()` 组合两者，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```

<a id="fallbacks--browser-support-for-anchor-positioning"></a>

### 锚点定位的回退方案和浏览器支持

Anchor positioning 的浏览器支持：有限可用。
支持版本：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

没有 CSS Anchor Positioning 时，浮层会回退到用户代理的视口居中位置。菜单绝不能以此交付：它会脱离触发器，居中的子菜单还会覆盖父菜单。把锚点规则放在 `@supports (position-area: block-end)` 中，不支持时通过脚本定位：

* 将菜单放在触发器下方（顶层）或旁边（子菜单），溢出时翻到另一侧并约束到视口内。
* 菜单打开时在 `toggle` 处理器中执行，将结果作为菜单的 `left` 和 `top`。使用 `position: fixed` 配合 `inset: auto` 和 `margin: 0`，使坐标相对于视口。
* 将这些覆盖放在 `@supports not (position-area: block-end)` 内，避免影响支持锚点定位的浏览器。

api.HTMLElement.showPopover.options_source_parameter.implicit_anchor_reference 能力的 Baseline 状态：新近可用。自 2026-01-13 起纳入 Baseline。
支持版本：Chrome 137（2025 年 5 月）、Edge 137（2025 年 5 月）、Firefox 147（2026 年 1 月）和 Safari 26（2025 年 9 月）。

如果目标包含 `showPopover({ source })` 尚不建立隐式锚点的早期实现（`ToggleEvent.prototype` 上没有 `source`），通过脚本为每个触发器设置唯一 `anchor-name`，并为每个菜单设置匹配的 `position-anchor`，不要逐个编写 CSS 规则。

完全没有锚点定位的浏览器所用 polyfill 路径参见 `viewport-aware-dropdowns`（通过 `npx -y modern-web-guidance@latest retrieve "viewport-aware-dropdowns"` 获取）。

<a id="fallbacks--browser-support-for-invoker-commands"></a>

### Invoker commands 的回退方案和浏览器支持

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

没有调用器时，`command="toggle-popover"` 无效，因此脚本必须切换菜单。

* 检测接口而非实例：`'commandForElement' in HTMLButtonElement.prototype`。
* 在每个触发器的 `click` 调用 `preventDefault()`，避免支持调用器的浏览器切换两次。
* 菜单已打开时，用 `closeAndRestore(menu)` 关闭；否则调用 `menu.showPopover({ source: trigger })`。
* 除非点击来自被指针按下的触发器（`pointerTrigger`），否则在 `enterOnOpen` 中标记菜单，确保只有键盘打开才进入。
* `Enter` 和 `Space` 仍然可用，因为它们会在按钮上生成点击。

<a id="fallbacks--browser-support-for-has"></a>

### `:has()` 的回退方案和浏览器支持

`:has()` 的 Baseline 状态：广泛可用。自 2023-12-19 起纳入 Baseline。
支持版本：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 121（2023 年 12 月）和 Safari 15.4（2022 年 3 月）。

如果目标浏览器不支持 `:has()`，给每个菜单浮层添加类，替代 `[popover]:has(> [focusgroup~="menu"])` 选择器。

<a id="fallbacks--browser-support-for-sign"></a>

### `sign()` 的回退方案和浏览器支持

abs() 和 sign() 的 Baseline 状态：新近可用。自 2025-06-26 起纳入 Baseline。
支持版本：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 118（2023 年 9 月）和 Safari 15.4（2022 年 3 月）。

如果目标 Baseline 缺少 `sign()`，跳过 `--bridge-side`，用 `clamp()` 选择边缘和顶点偏移：大乘数将 `--pointer-x` 推过任一界限，使结果为其中一个端点。

```css
@supports not (width: calc(sign(1px) * 1px)) {
  [data-bridge]::before {
    --bridge-edge: clamp(100vw, 50% + var(--pointer-x) * 1e6, 100% - 100vw);
    --bridge-apex: calc(100vw + var(--pointer-x) + clamp(-1 * var(--bridge-slack), var(--pointer-x) * 1e6, var(--bridge-slack)));
  }
}
```
