<a id="animate-element-entry-and-exit"></a>

# 元素进入与退出动画

过去，元素首次加入 DOM 或 `display` 从 `none` 改变时，CSS 过渡无法为其添加动画。`@starting-style` at-rule 与 `transition-behavior: allow-discrete` 提供声明式方式创建平滑进入和退出动画。

<a id="implementation"></a>

## 实现

<a id="1-animating-display-none-toggles"></a>

### 1. 为 `display: none` 切换添加动画

通过属性切换元素可见性时（例如具有 `display: none` 的 `hidden`）：

1. **定义可见状态：** 在基础类中设置最终属性值，例如 `opacity: 1`。
2. **定义进入起始状态：** 用 `@starting-style` 指定变为可见时从哪些值开始过渡。
3. **启用离散过渡：** 在 `transition` 中包含 `display`，并使用 `transition-behavior: allow-discrete`。
4. **定义退出状态：** 在 `hidden` 属性对应样式中设置目标值。

```css
.card {
  display: block;
  opacity: 1;
  translate: 0;
  transition:
    display,
    opacity ease-out,
    translate ease-out;
  transition-duration: 0.4s;
  /* Separate after transition so the shorthand doesn't reset it or fail in older browsers */
  transition-behavior: allow-discrete;
}

/* Entry animation: transition FROM these values when first rendered */
@starting-style {
  .card {
    opacity: 0;
    translate: 0 -20px;
  }
}

/* Exit animation: transition TO these values when hidden */
.card[hidden] {
  display: none;
  opacity: 0;
  translate: 0 -20px;
}

/* Respect user preference for reduced motion */
@media (prefers-reduced-motion: reduce) {
  .card {
    /* Disable movement and shorten duration for a simple fade */
    translate: none;
    transition-duration: 0.1s;
  }

  @starting-style {
    .card {
      translate: none;
    }
  }

  .card[hidden] {
    translate: none;
  }
}
```

<a id="2-animating-dom-insertion-and-removal"></a>

### 2. 为 DOM 插入和移除添加动画

对于通过 `appendChild()` 添加或 `remove()` 移除的元素：

- **进入：** 按上文使用 `@starting-style`。浏览器自动检测从“不存在”到初始样式的变化，并从 `@starting-style` 的值触发过渡。
- **移除：** `element.remove()` 即时执行，不会自身触发 CSS 过渡；必须先触发退出过渡，等待完成后再从 DOM 移除节点。

```javascript
// 1. Trigger exit transition
element.hidden = true;

// 2. Wait for all active transitions/animations to finish,
//    with a failsafe timeout in case an animation never ends (e.g. for looping animations)
const animations = element.getAnimations();
if (animations.length > 0) {
  await Promise.race([
    // Promise.allSettled ensures we wait even if some animations fail
    Promise.allSettled(animations.map(a => a.finished)),
    new Promise(r => setTimeout(r, 2000))
  ]);
}

// 3. Finally remove the node from the DOM
element.remove();
```

<a id="constraints--accessibility"></a>

## 约束与无障碍

- **必须：** 对 `display` 过渡时使用 `transition-behavior: allow-discrete`，否则退出时元素瞬间消失。
- **不要**在 `transition` 简写中写 `allow-discrete`，它会让旧浏览器忽略整个 `transition` 声明。除非明确希望如此，否则独立声明 `transition-behavior: allow-discrete`。
- **必须：** 进入动画使用 `@starting-style`。否则浏览器跳过元素首次样式更新（初始渲染或 `display: none` 变化）的过渡。
- **要：** 对 `<dialog>` 或 `popover` 等顶层元素动画时，将 `overlay` 加入 `transition` 列表，确保退出动画期间仍在顶层。
- **要：** 通过 `prefers-reduced-motion` 尊重减少动态效果偏好。
- **不要：** 依靠 `@starting-style` 做退出动画，它只定义进入过渡的起点。退出由过渡到隐藏状态定义。

<a id="fallback-strategies"></a>

## 回退策略

`@starting-style` 的 Baseline 状态：新近可用。自 2024-08-06 起纳入 Baseline。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.5（2024 年 5 月）。

<a id="fallbacks--browser-support-for-transition-behavior"></a>

### transition-behavior 的回退方案和浏览器支持

transition-behavior 的 Baseline 状态：新近可用。自 2024-08-06 起纳入 Baseline。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.4（2024 年 3 月）。

css.properties.transition-behavior.transitionable_display 能力的浏览器支持：有限可用。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）和 Safari 18（2024 年 9 月）。
不支持：Firefox。

Firefox 129+ 能解析 `transition-behavior: allow-discrete`（`CSS.supports('transition-behavior', 'allow-discrete')` 返回 `true`），但实际上不对 `display` 过渡（Firefox bug 1882408），导致退出时立即消失。

要可靠检测离散 `display` 过渡，不要只依靠 `CSS.supports('transition-behavior', 'allow-discrete')`；创建临时元素，探测其过渡到 `none` 时计算 `display` 是否仍保持可见：

```javascript
let supportsDisplayTransition;
function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  // The shorthand is intentional here: browsers that don't parse allow-discrete
  // drop the whole declaration, so display: none applies instantly and the probe
  // correctly returns false. !important guards against global reduced-motion
  // resets like `* { transition: none !important }`.
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}
```

<a id="exit-fallback-when-discrete-display-transitions-are-unsupported"></a>

### 不支持离散 `display` 过渡时的退出回退

基于 `@starting-style` 的进入动画在所有现代浏览器无需 JavaScript 即可工作。不支持离散 `display` 过渡（`!canTransitionDisplay()`）时，设置 `hidden` 会立即应用 `display: none`，跳过退出动画（隐藏和 `element.remove()` 前都如此）。将视觉退出状态（`[data-closing]`）与 `display: none`（`[hidden]`）分离，让 `opacity` 和 `translate` 完成后再隐藏或移除元素。将第 1 步 `.card[hidden]` 规则（包括 `prefers-reduced-motion` 覆盖）替换为：

```css
.card:where([hidden], [data-closing]) {
  opacity: 0;
  translate: 0 -20px;
}

.card[hidden] {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .card:where([hidden], [data-closing]) {
    translate: none;
  }
}
```

```javascript
async function hideElement(el) {
  if (canTransitionDisplay()) {
    el.hidden = true;
  } else {
    el.setAttribute('data-closing', '');
  }

  const animations = el.getAnimations();
  if (animations.length > 0) {
    await Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }

  // Skipped if showElement() cancelled the close mid-animation.
  if (el.hasAttribute('data-closing')) {
    el.removeAttribute('data-closing');
    el.hidden = true;
  }
}

function showElement(el) {
  el.removeAttribute('data-closing');
  el.hidden = false;
}

async function removeElement(el) {
  await hideElement(el);
  el.remove();
}
```
