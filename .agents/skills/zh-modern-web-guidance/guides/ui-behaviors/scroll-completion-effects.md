<a id="triggering-effects-after-programmatic-scrolling-completes"></a>

# 在程序滚动完成后触发效果

程序滚动到章节或元素时（尤其 `behavior: 'smooth'`），立即触发高亮闪现、进入动画或焦点移动，会在目标仍离屏或滚动中途时执行。

过去开发者只能用 `setTimeout()` 猜时长（长滚动太早、短滚动太晚），或手动将 `scrollend` 包成 `Promise` 并加回退定时器，因为目标已在视野、没有滚动时不触发 `scrollend`。

`Element` 的 `scrollIntoView()`、`scroll()`、`scrollTo()`、`scrollBy()` 和 `Window` 的 `scroll()`、`scrollTo()`、`scrollBy()` 返回滚动完成时兑现的 `Promise`。已经位于请求的滚动位置、无需滚动时，返回的 `Promise` 会立即兑现，不会一直处于待决状态。

<a id="implementation"></a>

## 实现

1. **将处理器标为 `async`：** 触发滚动的事件或导航处理器使用 `async`。
2. **直接等待滚动方法：** 调用 `await element.scrollIntoView({ behavior: 'smooth', ... })`（或 `await element.scrollTo(...)`、`await window.scrollTo(...)` 等）。执行会暂停，直到浏览器完成滚动动画，且滚动位置稳定。
3. **应用滚动后效果：** `await` 后再切换高亮、开始动画或移动焦点。

<a id="interrupted-scrolls--focus-management"></a>

## 滚动中断与焦点管理

- **处理快速/中断滚动：** 同一容器平滑滚动未完又开始新滚动，浏览器中止旧滚动，并**兑现而非拒绝**该容器全部待决滚动 promise。若快速点击时需抑制被替代操作的后续效果，用递增操作 ID，在 `await` 后发现有更新滚动则提前返回：

```javascript
let currentScrollId = 0;
const sections = document.querySelectorAll('section');

async function scrollToAndHighlight(targetElement) {
  const scrollId = ++currentScrollId;
  sections.forEach((sec) => sec.classList.remove('highlight'));

  await targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Abort follow-up effect if another scroll was triggered while awaiting
  if (scrollId !== currentScrollId) return;

  targetElement.classList.add('highlight');
}
```

- **滚动后聚焦目标：** 执行 `await targetElement.scrollIntoView(...)` 后，聚焦目标或内部 `tabindex="-1"` 标题时，向 `focus()` 传 `{ preventScroll: true }`，避免第二次竞争滚动：

```javascript
await targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
targetHeading.focus({ preventScroll: true });
```

<a id="constraints--best-practices"></a>

## 约束与最佳实践

- **必须：** 直接等待 `scrollIntoView()`、`scroll()`、`scrollTo()` 或 `scrollBy()` 返回的 `Promise`，不用 `setTimeout()` 猜测滚动时长。
- **不要**以手动 `new Promise()` 包裹 `scrollend` 作为主要实现：目标已经在视野内、没有实际滚动距离时，`scrollend` 不会触发，而滚动方法返回的 Promise 会自动兑现。
- **要：** 等待滚动后 `.focus()` 使用 `{ preventScroll: true }`，避免跳变或再次滚动。
- **要：** 快速交互可能触发同容器重叠平滑滚动时，用请求令牌保护后续效果，因为中断兑现而不拒绝旧 promise。
- **Chrome 根滚动器已知错误：** 文档根滚动时，`scrollIntoView()` 返回的 `Promise` 会过早兑现；等待嵌套滚动容器上的 `scrollIntoView()` 则能按预期工作。不要为规避此错误，把内容包进设置了 `overflow-y: auto` 的 `div` 等新滚动容器。

<a id="accessibility-considerations"></a>

## 无障碍考量

确保触发滚动的控件具有合适角色。若意图是在当前上下文把用户带到别处，使用有 `href` 的 `<a>`，获得隐式 `link` 角色和预期键盘行为。将焦点重定向到滚动目标，让用户从新位置继续导航。

**不要**仅通过滚动结束后的视觉变化提供重要信息。需要传达的重要内容应具有足够对比的文字，并通过 ARIA 实时区域告知屏幕阅读器用户。

<a id="fallback-strategies"></a>

## 回退策略

Scroll method promises 的浏览器支持：有限可用。
支持版本：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持：Firefox 和 Safari。

在不支持滚动方法 Promise 的浏览器中，`scrollIntoView()`、`scroll()`、`scrollTo()` 和 `scrollBy()` 返回 `undefined`，而非 `Promise`。

- **渐进增强（默认 `await` 行为）：** `await undefined` 是有效 JavaScript，会在下一个微任务立即完成。因此，编写 `await element.scrollIntoView({ behavior: 'smooth' })` 在不支持的浏览器中也不会抛错，而是降级为在滚动刚开始时执行后续代码。对于短暂高亮等非关键视觉点缀，这通常已经足够。
- **忠实回退（`scrollend` + 超时）：** 目标 Baseline 缺少 `scroll-promises`，且旧浏览器也必须等待结束时，检查返回值是否为 `Promise`（`result instanceof Promise`）。若为 `undefined`，等待容器的 `scrollend`，并设短回退超时，处理已在视野、无滚动情况：

```javascript
function scrollIntoViewAsync(element, options, scroller = window) {
  const result = element.scrollIntoView(options);

  // Feature detect: in supporting browsers, scrollIntoView() returns a Promise
  if (result instanceof Promise) {
    return result;
  }

  // Fallback for browsers where scrollIntoView() returns undefined
  return new Promise((resolve) => {
    let timeoutId;

    const finish = () => {
      clearTimeout(timeoutId);
      scroller.removeEventListener('scrollend', finish);
      scroller.removeEventListener('scroll', onScroll);
      resolve();
    };

    const onScroll = () => {
      // Restart the idle timer on every scroll event. If scrollend never fires
      // (browsers without scrollend support), this resolves once scrolling goes idle.
      clearTimeout(timeoutId);
      timeoutId = setTimeout(finish, 100);
    };

    scroller.addEventListener('scrollend', finish, { once: true });
    scroller.addEventListener('scroll', onScroll, { passive: true });

    // If no scroll event fires within the idle window (e.g., already in view), resolve.
    // 100ms is an example value; it only needs to exceed the gap between scroll events.
    timeoutId = setTimeout(finish, 100);
  });
}
```
