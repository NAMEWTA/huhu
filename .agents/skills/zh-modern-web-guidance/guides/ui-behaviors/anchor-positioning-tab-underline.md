<a id="anchor-positioning-tab-underline"></a>

# 用锚点定位实现标签下划线

在标签菜单中，为活动标签添加下划线，向用户指示当前项。使用锚点定位可以在活动标签改变时，让下划线在位置之间平滑动画。如果切换标签会加载新页面，此方式不适用。

也可用此效果在垂直标签栏添加动画圆点，指示活动项。

在包含 `<li>` 的 `<ul>` 上使用 `::before` 伪元素绘制下划线。**优先使用伪元素，以保持 DOM 简洁，避免为纯装饰添加额外元素。**

```css
ul::before {
  /* Use a pseudo-element on the container to represent the animated indicator */
  content: '';
}
```

为活动列表项添加 `anchor-name` 使其成为锚点，值以 `--` 开头。

```css
li.active {
  /* Make a unique anchor-name for the active element. */
  anchor-name: --active;
}
```

为下划线设置与锚点 `anchor-name` 匹配的 `position-anchor`，并设 `position: absolute`，将其关联到活动项。

```css
ul::before {
  /* Tether the underline to the active element. */
  position: absolute;
  position-anchor: --active;
}
```

用 inset 属性和 `anchor()` 函数相对锚点定位下划线。

```css
ul::before {
  /* DO NOT use position-area, which can not be transitioned. */
  /* Use calc() to offset the top slightly */
  inset-block-start: calc(anchor(bottom) + .1lh);
  inset-inline-start: anchor(left);
  inset-inline-end: anchor(right);
}
```

使用边框绘制下划线。不要用背景或 `box-shadow`，强制颜色模式会移除两者，使指示消失。

```css
ul::before {
  /* Apply your project's styles for the indicator */
  border-block-end: .25lh solid red;
}
```

最后，对 `inset` 属性添加过渡。

```css
ul::before {
  @media (prefers-reduced-motion: no-preference) {
    /* MANDATORY: The transition must be wrapped in a prefers-reduced-motion media query to respect user preferences. */
    transition: inset .2s;
  }
}
```

这只是视觉指示，不能替代合适的 `aria-current="page"` 或 `aria-selected` 值。

```html
<!-- MANDATORY: Provide explicit assistive technology state alongside the visual tab underline -->
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

Anchor positioning 的浏览器支持：有限可用。
支持版本：Chrome 157（2026 年 11 月）、Edge 157（2026 年 11 月）和 Safari 27（2026 年 9 月）。
不支持：Firefox。

浏览器不支持锚点定位时，用 `border-bottom` 添加没有动画的下划线。

```css
ul li.active {
  @supports not (position-anchor: auto) {
    /* Choose a color appropriate to the app theme. */
    border-bottom: .25lh var(--primary) solid;
  }
}
```