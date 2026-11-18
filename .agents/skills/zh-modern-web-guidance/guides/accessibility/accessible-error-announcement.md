<a id="accessible-error-announcement"></a>
# 可访问的错误播报

<a id="the-problem"></a>
## 问题
标准 HTML5 验证可通过 `:invalid` 或 `:user-invalid` 提供视觉反馈，但不会自动与 `aria-invalid` 等无障碍属性同步。

如果使用标准 `:invalid` 样式，用户通过 Tab 键进入当前为空的必填字段时，屏幕阅读器可能立即播报“输入无效”。在用户尚未与字段交互之前就播报错误，会打断使用辅助技术的用户。

<a id="the-solution"></a>
## 解决方案
我们希望*程序化*状态（`aria-invalid="true"`）与*视觉*状态（`:user-invalid`）在**完全相同的时刻**生效。由于 `:user-invalid` 依赖浏览器内部的“用户已交互”标记，可以用 JavaScript 在标准交互事件期间检查元素是否匹配此选择器。

在匹配 `:user-invalid` 之前，设置 `aria-invalid="false"`，而不是不设置该属性。Firefox 和 Safari 从页面加载开始，就将空的 `required` 字段暴露为无效状态，因此不设置属性仍会在这些浏览器中导致过早播报“输入无效”。

<a id="implementation-strategy"></a>
### 实施策略

1. **视觉层**：使用 CSS `:user-invalid` 显示边框或图标。
2. **无障碍层**：使用 `aria-invalid`，并在字段无效期间通过 `aria-describedby` 引用错误消息，向辅助技术（AT）传达状态。用户离开字段时出现的错误，通过页面上一个礼貌级别的实时区域播报。
3. **连接视觉层与无障碍层**：创建轻量的 JavaScript 工具，监听 `blur`、`change`、`input` 和 `invalid` 事件，检查元素是否匹配 `:user-invalid`，并相应更新 ARIA 属性。
4. **提交时的焦点处理**：焦点到达字段时，屏幕阅读器会播报该字段的错误，因此提交失败后，应将焦点移至第一个无效字段；对于长表单，也可以移至错误摘要，其中包含一个标题及指向每个无效字段的链接。原生验证会替你将焦点移到第一个无效字段；如果表单使用 `novalidate`，则需要在提交处理器中移动焦点。

<a id="implementation-guide"></a>
## 实现指南

<a id="1-html-structure"></a>
### 1. HTML 结构
将输入框的 `data-error` 属性设为错误消息的 `id`，以建立关联。第 3 节的脚本只在字段无效时，才将该 `id` 列入 `aria-describedby`。不要在标记中通过 `aria-describedby` 引用错误消息：错误元素始终存在于页面，而 `aria-describedby` 引用的文本即使隐藏也会被播报，因此用户尚未交互时就会听到错误。

```html
<form>
  <div class="field">
    <label for="email">Email</label>
    <input 
      type="email" 
      id="email" 
      required 
      data-error="email-error"
    >
    <span id="email-error" class="error-msg">
      Please enter a valid email address.
    </span>
  </div>
</form>
```

<a id="2-css"></a>
### 2. CSS
使用原生伪类 `:user-invalid` 控制错误消息的可见性。

```css
.error-msg {
  display: none;
  color: #d93025;
}

/* Show error message when input is user-invalid */
input:user-invalid ~ .error-msg {
  display: block;
}

/* Optional: Visual cues on the input itself */
input:user-invalid {
  border-color: #d93025;
}
```

<a id="3-javascript"></a>
### 3. JavaScript
由于没有 “UserInvalidChanged” 事件，需要接入标准表单事件来检查状态。

原生 `:user-invalid` 不会自动与 ARIA 属性同步。添加以下 JavaScript，使 `aria-invalid` 与视觉状态保持同步：

* 在匹配 `:user-invalid` 之前，设置 `aria-invalid="false"`，而不是省略该属性。Firefox 和 Safari 从页面加载开始，就将空的 `required` 字段暴露为无效状态；Chromium 则在用户交互后，仍不会将空的 `required` 字段暴露为无效，除非设置了 `aria-invalid="true"`。
* 将每个字段的 `data-error` 属性设为错误消息的 `id`，把两者关联起来，例如 `<div id="email-error">` 对应 `data-error="email-error"`，并让脚本只在字段无效时将该 `id` 列入 `aria-describedby`。不要在标记中通过 `aria-describedby` 引用错误：错误元素始终存在于页面，而且 `aria-describedby` 引用的文本即使隐藏也会被播报。
* 用户离开或更改字段时出现的错误，通过页面上一个礼貌级别的实时区域稍后播报，避免盖过下一个字段的播报。不要将每条错误消息都设为实时区域：仅从隐藏变为显示、而内容没有变化的实时区域，并不能被可靠播报。提交失败后，应将焦点移至第一个无效字段，通过焦点变化播报其错误。

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

使用 `.visually-hidden` 工具类隐藏实时区域：

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
### :user-valid 和 :user-invalid 的回退与浏览器支持

:user-valid 和 :user-invalid 的 Baseline 状态：广泛可用。自 2023-11-02 起纳入 Baseline。
支持的浏览器：Chrome 119（2023 年 10 月）、Edge 119（2023 年 11 月）、Firefox 88（2021 年 4 月）和 Safari 16.5（2023 年 5 月）。

<a id="css-for-fallback"></a>
### 回退用的 CSS

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

使用可复用工具，通过 `WeakMap` 追踪交互状态，避免用 “dirty” 类或数据属性污染 DOM。

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
