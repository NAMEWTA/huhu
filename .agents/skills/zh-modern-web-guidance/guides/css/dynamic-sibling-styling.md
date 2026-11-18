<a id="styling-siblings-based-on-count-and-index"></a>

# 根据数量和序号为兄弟元素设置样式

过去，对列表中每个兄弟元素应用独特样式，需要复杂的 `:nth-child` 循环或 JavaScript 注入内联样式。现代 CSS 提供 `sibling-index()` 和 `sibling-count()`，直接在样式表内计算，使动态布局和配色能够随元素增删自动适应。

<a id="dynamic-color-systems"></a>

## 动态配色系统

为每个子元素计算独特的色相或明度，可以在一组兄弟元素间形成色谱。这样无论项目数量如何，都能保持一致渐变。

```css
.swatch {
  /* Calculate hue by dividing the full 360deg circle by total siblings */
  /* and multiplying by the current element's 1-based index */
  background-color: hsl(
    calc(360deg / sibling-count() * sibling-index()),
    70%,
    50%
  );
}
```

<a id="symmetrical-layout-and-fan-effects"></a>

## 对称布局与扇形效果

要创建对称效果（例如扇形或项目居中），使用总数确定列表中点。

```css
.card {
  /* Find the center index (e.g., 3 if there are 5 siblings) */
  --center: calc((sibling-count() + 1) / 2);

  /* Rotate items away from the center: negative for left, positive for right */
  /* center element gets 0deg rotation */
  transform: rotate(calc(10deg * (sibling-index() - var(--center))));
}
```

<a id="circular-and-complex-positioning"></a>

## 环形与复杂定位

将这些函数与 CSS 三角函数（`sin()`、`cos()`）结合，无需手动坐标即可将元素排列成完整圆形。

```css
.orb {
  /* Calculate the angle for this item's position on a 360deg circle */
  --angle: calc(360deg / sibling-count() * sibling-index());
  --radius: 150px;

  /* Set the pre-transformed position for all items to be centered */
  position: absolute;
  place-self: center;


  /* Position each element around the parent center */
  transform: translate(
    calc(cos(var(--angle)) * var(--radius)),
    calc(sin(var(--angle)) * var(--radius))
  );
}
```

<a id="fallback-strategies"></a>

### 回退策略

sibling-count() 和 sibling-index() 的 Baseline 状态：新近可用。自 2026-08-18 起达到 Baseline。
支持：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 154（2026 年 8 月）和 Safari 26.2（2025 年 12 月）。

不支持 `sibling-index()`、`sibling-count()` 时，通过 JavaScript 注入 CSS 自定义属性提供回退。**强制要求：** 用 `CSS.supports()` 检测特性，确保脚本只在必要时执行。

```js
/* MANDATORY: Check for native support before applying fallback */
if (!CSS.supports('top: calc(sibling-index() * 1px)')) {
  const items = document.querySelectorAll('.item');
  items.forEach((item, index) => {
    /* MANDATORY: Injected index must be 1-based to match native function */
    item.style.setProperty('--sibling-index', index + 1);
    item.style.setProperty('--sibling-count', items.length);
  });
}
```

在 CSS 中以这些变量为基础，再在 `@supports` 块内用原生函数覆盖。**强制要求：** 必须用 `@supports` 包裹原生函数覆盖，保证旧浏览器中变量仍有效。

```css
.item {
  /* 1. Set base values using variables (from JS fallback) */
  --index: var(--sibling-index);
  --count: var(--sibling-count);

  /* 2. Use the computed variables - replace this with your implementation-specific styles */
  background-color: hsl(calc(360deg / var(--count) * var(--index)), 70%, 50%);
}

@supports (top: calc(sibling-index() * 1px)) {
  .item {
    /* 3. Override with native functions ONLY if supported */
    --index: sibling-index();
    --count: sibling-count();
  }
}
```

