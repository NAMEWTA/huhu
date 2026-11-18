<a id="pre-rendering-custom-elements"></a>

# 预渲染自定义元素

预渲染是指从服务器发送自定义元素的标记，包括它的 shadow 树，使组件在任何 JavaScript 运行之前就具有样式和结构。主要的平台原语是**声明式 Shadow DOM（DSD）**：解析器仅凭 HTML 就附加 shadow root；如果稍后注册了类，元素再由该类升级（“hydrate”）。该模式适用于服务器端渲染、流式输出，以及避免未设置样式的内容闪现（FOUC）。

<a id="authoring-a-declarative-shadow-root"></a>

## 编写声明式 shadow root

将带有 `shadowrootmode` 属性的 `<template>` 嵌套为宿主的第一个子元素。解析器把模板内容附加为 shadow root，并移除模板，无须脚本。

```html
<my-card>
  <template shadowrootmode="open">
    <style>
      .card { border: 1px solid; border-radius: 8px; padding: 1rem; }
    </style>
    <div class="card">
      <slot name="header"></slot>
      <div class="body"><slot></slot></div>
    </div>
  </template>

  <!-- Light DOM children are projected into the slots above. -->
  <h2 slot="header">Server-rendered title</h2>
  <p>Visible and styled before JS loads.</p>
</my-card>
```


<a id="hydration-timing"></a>

## Hydration 时机

匹配的类注册后，浏览器升级宿主。因为 shadow root **已经存在**，构造函数不能盲目创建第二个：

```javascript
class MyCard extends HTMLElement {
  constructor() {
    super();
    // Reuse the server-rendered shadow root if present; only create one if absent.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.append(template.content.cloneNode(true));
    }
    // Hydrate in place: attach listeners once against existing markup (not unguarded
    // in connectedCallback, which re-runs if the element moves in the DOM), and do
    // NOT re-render; that would discard the server's DOM and flash.
    this.shadowRoot.getElementById('toggle')
      ?.addEventListener('click', () => this.toggleAttribute('open'));
  }
}
```


几乎所有情况下都设置 `shadowrootmode="open"`，而非 `closed`，使脚本和工具能访问 `this.shadowRoot` 来 hydrate。在服务器或测试中将现有 shadow root 序列化回 HTML 时，使用 `getHTML({ serializableShadowRoots: true })`，并在附加 root 时设置 `serializable: true`。

<a id="avoiding-fouc"></a>

## 避免 FOUC

只有样式随声明式模板一起发送，DSD 才能在首次绘制时正确渲染。为保持这一点：

- 将组件 CSS 放在 `<template shadowrootmode>` **内部**（使用 `<style>` 标签或 `<link>`），不要放在单独由脚本加载的样式表中。
- 只有必须等待 JS 的样式才配合 `my-card:not(:defined) { … }`，通常是页面级保护规则，例如对未经过 SSR 的客户端渲染实例应用淡出。这些规则位于 light-DOM（页面）样式表，因为那里还没有 shadow root，外部的 `:host` 选择器也不适用。DSD 模板内部的结构样式不需要这种保护。
- Hydration 时不要重新渲染 shadow 树。将服务器标记视为权威内容，并在其上附加行为。

<a id="fallback-strategies"></a>

## 回退策略

声明式 shadow DOM 的 Baseline 状态：广泛可用。它自 2024-02-20 起进入 Baseline。
支持的浏览器：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 123（2024 年 2 月）和 Safari 16.4（2023 年 3 月）。

在不解析 `shadowrootmode` 的引擎中，模板是惰性的，内容不会附加为 shadow root。进行检测（`Object.hasOwn(HTMLTemplateElement.prototype, 'shadowRootMode')`）；如果不支持，则在升级时根据同一份标记，以命令式方式附加 shadow root，使组件仍能渲染。
