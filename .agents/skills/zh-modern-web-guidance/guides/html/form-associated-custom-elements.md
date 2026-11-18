<a id="form-associated-custom-elements"></a>

# 与表单关联的自定义元素

不要为了向表单提供自定义控件的值，就回退到隐藏 `<input>`。使用**与表单关联的自定义元素**（FACE）：通过 `formAssociated` 和 `ElementInternals`，元素可以提交自身值、参与验证，并原生反映表单状态。

```javascript
class RatingInput extends HTMLElement {
  // MANDATORY: opt in. Without this, attachInternals() form APIs are unavailable.
  static formAssociated = true;

  #internals;
  #value = '';

  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.attachShadow({ mode: 'open', delegatesFocus: true });
  }

  connectedCallback() {
    // Validate initial state once attributes (such as `required`) are present.
    this.#validate();
  }

  get value() { return this.#value; }
  set value(v) {
    this.#value = v;
    // Push the value into the owning <form> for submission.
    this.#internals.setFormValue(v);
    this.#validate();
  }

  #validate() {
    if (this.hasAttribute('required') && !this.#value) {
      // Mark invalid and supply the native validation message + anchor.
      this.#internals.setValidity(
        { valueMissing: true },
        'Please choose a rating.',
        this.shadowRoot.querySelector('[tabindex]'),
      );
    } else {
      this.#internals.setValidity({}); // clear
    }
  }

  // Optional FACE lifecycle hooks:
  formResetCallback() { this.value = ''; }
  formDisabledCallback(disabled) {
    // Disable internal controls so they leave the tab order and ignore clicks.
    // Do NOT toggle `disabled` on `this`, or a `<fieldset disabled>` toggle will
    // leave the host permanently stuck with its own `disabled` attribute.
    for (const el of this.shadowRoot.querySelectorAll('button')) {
      el.disabled = disabled;
    }
  }
  formStateRestoreCallback(state) { this.value = state; }
}
customElements.define('rating-input', RatingInput);
```


要点：

- `static formAssociated = true` 是**必须的**；它启用与表单有关的 `ElementInternals` 方法和 `formXxxCallback` 生命周期。
- `setFormValue(value)` 负责提交值，无须隐藏 input。多值控件传入 `FormData`。
- `setValidity(flags, message, anchor)` 与原生约束验证集成：无效时表单不会提交，`:invalid` / `:valid` 生效，报告时 anchor 元素获得焦点。调用 `setValidity({})` 清除验证状态。反映用户交互的 `:user-valid` / `:user-invalid` 伪类，对表单关联元素的跨浏览器支持并不一致；依赖之前先验证支持情况，不要假定它们像原生控件一样跟踪用户交互。
- 实现 `formResetCallback`、`formDisabledCallback` 和 `formStateRestoreCallback`，让元素在重置、`fieldset[disabled]` 以及前进／后退自动填充恢复时表现得像原生控件。在 `formDisabledCallback(disabled)` 中，禁用内部控件（或将其移出 Tab 顺序并忽略输入），不要给宿主设置 `disabled`：在回调中设置宿主属性，会导致祖先 `<fieldset>` 重新启用时元素无法重新启用，而且宿主本身已经会自动匹配 `:disabled`。
- 派发事件时遵循平台约定，优先内置 `input` 和 `change` 事件，而不是自定义事件。值因用户直接操作变化时（打字、拖动滑块）触发 `input`；用户提交时（释放滑块、字段失焦），每一串变化触发一次 `change`。分别用 `InputEvent` 和 `Event` 构造。

<a id="accessibility-considerations"></a>

## 无障碍注意事项

创建自定义元素时，如果元素直接处理交互，或作为独立控件的组，确保它具有角色；直接处理交互时，还要传达状态信息。可以通过 ElementInternals 的相应属性实现。

```js
this.#internals.role = 'group';
```


除非自定义元素包含自己的可见标签（单个类似复选框的自定义元素可能属于这种情况），否则不要直接通过 ElementInternals 应用无障碍名称。这样做可能覆盖使用自定义元素时设置的无障碍名称，例如通过 HTML label 的 `for` 属性为元素添加的标签。

<a id="fallback-strategies"></a>

## 回退策略

与表单关联的自定义元素的 Baseline 状态：广泛可用。它自 2023-03-27 起进入 Baseline。
支持的浏览器：Chrome 77（2019 年 9 月）、Edge 79（2020 年 1 月）、Firefox 98（2022 年 3 月）和 Safari 16.4（2023 年 3 月）。

依赖该功能前，检测 `static formAssociated` 支持：`'attachInternals' in HTMLElement.prototype && 'setFormValue' in ElementInternals.prototype`。不支持时，回退到与控件值同步、视觉隐藏的原生 `<input>`，使表单仍能提交；这是隐藏 input 模式合理的唯一情况。
