<a id="style-a-form-group-when-a-field-is-invalid-with-has"></a>

# 字段无效时使用 :has() 为表单组设置样式

<a id="the-problem"></a>

## 问题
错误状态经常需要为输入框**之外**的元素设置样式，例如改变父级 `fieldset` 边框颜色、突出 `<label>`，或在卡片页头显示全局错误图标。过去必须通过 JavaScript 切换父元素类。

<a id="the-solution"></a>

## 解决方案
结合 `:has()` 与 `:user-invalid`，可以根据具体后代的有效性状态，以声明方式为任意祖先设置样式，将全部呈现逻辑留在 CSS 中。

<a id="implementation-strategy"></a>

### 实现策略

1. **选择器**：使用 `.parent:has(:user-invalid)` 选择容器。
2. **范围**：尽量具体以避免性能问题，选择 `.field-group`，不要选择 `body`。
3. **回退**：不支持 `:has()` 时，需要 JS 切换父元素类。

<a id="implementation-guide"></a>

## 实现指南

<a id="1-html-structure"></a>

### 1. HTML 结构
```html
<form>
  <div class="card-section">
    <div class="header">
      <h3>Profile Settings</h3>
      <span class="status-icon"></span>
    </div>

    <div class="field">
      <label for="username">Username</label>
      <input type="text" id="username" required>
    </div>
  </div>
</form>
```

<a id="2-css"></a>

### 2. CSS
```css
/* Default State */
.card-section {
  border: 1px solid #ccc;
  border-left: 4px solid #ccc;
}

/*
  Parent Styling Logic:
  If the card contains ANY user-invalid input, turn the whole card's edge red.
*/
.card-section:has(:user-invalid) {
  border-left-color: #d93025;
  background-color: #fff8f8;
}

/* Change the icon too */
.card-section:has(:user-invalid) .status-icon::after {
  content: "⚠️" / "Error";
}
```

父级样式只提供强调，不能说明哪个字段出错或为什么出错，所以每个字段仍需要独立可见的错误文本。见 `required-field-feedback`（运行 `npx -y modern-web-guidance@latest retrieve "required-field-feedback"`）。

<a id="fallbacking--browser-support"></a>

## 回退与浏览器支持

:user-valid 和 :user-invalid 的 Baseline 状态：广泛可用。自 2023-11-02 起达到 Baseline。
支持：Chrome 119（2023 年 10 月）、Edge 119（2023 年 11 月）、Firefox 88（2021 年 4 月）和 Safari 16.5（2023 年 5 月）。

<a id="css-for-fallback"></a>

### 回退 CSS
在父元素上用 `.has-error` 类模拟 `:has()` 行为。

```css
/* Native */
.card-section:has(:user-invalid) {
  border-left-color: #d93025;
}

/* Fallback */
.card-section.has-error-fallback {
  border-left-color: #d93025;
}
```

<a id="javascript-fallback"></a>

### JavaScript 回退

使用基于 `WeakMap` 跟踪交互状态的可复用工具，避免用“dirty”类或 data 属性污染 DOM。

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

```js
// 1. Initialize the generic fallback
const form = document.querySelector('#demo-form');
UserInvalidFallback.init(form);

// 2. Add specialized "parent styling" logic (Separate from fallback)
const supportsHas = CSS.supports('selector(:has(a))');
if (!supportsHas) {
  // Listen for changes to form validity after interaction
  form.addEventListener('blur', (e) => {
    if (!e.target.matches('input, select, textarea')) return;

    // Find the container we want to style (sync with CSS)
    const container = e.target.closest('.card-section');
    if (!container) return;

    // Check if ANY input in this container is invalid. Match :user-invalid as well as the
    // fallback class: a browser can support :user-invalid but not :has().
    const hasError = container.querySelector(':is(:user-invalid, .user-invalid-fallback)');
    container.classList.toggle('has-error-fallback', !!hasError);
  }, true); // Capture phase to ensure we run after the fallback's blur listener

  // Also handle input events for immediate cleanup
  form.addEventListener('input', (e) => {
    const container = e.target.closest('.card-section');
    if (container) {
      const hasError = container.querySelector(':is(:user-invalid, .user-invalid-fallback)');
      container.classList.toggle('has-error-fallback', !!hasError);
    }
  });

  // A submit attempt flags every failing field through the invalid event, the only event
  // it fires on fields the user never touched. invalid doesn't bubble, so use the capture phase.
  form.addEventListener('invalid', (e) => {
    const container = e.target.closest('.card-section');
    if (container) {
      const hasError = container.querySelector(':is(:user-invalid, .user-invalid-fallback)');
      container.classList.toggle('has-error-fallback', !!hasError);
    }
  }, true);

  // Handle form resets
  form.addEventListener('reset', () => {
    form.querySelectorAll('.has-error-fallback').forEach(el => {
      el.classList.remove('has-error-fallback');
    });
  });
}
```

<a id="other-considerations"></a>

## 其他注意事项

1. **无障碍**：原生 `:user-invalid` 不会自动同步 ARIA 属性。添加以下 JavaScript，让 `aria-invalid` 与视觉状态保持同步：

* 在 `:user-invalid` 匹配之前，设置 `aria-invalid="false"`，不要完全不设。Firefox、Safari 会从页面加载开始就把空 `required` 字段暴露为无效；Chromium 则在交互后也不会把空 `required` 字段暴露为无效，除非设置 `aria-invalid="true"`。
* 将字段的 `data-error` 属性设为错误消息的 `id`，从而关联两者（例如 `<div id="email-error">` 对应 `data-error="email-error"`）。仅在字段无效期间，由脚本将该 `id` 放入 `aria-describedby`。不要在标记中直接通过 `aria-describedby` 引用错误；错误元素一直存在于页面，`aria-describedby` 引用的文本即使隐藏也会被朗读。
* 用户离开或修改字段后出现错误时，通过页面唯一的 polite live region 稍后播报，以免盖过下一字段。不要让每条错误消息都成为 live region；仅从隐藏变显示、而非内容变化的 live region 无法可靠播报。提交失败后应将焦点移到第一个无效字段，由它播报错误。

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

使用 `.visually-hidden` 工具类隐藏 live region：

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

