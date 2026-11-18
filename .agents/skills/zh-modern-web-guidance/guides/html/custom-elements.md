<a id="custom-elements"></a>

# 自定义元素

自定义元素是通过 `customElements.define()` 注册到标签名上的类。注册和基本生命周期已广为理解；以下规则着重说明经常实现错误的部分。

自定义元素自身没有角色或键盘行为。如果内容本身已承担语义，例如包裹标题和文本的布局容器，这没有问题。如果需要语义或键盘支持，应在模板内使用 `<button>` 等原生元素构建，或者通过 `ElementInternals` 赋予角色和 ARIA 状态，并处理焦点，具体参见 `accessible-web-components`（通过 `npx -y modern-web-guidance@latest retrieve "accessible-web-components"` 获取）。如果内容纯属装饰，使用 `aria-hidden="true"` 对辅助技术隐藏。

<a id="lifecycle-the-parts-that-get-implemented-wrong"></a>

## 生命周期：容易实现错误的部分

各回调本身已有完善文档；以下误解会造成缺陷：

- **`connectedCallback` 可能运行多次。**每次插入都会触发，因此移动元素会让它重新运行。让设置过程保持幂等，不要假定只会第一次运行。
- **`connectedMoveCallback` 会跳过移动时的断开／重新连接回调对。**通过 `Node.moveBefore()` 移动元素时，会触发这个回调，代替 `disconnectedCallback` → `connectedCallback`，因此状态、焦点和 iframe／媒体播放在移动后仍能保留。如果设置或清理成本很高，或者重复执行会产生可观察影响，应定义它。
- **在 `disconnectedCallback` 中清理。**移除全局监听器、定时器和 observer，否则会泄漏；但元素可能重新插入，因此不要把清理视为永久结束。
- **在构造函数中先调用 `super()`，也不要依赖完整 DOM 已存在。**访问 `this` 后才调用 `super()` 会抛出 `ReferenceError`。属性通常存在，但并非总是如此；长子元素列表也可能尚未解析完。用 `connectedCallback` 做一次性初始化，用 `slotchange` 监测直接子节点，用 `attributeChangedCallback` 监测属性。`connectedCallback` 仍可能在全部子节点解析之前触发，因此不能忽略后续的 `slotchange` / `attributeChangedCallback` 调用。
- **`attributeChangedCallback` 只对 `observedAttributes` 中的属性触发**；对于不影响输出的属性，处理应保持轻量。
- **生命周期钩子和 `observedAttributes` 会在注册时被快照保存。**`customElements.define()` 只读取两者一次；在调用后再给类添加钩子或扩展 `observedAttributes`，会被静默忽略。尤其是，如果 `define()` 时不存在 `observedAttributes`，`attributeChangedCallback` 就永远不会触发。

<a id="upgrade-timing-and-defined"></a>

## 升级时机与 `:defined`

元素可以在类注册之前就存在于 DOM 中（例如服务器渲染的 HTML，或脚本较晚加载）。定义之前，它只是惰性的 `HTMLElement`，没有你的任何行为；运行 `customElements.define()` 时，浏览器会**升级**文档中所有匹配元素，并在此时运行构造函数和 `connectedCallback`。

模型经常遗漏两个后果：

1. 升级时运行构造函数／`connectedCallback`，**属性和子节点可能已经存在**。在 `connectedCallback` 读取现有属性来同步初始状态，绝不假定元素起初为空。
2. 即使到了 `connectedCallback`，**子节点仍可能缺失**；HTML 解析器可能在长子节点列表解析途中让出执行，因此回调有时在全部子节点附加之前运行。处理模式（`slotchange` + `attributeChangedCallback`）参见上方“生命周期”中的构造函数条目。

隐藏尚未定义的元素可以避免未设置样式的内容闪现，但要**以开放方式失败**，使脚本始终未加载时内容仍可访问。使用 `visibility: hidden` 隐藏；在内容不可见期间，它还会将内容移出 Tab 顺序和无障碍树（只用 `opacity: 0` 会留下不可见但仍可聚焦的后代元素；对应 WCAG 2.4.7 焦点可见）。再通过延迟动画恢复 `visibility`，使元素即使永远没有升级，也能在超时后显示。`visibility` 是切换而不是渐变，如果还希望淡入，可添加 `opacity: 0`，让它与 `visibility` 同时执行动画；opacity 是可选的：

```css
my-element:not(:defined) {
  visibility: hidden;
  opacity: 0; /* Optional: fades the element in as it becomes visible. */
  /* Reveal anyway after 2s, so a failed or slow script never hides content for good. */
  animation: defined-fallback 0.2s 2s forwards;
}
@keyframes defined-fallback { to { visibility: visible; opacity: 1; } }
```


将这些保护规则限定到需要的元素，或通过 `:has(:not(:defined))` 限定到某个子树，不要作用于整个 `body`。一个加载缓慢但不关键的组件（比如分享按钮），不应拖延整个页面绘制。

<a id="attribute--property-reflection"></a>

## Attribute ⇄ property 反射

让 HTML attribute 与 JS property 保持同步，使元素既可通过标记使用，也可通过脚本使用。Attribute 值**始终是字符串**，需要做类型转换。

```javascript
class MyToggle extends HTMLElement {
  static observedAttributes = ['label', 'count', 'disabled'];

  // String attribute reflected via getter/setter.
  get label() { return this.getAttribute('label') ?? ''; }
  set label(v) {
    v ? this.setAttribute('label', v) : this.removeAttribute('label');
  }

  // Numeric attribute: coerce from string on read, serialize on write.
  get count() { return Number(this.getAttribute('count')) || 0; }
  set count(v) { this.setAttribute('count', String(v)); }

  // Boolean attribute: present = true, absent = false. Never set it to "false".
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(on) { this.toggleAttribute('disabled', !!on); }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal) this.render();
  }
}
```


<a id="where-the-value-lives"></a>

### 值存放在哪里

上面的示例以 **DOM 为唯一真实来源**，每个 getter 都读取 `getAttribute`。对于少量简单、近似字符串的属性，这是正确默认做法：状态只存在于一个位置，因此不会失去同步。

更复杂的组件应以 **JS 字段为唯一真实来源**，只有在其他对象必须观察时，才向外反射为 attribute，例如供 CSS 选择，或供使用方读取。读取字段比每次访问时解析并转换 attribute 便宜得多，非字符串值也无须序列化来回转换。因此 Lit 等库在 JS 中保存状态，并选择性反射，而不把 attribute 当作存储：只反射外部必须观察的内容，不要反射每个 property。

常见陷阱：

- **严控 `observedAttributes`**：只列出变化后必须重新渲染或触发副作用的属性。观察所有属性，会让每次修改都多一次回调，却没有收益。
- **反射循环**：写入 attribute 的 setter 会重新进入 `attributeChangedCallback`。像上面的示例一样，用 `oldVal !== newVal` 检查防护。
- **无障碍状态**：向辅助技术暴露的状态（通过 `ElementInternals` 提供的 ARIA 状态，或内部原生控件上的属性）必须从与可见状态相同的真实来源派生，并在所有修改路径上更新：升级时读取属性、`attributeChangedCallback`、property setter 和用户交互。否则，从标记或使用方脚本设置状态，只会改变显示，不会改变朗读内容（WCAG 4.1.2 名称、角色、值）。
- **重新渲染**：只更新变化的节点，不要通过 `innerHTML` 重建 shadow 树。替换拥有焦点的元素会把焦点移到 `<body>`，键盘和屏幕阅读器用户会丢失位置（WCAG 2.4.3 焦点顺序）。
- **仅供样式使用的状态**：对于只驱动样式的内部状态（加载中、激活、展开），优先使用**自定义状态**，不要反射人为添加的 attribute；参见下方[自定义状态](#custom-states)。只有当使用方必须能从标记中设置该状态时，才反射成 attribute。

<a id="custom-states"></a>

## 自定义状态

自定义状态是元素通过 `ElementInternals` 设置、用 `:state()` 伪类匹配、向 CSS 暴露的**关于自身**的布尔标志。对内部运行时 UI 状态，如 `busy`、`expanded`、`invalid`，使用它们代替人为反射的 attribute：它们不会与使用方属性冲突，不会出现在 DOM 中，而且对外只读（使用方可以为 `:state()` 设置样式，但不能伪造状态）。

```javascript
class AsyncButton extends HTMLElement {
  #internals;
  #action = async () => {};

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  set action(fn) { this.#action = fn; } // host supplies the work to run

  async run() {
    if (this.#internals.states.has('busy')) return; // guard re-entry
    this.#internals.states.add('busy');
    this.#internals.ariaBusy = 'true'; // assistive technologies don't see custom states
    this.#internals.states.delete('success');
    this.#internals.states.delete('error');
    try {
      await this.#action();
      this.#internals.states.add('success');
    } catch {
      this.#internals.states.add('error');
    } finally {
      this.#internals.states.delete('busy');
      this.#internals.ariaBusy = 'false';
    }
  }
}
```


`CustomStateSet` 是集合，因此独立状态可以组合（`busy` 加 `error`），无须发明一个组合式 `data-status` 枚举。

自定义状态只对 CSS 可见，辅助技术看不到。当状态向用户传达信息（忙碌、成功、错误、无效、展开）时，还要通过 `ElementInternals` 的 ARIA 状态（如上面的 `ariaBusy`），或组件内部原生控件上的状态向辅助技术暴露；用文本表达，而不能只靠颜色；并将操作结果（如保存成功或失败）作为状态消息播报（WCAG 4.1.2 名称、角色、值；1.4.1 颜色使用；4.1.3 状态消息）。

**自定义状态只存在于运行时。**它不序列化到 DOM，因此不会在重新加载、元素重建或服务器渲染后保留。如果状态必须在标记中声明式设置，或跨加载持久保存，应使用 **attribute**（参见[值存放在哪里](#where-the-value-lives)），并在 `connectedCallback` 中从真实来源恢复。经验规则是：组件在运行时派生和拥有、且只需要设置样式的状态用自定义状态；必须从标记设置或序列化的状态用 attribute。

关于如何在组件内部及使用方样式表中为这些状态设置样式，参见 `styling-web-components`（通过 `npx -y modern-web-guidance@latest retrieve "styling-web-components"` 获取）。

<a id="naming-conventions"></a>

## 命名约定

- 真正私有的状态：使用原生 `#` 字段（`#count`）实现严格封装；只有子类仍须访问时才用 `_` 前缀。注意，`#` 字段不被继承，子类无法看到基类的私有字段。
- 以 Symbol 为键的属性是折中方案：普通枚举看不到，但持有该 symbol 的任何代码都能访问（可以导出它，或作为类的 `static` 字段暴露）。每个 symbol 都唯一，因此两个具有相同描述的 symbol 不会冲突；当子类或同级对象需要 `#` 字段无法提供的受控访问时，这很有用。
- **不要**用自有 property 遮蔽全局 attribute（如 `style`、`class`、`id`、`slot`、`part`、`title`、`lang`、`dir`），例如声明 `role` 或 `ariaLabel` 类字段；这会破坏内置行为，使用方设置 property 后不再改变 attribute，也不改变辅助技术收到的内容。注意，`disabled` 只在表单控件中通用；其他元素必须自行实现效果，包括忽略激活和向辅助技术暴露状态（如 `this.#internals.ariaDisabled = 'true'`）。如果组件样式在 `:host` 上设置 `display`，还要添加 `:host([hidden]) { display: none; }`，否则 `hidden` 属性将不再隐藏元素，内容仍可见、可聚焦且留在无障碍树中。

命名新的 API 接口时，遵循平台自身约定：自定义元素标签名使用至少一个连字符的小写 kebab-case（如 `my-toggle`），property 和方法使用 `lowerCamelCase`，attribute 名称使用小写，并与对应 property 同步。
