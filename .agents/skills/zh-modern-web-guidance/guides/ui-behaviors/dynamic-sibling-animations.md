<a id="creating-a-stagger-animation"></a>

# 创建交错动画

交错动画让多个有序元素依次播放，彼此有短暂延迟，而非同时动画。这常用于列表、图库或导航菜单，引导用户视线，让交互具有精致且有节奏的感受。

<a id="stagger-animations-with-sibling-index"></a>

## 用 `sibling-index()` 实现交错动画

在 `animation-delay` 中使用 `sibling-index()`，使每个元素的延迟与其在父级中的位置成比例。`sibling-index()` 返回从 1 开始的整数，乘以时间值即可生成延迟。

```css
#stagger-list > .item {
  --stagger-time: 0.1s; /* Example step delay */
  /* Hold initial keyframe during each sibling's stagger delay */
  animation: fade-in 0.4s both;
  /* Offset each sibling's delay by its 1-based index */
  animation-delay: calc(sibling-index() * var(--stagger-time));
}
```

**必须：** 尊重用户偏好，为偏好减少动态效果的用户禁用动画。

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable animation for users who prefer reduced motion. */
  #stagger-list > .item {
    animation: none;
  }
}
```

<a id="fallback-strategies"></a>

## 回退策略

sibling-count() 和 sibling-index() 的 Baseline 状态：新近可用。自 2026-08-18 起纳入 Baseline。
支持版本：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 154（2026 年 8 月）和 Safari 26.2（2025 年 12 月）。

目标 Baseline 不支持 `sibling-index()` 时，进行特性检测，让旧浏览器仍有交错动画。检测必须用字面时间值：CSS 中 `@supports (animation-delay: calc(sibling-index() * 0.1s))`，JavaScript 中 `!CSS.supports('animation-delay: calc(sibling-index() * 0.1s)')`。**不要**在 `@supports` 或 `CSS.supports()` 中引用 `var()`，自定义属性引用在所有浏览器都可解析为有效，使检查始终为 `true`。

动态列表或新实现可用 JavaScript 为每个子元素设置从 1 开始的 `--sibling-index`。**必须：** 包在 `!CSS.supports('animation-delay: calc(sibling-index() * 0.1s)')` 检查中，避免支持浏览器运行多余 JS。

```js
if (!CSS.supports('animation-delay: calc(sibling-index() * 0.1s)')) {
  const staggerList = document.getElementById('stagger-list');
  [...staggerList.children].forEach((el, index) => {
    el.style.setProperty('--sibling-index', index + 1);
  });
}
```

基础 `animation-delay` 用 `var(--sibling-index)`；**必须**将 `sibling-index()` 覆盖放在 `@supports (animation-delay: calc(sibling-index() * 0.1s))` 中。由于 `calc(sibling-index() * var(--stagger-time))` 含 `var(--stagger-time)`，CSS 将语法校验推迟到计算值阶段；没有 `@supports` 时，不支持 `sibling-index()` 的浏览器会在解析阶段接受第二条声明、丢弃回退，然后因计算值无效（Invalid at Computed-Value Time）将 `animation-delay` 重置为 `0s`。

```css
#stagger-list > .item {
  --stagger-time: 0.1s; /* Example step delay */
  animation: fade-in 0.4s both;
  animation-delay: calc(var(--sibling-index) * var(--stagger-time));
}

/* MANDATORY: Gate sibling-index() in @supports using a literal time unit */
@supports (animation-delay: calc(sibling-index() * 0.1s)) {
  #stagger-list > .item {
    animation-delay: calc(sibling-index() * var(--stagger-time));
  }
}
```

重构现有 `:nth-child()` 交错样式且不宜添加客户端 JS 时（例如固定少量项目的静态或服务端渲染 CSS），将 `:nth-child()` 延迟规则保留在 `@supports not (animation-delay: calc(sibling-index() * 0.1s))` 中，不用 JS 注入 `--sibling-index`。把 `:nth-child()` 包在 `@supports not (...)` 中，可防止更高优先级的 `:nth-child()` 选择器 在支持浏览器覆盖 `sibling-index()`：

```css
#stagger-list > .item {
  --stagger-time: 0.1s; /* Example step delay */
  animation: fade-in 0.4s both;
}

/* Literal time in @supports avoids var() always-true parsing */
@supports (animation-delay: calc(sibling-index() * 0.1s)) {
  #stagger-list > .item {
    animation-delay: calc(sibling-index() * var(--stagger-time));
  }
}

/* Gate :nth-child() so its higher specificity doesn't override sibling-index() */
@supports not (animation-delay: calc(sibling-index() * 0.1s)) {
  #stagger-list > .item:nth-child(1) { animation-delay: 0.1s; }
  #stagger-list > .item:nth-child(2) { animation-delay: 0.2s; }
  #stagger-list > .item:nth-child(3) { animation-delay: 0.3s; }
}
```
