<a id="ime-safe-enter-to-submit"></a>
# 不会干扰输入法的回车提交

许多聊天界面会在用户于 `<textarea>` 中按下 `Enter` 时提交消息。

这适用于直接使用拉丁字母键盘输入的用户，例如输入英语的用户，但会影响通过输入法编辑器（IME）组合日语、中文或韩语等语言文本的用户。

在这些场景中，`Enter`/`Return` 键用于确认当前的字符转换候选项。如果自定义 JavaScript 监听 `Enter` 的 `keydown` 并立即提交，消息就会在用户仍在转换字符时发送，造成消息不完整、碎片化或内容错误。

对组合输入是否进行中的检查，适用于任何响应 `Enter` 的自定义 `keydown` 处理器，并不只限于多行 `<textarea>`。自行处理 `Enter` 的单行 `<input>`，例如搜索和查找栏、行内重命名字段、模态对话框字段及命令面板，也会与 `<textarea>` 一样接收到用于确认输入法候选项的 `Enter` keydown，此时 `isComposing` 为 `true`。如果 `<input>` 没有自定义 `Enter` 处理器，只依靠 `<form>` 的原生隐式提交，则无需显式处理，因为当 IME 消费 `Enter` 按键时，浏览器会阻止隐式提交。

<a id="implementation-strategy"></a>
## 实施策略

对于自定义回车提交行为的 `<textarea>` 或 `<input>`，提交内容之前应检查 `KeyboardEvent` 的原生 `isComposing` 属性。同时调用 `event.preventDefault()`：`Enter` 的默认行为是在 `<textarea>` 中插入换行，而在 `<form>` 内的 `<input>` 中则会触发浏览器的隐式提交，造成第二次提交。

```html
<form id="chat-form">
  <label for="chat-input" class="visually-hidden">Message</label>
  <textarea id="chat-input" placeholder="Type a message..."></textarea>
  <button type="submit" id="send-button">Send</button>
</form>
```

```js
const textarea = document.getElementById('chat-input');
const form = document.getElementById('chat-form');

textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    // Prevent the default action (newline in a textarea, implicit form submission in an input)
    event.preventDefault();

    // If the user is composing text, return early.
    if (event.isComposing) {
      return;
    }

    form.requestSubmit();
  }
});
```

单行 `<input>` 使用相同处理器，但去掉 `!event.shiftKey` 条件；该条件仅用于保留 `<textarea>` 中通过 `Shift+Enter` 换行的行为。

注意：其他自定义提交快捷键，例如 `Cmd+Enter` 或 `Ctrl+Enter`，不会与 IME 确认键冲突，因此不需要进行 IME 安全检查。

<a id="accessibility-and-testing"></a>
## 无障碍与测试

1. **明确的提交按钮：** 始终包含一个 `<button type="submit">` 元素。键盘快捷键只是辅助方式，不能替代原生表单提交路径。
2. **可访问的输入控件：** 确保所有 `<input>` 和 `<textarea>` 都通过匹配的 `id` 与 `for` 属性，在程序上关联到 `<label>`。

<a id="fallback-strategies"></a>
## 回退策略

api.KeyboardEvent.isComposing 能力的浏览器支持：可用性有限。
支持：Chrome 56（2017 年 1 月）、Edge 79（2020 年 1 月）和 Firefox 31（2014 年 7 月）。
不支持：Safari。

在近期版本的 Safari 中，一个事件顺序问题（WebKit 缺陷 165004）会先把 `compositionend` 交给脚本处理器，再交付用于确认的 `Enter` `keydown`，尽管底层事件实际按相反顺序派发。等到 keydown 处理器运行时，`event.isComposing` 已被重置为 `false`，因此仅使用标准检查无法防止过早提交。

如果需要兼容较旧版本的 Safari 和其他平台，请采用以下某一种回退策略：

<a id="strategy-1-add-a-keycode--229-check-recommended"></a>
### 策略 1：增加 `keyCode === 229` 检查（推荐）

在 IME 组合输入期间，浏览器在 `keydown` 中报告的是 `keyCode: 229`（`VK_PROCESSKEY`），而不是 `13`，即使在确认按键上 `event.key === 'Enter'` 也成立。结合 `event.isComposing` 与 `event.keyCode === 229`，可以可靠地识别 Safari 中乱序交付的确认 `Enter` keydown。（这也意味着旧的 `event.keyCode === 13` 处理器本来就不会误响应 IME 确认；如果迁移为 `event.key === 'Enter'` 时不同时加入 `event.isComposing` 和 `event.keyCode === 229`，就会引入过早提交问题。）由于这项检查位于 `event.key === 'Enter'` 条件内部，即使移动虚拟键盘在普通字符输入时使用 `229`，也不会受其影响。

```js
textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();

    // Block submission if composing natively or if keyCode is 229
    if (event.isComposing || event.keyCode === 229) {
      return;
    }

    form.requestSubmit();
  }
});
```

<a id="strategy-2-the-eventtimestamp-window-workaround-alternative"></a>
### 策略 2：基于 `event.timeStamp` 时间窗口的变通方案（备选）

如果代码库严格禁止使用 `keyCode` 等已弃用 API，或在特定目标环境中已知 `229` 检查存在问题，可以改为跟踪浏览器报告的事件派发时间戳。

Safari 派发用于确认的 `Enter` keydown 与 `compositionend` 的时间非常接近，通常相隔不到 5ms；有时由于处理器交付顺序倒置，keydown 的时间戳还会略微*更早*。因此，检查两者的时间差具有很高可靠性，在通常情况下也不易因移动虚拟键盘产生误判。

```js
let lastCompositionEndAt = null;

textarea.addEventListener('compositionend', (event) => {
  // IMPORTANT: Always use event.timeStamp, not Date.now() or performance.now().
  // Handler-time measurements are vulnerable to drift when the main thread is blocked.
  lastCompositionEndAt = event.timeStamp;
});

textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();

    if (event.isComposing) {
      return;
    }

    // Block submission if the event occurs within a 50ms window of composition ending.
    // Math.abs handles Safari's inverted event delivery timing bug.
    if (
      lastCompositionEndAt !== null &&
      Math.abs(event.timeStamp - lastCompositionEndAt) < 50
    ) {
      return;
    }

    form.requestSubmit();
  }
});
```
