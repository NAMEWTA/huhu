<a id="light-dismiss-a-dialog"></a>

# 轻触关闭对话框

现代模态对话框常支持“轻触关闭”，让用户点击或轻触背景遮罩（对话框外区域）关闭。`closedby` 以声明式方式启用此行为，无需自定义 JavaScript。

<a id="implementation"></a>

## 实现

启用轻触关闭：

1. 给 `<dialog>` 添加 `closedby="any"`。
2. 用 `dialog.showModal()` 打开。

<a id="attribute-values"></a>

### 属性值

- `any`：启用轻触关闭（点击背景）、“关闭请求”（`Esc`）和开发者机制（例如 `dialog.close()`）。
- `closerequest`：仅启用关闭请求和开发者机制，模态默认值。
- `none`：仅开发者机制可关闭。

<a id="styling-the-backdrop"></a>

### 背景遮罩样式
使用 `showModal()` 模态打开时，浏览器生成 `::backdrop`，覆盖整个视口并紧位于对话框后方。

```css
/* Style the backdrop to indicate the dialog is modal */
dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px); /* Optional: add blur for modern browsers */
}
```

<a id="example"></a>

## 示例

```html
<!-- MANDATORY: Use closedby="any" to enable light-dismiss behavior -->
<dialog id="myDialog" closedby="any" aria-labelledby="dialogTitle">
  <form method="dialog">
    <h2 id="dialogTitle">Feedback</h2>
    <p>Click outside this box or press Esc to dismiss.</p>
    <button type="submit">Close</button>
  </form>
</dialog>

<button onclick="document.getElementById('myDialog').showModal()">Open Dialog</button>
```

<a id="constraints--accessibility"></a>

## 约束与无障碍

- **必须：** 用 `closedby="any"` 声明式启用轻触关闭。
- **必须：** 始终用 `showModal()` 打开模态，确保位于顶层、焦点受约束并处理 `Esc`。
- **要：** 始终提供可见关闭按钮，给用户清晰的替代关闭途径。
- **要：** 用 `aria-labelledby` 或 `aria-label` 命名对话框。
- **不要：** 为 `show()` 打开的非模态使用 `closedby`，它们没有背景遮罩，不会触发轻触关闭。
- **不要：** 用 `click` 处理需要在关闭前发生的关键逻辑；改为监听 `close` 或 `cancel`。

确保模态内没有也使用 `Esc` 交互而导致意外关闭的组件。若包含使用 `Esc` 的组件（例如菜单或组合框），它们聚焦时应捕获 `Esc` 并按自身用途处理，避免意外关闭整个对话框。

<a id="fallback-strategies"></a>

## 回退策略

`<dialog closedby>` 的浏览器支持：有限可用。
支持版本：Chrome 134（2025 年 3 月）、Edge 134（2025 年 3 月）和 Firefox 141（2025 年 7 月）。
不支持：Safari。

**必须：** 尚不支持 `closedby` 的浏览器，需要通过以下脚本检查点击是否发生在对话框内容边界外，实现轻触关闭回退：

```javascript
const dialog = document.querySelector('dialog');

// Fallback for browsers without closedby support
if (!('closedBy' in HTMLDialogElement.prototype)) {
  dialog.addEventListener('click', (event) => {
    // 1. When clicking the backdrop, the event target is the dialog element itself.
    // Ignore clicks where the target is a child element inside the dialog.
    if (event.target !== dialog) return;

    // 2. Check if the click coordinates fall within the dialog's content box.
    // This distinguishes between a click on the backdrop vs a click on the dialog's background/padding.
    const rect = dialog.getBoundingClientRect();
    const isDialogContent = (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );

    if (isDialogContent) return;

    // 3. Since the click was outside the content area (on the backdrop), manually close the dialog.
    dialog.close();
  });
}
```
