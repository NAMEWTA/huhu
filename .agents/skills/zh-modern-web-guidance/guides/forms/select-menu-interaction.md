<a id="select-menu-interaction"></a>
# 选择菜单的交互

<a id="the-problem"></a>
## 问题
对于必选的下拉菜单，例如“选择国家”，如果默认选项的值为空，标准校验会立即把字段标为无效，造成视觉干扰。我们希望只在用户与菜单交互后未选择选项就离开，或未选择选项就尝试提交表单时显示错误。

<a id="the-solution"></a>
## 解决方案
`:user-invalid` 伪类可以自然地配合 `<select>` 元素使用。它遵循用户的交互流程：仅加载页面，或在未修改值的情况下聚焦、失焦，都不算交互，因此字段会保持中性状态，直到用户主动尝试选择。

<a id="implementation-strategy"></a>
### 实施策略

1. **HTML 约束：** 使用带有 `required` 的 `<select>`。第一个选项应为 `value=""`，最好禁用或隐藏，以要求用户作出有效选择。
2. **视觉反馈：** 使用 `:user-invalid` 设置选择框边框样式。
3. **时机：** 如果用户在控件失焦前更改了值，即使又改回默认的无效状态，浏览器也会认为该字段“已交互”；提交表单时也同样如此。某些浏览器还会把打开后未选任何选项就关闭菜单视为交互。
4. **错误关联：** 仅在 select 无效时，将错误消息列入其 `aria-describedby`，使屏幕阅读器随控件一起读出错误。如果在初始标记中就设置引用，页面加载后就可能读出隐藏消息。“其他注意事项”中“无障碍”部分的脚本会为每个将 `data-error` 设为错误消息 `id` 的字段完成这一关联。

<a id="implementation-guide"></a>
## 实现指南

<a id="1-html-structure"></a>
### 1. HTML 结构
此处的关键是“占位”选项。

```html
<form>
  <div class="field">
    <label for="country">Country</label>
    <!-- Set data-error to the error message's id. The aria-invalid script lists that id in aria-describedby while the select is invalid. -->
    <select
      id="country"
      name="country"
      required
      data-error="country-error"
    >
      <option value="" disabled selected>Select a country...</option>
      <option value="us">United States</option>
      <option value="ca">Canada</option>
      <option value="uk">United Kingdom</option>
    </select>
    <div id="country-error" class="error-msg">
      <span role="img" aria-label="Error">❌</span> Please select a country.
    </div>
  </div>
</form>
```

<a id="2-css"></a>
### 2. CSS
```css
.error-msg {
  display: none;
  color: #d93025;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/*
  Only show error after the user visits the select menu.
*/
select:user-invalid {
  border-color: #d93025;
  background-color: #fce8e6;
}

select:user-invalid + .error-msg {
  display: block;
}

select:user-valid {
  border-color: #188038;
}
```

<a id="fallbacking--browser-support"></a>
## 回退与浏览器支持

<a id="fallbacks--browser-support-for-user-valid-and-user-invalid"></a>
### :user-valid 和 :user-invalid 的回退方案与浏览器支持

:user-valid 和 :user-invalid 的 Baseline 状态：已广泛可用。自 2023-11-02 起达到 Baseline。
支持：Chrome 119（2023 年 10 月）、Edge 119（2023 年 11 月）、Firefox 88（2021 年 4 月）和 Safari 16.5（2023 年 5 月）。

<a id="css-for-fallback"></a>
### 回退所需的 CSS

```css
/* Applies to every field that can be invalid (input, select, textarea). :is() keeps the
   rule working where :user-invalid isn't supported: in a plain selector list, one
   unsupported selector drops the whole rule. */
:is(:user-invalid, .user-invalid-fallback) {
  border-color: #d93025;
  background-color: #fce8e6;
}

:is(:user-invalid, .user-invalid-fallback) + .error-msg {
  display: block;
}
```

<a id="javascript-fallback"></a>
### JavaScript 回退

使用一个可复用工具，通过 `WeakMap` 跟踪交互状态。这样可避免用“dirty”类名或 data 属性污染 DOM。

```javascript
const UserInvalidFallback = (() => {
  const dirtyState = new WeakMap();

  const updateState = (input) => {
    // validity.valid gives the current state without firing an 'invalid' event, as checkValidity() does.
    const isValid = input.validity.valid;

    // Update both visual and ARIA state
    input.classList.toggle('user-invalid-fallback', !isValid);
    input.classList.toggle('user-valid-fallback', isValid);

    input.setAttribute('aria-invalid', isValid ? 'false' : 'true');
    linkError(input, !isValid);
  };

  // List the error message (the id in data-error) in aria-describedby only while it's
  // shown: text that aria-describedby references is announced even when it's hidden.
  const linkError = (input, shown) => {
    const errorId = input.dataset.error;
    if (!errorId) return;
    const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
  };

  const handleEvent = (event) => {
    const input = event.target;

    if (event.type === 'reset') {
      const controls = input.elements || [];
      for (const control of controls) {
        dirtyState.delete(control);
        control.classList.remove('user-invalid-fallback');
        control.classList.remove('user-valid-fallback');
        if (control.matches('input, select, textarea')) control.setAttribute('aria-invalid', 'false');
        if (control.dataset?.error) linkError(control, false);
      }
      return;
    }

    if (!input.checkValidity) return;

    // A submit attempt counts as interaction: the browser fires 'invalid' on each failing
    // field, including required fields the user never touched, so flag them all.
    if (event.type === 'invalid') {
      dirtyState.set(input, { hasInteracted: true, hasBlurred: true });
      updateState(input);
      return;
    }

    if (event.type === 'input' || event.type === 'change') {
      const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(input, state);
      if (state.hasBlurred) {
        updateState(input);
      }
    } else if (event.type === 'blur') {
      const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(input, state);
      if (state.hasInteracted) {
        updateState(input);
      }
    }
  };

  const init = (root = document) => {
    if (CSS.supports('selector(:user-invalid)')) return;

    // Firefox and Safari expose an empty required field as invalid from page load.
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.hasAttribute('aria-invalid')) el.setAttribute('aria-invalid', 'false');
    });

    root.addEventListener('blur', handleEvent, true); // Capture phase
    root.addEventListener('input', handleEvent);
    root.addEventListener('change', handleEvent);
    root.addEventListener('invalid', handleEvent, true); // invalid doesn't bubble
    root.addEventListener('reset', handleEvent, true); // Capture resets
  };

  return { init };
})();

// Initialize for a specific form
const form = document.querySelector('#demo-form');
UserInvalidFallback.init(form);
```

<a id="other-considerations"></a>
## 其他注意事项

1. **移动设备行为：** 在移动设备上，“失焦”的发生方式可能随操作系统选择器而不同。建议在真实设备上测试。
2. **无障碍：** 原生 `:user-invalid` 不会自动同步 ARIA 属性。添加以下 JavaScript，让 `aria-invalid` 与视觉状态保持一致：

* 在 `:user-invalid` 匹配之前，将 `aria-invalid="false"`，不要省略该属性。Firefox 和 Safari 会从页面加载起就把空的 `required` 字段暴露为无效；而在 Chromium 中，如果没有设置 `aria-invalid="true"`，交互后的空 `required` 字段又不会被暴露为无效。
* 将字段的 `data-error` 属性设为错误消息的 `id`，建立字段与错误消息的联系，例如 `<div id="email-error">` 对应 `data-error="email-error"`；让脚本仅在字段无效时，将该 `id` 列入 `aria-describedby`。不要在初始标记的 `aria-describedby` 中引用错误：错误元素一直存在于页面中，而被 `aria-describedby` 引用的文本即使隐藏，也会被朗读。
* 通过页面共用的一个 polite live region，朗读用户离开或修改字段时出现的错误；稍作延迟，避免与下一个字段的朗读重叠。不要让每条错误消息本身都成为 live region：仅被显示而未改变内容的 live region，不能可靠地触发朗读。提交失败后，应将焦点移到第一个无效字段，使其错误得到朗读。

```javascript
// List the field's error message (the id in data-error) in aria-describedby only while
// it's shown: text that aria-describedby references is announced even when it's hidden.
const linkError = (el, shown) => {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
};

// One polite live region for the page announces an error that appears when the user
// leaves or changes a field. Run this once the form is in the page.
const announcer = document.createElement('div');
announcer.setAttribute('aria-live', 'polite');
announcer.classList.add('visually-hidden');
document.body.append(announcer);
let announceTimer;
let announcedField;

// Text as a screen reader reads it: icons' text alternatives in, aria-hidden text out.
const spokenText = (node) => {
  const copy = node.cloneNode(true);
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => n.replaceWith(`${n.getAttribute('aria-label')}: `));
  return copy.textContent.replace(/\s+/g, ' ').trim();
};
const announceError = (el) => {
  const error = document.getElementById(el.dataset.error);
  if (!error) return;
  const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
  clearTimeout(announceTimer);
  announcer.textContent = '';
  announcedField = el;
  // Wait until the screen reader has announced the field that receives focus next.
  announceTimer = setTimeout(() => { announcer.textContent = label + spokenText(error); }, 500);
};

// Sync aria-invalid with the CSS :user-invalid state. Only form fields are synced, and
// an aria-invalid="true" that this script didn't set (for example from a server check)
// is left alone.
const flagged = new WeakSet();
// Fields whose current error has been announced, or read out by focus after a failed
// submit. A field can become invalid while the user types, so this is tracked separately.
const announced = new WeakSet();
const syncAria = (el, announce = false) => {
  if (!el.matches?.('input, select, textarea')) return;
  const invalid = el.matches(':user-invalid');
  if (invalid) {
    if (announce && !announced.has(el)) {
      announceError(el);
      announced.add(el);
    }
    el.setAttribute('aria-invalid', 'true');
    linkError(el, true);
    flagged.add(el);
  } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
    el.setAttribute('aria-invalid', 'false');
    linkError(el, false);
    flagged.delete(el);
    announced.delete(el);
    // Clear a fixed field's announcement so it isn't found later when reading the page.
    if (announcedField === el) {
      clearTimeout(announceTimer);
      announcer.textContent = '';
    }
  }
};

// Start every field at aria-invalid="false".
document.querySelectorAll('input, select, textarea').forEach((el) => syncAria(el));

// Update on blur (to show and announce an error) and input (to clear it)
document.addEventListener('blur', (e) => syncAria(e.target, true), true);
document.addEventListener('input', (e) => {
  if (e.target.hasAttribute('aria-invalid')) syncAria(e.target);
});

// Checkboxes, radio buttons and other controls that commit on 'change' can become
// :user-invalid without losing focus, so update on change too.
document.addEventListener('change', (e) => syncAria(e.target, true), true);

// A failed submit fires 'invalid' on each failing field, including required fields the
// user never touched, so update those too. 'invalid' doesn't bubble. Focus moving to the
// first invalid field announces its error, so these aren't announced.
document.addEventListener('invalid', (e) => {
  announced.add(e.target);
  syncAria(e.target);
}, true);

// Reset clears :user-invalid after the 'reset' event, so update each field afterwards.
document.addEventListener('reset', (e) => {
  setTimeout(() => [...e.target.elements].forEach((el) => syncAria(el)));
}, true);
```

使用 `.visually-hidden` 工具类在视觉上隐藏 live region：

```css
/* Hides content visually but keeps it in the accessibility tree */
.visually-hidden:where(:not(:focus-within, :active)) {
  position: absolute !important;
  clip-path: inset(50%) !important;
  overflow: hidden !important;
  width: 1px !important;
  height: 1px !important;
  margin: -1px !important;
  padding: 0 !important;
  border: 0 !important;
  white-space: nowrap !important;
}
```
