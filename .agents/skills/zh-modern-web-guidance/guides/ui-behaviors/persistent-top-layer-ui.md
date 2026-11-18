<a id="persistent-top-layer-ui"></a>

# 保持顶层 UI 状态

用 `appendChild()`、`insertBefore()` 等传统方法在 DOM 移动已打开 `<dialog>`、`popover` 或全屏元素时，浏览器隐式移除再插入。移除会重置状态，使模态、浮层和全屏突然关闭。

要在改变父节点时保持用户体验且不关闭，改用原子 `moveBefore()` API。

<a id="reparenting-open-top-layer-elements"></a>

### 重新挂载已打开顶层元素

`moveBefore()` 接受待移动节点和参考节点两个参数；插入参考之前，参考为 `null` 则追加到新父级末尾。

```javascript
const newParent = document.getElementById('new-container');
const dialogElement = document.getElementById('my-dialog');

// MANDATORY: Use moveBefore to ensure the <dialog> or popover stays open.
// Passing null appends it to the end of newParent.
newParent.moveBefore(dialogElement, null);
```

<a id="fallback-strategies"></a>

### 回退策略

moveBefore() 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 144（2025 年 10 月）。
不支持：Safari。

`moveBefore()` 属于渐进增强，调用前必须进行特性检测；旧浏览器回退为传统重新挂载。

**必须：** 不支持浏览器中，传统移动会关闭 `<dialog>`。如需保持打开，必须移动后手动重新打开。

```javascript
const targetParent = document.getElementById('target-container');
const popoverOrDialog = document.getElementById('my-top-layer-element');

// Check if moveBefore is supported
if ('moveBefore' in Element.prototype) {
  targetParent.moveBefore(popoverOrDialog, null);
} else {
  // Fallback: traditional move.
  // Note: This WILL close <dialog>, popover, and fullscreen elements.
  const wasOpen = popoverOrDialog.hasAttribute('open') || popoverOrDialog.matches(':popover-open');
  targetParent.insertBefore(popoverOrDialog, null);
  
  // Manually restore state if possible
  if (wasOpen && typeof popoverOrDialog.showModal === 'function') {
    popoverOrDialog.showModal();
  } else if (wasOpen && typeof popoverOrDialog.showPopover === 'function') {
    popoverOrDialog.showPopover();
  }
}
```