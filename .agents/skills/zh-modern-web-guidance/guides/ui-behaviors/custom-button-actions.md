<a id="custom-button-actions"></a>

# 自定义按钮操作
Invoker Commands API 让按钮通过 HTML 属性声明式触发目标元素的操作。
它减少手动事件监听，并将 UI 与实现细节解耦。
对于应用特有操作，可以自定义命令名。自定义命令必须以双连字符（`--`）开头，避免与未来浏览器内建命令冲突。

<a id="implementation-steps"></a>

## 实现步骤

1. **定义目标元素：** 确定响应操作的元素；没有唯一 `id` 时添加。
2. **配置调用按钮：** `commandfor` 指向目标 `id`，`command` 指定以 `--` 开头的自定义命令名。
3. **处理 command 事件：** 直接在目标元素监听 `command`。事件对象包含 `command` 属性和 `target` 属性，后者指向 `commandfor` 标识的元素。
4. **处理 ARIA 状态：** 自定义命令没有内建语义，必须自行处理 `aria-pressed`、`aria-expanded` 等状态。

<a id="example-custom-animation-controls"></a>

## 示例：自定义动画控制

```html
<!-- 响应自定义命令的目标元素。 -->
<div id="action-target" class="target">
  Action Target
</div>

<!-- 以声明式方式关联到目标元素的按钮。 -->
<!-- 每个按钮发送以 '--' 开头的唯一自定义命令。 -->
<button commandfor="action-target" command="--spin">
  Spin
</button>

<button commandfor="action-target" command="--grow">
  Grow
</button>

<button commandfor="action-target" command="--reset">
  Reset All
</button>

<script>
  // 1. 可选：定义请求操作的注册表，使逻辑更清楚。
const commandRegistry = {
  '--spin': (target, source) => {
    const isSpun = target.classList.toggle('is-spun');
    // 设置 ARIA 状态，因为自定义命令没有固有语义。
    source?.setAttribute('aria-pressed', isSpun);
  },
  '--grow': (target, source) => {
    const isGrown = target.classList.toggle('is-grown');
    source?.setAttribute('aria-pressed', isGrown);
  },
  '--reset': (target) => {
    target.classList.remove('is-spun', 'is-grown');
    // 重置所有相关按钮的 ARIA 状态。
    document.querySelectorAll(`button[commandfor="${target.id}"]`).forEach(btn => {
      btn.setAttribute('aria-pressed', 'false');
    });
  },
};

  // 2. 必须：直接在目标元素上监听 command 事件。
  // 这是必要的，因为原生 command 事件不会冒泡。
  document.getElementById('action-target').addEventListener('command', (event) => {
    const command = event.command;
    const target = event.target;
    const source = event.source; // event.source 指向触发按钮。
    const action = commandRegistry[command];

    if (action) {
      action(target, source);
    }
  });
</script>
```

<a id="key-constraints"></a>

## 关键约束

* **自定义命令前缀：** 必须：全部自定义命令以 `--` 开头，例如 `command="--my-action"`。
* **目标：** `commandfor` 必须匹配与按钮处于同一树中的元素 `id`（同一个文档或 shadow root）。
* **不冒泡：** `command` 事件不冒泡。有多个可能目标时，在祖先监听并添加 `{ capture: true }`。
* **Shadow root：** 目标可能在 shadow root 内时，用 `event.composedPath()[0]` 替代 `event.target`。
* **无障碍：** 自定义命令没有固有语义，任何状态都必须显式应用。

<a id="accessibility-considerations"></a>

## 无障碍考量

* 按钮显示额外内容时，用 `aria-expanded`，默认设置 `aria-expanded="false"`，内容显示后设置 `aria-expanded="true"`。
* 按钮本身执行可切换交互时（例如播放/暂停、静音/取消静音），用 `aria-pressed`，未激活时设置 `aria-pressed="false"`，激活时设置 `aria-pressed="true"`。
* 按钮打开角色为 `menu`、`listbox`、`tree`、`grid` 或 `dialog` 的元素时，必须具有 `aria-haspopup`，值为打开元素的角色。
* 激活后需禁用按钮时，使用 `aria-disabled="true"` 而非 `disabled`，避免丢失焦点。

<a id="fallback-strategies"></a>

## 回退策略

Invoker commands 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持版本：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 144（2025 年 10 月）和 Safari 26.2（2025 年 12 月）。

不支持 Invoker Commands API 时，不会触发 `command` 事件。为完整支持所有现代浏览器，建议通过 `npm install` 或 CDN 使用 https://github.com/keithamus/invokers-polyfill 提供的 invokers-polyfill。

它完整支持以 `--` 开头的自定义操作，并像原生 API 一样派发 `command`。

<a id="dynamic-import-performance-optimization"></a>

### 动态导入（性能优化）

为获得最佳性能，仅在浏览器缺少原生支持时加载 polyfill，为现代浏览器用户节省带宽与脚本执行时间。

**注意：** polyfill 不管理自定义命令的 ARIA 状态，例如 `aria-pressed` 或 `aria-expanded`。必须在事件监听器中手动同步以确保无障碍。

<a id="conditionally-load-the-invoker-commands-polyfill"></a>

#### 条件加载 Invoker Commands polyfill

```javascript
// 1. 按条件加载 polyfill。
const hasNativeSupport = 'commandForElement' in HTMLButtonElement.prototype;

if (!hasNativeSupport) {
  // 包在异步 IIFE 中，避免旧浏览器的顶层 await 问题。
  (async () => {
    try {
      await import('https://esm.run/invokers-polyfill');
    } catch (err) {
      console.error('Error loading fallback:', err);
    }
  })();
}
```

<a id="manually-manage-aria-states-in-your-listener"></a>

#### 在监听器中手动管理 ARIA 状态

```javascript
// 2. 在监听器中手动管理 ARIA 状态。
document.getElementById('action-target').addEventListener('command', (event) => {
  const command = event.command;
  const target = event.target;
  const source = event.source; // 触发命令的按钮。

  if (command === '--spin') {
    const isSpun = target.classList.toggle('is-spun');
    
    // polyfill 提示：手动更新 ARIA，使其与新状态一致。
    source?.setAttribute('aria-pressed', isSpun);
  }
});
```

<a id="manual-fallback-traditional-pattern"></a>

### 手动回退（传统模式）

不希望使用 polyfill 时，可以结合**事件委托**派发事件，以及**命令注册表**处理操作。这是传统 JavaScript 开发中常见且仍高效、可扩展的架构模式。

```javascript
// 1. 可选：定义请求操作的注册表，使逻辑更清楚。
const commandRegistry = {
  '--spin': (target) => target.classList.toggle('is-spun'),
  '--grow': (target) => target.classList.toggle('is-grown'),
  '--reset': (target) => target.classList.remove('is-spun', 'is-grown'),
};

// 2. CommandEvent 不存在时，假定没有原生支持并提供回退。
if (!globalThis.CommandEvent) {
  globalThis.CommandEvent = class CommandEvent extends Event {
    constructor(type, { source, command, ...options } = {}) {
      super(type, options);
      this.source = source;
      this.command = command;
    }
  }

// 3. 回退：缺少原生支持时，手动分发事件。
  document.addEventListener('click', (event) => {
    // 尊重已取消按钮激活的处理器。
    if (event.defaultPrevented) return;
    const button = event.composedPath().find((el) => el.matches?.("button[commandfor]"));
    if (!button) return;

    // 在按钮所在的树中解析目标，因为不同 shadow root 可以使用相同 ID。
    const target = button.getRootNode().getElementById(button.getAttribute('commandfor'));
    const command = button.getAttribute('command');

    if (target && command) {
      target.dispatchEvent(new CommandEvent('command', { 
        command, 
        source: button,
      }));
    }
  });
}

// 4. 必须：直接在目标元素上注册统一监听器。
document.getElementById('action-target').addEventListener('command', (event) => {
  const command = event.command;
  const target = event.target;
  const action = commandRegistry[command];

  if (action) {
    action(target);
  }
 });
```
