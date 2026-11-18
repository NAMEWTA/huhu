<a id="shadow-dom-templates--slots"></a>

# Shadow DOM、模板与插槽

Shadow root 是附加到宿主元素上的封装 DOM 子树：内部样式不会泄漏到外部，页面样式也不会进入内部（继承属性除外）。模板高效构造这棵树，插槽将 Light DOM 内容投影到其中。

<a id="attaching-a-shadow-root"></a>

## 附加 shadow root

```javascript
this.attachShadow({ mode: 'open', delegatesFocus: true });
```


`delegatesFocus: true` 使宿主获得焦点时将焦点移到 shadow 树内第一个可聚焦元素，将 `:focus` 样式传递到宿主，并在表单关联自定义元素（`static formAssociated = true`）上，把 `<label>` 点击转发给内部控件。组件包装可聚焦控件时都应设置它。几乎所有情况下都使用 `mode: 'open'`，使开发工具、页面脚本和服务器 hydration 能访问 `element.shadowRoot`（参见 `web-components`，通过 `npx -y modern-web-guidance@latest retrieve "web-components"` 获取）。

<a id="templates-construct-the-tree-efficiently"></a>

## 模板：高效构造树

只定义**一次** `<template>`（在模块作用域或静态字段中），然后为每个实例克隆。克隆已经解析的片段，比每次构造都重新解析 `innerHTML` 字符串快得多。

```javascript
const template = document.createElement('template');
template.innerHTML = `
  <div class="card">
    <slot name="header"></slot>
    <div class="body"><slot></slot></div>
    <slot name="footer"></slot>
  </div>
`;

class MyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // MANDATORY: deep-clone the template content so each instance gets its own nodes.
    this.shadowRoot.append(template.content.cloneNode(true));
  }
}
customElements.define('my-card', MyCard);
```


保持模板精简。深度嵌套的“div 堆叠”和多层 shadow root 嵌套都会增加可测量的样式解析和布局成本，在大量实例下成为严重性能问题。优先扁平结构和语义元素。

<a id="slots-the-parts-that-surprise-people"></a>

## 插槽：容易出乎意料的部分

默认插槽与具名插槽按文档说明工作；以下行为容易造成问题：

- **空白也算内容。**元素之间的文本节点（包括纯空白）会分配到默认插槽，因此默认插槽很少真正“为空”。
- **保留的是 DOM 顺序，而不是插槽顺序。**无论投影节点填入哪个插槽，对于 `:first-child` / `:last-child`，它们都保持原有 Light DOM 顺序。`::slotted(*:first-child)` 规则针对的是第一个 **DOM** 子节点，而非该插槽的第一个子节点，因此经常不会匹配预期目标。
- **`slotchange` 是升级时机的信号。**分配节点变化时（包括初次分配）会触发；升级时 `connectedCallback` 中可能尚无 Light DOM 子节点，而 `slotchange` 能可靠告知这些子节点已到达。

```javascript
this.shadowRoot.querySelector('slot[name="header"]')
  .addEventListener('slotchange', (e) => {
    const nodes = e.target.assignedElements();
    this.toggleAttribute('has-header', nodes.length > 0);
  });
```


<a id="loading-stylesheets-into-a-shadow-root"></a>

## 将样式表加载到 shadow root 中

| 方法 | 优点 | 缺点 |
| :--- | :--- | :--- |
| 模板内的 `<style>` | 简单、完全封装，无 JS 也可工作。 | 每个实例重复一份；大量实例时 DOM 膨胀。 |
| `<link rel="stylesheet">` | 可缓存的外部文件。 | 额外请求；可能出现未设置样式的内容闪现。 |
| `adoptedStyleSheets` | 所有实例共享一个 `CSSStyleSheet`，大量实例时最快。 | 需要 JS；构造式样式表不支持 `@import`。 |

同一个组件有大量实例时，优先共享构造式样式表：

```javascript
const sheet = new CSSStyleSheet();
sheet.replaceSync(`:host { display: block; }`);

class MyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // The same sheet object is reused by every instance; no per-instance parse.
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }
}
```

