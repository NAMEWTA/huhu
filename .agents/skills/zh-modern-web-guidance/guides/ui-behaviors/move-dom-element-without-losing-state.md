<a id="move-dom-element-without-losing-state"></a>

# 移动 DOM 元素而不丢失状态

通过 `appendChild()`、`insertBefore()` 等传统方法改变父节点时，浏览器隐式先移除元素，再插入新位置。这种“移除再插入”重置许多内部状态，导致 `<iframe>` 重载、CSS 动画重启、输入框失焦。

要保留状态地移动，使用 `moveBefore()` API。它执行原子移动，完全绕过移除与插入步骤。

<a id="moving-an-element-with-state"></a>

## 移动具有状态的元素

`moveBefore()` 用法与 `insertBefore()` 相同，需要两个参数：待移动节点、插入到其前方的参考节点；参考为 `null` 则追加到新父级末端。

```javascript
const newParent = document.getElementById('new-parent');
const elementWithState = document.getElementById('iframe-or-focused-input');

// MANDATORY: Use moveBefore to preserve state. 
// Passing null as the second argument appends the element to the end of newParent.
newParent.moveBefore(elementWithState, null);
```

<a id="moving-custom-elements-web-components"></a>

## 移动自定义元素（Web Components）

使用 `moveBefore()` 移动自定义元素时，**不会**触发 `connectedCallback` 和 `disconnectedCallback` 生命周期。

需要在移动时执行特定逻辑，可在自定义元素定义中实现 `connectedMoveCallback()`。

```javascript
class MyCustomElement extends HTMLElement {
  connectedCallback() {
    // Runs on initial insertion.
  }
  
  connectedMoveCallback() {
    // Runs when the element is moved via moveBefore().
    // Use this to update state that depends on the new DOM location.
  }
}
```

<a id="fallback-strategies"></a>

## 回退策略

moveBefore() 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 144（2025 年 10 月）。
不支持：Safari。

`moveBefore()` 是渐进增强，调用前必须检测，旧浏览器回退为传统 `insertBefore()` 或 `appendChild()`。

```javascript
const targetParent = document.getElementById('target-container');
const nodeToMove = document.getElementById('moving-element');

// Check if moveBefore is supported on the Element prototype
if ('moveBefore' in Element.prototype) {
  targetParent.moveBefore(nodeToMove, null);
} else {
  // Fallback: traditional move. 
  // Note: This WILL reset <iframe>, animation, and focus state in unsupported browsers.
  targetParent.insertBefore(nodeToMove, null);
}
```

<a id="accessibility-considerations"></a>

## 无障碍考量

确保移动或改变父节点不会引起令人迷失的上下文变化，例如键盘焦点掉到 `<body>`。

尽可能由用户触发而非自动变化，避免意外上下文改变。

确保移动不影响整体内容含义。例如多个内容面板能够或本就预期按任意顺序独立阅读，重新摆放不会改变含义；但若必须按特定顺序理解，DOM 重排即使视觉仍合理，也可能破坏阅读顺序，使看不到内容的屏幕阅读器用户迷失。

若移动触发用户需要知道的重要变化，例如把视频从页面一处移到另一处“收藏”列表，用实时区域确认成功。
