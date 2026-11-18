<a id="set-a-scroll-target-for-the-initial-render"></a>

# 设置初始渲染的滚动目标

CSS `scroll-initial-target` 提供声明式纯 CSS 方法，在滚动容器一渲染就把特定后代带入可见区域。过去依赖 JavaScript（`Element.scrollIntoView()`）或 URL 片段（`#item-id`），两者都有局限且实现棘手。

<a id="how-to-implement"></a>

## 实现方法

成功实现需要：

1. **确保有滚动容器：** 目标位于允许滚动的 overflow 元素（如 `overflow: auto`）内部。可以是任意祖先，包括根 `<html>`。
2. **指定项目：** 对需要进入视野的后代应用 `scroll-initial-target: nearest`。

<a id="example-code-vertical-media-feed"></a>

## 示例代码：垂直媒体信息流

此例从特定“精选”项开始，而不是列表顶部。

```css
/** 
 * TARGET: The item that should be visible on initial load.
 */
.item.target {
  scroll-initial-target: nearest;
}
```

<a id="strategic-implementation--best-practices"></a>

## 实现策略与最佳实践

- **要**用 `scroll-initial-target` 实现“从中间开始”的体验，例如日历定位今天、图库定位特定图片。
- **不要**与无障碍焦点混淆。此属性只移动**视觉**视口，不移动键盘焦点。目标应成为键盘起点时，需手动管理 `element.focus()`。
- **不要**用于加载时需要平滑滚动动画的场景；属性为离散，在布局阶段即时定位。
- **不要**在同一滚动容器的多个元素上设置 `scroll-initial-target`。多个元素指定 `scroll-initial-target: nearest` 时，浏览器选择 DOM 顺序第一个。
- **要**为媒体提供尺寸。位置在初始布局计算，图片视频应有 `aspect-ratio` 或固定 `height`/`width`，防止加载后目标偏移。
- **要**考虑**优先级层次**：URL 片段（如 `example.com/#top`）和容器级 `scroll-start` 都优先于 `scroll-initial-target`。

<a id="fallback-strategy"></a>

## 回退策略

scroll-initial-target 的浏览器支持：有限可用。
支持版本：Chrome 133（2025 年 2 月）和 Edge 133（2025 年 2 月）。
不支持：Firefox 和 Safari。

尚不支持时使用 JS 回退。`DOMContentLoaded` 确保 HTML 解析完成即滚入，比等待全部图片资源更快。也可把脚本放在 `<body>` 末尾，无需监听事件。

```javascript
/**
 * Progressive Enhancement Fallback
 */
document.addEventListener("DOMContentLoaded", () => {
  // Check for native CSS support
  if (!CSS.supports("scroll-initial-target", "nearest")) {
    const feedTarget = document.querySelector(".item.target");
    if (feedTarget) {
      // 'block: center' ensures the featured media is centered in view
      feedTarget.scrollIntoView({ behavior: "instant", block: "center" });
    }
  }
});
```
