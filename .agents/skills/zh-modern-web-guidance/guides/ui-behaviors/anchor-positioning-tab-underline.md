<a id="anchor-positioning-tab-underline"></a>

# 用锚点定位实现标签下划线

在标签菜单中，为活动标签添加下划线，向用户指示当前项。使用锚点定位可以在活动标签改变时，让下划线在位置之间平滑动画。如果切换标签会加载新页面，此方式不适用。

也可用此效果在垂直标签栏添加动画圆点，指示活动项。

在包含 `<li>` 的 `<ul>` 上使用 `::before` 伪元素绘制下划线。**优先使用伪元素，以保持 DOM 简洁，避免为纯装饰添加额外元素。**

```css
ul::before {
  /* 用容器上的伪元素表示动画指示器。 */
  content: '';
}
```

为活动列表项添加 `anchor-name` 使其成为锚点，值以 `--` 开头。

```css
li.active {
  /* 为活动元素设置唯一 anchor-name。 */
  anchor-name: --active;
}
```

为下划线设置与锚点 `anchor-name` 匹配的 `position-anchor`，并设 `position: absolute`，将其关联到活动项。

```css
ul::before {
  /* 将下划线绑定到活动元素。 */
  position: absolute;
  position-anchor: --active;
}
```

使用逻辑 inset 属性和 `anchor(self-start)` 或 `anchor(self-end)` 定位下划线。与 `start`、`end` 不同，这些关键字采用下划线自身的书写模式，而非其包含块的书写模式。当 RTL 标签列表位于 LTR 页面内，且下划线的任何祖先都没有在 RTL 区域内建立包含块时，这样能让锚点各边与逻辑 inset 保持一致。

```css
ul::before {
  /* 不要使用无法过渡的 position-area。 */
  /* 在指示器与标签的块结束边之间留一点间隙。 */
  inset-block-start: calc(anchor(self-end) + .1lh);
  inset-inline-start: anchor(self-start);
  inset-inline-end: anchor(self-end);
}
```

使用边框绘制下划线。不要用背景或 `box-shadow`，强制颜色模式会移除两者，使指示消失。

```css
ul::before {
  /* 应用项目的指示器样式。 */
  border-block-end: .25lh solid red;
}
```

最后，对 `inset` 属性添加过渡。

```css
ul::before {
  @media (prefers-reduced-motion: no-preference) {
    /* 必须：将过渡包在 prefers-reduced-motion 媒体查询内，尊重用户偏好。 */
    transition: inset .2s;
  }
}
```

这只是视觉指示，不能替代合适的 `aria-current="page"` 或 `aria-selected` 值。

```html
<!-- 必须：除了可见的标签下划线，还要向辅助技术提供明确状态。 -->
<nav aria-label="Primary">
  <ul>
    <li class="active">
      <a href="/home" aria-current="page">Home</a>
    </li>
    <li>
      <a href="/about">About</a>
    </li>
  </ul>
</nav>
```

<a id="fallback-strategies"></a>

## 回退策略

### 锚点定位

css.types.anchor 能力的 Baseline 状态：新近可用。自 2026-01-13 起纳入 Baseline。
支持版本：Chrome 125（2024 年 5 月）、Edge 125（2024 年 5 月）、Firefox 147（2026 年 1 月）和 Safari 26（2025 年 9 月）。

如果浏览器不支持这里使用的锚点定位，隐藏伪元素，并在活动标签上绘制静态 `border-block-end`。边框会遵循标签的书写模式。

```css
@supports not (position-anchor: --active) {
  ul::before {
    content: none;
  }

  ul li.active {
    /* 选择适合应用主题的颜色。 */
    border-block-end: .25lh solid currentColor;
  }
}
```

### 锚点定位动画

锚点定位动画与过渡的浏览器支持：有限可用。
支持版本：Chrome 125（2024 年 5 月）、Edge 125（2024 年 5 月）和 Safari 26（2025 年 9 月）。
不支持：Firefox。

如果浏览器能定位下划线，但不能对 `anchor()` 值作过渡，则保留锚定的下划线。选择变化时，它会直接移到新的活动标签。
