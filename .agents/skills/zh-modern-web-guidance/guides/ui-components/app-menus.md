<a id="build-an-application-menu-bar"></a>

# 构建应用菜单栏

应用菜单栏（File、Edit、View、Help）是一排作为单一控件工作的菜单：一个 `Tab` 停靠点，`ArrowLeft`、`ArrowRight` 在菜单间移动，聚焦标题即显示菜单；一旦有菜单打开，指向另一个标题就切换过去。将其用于应用命令栏。

不要用于站点导航（用户通过 `Tab` 逐个访问的少量链接），也不要用于工具栏或页头中几个互不相关的菜单按钮。后者应为独立菜单：每个触发器各有自己的 `Tab` 停靠点，外观是独立按钮，没有下文的菜单栏行为。

栏内每个菜单都是完整弹出菜单，包含 invoker 触发的 popover、嵌套 focusgroup、子菜单、分隔符、可勾选项、定位、指针处理和回退。按照 `menu`（运行 `npx -y modern-web-guidance@latest retrieve "menu"`）构建；本指南只说明菜单栏在此基础上增加的部分。

<a id="structure"></a>

## 结构

* 为顶层触发器容器设置 `role="menubar"` 和 `aria-label`，不要设置在 popover 上。每个顶层触发器都是 menubar 的直接子元素，后面紧跟自己的 popover。
* 每个顶层触发器有描述用途的无障碍名称，并设置 `role="menuitem"`。
* 将栏绘制为连续带状，触发器之间无空隙或边框。独立按钮暗示各自有 `Tab` 停靠点；连续栏则暗示一个控件。
* 给 `aria-expanded="true"` 的触发器明显的活动样式，让用户知道哪个菜单正在打开或预览。

```html
<div role="menubar" aria-label="Document commands">
  <!-- 仅活动触发器可通过 Tab 到达；脚本随 ArrowLeft 和 ArrowRight 移动 tabindex。 -->
  <button id="file-trigger" type="button" aria-haspopup="menu" aria-expanded="false"
    commandfor="file-menu" command="toggle-popover" role="menuitem">File</button>
  <div id="file-menu" popover="auto">
    <div focusgroup="menu nomemory" aria-labelledby="file-trigger">
      <!-- 项目和子菜单与菜单指南相同。 -->
    </div>
  </div>

  <button id="edit-trigger" type="button" aria-haspopup="menu" aria-expanded="false"
    commandfor="edit-menu" command="toggle-popover" tabindex="-1">Edit</button>
  <div id="edit-menu" popover="auto">
    <div focusgroup="menu nomemory" aria-labelledby="edit-trigger">
      <!-- … -->
    </div>
  </div>
</div>
```

<a id="keyboard-and-focus"></a>

## 键盘与焦点

各菜单内部沿用 menu 指南的键盘模型。菜单栏额外增加：

* **一个 Tab 停靠点。** `Tab` 进入第一个顶层触发器。`ArrowLeft` 和 `ArrowRight` 在顶层触发器间移动，并在两端循环。触发器上的 `Home`、`End` 进入其菜单的第一项或最后一项。
  * **注意 `Tab` 返回哪个触发器。** APG 允许返回第一个或最后使用的触发器。本指南指定第一个，但用 `ArrowLeft` 和 `ArrowRight` 移动 Tab 停靠点后，键盘导航后的 `Shift`+`Tab` 会回到最后到达的触发器。指针操作不移动停靠点，所以相同步骤可能落到不同触发器。两种行为都可接受，但应选定一种并保持一致。
* **预览。** 聚焦顶层触发器会显示菜单并设置 `aria-expanded="true"`。焦点保留在触发器，不聚焦任何菜单项。触发器失焦时关闭仅预览的菜单。
* **预览中的 Enter 和空格。** 关闭预览并将焦点保留在触发器。原生 `toggle-popover` 已处理，脚本不得拦截这些键。
* **预览中的 ArrowDown。** 将预览转为已打开菜单，并聚焦第一项。
* **已打开顶层菜单内的左右方向键。** 关闭当前菜单，预览相邻菜单并聚焦其触发器，在两端循环。再按 `ArrowDown` 才进入。左右键永远不直接落到菜单内部。
* **没有下级子菜单的子菜单项上按 ArrowRight。** 关闭整个层级，预览下一个顶层菜单，焦点留在触发器。再按 `ArrowDown` 进入。
* **有菜单打开时，指针进入另一个顶层触发器。** 关闭原菜单，预览悬停项，并将焦点无焦点环地移到其触发器。没有菜单打开时，悬停不执行操作。
* **Tab。** 从触发器或任意菜单内部离开菜单栏，并关闭全部菜单。

<a id="implementing-the-bar"></a>

## 实现菜单栏

1. **游走式 tabindex。** 第一个顶层触发器设 `tabindex="0"`，其他设 `-1`。`ArrowLeft` 或 `ArrowRight` 移到其他触发器时，随之移动 `0`。不要把触发器放进 focusgroup；菜单栏需要聚焦预览和菜单切换，而 focusgroup 不提供。
2. **聚焦时预览。** 顶层触发器的 `focus` 处理器调用 `menu.showPopover({ source: trigger })`，使菜单锚定它。忽略从触发器自身菜单内部返回的焦点，或从其他窗口返回的焦点（窗口 `blur` 时设标记，窗口 `focus` 后一个 tick 再清除，否则切换应用会重新打开上次菜单）。`blur` 时隐藏预览菜单，除非焦点进入其中。
3. **菜单间移动。** 由一个函数关闭全部顶层菜单、移动 tabindex 并聚焦目标触发器，剩余由聚焦预览完成。在触发器上按 `ArrowLeft`/`ArrowRight`、在已打开顶层菜单内按相同的键，以及在没有下级子菜单的子菜单项上按 `ArrowRight` 时调用它。

```js
// 仅直接子元素：子菜单触发器位于菜单栏的嵌套浮层内。
const rootTriggers = [...document.querySelectorAll('[role="menubar"] > [commandfor]')];

// 与原生菜单栏相同，左右键总是落到相邻触发器并预览，绝不直接进入菜单。
// 之后由 ArrowDown 进入。
function moveToRootTrigger(from, direction) {
  const next = rootTriggers[(rootTriggers.indexOf(from) + direction + rootTriggers.length) % rootTriggers.length];
  rootTriggers.forEach(trigger => { trigger.tabIndex = trigger === next ? 0 : -1; });
  rootTriggers.map(menuFor).filter(isOpen).forEach(menu => menu.hidePopover());
  next.focus({ preventScroll: true }); // 聚焦触发器会预览其菜单。
}
```

4. **悬停切换已打开菜单。** 顶层触发器的 `pointerenter` 发生且另一顶层菜单已打开时：隐藏旧菜单，无焦点环聚焦悬停触发器（`focus({ focusVisible: false })`），然后由聚焦预览显示新菜单。无菜单打开时不做操作。保留顶层触发器的 `:hover`：没有菜单打开时只是按钮反馈；有菜单时悬停切换，焦点随之移动。
5. **从触发器进入。** 预览中的触发器按 `ArrowDown` 聚焦第一项；关闭状态的触发器则标记需要进入菜单并调用 `trigger.click()`，使 invoker 保持唯一打开路径。`Home`、`End` 必要时先预览，再聚焦首个或最后一个启用项。
6. **外部焦点。** 关闭全部菜单的 `document` `focusin` 监听器必须把 menubar 视为菜单系统内部，否则 `Tab` 刚落到触发器就会关闭刚预览的菜单。
7. **立即切换。** 原生 menubar 切换已打开菜单没有动画。如果菜单有动画，在栏内另一菜单已打开时禁用过渡：

```css
@media (prefers-reduced-motion: no-preference) {
  /* 与原生菜单栏相同，已打开的菜单之间立即切换。 */
  [role="menubar"]:has(> [popover]:popover-open) > [popover] {
    transition: none;
  }
}
```

<a id="verify-before-finishing"></a>

## 完成前验证

指令不能保证行为，因此要测试结果。打开页面，用真实键盘和鼠标逐项检查，失败时修复并复测。菜单自身也按 menu 指南的清单检查。

* **一个 Tab 停靠点。** `Tab` 只落到一次第一个触发器并预览；从页面内容按 `Shift`+`Tab` 返回栏时也只停一次，不逐个经过触发器。
* **方向键。** 在触发器上按 `ArrowRight` 和 `ArrowLeft` 循环预览相邻菜单，不聚焦菜单项；按 `ArrowDown` 进入。已打开菜单内的 `ArrowRight` 和 `ArrowLeft` 将相邻菜单切为预览。
* **悬停。** File 打开时，指向 Edit 立即切换；没有菜单打开时，指向触发器不执行操作。
* **窗口焦点。** 切到其他窗口再返回，不会重新打开上次菜单。
* **离开。** 从触发器或菜单内按 `Tab`，关闭全部菜单并离开栏。

<a id="fallback-strategies"></a>

## 回退策略

菜单栏自身使用游走式 tabindex、焦点处理和 `showPopover()`，这些脚本能力均广泛支持。相对于菜单本体，栏仅额外使用 `[role="menubar"]:has(> [popover]:popover-open)` 规则在切换时禁用过渡；缺少 `:has()` 时，切换会像普通打开一样带动画。

栏内菜单使用 focusgroup、popover、invoker commands、锚点定位和 `:has()`，其回退如下。

<a id="fallbacks--browser-support-for-focusgroup"></a>

### focusgroup 的回退与浏览器支持

focusgroup 的浏览器支持：有限可用。
支持：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

标记中保留 `focusgroup="menu nomemory"`。若 `'focusGroup' in HTMLElement.prototype` 为 false，安装上下、Home、End 的处理，为菜单容器设置 `role="menu"`，为没有 role 的按钮设置 `role="menuitem"`；不要改动可勾选项、`<hr>` 或 `role="group"`。有原生 focusgroup 时绝不安装。无论哪种情况，子菜单预览、打开、关闭都由作者脚本实现。

```js
if (!('focusGroup' in HTMLElement.prototype)) {
  document.querySelectorAll('[focusgroup~="menu"]').forEach(group => {
    group.setAttribute('role', 'menu');
    group.querySelectorAll('button:not([role])').forEach(item => {
      item.setAttribute('role', 'menuitem');
    });
    group.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      // 仅自身项目：嵌套子菜单有自己的 focusgroup，role="group" 包裹层则没有。
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

### Popover 的回退与浏览器支持

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起达到 Baseline。
支持：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 大体上属于**渐进增强**，但提升到顶层、轻触关闭、`popovertarget` 调用这些核心行为没有纯 CSS 等价实现。旧浏览器需要 polyfill；若不希望分发，也可手动回退。

**Polyfill：** 为旧浏览器支持 `popover` 属性，有条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**强制要求：** 检测 `HTMLElement.prototype` 上的 `popover` 属性，仅在原生支持缺失时加载，不要无条件加载。

使用构建工具或 import map：

```js
// 必须：检测 HTMLElement.prototype 上的 popover 特性。
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

不用包管理器时，可从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 的注意事项：
- 可能在 polyfill 完全加载前运行的代码，不要使用 `popover` IDL 属性；它不会反映为 HTML 属性，popover 不会被识别，而且该属性会一直遮蔽 polyfill 添加的访问器。应使用 `setAttribute()`/`removeAttribute()`。
- **样式注意事项：** polyfill 无法定义真实的 `:popover-open` 伪类，会改用 `.\:popover-open` 类。**强制要求：** 用 `:is()` 或 `:where()` 合并两者，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```

为防止 polyfill 加载前显示浮层，请用 CSS 将它们隐藏：

```css
@supports not selector(:popover-open) {
  [popover]:not(.\:popover-open) {
    display: none;
  }
}
```

Popover polyfill 无法完整模拟顶层行为。避免让菜单成为任何子菜单的包含块；添加 `translate` 打开过渡时就可能发生这种情况。将所有会建立包含块的属性（`filter`、`translate`、`scale`、`transform` 等）放在 `@supports selector(:popover-open)` 查询内。

```css
[popover]:has(> [focusgroup~="menu"]){
  @supports selector(:popover-open){
    translate: 0 -.25rem;
  }
}
```

<a id="fallbacks--browser-support-for-anchor-positioning"></a>

### 锚点定位的回退与浏览器支持

css.properties.position-area 能力的 Baseline 状态：新近可用。自 2026-01-13 起纳入 Baseline。
支持版本：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）、Firefox 147（2026 年 1 月）和 Safari 26（2025 年 9 月）。

缺少 CSS 锚点定位时，popover 会回退到 UA 的视口居中位置。菜单绝不能这样交付：它会脱离触发器，居中的子菜单还会遮住父菜单。用 `@supports (position-area: block-end)` 限定锚点规则，检测失败时通过脚本定位：

* 顶层菜单放在触发器下方，子菜单放侧面；可能溢出时翻到另一侧，并限制在视口内。
* 菜单打开时在 `toggle` 处理器中运行，将结果写入菜单 `left`、`top`。使用 `position: fixed`、`inset: auto`、`margin: 0`，使坐标相对于视口。
* 覆盖放在 `@supports not (position-area: block-end)` 内，不影响支持锚点定位的浏览器。

ToggleEvent source 的 Baseline 状态：新近可用。自 2026-05-11 起纳入 Baseline。
支持版本：Chrome 140（2025 年 9 月）、Edge 140（2025 年 9 月）、Firefox 145（2025 年 11 月）和 Safari 26.5（2026 年 5 月）。

目标包含早期实现、`showPopover({ source })` 无法建立隐式锚点（`ToggleEvent.prototype` 上没有 `source`）时，通过脚本为各触发器设置唯一 `anchor-name`，为菜单设置匹配的 `position-anchor`，不要逐个编写菜单 CSS。

<a id="fallbacks--browser-support-for-invoker-commands"></a>

### Invoker commands 的回退与浏览器支持

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起达到 Baseline。
支持：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

没有调用器时，`command="toggle-popover"` 不会执行任何操作。改用 `popovertarget`：它有更久的浏览器支持历史，popover polyfill 也支持它。

* 除非点击来自被按下的触发器（`pointerTrigger`），否则将菜单记入 `enterOnOpen`，使只有键盘打开会进入菜单。
* `Enter` 和 `Space` 仍可使用，因为它们会在按钮上生成 click。

<a id="fallbacks--browser-support-for-has"></a>

### `:has()` 的回退与浏览器支持

:has() 的 Baseline 状态：广泛可用。自 2023-12-19 起达到 Baseline。
支持：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 121（2023 年 12 月）和 Safari 15.4（2022 年 3 月）。

目标包含不支持 `:has()` 的浏览器时，为每个菜单 popover 添加类，代替 `[popover]:has(> [focusgroup~="menu"])` 选择器。

<a id="fallbacks--browser-support-for-sign"></a>

### `sign()` 的回退与浏览器支持

abs() 和 sign() 的 Baseline 状态：新近可用。自 2025-06-26 起达到 Baseline。
支持：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 118（2023 年 9 月）和 Safari 15.4（2022 年 3 月）。

Baseline 目标缺少 `sign()` 时，跳过 `--bridge-side`，用 `clamp()` 选择边缘与顶点微移；较大乘数将 `--pointer-x` 推过任一边界，使结果落在一端或另一端。

```css
@supports not (width: calc(sign(1px) * 1px)) {
  [data-bridge]::before {
    --bridge-edge: clamp(100vw, 50% + var(--pointer-x) * 1e6, 100% - 100vw);
    --bridge-apex: calc(100vw + var(--pointer-x) + clamp(-1 * var(--bridge-slack), var(--pointer-x) * 1e6, var(--bridge-slack)));
  }
}
```

