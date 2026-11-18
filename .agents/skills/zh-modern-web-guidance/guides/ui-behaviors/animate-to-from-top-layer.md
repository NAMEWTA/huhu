<a id="animate-elements-to-and-from-top-layer"></a>

# 元素进入和退出顶层的动画

在“顶层”渲染的元素（如 `<dialog>`、具有 `popover` 属性的元素或工具提示）会在 `display: none` 与可见状态间切换，过去难以添加动画。现代 CSS 提供 `@starting-style`、`transition-behavior: allow-discrete` 和 `overlay` 属性，实现平滑进入和退出过渡。以下示例使用原生 CSS 嵌套。

<a id="implementation"></a>

## 实现

<a id="1-enable-discrete-transitions"></a>

### 1. 启用离散过渡

要对 `display` 添加动画，必须设置 `transition-behavior: allow-discrete`，使元素在退出过渡期间保持可见。如果使用 `transition` 简写，将 `transition-behavior: allow-discrete` 放在其后，避免被简写重置。

<a id="2-the-overlay-property"></a>

### 2. `overlay` 属性

元素进入或退出顶层时，必须对 `overlay` 过渡，确保动画期间保持顶层，避免过早被其他元素或视口裁剪。

<a id="3-entry-animations-with-starting-style"></a>

### 3. 使用 `@starting-style` 的进入动画

用 `@starting-style` 定义元素首次渲染或 `display` 从 `none` 改变时，过渡应从哪些样式开始。

<a id="4-animating-the-backdrop"></a>

### 4. 背景遮罩动画

`::backdrop` 伪元素同样可通过对其自身属性添加过渡来实现动画。

<a id="example"></a>

## 示例

```css
/* 1. Define the visible (open) state */
dialog[open],
[popover]:popover-open {
  opacity: 1;

  /* 2. Define the starting state for entry (must come after open state) */
  @starting-style {
    opacity: 0;
  }

  /* Scale only for users who haven't asked for reduced motion (see 5) */
  @media (prefers-reduced-motion: no-preference) {
    transform: scale(1);

    @starting-style {
      transform: scale(0.9);
    }
  }
}

/* 3. Define the base (closed/exit) state and transitions */
dialog,
[popover] {
  opacity: 0;

  /* MANDATORY: transition display and overlay for top-layer elements */
  transition-property: opacity, transform, display, overlay;
  transition-duration: 0.3s;
  transition-timing-function: ease-out;
  /* Separate after transition so a shorthand doesn't reset it or fail in older browsers */
  transition-behavior: allow-discrete;

  @media (prefers-reduced-motion: no-preference) {
    transform: scale(0.9);
  }
}

/* 4. Animate the backdrop */
dialog::backdrop,
[popover]::backdrop {
  background-color: rgba(0, 0, 0, 0);
  transition-property: background-color, display, overlay;
  transition-duration: 0.3s;
  transition-timing-function: ease-out;
  /* Separate after transition so a shorthand doesn't reset it or fail in older browsers */
  transition-behavior: allow-discrete;
}

dialog[open]::backdrop,
[popover]:popover-open::backdrop {
  background-color: rgba(0, 0, 0, 0.5);

  @starting-style {
    background-color: rgba(0, 0, 0, 0);
  }
}

/* 5. Respect user preference for reduced motion: the scale above only applies
   with no-preference, so this only shortens the fade */
@media (prefers-reduced-motion: reduce) {
  dialog,
  [popover] {
    transition-duration: 0.1s;
  }
}
```

<a id="constraints--accessibility"></a>

## 约束与无障碍

- **必须：** 任何进入或退出顶层的元素，都在 `transition` 列表中包含 `overlay`。
- **必须：** 对 `display` 和 `overlay` 过渡时，使用 `transition-behavior: allow-discrete`。
- **不要：** 在 `transition` 简写中写 `allow-discrete`，这会让旧浏览器忽略整个 `transition` 声明。除非希望如此，否则独立声明 `transition-behavior: allow-discrete`。
- **必须：** 尊重减少动态效果偏好：只在 `@media (prefers-reduced-motion: no-preference)` 内应用变换，在 `@media (prefers-reduced-motion: reduce)` 中缩短过渡，让偏好减少动态的用户获得短暂淡入淡出。
- **要：** 将 `@starting-style` 块放在“打开”状态选择器内或其后，确保正确层叠。
- **不要：** 用 `@starting-style` 定义退出；退出由过渡到基础（关闭）状态定义。

<a id="fallback-strategies"></a>

## 回退策略

`@starting-style` 的 Baseline 状态：新近可用。自 2024-08-06 起纳入 Baseline。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.5（2024 年 5 月）。

overlay 的浏览器支持：有限可用。
支持版本：Chrome 117（2023 年 9 月）和 Edge 117（2023 年 9 月）。
不支持：Firefox 和 Safari。

<a id="fallbacks--browser-support-for-transition-behavior"></a>

### transition-behavior 的回退方案和浏览器支持

transition-behavior 的 Baseline 状态：新近可用。自 2024-08-06 起纳入 Baseline。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）、Firefox 129（2024 年 8 月）和 Safari 17.4（2024 年 3 月）。

css.properties.transition-behavior.transitionable_display 能力的浏览器支持：有限可用。
支持版本：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）和 Safari 18（2024 年 9 月）。
不支持：Firefox。

Firefox 129+ 可以解析 `transition-behavior: allow-discrete`（`CSS.supports('transition-behavior', 'allow-discrete')` 返回 `true`），却不会实际对 `display` 过渡（Firefox bug 1882408），导致退出时立即消失。

要可靠检测离散 `display` 过渡支持，应探测临时元素过渡到 `none` 时的计算 `display` 是否仍可见，不要仅依赖 `CSS.supports('transition-behavior', 'allow-discrete')`：

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

<a id="top-layer-exit-fallback"></a>

### 顶层退出回退

进入动画在所有支持 `@starting-style` 的浏览器中可由纯 CSS 实现，无需 `.is-opening` 类，因为进入不依赖 `overlay` 或离散 `display` 过渡。

退出动画同时要求支持 `overlay` 与离散 `display` 过渡。任一不支持时（例如 Firefox、Safari），用 `:is()` 包裹打开状态选择器，并追加 `:where(:not([data-closing]))`（嵌套 `&::backdrop` 和 `@starting-style`）。这样设置 `data-closing` 时，元素仍在顶层但开始退出过渡；等待 `getAnimations()` 完成后，再调用 `.close()` 或 `.hidePopover()`：

```css
:is(dialog[open], [popover]:popover-open):where(:not([data-closing])) {
  opacity: 1;

  @starting-style {
    opacity: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    transform: scale(1);

    @starting-style {
      transform: scale(0.9);
    }
  }

  &::backdrop {
    background-color: rgb(0 0 0 / 0.5);

    @starting-style {
      background-color: transparent;
    }
  }
}
```

```javascript
// Evaluate lazily: canTransitionDisplay() needs document.body, so a top-level
// const would be permanently false if this script runs in <head>.
function supportsTopLayerExit() {
  return window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();
}

async function closeTopLayer(element) {
  if (!supportsTopLayerExit()) {
    element.setAttribute('data-closing', '');
    const animations = element.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    }
    if (!element.hasAttribute('data-closing')) return;
    element.removeAttribute('data-closing');
  }

  element.close();
  // Or for popover:
  // element.hidePopover();
}

// Route native close requests (Esc, closedby light dismiss) through the same
// helper so they animate too, instead of closing instantly.
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeTopLayer(dialog);
});
```

Popover 轻触关闭和 `popovertarget` 切换无法拦截（`beforetoggle` 只有打开时可取消），因此需要回退的浏览器中这些退出是即时的。如果退出动画重要，提供调用 `closeTopLayer()` 的明确关闭控件。

<a id="fallbacks--browser-support-for-popover"></a>

### Popover 的回退方案和浏览器支持

Popover 的 Baseline 状态：新近可用。自 2025-01-27 起纳入 Baseline。
支持版本：Chrome 116（2023 年 8 月）、Edge 116（2023 年 8 月）、Firefox 125（2024 年 4 月）、Safari 17（2023 年 9 月）和 Safari iOS 18.3（2025 年 1 月）。

Popover API 主要属于**渐进增强**，但其核心行为——提升到顶层、轻触关闭和 `popovertarget` 调用——没有纯 CSS 等价实现。旧浏览器需要 polyfill；如果不希望引入，也可以手动实现回退。

**Polyfill：** 要在旧浏览器支持 `popover` 属性，按条件加载 [`@oddbird/popover-polyfill`](https://github.com/oddbird/popover-polyfill)。**必须：** 检测 `HTMLElement.prototype` 是否具有 `popover` 属性，**仅在**缺少原生支持时加载 polyfill，不得无条件加载。

使用打包工具或 import map 时：

```js
// MANDATORY: Feature detect 'popover' on HTMLElement.prototype.
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("@oddbird/popover-polyfill");
}
```

如果不使用包管理器，可以从 CDN 导入，例如 `"https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js"`。

使用 polyfill 时的注意事项：
- 对于可能在 polyfill 完全加载前运行的代码，不要使用 `popover` IDL 属性。它不会映射成 HTML 属性，浮层不会被 polyfill 识别，而且该属性会永久遮蔽 polyfill 添加的访问器。改用 `setAttribute()`/`removeAttribute()`。
- **样式注意事项：** polyfill 无法定义真正的 `:popover-open` 伪类，因此改为应用 `.\:popover-open` 类。**必须：** 用 `:is()` 或 `:where()` 组合两者，否则不支持 `:popover-open` 的浏览器会丢弃整条规则：

```css
[popover]:is(:popover-open, .\:popover-open) {
  display: block;
}
```
