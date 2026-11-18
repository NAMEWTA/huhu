<a id="required-field-feedback"></a>
# 必填字段反馈

<a id="the-problem"></a>
## 问题
页面刚加载就把必填字段标为错误状态，会使用户困惑。理想情况下，只有用户尝试填写却未成功时，必填字段才应显示为“无效”。

<a id="the-solution"></a>
## 解决方案
`:user-invalid` 伪类能够很好地解决这个问题。对于必填字段，它不会在页面加载时匹配，只会在以下情况匹配：
1. 用户与字段发生交互，例如输入一个字符后又删除，然后离开字段（失焦），最终留下空值。
2. 用户在字段为空时尝试提交表单。

<a id="implementation-strategy"></a>
### 实施策略

1. **HTML 约束：** 为输入控件添加 `required` 属性。
2. **视觉反馈：** 使用 `:user-invalid` 将边框设为红色，并显示“必填”辅助文本。
3. **时机：** 依靠浏览器原生时机提供视觉反馈。无需再通过 `onBlur` 处理器添加 `touched` 类，不过同步 ARIA 属性仍需要一些 JavaScript，见下文。
4. **错误文本：** 显示错误样式时，同时显示可见的错误文字，避免只用颜色传达错误。每条消息应以具有“错误”等替代文本的错误图标开头，这是最稳妥的选择；或者把每条消息都写成明确的错误描述，例如“姓名为必填项。”表单内的所有错误应采用同一种方式。
5. **错误关联：** 仅在字段无效时，将错误消息加入字段的 `aria-describedby`，使屏幕阅读器随字段一起读出错误。如果在初始标记中就设置引用，页面加载后就可能读出隐藏消息。第 3 节的脚本会为每个将 `data-error` 设置为错误消息 `id` 的字段处理这一关联。

<a id="implementation-guide"></a>
## 实现指南

<a id="1-html-structure"></a>
### 1. HTML 结构
```html
<form id="feedback-form">
  <div class="field">
    <label for="full-name">Full Name</label>
    <!-- Set data-error to the error message's id. The aria-invalid script lists that id in aria-describedby while the field is invalid. -->
    <input
      type="text"
      id="full-name"
      name="full-name"
      required
      data-error="name-error"
    >
    <!-- MANDATORY: Include an icon or distinct non-color indicator alongside error text -->
    <div id="name-error" class="error-msg">
      <span role="img" aria-label="Error">❌</span> This field is required.
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
  Only highlight empty required fields AFTER the user interacts with them or attempts submission.
  MANDATORY: Provide multiple indicators (border shift + helper text/icon) to avoid color-only state communication.
*/
input:user-invalid {
  border-color: #d93025;
  background-color: #fce8e6;
}

input:user-invalid + .error-msg {
  display: block;
}

/* Optional: Subtle indicator for required fields that are valid */
input:required:user-valid {
  border-color: #188038;
  border-width: 2px;
}
```

<a id="3-javascript-state-synchronization"></a>
### 3. 使用 JavaScript 同步状态

强制要求：由于 `:user-invalid` 是视觉状态，**必须**提供 JavaScript 桥接，在用户离开无效字段或尝试提交时，为辅助技术动态同步 `aria-invalid="true"`。该值应根据 `:user-invalid` 推导，而不是根据 `checkValidity()` 推导，因为用户只是通过 Tab 经过一个未修改的字段时，后者就可能已经返回 false。

原生 `:user-invalid` 不会自动同步 ARIA 属性。添加以下 JavaScript，让 `aria-invalid` 与视觉状态保持一致：

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

1. **星号：** 最佳实践仍是在标签中以可见方式标明必填字段，例如使用星号 `*`，让用户在交互*之前*就知道要求。在表单之前统一解释一次星号含义，例如“标有 * 的字段为必填项。”并将星号包裹在 `<span aria-hidden="true">*</span>` 中，因为 `required` 属性已经会让屏幕阅读器宣布“必填”。
2. **提交按钮：** 不要使用 `disabled` 禁用提交按钮，应保持按钮可用。用户点击时，浏览器会自动让所有空的必填字段匹配 `:user-invalid`，并聚焦第一个字段。这有利于无障碍和用户体验。
