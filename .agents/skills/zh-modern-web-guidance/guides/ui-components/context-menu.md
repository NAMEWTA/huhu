<a id="context-menu"></a>

# 上下文菜单

上下文菜单让用户快速访问与特定项目或区域有关的操作。在项目列表中，它由单个按钮触发。它也可以作为次要交互，通过右键点击或某些情况下的长按触发，让主要的点击或触摸操作继续用于选择、导航或拖放。

- **右键点击 + 可见菜单按钮（推荐）：** 当前视图主要通过此菜单访问这些操作时，需要这种方式；它同时支持触摸、键盘和发现入口。
- **仅可见菜单按钮：** 不需要右键点击行为时使用。

只有项目能先被选中，且其他位置也能执行相同操作（例如常驻工具栏）时，仅右键点击的方式才具备无障碍可用性。

<a id="implementation"></a>

## 实现

<a id="1-shared-foundation"></a>

### 1. 共用基础

遵循 `menu` 指南（通过 `npx -y modern-web-guidance@latest retrieve "menu"` 获取），在浮层中创建上下文菜单内容。

上下文菜单不应跨多个项目复用，每个菜单都必须有唯一 ID。

```html
<!-- 菜单容器 -->
<div popover id="context-menu">
  <div focusgroup="menu nomemory" aria-label="Context Menu">
    <button type="button">Edit</button>
    <button type="button">Share</button>
    <button type="button">Delete</button>
  </div>
</div>
```

使用 CSS Anchor Positioning 将浮层与锚点对齐，同时防止浮层溢出。

```css
/* 相对于锚点定位浮层 */
[popover] {
  margin: 0;
  inset: auto;
  /* 使用 position-area 让菜单相对于锚点对齐 */
  position-area: block-end span-inline-end;
  position-try: flip-inline, flip-block, flip-start;
}
```

<a id="2-method-a-right-click-trigger-cursor-anchored"></a>

### 2. 方法 A：右键点击触发（锚定光标）

要将菜单准确放在光标处，使用不可见的锚点元素，在用户右键点击时由 JavaScript 定位。部分平台也可能通过长按触发，但并非通用行为，尤其 iOS Safari 不支持。把此元素放在触发上下文菜单的元素内部，紧挨可见按钮之前。

```html
<span class="menu-anchor"></span>
```

```css
/* 跟随光标的不可见锚点 */
.menu-anchor {
  position: fixed;
  inline-size: 0;
  block-size: 0;
}
```

监听 `contextmenu` 事件以阻止浏览器默认菜单，用 `pointerup` 捕获坐标并打开浮层。将焦点移到第一个启用的按钮。

```js
const card = document.querySelector('.card');
const menuAnchor = card.querySelector('.menu-anchor');
const popover = card.querySelector('#context-menu');

function openContextMenu(e) {
  const x = e.clientX;
  const y = e.clientY;

  // 将锚点元素移到光标位置。
  // 使用物理属性而非逻辑属性，与 clientX/clientY 对应。
  menuAnchor.style.left = `${x}px`;
  menuAnchor.style.top = `${y}px`;

  // 打开浮层并关联锚点来源。
  // 必须：使用 showPopover({source}) 建立隐式锚点。
  popover.showPopover({ source: menuAnchor });
  // 在浮层的 toggle 事件中检查 enterOnOpen 是否包含该浮层，并将焦点移到第一个按钮。
  enterOnOpen.add(popover);
}

card.addEventListener('contextmenu', (e) => {
  // 阻止浏览器默认上下文菜单。
  e.preventDefault();
});

card.addEventListener('pointerup', (e) => {
  // button 2 表示鼠标右键点击。
  if (!(e.button === 2 || e.ctrlKey)) return;
  openContextMenu(e);
});
```

<a id="3-method-b-visible-menu-button-element-anchored"></a>

### 3. 方法 B：可见菜单按钮（锚定元素）

为触摸用户和一般的入口发现需求，添加切换同一浮层的可见按钮。使用 `command` 和 `commandfor` 属性实现声明式控制。浮层元素紧接此 `<button>` 放置。

按钮直接覆盖在可交互内容上时，最小尺寸必须为 24 × 24 CSS 像素。如果按钮未覆盖可交互内容，其周围 12 像素半径内不得有其他交互元素，且此范围不得与其他不足尺寸目标的 24 CSS 像素直径圆相交。

为了让入口容易被发现，尤其考虑使用语音控制软件或存在认知障碍的人，应始终显示按钮。避免仅在悬停或聚焦时显示按钮的模式。

```html
<button type="button" 
  command="toggle-popover" 
  commandfor="context-menu"
  aria-haspopup="menu" aria-expanded="false"
  aria-label="Actions for item 1">
  <!-- 可见触发器，例如三点图标 -->
</button>
```

`command` 属性设置浮层的隐式锚点位置，与 `showPopover({source})` 中的 source 相同。无需设置 `anchor-name` 或 `position-anchor` 就能将它用作锚点。在项目列表中，将项目名称放进按钮的 `aria-label`，让每个触发器以及通过 `aria-labelledby` 命名的菜单具有不同的无障碍名称。让 `aria-expanded` 的值与浮层状态保持同步。

<a id="4-differentiating-between-methods"></a>

### 4. 区分不同触发方式

要区分触发来源，例如据此调整位置，在浮层的 `beforetoggle` 事件中检查 `event.source`，并设置可用于样式的属性。

```js
popover.addEventListener('beforetoggle', (event)=>{
  if (event.newState === "open") {
    popover.setAttribute("source", event.source?.tagName ?? "");
  }
});
```

```css
[popover][source="button" i]{
  position-area: block-end span-inline-start;
}
```

<a id="fallbacks"></a>

## 回退方案

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退方案和浏览器支持

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起纳入 Baseline。
支持版本：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 主要属于**渐进增强**，但提升到顶层、轻触关闭和 `popovertarget` 调用这些核心行为没有纯 CSS 等价方案。旧浏览器需要 polyfill；不希望引入时，也可以手动实现回退。

**Polyfill：** 要让旧浏览器支持 `popover` 属性，按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须**检查 `HTMLElement.prototype` 上的 `popover` property 做特性检测，**仅**在缺少原生支持时加载 polyfill，不要无条件加载。

使用打包器或 import map 时：

```js
// 必须：检测 HTMLElement.prototype 上的 popover 特性。
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

不使用包管理器时，可从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 的注意事项：

- 对可能在 polyfill 完全加载前运行的代码，不要使用 `popover` IDL 属性。它不会映射为 attribute，polyfill 不会识别该浮层，而此 property 会一直遮蔽 polyfill 添加的访问器。应使用 `setAttribute()` / `removeAttribute()`。
- **样式注意事项：** polyfill 无法定义真正的 `:popover-open` 伪类，因此改为添加 `.\:popover-open` 类。**必须**用 `:is()` 或 `:where()` 将两者组合，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

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

<a id="fallback-for-invoker-commands"></a>

### Invoker Commands 的回退

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

如果目标 Baseline 不支持 Invoker Commands，使用 `popovertarget`。

```html
<button type="button" 
  popovertarget="context-menu"
  aria-haspopup="menu" aria-expanded="false"
  aria-label="Actions for item">
  <!-- 可见触发器，例如三点图标 -->
</button>
```

<a id="fallback-for-anchor-positioning-and-toggleevent-source"></a>

### Anchor Positioning 与 ToggleEvent source 的回退

Anchor positioning 的浏览器支持：有限可用。
支持版本：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

如果目标 Baseline 不支持 CSS Anchor Positioning，必须在 JavaScript 中手动计算浮层的 `inset` 坐标。右键触发时，在 `openContextMenu` 中将 inset 设置为点击位置；按钮点击触发时，设为按钮底边位置。这样可以根据触发方式区分位置，但请注意，此方法不处理溢出。

```js
const openContextMenu = (event) => {
  const x = event.clientX;
  const y = event.clientY;
  if(CSS.supports("anchor-name: --a") ){
    anchor.style.left = `${x}px`;
    anchor.style.top = `${y}px`;
  } else {
    popover.style.removeProperty('right');
    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
  }

  enterOnOpen.add(popover);
  popover.showPopover({ source: anchor });
};

buttonTrigger.addEventListener("click", (event) => {
  const menu = menuFor(buttonTrigger);
  if (!menu) return;
  // 不支持锚点定位时，定位下拉菜单。
  if(!CSS.supports("anchor-name: --a")){
    const {right, width, bottom: y} = event.target.getBoundingClientRect();
    const x = document.body.clientWidth - right;
    menu.style.removeProperty('left');
    menu.style.right = `${x}px`;
    menu.style.top = `${y}px`;
  }
});
```

ToggleEvent source 的 Baseline 状态：新近可用。自 2026-05-11 起纳入 Baseline。
支持版本：Chrome 140（2025 年 9 月）、Edge 140（2025 年 9 月）、Firefox 145（2025 年 11 月）和 Safari 26.5（2026 年 5 月）。

支持锚点定位、但没有 `ToggleEvent` source 时，要按触发器区分位置，应在每个触发器中设置 `position-area`。

```js
const openContextMenu = (event) => {
  const x = event.clientX;
  const y = event.clientY;
  if(CSS.supports("anchor-name: --a") ){
    anchor.style.left = `${x}px`;
    anchor.style.top = `${y}px`;
    if(!'source' in ToggleEvent.prototype){
      popover.style.setAttribute('position-area', 'block-end span-inline-end')
    }
  } 
  // ...
};

buttonTrigger.addEventListener("click", (event) => {
  const menu = menuFor(buttonTrigger);
  if (!menu) return;
  if(!'source' in ToggleEvent.prototype){
    menu.style.setAttribute('position-area', 'block-end span-inline-start')
  }
  // ...
});
```

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

- 使用 `focusgroup` 和 `focusgroupstart` attribute，不要使用 polyfill 不会添加的 `focusGroup` property。
- polyfill 不会察觉之后隐藏或显示的项目；项目隐藏期间，为它添加 `focusgroup="none"`。
