<a id="platform-controls-dismiss-dialog"></a>

# 通过平台控件关闭对话框

模态打开时，用户预期使用熟悉的控件关闭：键盘 <kbd>Esc</kbd>、移动平台返回按钮或手势、辅助技术关闭手势。

`<dialog>` 最初只可通过 <kbd>Esc</kbd> 关闭，不支持移动端返回等其他平台控件。随着 `<dialog>` 元素增加 `closedby` 属性，对更多平台特定关闭请求的响应行为也应用到以模态状态打开的 `<dialog>`（即在 JavaScript 中命令式调用 `<dialog>` 元素的 `showModal()` 方法，或使用声明式 `show-modal` 调用命令）。因此，已经使用 `<dialog>` 的开发者无需作额外修改。

```html
<!-- MANDATORY: must be opened with either `showModal()` with JavaScript or the `show-modal` command using declarative command invokers in order respond to close requests including platform-specific controls. -->
<dialog aria-labelledby="example">
  <h1 id="example">Example</h1>
  <p>Modal that can be dismissed with close requests.</p>
</dialog>
```

模态打开时，未设 `closedby` 的对话框对关闭请求的响应，与显式将 `closedby` 属性设为 `closerequest` 相同。

```html
<!-- This is unnecessary as it is the default behavior for modal dialogs -->
<dialog closedby="closerequest" aria-labelledby="example">
  <h1 id="example">Example</h1>
  <p>Modal that can be dismissed with close requests.</p>
</dialog>
```

如果还需要“轻触关闭”，必须将 `closedby` 设为 `any`：

```html
<dialog closedby="any" aria-labelledby="example">
  <h1 id="example">Example</h1>
  <p>Modal that can be dismissed with close requests and light dismiss.</p>
</dialog>
```

<a id="fallback-strategies"></a>

## 回退策略

`<dialog closedby>` 的浏览器支持：有限可用。
支持版本：Chrome 134（2025 年 3 月）、Edge 134（2025 年 3 月）和 Firefox 141（2025 年 7 月）。
不支持：Safari。

模态 `<dialog>` 已能用 <kbd>Esc</kbd> 关闭，无需回退。移动返回按钮/手势的关闭请求没有良好模拟方式，因此更简单的选择是将其视为渐进增强，尤其已有其他包容性的关闭途径。`<dialog>` 元素通过 `closedby="any"` 提供的轻触关闭行为，同样可视为渐进增强。