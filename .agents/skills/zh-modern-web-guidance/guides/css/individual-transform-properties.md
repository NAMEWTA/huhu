<a id="individual-transform-properties"></a>

# 独立变换属性

`transform` 属性允许按指定顺序应用多个变换，但修改其中一个变换时，必须重新写出整条变换链，因此很难单独为一个变换设置动画或过渡。

独立 CSS 变换属性（`translate`、`rotate`、`scale`）允许脱离 `transform` 属性独立应用变换，更容易只覆盖某一个变换，例如在 `:hover` 时修改。

<a id="key-implementation-details"></a>

### 关键实现细节

无论这些属性在 CSS 中的顺序如何，独立变换都按以下**固定顺序**应用：
1. `translate`
2. `rotate`
3. `scale`
4. `transform`（最后应用）

如果需要其他顺序（例如先缩放再旋转），仍须使用 `transform` 中的函数。

transform 函数不会覆盖独立变换属性。例如 `scale: 2; transform: scale(3);` 会先放大 2 倍，再放大 3 倍，总共放大 6 倍。

<a id="preventing-unexpected-changes-in-stacking-contexts-and-containing-blocks"></a>

### 避免层叠上下文与包含块发生意外变化

`transform` 及独立变换属性会影响页面布局和渲染，可能导致 z-index 或锚点定位出现意外行为。强制要求：如果元素可能在 `:hover` 等状态变化、过渡或动画中应用变换，应在元素基础状态设置恒等变换。这样应用变换时，元素的层叠上下文和包含关系就不会改变。

```css
.element{
  /* MANDATORY: Apply identity transformations for properties that will
     change on state changes (like :hover). This prevents unexpected layout
     or z-index shifts caused by creating a new stacking context only on hover. */
  translate: 0px;
  rotate: 0deg;
  scale: 1;
}
.element:hover{
  translate: 10px 10px;
  rotate: 20deg;
  scale: 0.8;
}
```

<a id="independent-animation-and-transitions"></a>

### 独立动画与过渡

主要好处是可以定义互相重叠但针对不同属性的动画或过渡，且不会冲突。

```css
.card {
  /* Define independent animations that don't overwrite each other */
  animation: float 3s infinite ease-in-out;
  
  /* Transition only the scale property for hover states */
  transition: scale 0.3s ease;

  /* Establish the base scale to prevent a sudden stacking context shift when transitioning on hover. */
  scale: 1;
}

.card:hover {
  /* Only the scale changes; the 'float' animation (translate) continues uninterrupted */
  scale: 1.05;
}

@keyframes float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -10px; }
}
```

<a id="fallback-strategies"></a>

### 回退策略

独立变换属性的 Baseline 状态：广泛可用。自 2022-08-05 起达到 Baseline。
支持：Chrome 104（2022 年 8 月）、Edge 104（2022 年 8 月）、Firefox 72（2020 年 1 月）、Safari 14.1（2021 年 4 月）和 Safari iOS 14.5（2021 年 4 月）。

不支持独立变换属性的浏览器使用传统 `transform`。注意：若要在其他状态修改其中一部分，必须重新声明完整变换栈。

```css
.element {
  /* Base transform */
  transform: translate(100px, 0) rotate(45deg);
  /* Specify the identity for the scale property. */
  scale: 1;
}

@supports not (translate: 0px) {
  .element:hover {
    /* Fallback: Must repeat translate and rotate even if only scale changes */
    transform: translate(100px, 0) rotate(45deg) scale(1.1);
  }
}

@supports (translate: 0px) {
  .element:hover {
    /* Modern: Only declare the change */
    scale: 1.1;
  }
}
```

