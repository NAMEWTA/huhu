<a id="defer-work-until-scroll-ends"></a>

# 将工作推迟到滚动结束

网页滚动应当流畅、响应及时。在滚动期间执行繁重任务，例如重新计算布局、发送分析数据跟踪信标或动态更新 DOM，可能占满主线程，造成丢帧和布局抖动。

过去，开发者依赖 `setTimeout()` 对 `scroll` 事件进行防抖，以猜测滚动何时结束。但这类防抖函数并不可靠，可能在用户仍在滚动时触发。

`scrollend` 事件提供了可靠、注重性能的解决方式。浏览器会在滚动真正停稳、所有过渡结束、触摸手势释放后，准确触发 `scrollend` 事件。

<a id="how-to-implement"></a>

## 如何实现

实现推迟工作模式的步骤：

1. **设置可滚动容器**：创建一个使用 `overflow: auto` 或 `overflow: scroll` 的容器。
2. **监听 `scroll` 事件**：此监听器仅用于基本的动态指标或信息性布局样式，不要在此执行繁重工作。
3. **监听 `scrollend` 事件**：在滚动容器或文档本身注册 `scrollend` 回调。
4. **在回调中执行高开销工作**：此时可以安全获取动态内容，或触发全面的 DOM 布局。

<a id="example-code"></a>

## 示例代码

```css
.scroll-container {
  height: 300px;
  overflow-y: auto;
}
```

```javascript
const scroller = document.querySelector('.scroll-container');

// 1. Informative feedback during scroll
scroller.addEventListener('scroll', () => {
  // Avoid dynamic heavier data updates here
  console.log('Scrolling dynamically... updates deferred');
});

// 2. Safe callback when scrolling rests
scroller.addEventListener('scrollend', () => {
  // Run layout recalculations or analytical beacons updates here
  const currentVisibleSection = findMostVisibleSection(scroller);
  fetchAdditionalData(currentVisibleSection);
});
```

<a id="strategic-implementation--best-practices"></a>

## 实现策略与最佳实践

- **应当**在发送布局数据信标或动态获取新内容时使用 `scrollend`，替代经过防抖的 `scroll` 事件。
- **应当**在构建轮播或用户评价幻灯片时，考虑将此模式与 `scrollSnapChange` 或 `scrollSnapChanging` 吸附交互结合。
- **不要**把依赖布局的动态更新塞进动态视觉滚动回调。
- **应当**考虑到视觉视口的缩放和滚动也会正确触发 `scrollend` 事件。

<a id="fallback-strategy"></a>

## 回退策略

scrollend 的 Baseline 状态：Newly available。自 2025-12-12 起纳入 Baseline。
支持的浏览器：Chrome 114（2023 年 5 月）、Edge 114（2023 年 6 月）、Firefox 109（2023 年 1 月）和 Safari 26.2（2025 年 12 月）。

对于不支持的浏览器，回退到使用 `setTimeout` 对 `scroll` 事件进行防抖，并派发自定义 `scrollend` 事件。

```javascript
function initializeDemo() {
  const scroller = document.querySelector('#scroller');
  scroller.addEventListener('scrollend', () => {
    // Safe execution
  });
}

if ('onscrollend' in window) {
  initializeDemo();
} else {
  initializeDemo();
  const scroller = document.querySelector('#scroller');
  scroller.addEventListener('scroll', () => {
    clearTimeout(window.scrollendtimer);
    window.scrollendtimer = setTimeout(() => {
      scroller.dispatchEvent(new CustomEvent('scrollend'));
    }, 100);
  });
}
```
