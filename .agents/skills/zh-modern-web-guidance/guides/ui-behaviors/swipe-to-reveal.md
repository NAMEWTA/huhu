<a id="swipe-to-reveal"></a>

# 滑动揭示

滑动揭示让用户水平滑动前景行或内容面板，露出隐藏 UI，例如置顶、静音、归档、删除按钮或次级侧菜单，**不自动激活任何操作**。容器吸附到打开状态，用户查看并激活控件，或反向滑动关闭。

> 全宽滑动超过阈值立即提交并移除项目，参见 `swipe-to-remove`（通过 `npx -y modern-web-guidance@latest retrieve "swipe-to-remove"` 获取）。垂直滚动容器顶部隐藏页头的揭示，参见 `pull-to-reveal`（通过 `npx -y modern-web-guidance@latest retrieve "pull-to-reveal"` 获取）。

<a id="how-to-implement"></a>

## 实现方法

无论揭示列表项操作还是可滚动面板旁的侧菜单，机制相同：将前景内容与隐藏面板放入水平外层滚动容器，配置 **CSS Scroll Snap**（`scroll-snap-type: x mandatory`）和 **`overscroll-behavior: chain`**。浏览器原生滚动引擎处理惯性、吸附、键盘焦点滚动及滚动链，无需 JS 手势监听。

<a id="step-1-mark-up-the-swipe-wrapper-content-and-revealed-panel"></a>

### 第 1 步：标记滑动包装、内容和揭示面板

`.SwipeReveal` 内先放前景，再放揭示控件（按钮或侧菜单）。内容在 DOM 第一位，容器自然从滚动偏移 `0` 开始，面板隐藏在右侧屏外。各操作无障碍名称应包含相关内容，使用户能区分控件。

```html
<!-- Example A: List item with revealable action buttons -->
<div class="SwipeReveal">
  <div class="SwipeReveal-content">
    <strong>Design review notes</strong>
    <p>Updated component specs for the Q3 release.</p>
    <button aria-label="Design review notes actions" aria-expanded="false">…</button>
  </div>
  <div class="SwipeReveal-panel" role="group" aria-label="Item actions">
    <button type="button" tabindex="-1">Pin</button>
    <button type="button" tabindex="-1">Archive</button>
    <button type="button" tabindex="-1">Delete</button>
  </div>
</div>

<!-- Example B: Scrollable content pane with a revealable side menu -->
<div class="SwipeReveal" role="region" aria-label="Document preview with swipeable side menu">
  <div class="SwipeReveal-content is-scrollable" tabindex="0">
    <h2>Article Preview</h2>
    <p>Scroll vertically through this pane, or swipe left to reveal the side menu...</p>
    <button aria-label="Article actions" aria-expanded="false">…</button>
  </div>
  <nav class="SwipeReveal-panel" aria-label="Contextual menu">
    <a href="#share" tabindex="-1">Share</a>
    <a href="#bookmark" tabindex="-1">Bookmark</a>
    <a href="#export" tabindex="-1">Export PDF</a>
  </nav>
</div>
```

<a id="step-2-configure-the-horizontal-snap-container-and-overscroll-behavior-chain"></a>

### 第 2 步：配置水平吸附和 `overscroll-behavior: chain`

仅为滑动效果增加外层滚动包装时，它成为文档或其他父滚动容器中的中间滚动器。

`overscroll-behavior` 四个关键字独立控制多余滚动是否传给祖先（**滚动链**），以及是否显示弹性橡皮筋或边缘辉光等**局部边界效果**：

| 值 | 滚动链（传给祖先） | 局部边界效果（弹性/辉光） | 在滑动揭示中的用途 |
| :--- | :--- | :--- | :--- |
| `auto` | 是 | 是 | 默认；需要正常弹性反馈的内部内容滚动器保留，外层避免使用，否则菜单会弹动 |
| `chain` | **是** | **否** | **用于外层 `.SwipeReveal`，让多余滚动传给文档等父级，同时菜单或操作条不弹动** |
| `contain` | 否 | 是 | 将滚动困在容器，同时保留局部弹性 |
| `none` | 否 | 否 | 同时阻止局部弹性和向祖先传递 |

将 `.SwipeReveal` 设为两列网格（`grid-template-columns: 100% max-content`），`.SwipeReveal-content` 吸附到 `start`，`.SwipeReveal-panel` 吸附到 `end`：

```css
.SwipeReveal {
  /* Column 1: full-width content. Column 2: auto-sized actions or side menu. */
  display: grid;
  grid-template-columns: 100% max-content;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;

  /* Prevent the swipe wrapper and revealed panel from bouncing locally while
     still chaining excess scroll into the parent scroller (the document). */
  overscroll-behavior: chain;
}

@media (prefers-reduced-motion: no-preference) {
  .SwipeReveal {
    scroll-behavior: smooth;
  }
}

.SwipeReveal-content {
  scroll-snap-align: start;
  scroll-initial-target: nearest;
  background: Canvas;
}

.SwipeReveal-content:focus-visible {
  outline: auto;
  outline-offset: -2px;
}

.SwipeReveal-content.is-scrollable {
  block-size: 20rem;
  overflow: auto;
  /* Keeps default `overscroll-behavior: auto` so the content pane retains
     its normal bounce effect while chaining horizontal swipes to `.SwipeReveal`. */
}

.SwipeReveal-panel {
  /* Snapping a trailing panel to `end` (or a leading panel to `start`) brings
     all controls fully into view while keeping the adjacent edge of the content visible. */
  scroll-snap-align: end;
  display: flex;

  &:first-child {
    scroll-snap-align: start;
  }
}
```

> 若也要在左侧（`inline-start`）揭示控件，使用三列（`grid-template-columns: max-content 100% max-content`）或两列（`max-content 100%`），将前置 `.SwipeReveal-panel` 放在 `.SwipeReveal-content` 前。由于 `.SwipeReveal-content` 具有 `scroll-initial-target: nearest`，滚动容器会初始停在内容列，而非前置面板。

<a id="step-3-reveal-controls-when-trigger-button-is-activated"></a>

### 第 3 步：激活触发按钮时揭示控件

`.SwipeReveal-panel` 内的按钮或链接静止时在屏外，因 `tabindex="-1"` 不默认聚焦；相应触发按钮激活时必须按预期显示，同时将 `tabindex` 属性改为 `tabindex="0"` 让用户到达和交互，并将触发控件的 `aria-expanded` 属性设为 `aria-expanded="true"`。已揭示时再激活应反向恢复这些变化。

```js
for (const trigger of document.querySelectorAll('.SwipeReveal-content [aria-label$="actions"]')) {
  trigger.addEventListener('click', () => {
    const reveal = trigger.closest('.SwipeReveal');
    if (!reveal) return;

    const label = (trigger.getAttribute('aria-label') || '').toLowerCase();
    const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      if (label.includes('leading')) {
        let leadingScrollPanelWidth = reveal.querySelector('.SwipeReveal-panel').offsetWidth;
        reveal.scrollTo({
          left: leadingScrollPanelWidth,
          behavior: 'smooth',
        });
      } else if (label.includes('trailing')) {
        let leadingScrollPanelWidth = reveal.querySelector('.SwipeReveal-panel').offsetWidth;
        reveal.scrollTo({
          left: leadingScrollPanelWidth,
          behavior: 'smooth',
        });
      } else {
        reveal.scrollTo({
          left: 0,
          behavior: 'smooth',
        });
      }

      for (const actionButton of reveal.querySelectorAll('[aria-label$="actions"]')) {
        actionButton.setAttribute('aria-expanded', 'false');
      }
      setActionTabIndexes(reveal, false);
      return;
    }

    const panels = Array.from(reveal.querySelectorAll('.SwipeReveal-panel'));
    if (panels.length === 0) return;

    let targetScrollLeft = reveal.scrollWidth;

    if (label.includes('leading')) {
      targetScrollLeft = 0;
    } else if (label.includes('trailing')) {
      targetScrollLeft = reveal.scrollWidth;
    } else if (panels.length === 1) {
      targetScrollLeft = reveal.scrollWidth;
    } else {
      const content = reveal.querySelector('.SwipeReveal-content');
      const firstTrigger = content.querySelector('[aria-label$="actions"]');
      targetScrollLeft = trigger === firstTrigger ? 0 : reveal.scrollWidth;
    }

    reveal.scrollTo({
      left: targetScrollLeft,
      behavior: 'smooth',
    });

    for (const actionButton of reveal.querySelectorAll('[aria-label$="actions"]')) {
      actionButton.setAttribute('aria-expanded', actionButton === trigger ? 'true' : 'false');
    }
    setActionTabIndexes(reveal, true);
  });
}
```

同时参照 `scroll-snap-realtime-feedback`（通过 `npx -y modern-web-guidance@latest retrieve "scroll-snap-realtime-feedback"` 获取），确保用户通过滑动而非按钮打开时，无障碍状态也同步。

<a id="best-practices-and-pitfalls"></a>

## 最佳实践与易错点

- **要**用 `scroll-snap-type: x mandatory` 而非 `proximity`，使用 `proximity` 时，轻滑可能让操作按钮或侧菜单停在半露状态。
- **要**在外层 `.SwipeReveal` 设置 `overscroll-behavior: chain`，让滚动传到父级，菜单或操作条不弹动。
- **要**为需要正常弹性反馈的内部可滚动内容（`.SwipeReveal-content.is-scrollable`）保留默认 `overscroll-behavior: auto`，同时将水平滑动传给外层。
- **要**用真实可聚焦 DOM 控件（`<button>`、`<a>`）实现操作和侧菜单。`.SwipeReveal-content` 自身可聚焦或含可聚焦控件时，在 `focusin` 检查 `event.target.matches(':focus-visible')`，调用 `scrollIntoView({ block: 'nearest', inline: 'start' })`，让 Tab 返回内容时关闭侧板且不影响指针。
- **不要**在 JS 拦截 `wheel`、`touchmove` 或 `pointermove` 事件 手动平移或模拟滚动链。主线程手势拦截会阻止合成器滚动，破坏原生惯性，降低响应。

<a id="accessibility-considerations"></a>

## 无障碍考量

为满足 WCAG 2.5.1 指针手势，功能不能只通过滑动提供。可见按钮是替代途径，尤其使语音控制用户可操作。按钮至少 24×24 CSS 像素（WCAG 2.5.8 最小目标尺寸），并可仅键盘聚焦和操作。

也可在其他位置提供同一功能。例如收件箱左滑收藏，还可进入邮件后点击“收藏邮件”。大量重复操作场景这种替代可用性较低，因为残障用户需花更多时间访问控件。操作系统或浏览器功能（例如 iOS 长按）也可作替代，但通常不如常驻按钮易发现。

<a id="fallback"></a>

## 回退方案

scroll-initial-target 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）和 Edge 133（2025 年 2 月）。
不支持：Firefox 和 Safari。

若 `.SwipeReveal` 容器中的 `.SwipeReveal-panel` 放在 `.SwipeReveal-content` 前的左侧（`inline-start`），不支持 `scroll-initial-target: nearest` 的浏览器会从滚动偏移 `0` 开始渲染，露出前置面板。

目标 Baseline 不支持 `scroll-initial-target` 时，用 `CSS.supports('scroll-initial-target', 'nearest')` 检测，并在 `load` 调用 `scrollTo()`、`behavior: 'instant'`，让带前置面板的容器直接跳到 `.SwipeReveal-content`，且不滚动页面：

<a id="progressive-enhancement"></a>

## 渐进增强

overscroll-behavior 的浏览器支持：有限可用。
支持版本：Chrome 144（2026 年 1 月）、Edge 144（2026 年 1 月）和 Firefox 150（2026 年 4 月）。
不支持：Safari。

Scroll snap 的 Baseline 状态：广泛可用。自 2020-01-15 起纳入 Baseline。
支持版本：Chrome 69（2018 年 9 月）、Edge 79（2020 年 1 月）、Firefox 68（2019 年 7 月）和 Safari 11（2017 年 9 月）。

scrollbar-width 的 Baseline 状态：新近可用。自 2024-12-11 起纳入 Baseline。
支持版本：Chrome 121（2024 年 1 月）、Edge 121（2024 年 1 月）、Firefox 64（2018 年 12 月）和 Safari 18.2（2024 年 12 月）。

将 `overscroll-behavior: chain` 和 `scrollbar-width: none` 作为无需 JavaScript 回退的渐进增强：

- **自动 CSS 层叠回退：** `overscroll-behavior` 的初始值是 `auto`。不认识 `chain` 关键字的浏览器在解析时忽略 `overscroll-behavior: chain`，保留 `auto`。`auto` 本就允许滚动传给祖先滚动容器，因此所有浏览器中的滑动揭示手势和向父级传递的滚动链都能直接工作；支持该值的浏览器只是额外抑制外层滑动包装上不需要的橡皮筋弹性。
- **覆盖 `contain` 或 `none`：** 基础样式或工具类若设置了 `overscroll-behavior: contain` 或 `none`，在 `overscroll-behavior: chain` 前紧接着声明 `overscroll-behavior: auto`，让不支持 `chain` 的浏览器仍将滚动传给父级，而非把滚动困在容器中。
- **隐藏滚动条（`scrollbar-width: none`）：** 隐藏水平滚动条轨道纯属外观调整；旧引擎若忽略 `scrollbar-width: none`，滑动揭示容器仍完整可用，只是显示标准滚动条。
