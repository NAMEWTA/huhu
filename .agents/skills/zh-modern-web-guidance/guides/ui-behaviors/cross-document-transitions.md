<a id="cross-document-transitions"></a>

# 跨文档过渡

跨文档视图过渡可在多页应用（MPA）的不同页面之间创建平滑、类似应用的效果。浏览器默认交叉淡入淡出，也可自定义以匹配站点风格。

<a id="implementation-steps"></a>

### 实现步骤

<a id="1-opt-in-to-cross-document-view-transitions"></a>

#### 1. 启用跨文档视图过渡

源页与目标页都必须启用，浏览器才会在导航时触发。

```css
/* Respect user's preference for reduced motion */
@media (prefers-reduced-motion: no-preference) {
  /* Add to a global stylesheet shared by both pages */
  @view-transition {
    /* Enables transitions for same-origin navigations */
    navigation: auto;
  }
}
```

<a id="2-customize-transition-animations-optional"></a>

#### 2. 自定义过渡动画（可选）

通过伪元素选中过渡的旧状态和新状态，实现滑动或揭示等效果。

```css
/* Customizing the outgoing page animation */
::view-transition-old(root) {
  /* Move the old page out to the left */
  animation: 0.4s ease-in both slide-out;
}

/* Customizing the incoming page animation */
::view-transition-new(root) {
  /* Move the new page in from the right */
  animation: 0.4s ease-out both slide-in;
}

@keyframes slide-out {
  to { transform: translateX(-20%); opacity: 0; }
}

@keyframes slide-in {
  from { transform: translateX(100%); }
}
```

<a id="3-create-directional-transitions-optional"></a>

#### 3. 创建有方向的过渡（可选）

根据导航页面组合，可能需要不同效果。例如首页进入联系页时，希望新内容从右侧进入；返回首页时，使用同样效果就不合理。

如果目标页无论从哪里进入都使用同一过渡类型，可以在 `@view-transition` 的 `types` 中指定。

```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition {
    navigation: auto;
    /* Specify the types of view transitions that will always be used on this page. */
    types: previous;
  }
}
```

也可以在 `pagereveal` 事件监听器中按条件指定类型。

```js
window.addEventListener("pagereveal", async (e) => {
  if (e.viewTransition && window.navigation?.activation) {
    // Use application-specific logic to compute a transition type
     const transitionType = yourTransitionTypeLogic(navigation.activation.from, navigation.activation.entry);
    e.viewTransition.types.add(transitionType);
  }
});
```

再用 `:active-view-transition-type()` 伪选择器为不同类型应用不同动画。

```css
:active-view-transition-type(next) {
  &::view-transition-old(root) {
    animation-name: slide-out-next;
  }

  &::view-transition-new(root) {
    animation-name: slide-in-next;
  }
}
:active-view-transition-type(previous) {
  &::view-transition-old(root) {
    animation-name: slide-out-previous;
  }

  &::view-transition-new(root) {
    animation-name: slide-in-previous;
  }
}
```

<a id="fallback-strategies"></a>

### 回退策略

View transitions 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 144（2025 年 10 月）和 Safari 18（2024 年 9 月）。

Cross-document view transitions 的浏览器支持：有限可用。
支持版本：Chrome 126（2024 年 6 月）、Edge 126（2024 年 6 月）和 Safari 18.2（2024 年 12 月）。
不支持：Firefox。

不支持视图过渡或跨文档视图过渡时，浏览器执行标准即时页面导航。跨文档过渡是渐进增强，不影响站点核心功能。

在 JavaScript 中检测支持：

```javascript
if ('onpagereveal' in window) {
  // Browser supports cross-document view transitions
}
```

Navigation API 的 Baseline 状态：新近可用。自 2026-01-13 起纳入 Baseline。
支持版本：Chrome 102（2022 年 5 月）、Edge 102（2022 年 5 月）、Firefox 147（2026 年 1 月）和 Safari 26.2（2025 年 12 月）。

不支持 Navigation API 时，无法用它决定过渡类型。应采用其他判断方法，或提供回退类型；否则浏览器执行标准即时导航。

在 JavaScript 中检测支持：

```javascript
if (window.navigation?.activation) {
  // Browser supports the Navigation API
}
```