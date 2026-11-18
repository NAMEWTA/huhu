<a id="accessible-web-components"></a>

# 具备无障碍能力的 Web Components

Shadow 边界会改变语义与 ARIA 的工作方式。主要有两类失败：shadow 树内部缺少语义，以及 ARIA 引用因不能跨越 shadow root 而静默失效。

从语义标记出发：在模板内使用真正的 `<button>`、`<nav>`、`<ul>`，直接获得大部分语义，再用 `ElementInternals` / ARIA 补足缺口。

<a id="default-semantics-via-the-elementinternals-aria-mixin"></a>

## 通过 ElementInternals ARIA mixin 提供默认语义

在 JS 中通过 `ElementInternals` 设置自定义元素的角色和 ARIA 状态，而不是给宿主写入 ARIA 属性。这样语义保持为组件拥有的默认值，同时仍允许使用方通过 Light DOM 中的属性覆盖。

```javascript
class ToggleSwitch extends HTMLElement {
  #internals;
  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#internals.role = 'switch';          // default role, no host attribute needed
    this.#internals.ariaChecked = 'false';    // exposed to the accessibility tree
    this.addEventListener('click', () => this.toggle());
    this.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); this.toggle(); }
    });
  }
  connectedCallback() {
    // Put the host in the tab order on connect (setting tabIndex in the constructor throws on createElement).
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
  }
  toggle() {
    const on = this.#internals.ariaChecked !== 'true';
    this.#internals.ariaChecked = String(on);
  }
}
customElements.define('toggle-switch', ToggleSwitch);
```


这样既避免 ARIA 属性污染 DOM，也防止使用方意外覆盖它们，同时无障碍树仍能看到正确的角色和状态。

<a id="focus-management-and-delegatesfocus"></a>

## 焦点管理与 `delegatesFocus`

- 当**宿主元素自身就是交互控件**，且通过 `ElementInternals` 承载角色和状态时（如上面的 `ToggleSwitch`），在 `connectedCallback` 内将宿主加入 Tab 顺序（`if (!this.hasAttribute('tabindex')) this.tabIndex = 0`；绝不要在构造函数中设置，否则使用 `document.createElement` 时会抛出异常），使焦点落在宿主上，由辅助技术朗读其角色和状态。对静态、非交互组件（如提示框或卡片），不要给宿主设置 `tabindex`。
- 当组件**包装了一个具有语义、可聚焦的内部控件**时（或它是带 `static formAssociated = true` 的表单关联自定义元素），附加 shadow root 时设置 `delegatesFocus: true`。此时聚焦宿主（以及对表单关联元素点击关联 `<label>`）会把焦点转到第一个可聚焦子元素，`:focus` 也匹配宿主。不要同时使用 `delegatesFocus: true` 和宿主上的角色／状态，否则焦点会落在内部元素，跳过宿主状态。
- 对游走焦点，或把焦点移入新显示的区域，给目标设置 `tabindex="-1"` 并调用 `.focus()`；显式标记可通过程序聚焦的目标，而不是依赖 Tab 顺序。

<a id="aria-relationships-across-shadow-roots"></a>

## 跨 shadow root 的 ARIA 关系

- **必须**注意，`aria-labelledby`、`aria-describedby`、`aria-controls` 等引用的 `id` 只在引用元素**自身**的树中解析。Light DOM 中基于 `id` 的属性不能指向 shadow 树内的 `id`，反向也不行；这些引用会被静默忽略。
- 要跨越边界，使用反射的 ARIA **element** property（如 `ariaLabelledByElements`、`ariaDescribedByElements` 等），它们接收直接的 JS 元素引用，而不是 id。它们向**外**解析：shadow 树内的元素可以指向 Light DOM 或任何祖先树中的目标（包括插槽内容），因此可以用 Light DOM 内容为 shadow 内部控件添加标签，而 `id` 引用无法表达这种关系。
- 它们**不会向内解析**：元素不能引用后代 shadow 树内部的元素（例如宿主不能由自身的 shadow 内容提供标签）。对于这一方向，新兴的 **Reference Target** 机制是标准发展方向，但尚未广泛可用。
- 如果两种方式都不能表达关系，就将关系保持在同一棵树内（在同一树中渲染标签），或用 `aria-label` 文本替代 `id` 引用。

<a id="fallback-strategies"></a>

## 回退策略

ARIA 属性反射的 Baseline 状态：广泛可用。它自 2023-10-24 起进入 Baseline。
支持的浏览器：Chrome 103（2022 年 6 月）、Edge 103（2022 年 6 月）、Firefox 119（2023 年 10 月）和 Safari 16.4（2023 年 3 月）。

如果 `ElementInternals` ARIA mixin 不可用，改为在宿主上设置 role 和 ARIA 状态属性（`this.setAttribute('role', 'switch')`）。这种方式普遍可用，代价是 DOM 中会出现可被使用方覆盖的属性。

api.Element.ariaLabelledByElements 能力的 Baseline 状态：新近可用。它自 2025-04-04 起进入 Baseline。
支持的浏览器：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 136（2025 年 3 月）和 Safari 16.4（2023 年 3 月）。

如果反射的 ARIA **element** property 不可用，同一树内的关系使用基于 `id` 的 `aria-*` attribute；跨边界标签没有基于 `id` 的等效做法，因此回退到 `aria-label` 文本。
