<a id="build-a-draggable-element"></a>

# 构建可拖动元素

为现有浮动元素（面板、调色板、工具栏、检查器或对话框）添加拖动。拖动不决定其显示、关闭、层叠或焦点行为。

<a id="use-a-dedicated-handle"></a>

## 使用专用手柄

元素包含可选文字、按钮、输入或链接时，从专用手柄启动拖动，保持正常内容可用。让手柄可聚焦以支持键盘移动，并提供提到方向键交互的无障碍名称。确保它暴露 `button` 角色，让屏幕阅读器能传达名称。

在手柄而非整个元素上应用 `cursor: grab`/`grabbing`、`touch-action: none`、`user-select: none` 和 `-webkit-user-select: none`，让外部文字仍可选、触摸手势保持正常：

```css
.drag-handle {
  cursor: grab;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.drag-handle.dragging {
  cursor: grabbing;
}
```

<a id="preserve-pointer-position-and-reachability"></a>

## 保留指针位置与可达性

将移动约束在视口时，使用 `position: fixed` 等相对视口的定位模型。

- 只对主指针按钮（`event.button === 0`）启动拖动。
- `pointerdown` 记录指针偏移，并用于每次移动，避免从角落之外抓取时元素跳变。
- 指针离开手柄后继续拖动。默认用 `setPointerCapture()`，在 `lostpointercapture` 清除状态。手柄可能中途被移除或重渲染时，改用文档级 `pointermove`、`pointerup`、`pointercancel` 监听器，因为这些情况会丢失捕获。
- 可选：移动约 4px 后再进入拖动状态，避免单击手柄也触发拖动样式。

使用指针捕获时，移动监听器可留在手柄上：

```js
handle.addEventListener('pointerdown', (event) => {
  const control = event.target.closest('button, input, select, textarea, a');
  if (event.button !== 0 || (control && control !== handle)) return;

  const rect = draggable.getBoundingClientRect();
  offsetX = event.clientX - rect.left;
  offsetY = event.clientY - rect.top;
  handle.setPointerCapture(event.pointerId);
});

handle.addEventListener('pointermove', (event) => {
  if (!handle.hasPointerCapture(event.pointerId)) return;
  handle.classList.add('dragging');
  moveTo(event.clientX - offsetX, event.clientY - offsetY);
});

handle.addEventListener('lostpointercapture', () => {
  handle.classList.remove('dragging');
});

function moveTo(left, top) {
  const maxLeft = Math.max(0, window.innerWidth - draggable.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - draggable.offsetHeight);

  draggable.style.left = `${Math.max(0, Math.min(left, maxLeft))}px`;
  draggable.style.top = `${Math.max(0, Math.min(top, maxTop))}px`;
}
```

所有指针与键盘位置都通过同一个约束辅助函数，确保元素可达。视口或元素尺寸变化后重新约束当前位置。布局开销大的元素可在拖动时仅变换，避免逐帧布局，释放后再将最终位置提交到 `left` 和 `top`。

<a id="provide-keyboard-movement"></a>

## 提供键盘移动

手柄聚焦时用方向键移动，并对这些键调用 `preventDefault()`。复用指针移动的约束辅助函数。15px 步长是合理起点，可按组件尺寸和精度需求调整。

<a id="dialog-specific-note"></a>

## 对话框特别说明

`<dialog>` 或 `[popover]` 除独立手柄外，也可用标题栏启用此机制。设置 `left` 和 `top` 前先设 `margin: 0`，因为浏览器默认外边距会干扰手动定位。对话框和浮层的打开、关闭、焦点及关闭方式参见 `declarative-dialog-popover-control`（通过 `npx -y modern-web-guidance@latest retrieve "declarative-dialog-popover-control"` 获取）和 `platform-controls-dismiss-dialog`（通过 `npx -y modern-web-guidance@latest retrieve "platform-controls-dismiss-dialog"` 获取）。

<a id="accessibility-requirements"></a>

## 无障碍要求

向辅助技术暴露的拖动手柄必须是专用按钮，不能只把对话框标题栏通过脚本设为可拖动。这样屏幕阅读器用户才能获得合适角色和名称。例如使用原生按钮：

```html
<button type="button" aria-label="Notes panel handle. Use arrow keys to move.">
  <!-- handle icon -->
</button>
```

确保元素也可通过无需拖动的单指针操作移动或操作，例如点击或轻触。UI 依用例而定，例如：
- 看板：“移到列”菜单或按钮。
- 地图：方向平移按钮。
- 滑块：点击轨道，有时也可通过关联 `<input>` 调值。
- 浮动面板和对话框：背景网格中点击某格即移到该位置；或将拖动手柄设为菜单按钮，菜单项提供“停靠左侧”“向左移动”“停靠顶部”“向上移动”“停靠右侧”“向右移动”“停靠底部”“向下移动”。

移动时为屏幕阅读器用户提供反馈。使用视觉隐藏的实时区域，更新时会被播报。区域必须在页面加载时已存在，才能注册。

```html
<div class="visually-hidden" aria-live="polite"></div>
```

元素移动时更新区域：

```html
<div class="visually-hidden" aria-live="polite">
  [Name of element] moved [new position]
</div>
```

不要显示原始位置坐标，优先描述性名称，例如“已停靠左侧”“已向左移动”“已向上移动”；没有有意义描述时省略。
消息一秒后可移除，因为已播报且不再相关。

键盘交互对部分用户可能不明显，应在元素内提供帮助按钮，显示操作按键。

<a id="fallback-strategies"></a>

## 回退策略

拖动仅改变组件位置时，将其视为渐进增强：没有 JavaScript 仍在合理默认位置保持元素、内容和控件可见、可读、可用。不要显示无效拖动手柄：独立抓手默认隐藏，JS 初始化后显示；标题栏兼手柄则在初始化后添加拖动提示。

user-select 的浏览器支持：有限可用。
支持版本：Chrome 54（2016 年 10 月）、Edge 79（2020 年 1 月）和 Firefox 69（2019 年 9 月）。
不支持：Safari。

在 `user-select: none` 前加入 `-webkit-user-select: none`，确保 Safari 拖动期间抑制文本选择。
