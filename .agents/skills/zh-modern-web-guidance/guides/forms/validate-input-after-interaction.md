<a id="validate-input-after-interaction"></a>
# 在交互后校验输入

<a id="the-problem"></a>
## 问题

用户刚聚焦字段并开始输入就显示校验错误，既过早又分散注意力。例如，用户正在输入电子邮件地址（如“user@gm”）或满足复杂要求的密码时，在输入完成之前，字段从技术上来说都处于无效状态。标准的 `:invalid` 样式会立即显示错误，令用户感到挫败。

<a id="the-solution"></a>
## 解决方案

`:user-invalid` 伪类允许把错误状态延后到用户已经“确认”某个值（修改字段后失焦），或尝试提交表单时再显示。这样可确保只在用户完成对字段的交互后提供校验反馈。

<a id="implementation-strategy"></a>
### 实施策略

1. **HTML 约束：** **应当**使用 `type="email"`、`pattern` 和 `required` 等标准 HTML5 属性，触发浏览器内置的校验逻辑。
2. **视觉反馈：** **应当**使用 `:user-invalid`，仅在交互后应用错误样式。
3. **正向反馈：** 满足要求后，可以使用 `:user-valid` 提供绿色的“成功”指示。
4. **平稳恢复：** 用户一旦把输入改为有效格式，`:user-invalid` 就停止匹配，错误状态随即移除。
5. **错误文本：** **应当**在显示错误样式时同时显示可见错误文字，避免仅靠颜色传达错误。每条消息**应当**以具有“错误”等替代文本的错误图标开头，这是最稳妥的选择；或者把所有消息都写成明确的错误描述，例如“请输入有效的电子邮件地址。”表单内所有错误都应采用同一种方式。如果知道解决办法，**应当**明确告知，例如“请按 you@example.com 的格式输入电子邮件地址。”
6. **错误关联：** **应当**仅在字段无效时，把错误消息放到字段的 `aria-describedby` 中，并排在已有提示之后，让屏幕阅读器随字段一起读出。如果在初始标记中就设置引用，页面加载后就可能读出隐藏消息。“一致的 ARIA 体验”中的脚本会为每个将 `data-error` 设为错误消息 `id` 的字段处理这一关联。

<a id="implementation-guide"></a>
## 实现指南

<a id="use-case-1-email-validation"></a>
### 场景 1：电子邮件校验

强制要求：电子邮件字段应依靠标准 HTML5 属性。错误消息默认隐藏，仅在浏览器判定用户离开字段时留下无效值后显示。

```html
<form>
  <div class="field">
    <label for="email">Email Address</label>
    <!-- MANDATORY: Place format hints above the input so autocomplete popovers don't cover them during editing -->
    <span id="email-hint" class="hint">Format: you@example.com</span>
    <!-- DO: Use standard HTML validation attributes like type="email" and required -->
    <!-- Set data-error to the error message's id. The aria-invalid script lists that id in aria-describedby while the field is invalid. -->
    <input
      type="email"
      id="email"
      name="email"
      required
      autocomplete="email"
      aria-describedby="email-hint"
      data-error="email-error"
    >
    <div id="email-error" class="error-msg">
      <span role="img" aria-label="Error">❌</span> Enter an email address in the format you@example.com.
    </div>
  </div>
</form>
```

```css
.hint {
  display: block;
  color: #5f6368;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}

.error-msg {
  display: none;
  color: #d93025;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/*
  DO: Only show error styles after user interaction.
  Use multiple indicators (border/background shift + icon/text) to avoid color-only states.
*/
input:user-invalid {
  border-color: #d93025;
  background-color: #fce8e6;
}

/* DO: Reveal the error message using the adjacent sibling selector */
input:user-invalid + .error-msg {
  display: block;
}

/* DO: Provide a clear success indication on :user-valid */
input:user-valid {
  border-color: #188038;
}
```

<a id="use-case-2-password-complexity"></a>
### 场景 2：密码复杂度

强制要求：在 `pattern` 属性中使用正则表达式前瞻模式定义复杂度规则。规则列表显示在输入框上方，用于引导用户；发生错误时将其高亮。

```html
<form>
  <div class="field">
    <label for="password">New Password</label>
    <!-- MANDATORY: Place hints and rules above the input so mobile keyboards do not obscure them -->
    <ul id="password-rules" class="rules-list">
      <li>At least 8 characters</li>
      <li>One uppercase letter</li>
      <li>One lowercase letter</li>
      <li>One number</li>
      <li>One special character</li>
    </ul>
    <!-- DO: Use pattern and minlength for complex password validation
         DO: Match all constraints with lookaheads via pattern attribute
     -->
    <!-- Set data-error to the error message's id. The aria-invalid script lists that id in aria-describedby while the field is invalid. -->
    <input
      type="password"
      id="password"
      autocomplete="new-password"
      required
      pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}"
      minlength="8"
      aria-describedby="password-rules"
      data-error="password-error"
    >
    <!-- MANDATORY: Give the password its own error text. Turning the rules list red
         doesn't say what is wrong, and screen readers don't convey the color change. -->
    <div id="password-error" class="error-msg">
      <span role="img" aria-label="Error">❌</span> Password doesn't meet all the requirements listed above.
    </div>
  </div>
</form>
```

```css
/* DO: State the default styling as neutral */
.rules-list { 
  color: #5f6368; 
  margin-bottom: 0.5rem;
}

/* DO: Show invalid state (After interaction): Error */
input:user-invalid {
  border-color: #d93025;
  background-color: #fce8e6;
}

/* DO: Reveal the error message using the adjacent sibling selector */
input:user-invalid + .error-msg {
  display: block;
}

/* DO: Highlight rules list when error is shown using the modern :has() selector */
.field:has(input:user-invalid) .rules-list {
  color: #d93025;
  font-weight: 600;
}

/* DO: Add success indications for :user-valid state */
input:user-valid {
  border-color: #188038;
}

/* DO: Hide rules once satisfied. visibility keeps their space: collapsing the list on
   blur would move the submit button between mousedown and mouseup, and the click
   would be lost. */
.field:has(input:user-valid) .rules-list {
  visibility: hidden;
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

1. **无障碍：**
    * **强制要求：** 使用 `aria-describedby` 把规则列表与输入控件关联起来。
    * **不要：** 在输入有效之前完全隐藏规则列表；用户需要知道应该输入什么！
2. **Pattern 属性的限制：** **强制要求：** `pattern` 属性执行完整匹配，隐含 `^...$`。确保密码正则表达式考虑整个字符串。
3. **校验严格程度：** **应当**注意，浏览器默认的 `type="email"` 校验相当宽松，例如 `user@localserver` 也可能通过。如果需要更严格的校验，可能需要在使用 `type="email"` 的同时，配合更完善的校验库或自定义校验函数。
4. **焦点管理：** **强制要求：** 如果用户在存在无效字段时提交表单，浏览器会自动聚焦第一个无效字段。由于提交尝试也算一次交互，`:user-invalid` 样式会立即生效。
5. **一致的 ARIA 体验：** 原生 `:user-invalid` 不会自动同步 ARIA 属性。添加以下 JavaScript，让 `aria-invalid` 与视觉状态保持一致：

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
