<a id="styling-web-components"></a>

# 为 Web Components 设置样式

Shadow DOM 是样式边界：页面规则不能进入，组件规则不会泄漏，**继承属性**（包括自定义属性）除外。通过以下渠道有意识地跨越边界。

<a id="host-host-host-context"></a>

## `:host`、`:host()`、`:host-context()`

```css
/* The component's own host element, styled from inside its shadow tree. */
:host { display: block; }

/* Only when the host matches a selector (e.g. a reflected state attribute). */
:host([disabled]) { opacity: 0.5; pointer-events: none; }

/* Based on an ancestor in the Light DOM; useful for theming. */
:host-context([theme="dark"]) { background: #111; color: #eee; }
```


**避免使用 `:host-context()`。**它会伸到边界之外检查祖先，但 Firefox 和 Safari 已拒绝实现，CSSWG 也倾向于不再继续发展它；应把它视为仅 Chromium 支持、没有发展前景的路径，而不是面向未来的选项。改用可继承的 CSS 自定义属性实现主题（见下文）：使用方在祖先上设置属性，组件跨边界读取，这种方式普遍可用，并保持双方解耦。

<a id="inherited-properties-and-custom-properties-cross-the-boundary"></a>

## 继承属性和自定义属性可跨越边界

可继承的 CSS 属性（`color`、`font-family`、`line-height` 和 CSS 自定义属性）**能够**穿过 shadow 边界。因此，自定义属性是主要主题 API，应提供合理的回退值。

```css
:host {
  /* Consumers override --card-bg from outside; the fallback keeps it usable. */
  background: var(--card-bg, white);
  color: var(--card-fg, black);
}
```


在 `:host` 上**定义**的自定义属性，只能被明确选中宿主元素的规则覆盖。如果希望它可以继承，并由树中任意祖先覆盖，就不要在 `:host` 上设置这个公开属性，而应依赖每个 `var()` 的回退值；不要在 `:host` 上给公开属性设初值。

为了让回退值只声明一次，而不是在每个 `var()` 中重复，可在 `:host` 上定义读取公开属性的私有“shadow”属性，并在内部引用这个私有属性：

```css
:host {
  --_card-bg: var(--card-bg, white);
  --_card-fg: var(--card-fg, black);
}
.card { background: var(--_card-bg); color: var(--_card-fg); }
```


使用方仍从外部覆盖 `--card-bg`；开头的下划线表明别名仅供内部使用，回退值也只存在于一个位置。

<a id="slotted-styling-projected-light-dom"></a>

## `::slotted()`：为投影的 Light DOM 设置样式

`::slotted(selector)` 选择分配给插槽的**顶层**节点。它不能选择这些节点的后代，而且会输给任意 Light DOM 规则（使用方拥有自己的内容），因此只用于轻微修饰，不用于全面控制。`::slotted(...) !important` 可以胜过使用方规则，但这会覆盖本应由使用方掌控的样式；只用于结构修复，不用于外观覆盖。

```css
/* Matches a slotted <p>, but NOT a <p> nested inside a slotted <div>. */
::slotted(p) { margin: 0; }
```


<a id="part-and-exportparts-expose-internals-for-theming"></a>

## `::part()` 与 `exportparts`：暴露内部元素供主题使用

用 `part="name"` 标记内部元素，使用方就可以在不知道内部结构的情况下，用任意属性为它设置样式。

```html
<!-- inside the shadow template -->
<button part="submit">Submit</button>
```


```css
/* consumer stylesheet */
my-card::part(submit) { background: navy; color: white; }
```


只暴露少量**高层** part（button、input、label），不要暴露每个 `<div>`；过大的 part 接口会变成脆弱 API。要通过自己的组件向上再次暴露嵌套组件的 part，使用 `exportparts` 转发：

```html
<inner-widget exportparts="submit: card-submit"></inner-widget>
```


有意识地选择两种渠道：**自定义属性**适合一组受约束、符合设计系统的值；**part** 适合对某个具体元素进行不受限的样式设置。

<a id="forwarding-styles-to-a-wrapped-native-element"></a>

## 向包装的原生元素转发样式

当自定义元素包装原生控件时（如 `<my-button>` 内有真正的 `<button>`），以下三点经常使人困惑：

- **表单控件不继承排版。**`color` 和自定义属性可跨越边界，但 `<button>`、`<input>`、`<select>` 的 `font` 等属性来自不继承的 UA 样式表。因此，只有在 shadow 树内部为包装的控件设置 `font: inherit`（通常还包括 `color: inherit`），它才会使用页面字体，否则仍渲染为平台字体。这是最常见的遗漏。
- **`:host` 样式不会传到内部元素。**在 `:host` 上设置 `background` / `border` / `padding`，改变的是宿主盒子，而非内部控件。需要明确转发：将控件暴露为 `::part` 以支持开放式样式设置，或通过自定义属性传递固定的一组值；`:host` 规则不会层叠到包装的元素中。
- **`display: contents` + `all: inherit` 是真实取舍，而非捷径。**用 `display: contents` 折叠宿主，再用 `all: inherit` 重置内部控件，目前是唯一无需使用方学习各组件专有 part 或自定义属性，就能把任意样式传给包装原生元素的通用办法；移除宿主自身的盒子通常正是该模式的目的（通过组合弥补内置继承机制的缺失）。有两个实际注意点：`all: inherit` 会清除 UA 默认值，因此希望保留默认值时，应限定到具体属性，或使用 `revert`；另一个具体阻碍是，对 `display: contents` 元素调用 `getBoundingClientRect()` 和 `getClientRects()` 会返回零，因此以宿主为锚点的定位会失效。如果这些取舍不合适，就使用 `::part` 或自定义属性。

<a id="state-style-the-components-own-states"></a>

## `:state()`：为组件自身状态设置样式

自定义元素可以通过 `ElementInternals` 的 `this.#internals.states.add('busy')` 和 `.delete('busy')` 暴露内部布尔状态（生命周期用法参见 `custom-elements`，通过 `npx -y modern-web-guidance@latest retrieve "custom-elements"` 获取）。这些状态形成跨边界样式渠道，与 `::part` 和自定义属性类似，但表达的是状态，而非结构或值。在 shadow 树内使用 `:host(:state(name))` 匹配，在使用方样式表中使用 `tag-name:state(name)`：

```css
/* Inside the component's shadow tree. */
:host(:state(busy)) button { opacity: 0.6; pointer-events: none; }

/* From the consumer's stylesheet — a read-only public hook. */
favorite-button:state(favorited) { filter: drop-shadow(0 0 4px crimson); }
```


与反射 attribute 不同，自定义状态**对外只读**：使用方可以为其设置样式，却不能设置或伪造它，因此组件仍是唯一写入者。当状态归组件所有、且只需要用于样式时，优先使用它而不是 `data-*` attribute。

<a id="layer-and-container-queries-inside-components"></a>

## 组件内的 `@layer` 与容器查询

- **层叠层**（`@layer`）在 shadow root 中可用，且作用域限定于该 root；shadow 树中的层名与页面中同名层彼此独立。用它排列组件自身样式的顺序（例如 `@layer base, theme;`），使使用方通过自定义属性和 `::part` 的覆盖仍能按预期生效。
- **容器查询**是响应式组件的合适工具：组件应该响应分配给它的空间，而不是视口。将宿主或包装器声明为容器（给 `:host` 设置布局盒子，例如 `display: block`，因为自定义元素默认是 `display: inline`，尺寸包含不适用于 `inline` 或 `contents` 元素），然后查询它，使同一组件能适应侧栏或全宽区域。

```css
:host {
  display: block; /* Required: size containment does not apply to default display: inline */
  container-type: inline-size;
}

@container (min-width: 30rem) {
  .card { grid-template-columns: 1fr 2fr; }
}
```


<a id="fallback-strategies"></a>

## 回退策略

Shadow parts 的 Baseline 状态：广泛可用。它自 2020-07-28 起进入 Baseline。
支持的浏览器：Chrome 73（2019 年 3 月）、Edge 79（2020 年 1 月）、Firefox 72（2020 年 1 月）、Safari 13.1（2020 年 3 月）和 Safari iOS 13.4（2020 年 3 月）。

层叠层的 Baseline 状态：广泛可用。它自 2022-03-14 起进入 Baseline。
支持的浏览器：Chrome 99（2022 年 3 月）、Edge 99（2022 年 3 月）、Firefox 97（2022 年 2 月）和 Safari 15.4（2022 年 3 月）。

容器查询（尺寸）的 Baseline 状态：广泛可用。它自 2023-02-14 起进入 Baseline。
支持的浏览器：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 110（2023 年 2 月）和 Safari 16（2022 年 9 月）。

`:host-context()` 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 54（2016 年 10 月）和 Edge 79（2020 年 1 月）。
不支持：Firefox 和 Safari。

`::part`、层叠层和容器查询已广泛可用；主题应主要通过可继承的自定义属性实现，即使这些功能不可用，自定义属性仍能工作。如上所述，**不要**依赖 `:host-context()`，它实际上仅支持 Chromium，不是面向未来的选择。
