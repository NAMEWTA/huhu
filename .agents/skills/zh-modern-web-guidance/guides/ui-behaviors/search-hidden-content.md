<a id="search-hidden-content"></a>

# 搜索隐藏内容

Web 界面常隐藏内容以改善体验、节省空间或提升性能。`display: none`、`visibility: hidden` 等传统方式在视觉上隐藏，也让屏幕阅读器和浏览器“页内查找”完全无法访问。

要在视觉上隐藏而仍可搜索，并支持 URL 片段和“滚动到文本片段”深链接，可使用 HTML `<details>` 或 `hidden="until-found"`。通常推荐 `<details>`，实现维护更简单；一些复杂情况它不够用，才需要 `hidden="until-found"`。

例如：

- 需要完全控制显示/隐藏机制的样式。
- 控制显示/隐藏的 UI 位于 DOM 另一处。
- 显示后不希望再支持隐藏。

<a id="how-to-implement"></a>

## 实现方法

`<details>` 的文字默认可搜索且可访问，无需特殊实现。尽可能优先使用 `<details>`，而非 `hidden="until-found"`。

必须用 `hidden="until-found"` 时：

1. **应用属性：** 直接给包含待隐藏内容的元素添加 `hidden="until-found"` HTML 属性。
2. **同步 UI 状态：** 如果界面其他状态依赖可见性，例如 ARIA 属性、开关类或手风琴图标旋转：
   - **必须**监听 `beforematch`。
   - 直接在带有 `hidden="until-found"` 属性的元素上注册 `beforematch` 监听器。事件会冒泡，也可在父元素（如标签容器）委托单个监听器管理多个区域。
   - 在监听器内同步关联 UI，例如关闭其他标签或改变切换按钮状态。

<a id="example-code"></a>

## 示例代码

**目标：** 渲染隐藏容器，内容在用户搜索该区域内词语前不可见。

<a id="using-details-element"></a>

### 使用 `<details>` 元素

```html
<details>
  <summary>Click to expand</summary>
  <p>This content is visually hidden.</p>
</details>
```

<a id="mutually-exclusive-disclosures"></a>

#### 互斥展开区域

排他手风琴等互斥区域，使用共享 `name` 的原生 `<details>`。

```html
<div class="accordion-group">
  <!-- The name attribute creates an exclusive disclosure group -->
  <details class="disclosure" name="my-accordion">
    <summary>Section 1</summary>
    <p>Section 1 content</p>
  </details>

  <details class="disclosure" name="my-accordion" open>
    <summary>Section 2</summary>
    <p>Section 2 content</p>
  </details>

  <details class="disclosure" name="my-accordion">
    <summary>Section 3</summary>
    <p>Section 3 content</p>
  </details>
</div>
```

<a id="using-hiddenuntil-found-attribute"></a>

### 使用 `hidden="until-found"` 属性

```html
<!-- The browser automatically removes hidden="until-found" upon a search match -->
<div class="hidden-container" hidden="until-found">
  <p>This content is visually hidden.</p>
</div>
```

<a id="custom-mutually-exclusive-disclosures"></a>

#### 自定义互斥展开区域

外部按钮控制的自定义互斥区域，应确保仅匹配面板可见。在 `beforematch` 内必须同步 ARIA，例如控制按钮设 `aria-expanded="true"`。

```html
<div class="custom-accordion">
  <div class="controls">
    <button aria-expanded="true" aria-controls="panel-1" id="btn-1">Section 1</button>
    <button aria-expanded="false" aria-controls="panel-2" id="btn-2">Section 2</button>
  </div>

  <div id="panel-1" class="panel">
    <p>Section 1 content (visible)</p>
  </div>

  <div id="panel-2" class="panel" hidden="until-found">
    <p>Section 2 content (hidden)</p>
  </div>
</div>
```

```javascript
const accordion = document.querySelector('.custom-accordion');

accordion.addEventListener('beforematch', (e) => {
  // Hide all panels and synchronize button states before the browser reveals the matched panel
  accordion.querySelectorAll('.panel').forEach((panel) => {
    if (panel !== e.target) {
      panel.hidden = 'until-found';
    }
  });
  accordion.querySelectorAll('button').forEach((btn) => {
    const controls = btn.getAttribute('aria-controls');
    btn.setAttribute('aria-expanded', controls === e.target.id ? 'true' : 'false');
  });
});
```

<a id="best-practices-for-hiddenuntil-found"></a>

## `hidden="until-found"` 最佳实践

- **要**把边框、内边距和背景应用到嵌套包装，而非直接应用到带有 `hidden="until-found"` 属性的元素，防止隐藏时意外布局偏移或视觉残留。
- **不要**对带有 `hidden="until-found"` 属性的元素直接应用 `display: none`、`visibility: hidden` 或任何相关的 `display`、`visibility` CSS 属性。这会破坏原生功能，使内容永久从搜索索引隐藏。
- **不要**将 `hidden="until-found"` 用于敏感信息、内部数据令牌或不应经搜索暴露的无关数据。
- **不要**用 `hidden="until-found"` 替代“仅屏幕阅读器可见”（.sr-only）文字。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

`<details>` 的 Baseline 状态：广泛可用。自 2020-01-15 起纳入 Baseline。
支持版本：Chrome 12（2011 年 6 月）、Edge 79（2020 年 1 月）、Firefox 49（2016 年 9 月）和 Safari 6（2012 年 7 月）。

hidden="until-found" 的浏览器支持：有限可用。
支持版本：Chrome 102（2022 年 5 月）、Edge 102（2022 年 5 月）和 Firefox 148（2026 年 2 月）。
不支持：Safari。

**不要**因缺少浏览器支持就避免使用 `hidden="until-found"`，其无障碍收益远大于实现回退成本。

<a id="hiddenuntil-found-fallback"></a>

#### `hidden="until-found"` 回退

普通手风琴或“阅读更多”区域，用 JS 检测，不支持时显示全部内容。

```javascript
if (!('onbeforematch' in HTMLElement.prototype)) {
  // Expand all hidden content for unsupported browsers
  document.querySelectorAll('[hidden="until-found"]').forEach((el) => {
    el.removeAttribute('hidden');
    // MANDATORY: also update any aria references to this element.
  });
}
```

互斥 UI（如共享同一视觉区域的自定义排他面板）应在回退时提取全部内容，按线性顺序显示于主交互区域下方，用 URL 锚点片段让用户直接导航到各节。
