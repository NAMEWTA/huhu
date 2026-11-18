<a id="fluid-scaling"></a>

# 流式缩放

<a id="overview"></a>

## 概述

流式缩放使组件能够根据当前尺寸调整内部比例，例如字号和间距。与在固定断点间跳变相比，这样的设计更协调。

过去通常通过视口单位实现流式缩放，即随屏幕尺寸变化；现代容器查询单位则使组件相对于父容器缩放。因此无论组件置于布局何处，都能保持良好外观，并改善组件隔离和复用。

<a id="implementation"></a>

## 实现

<a id="1-define-a-container"></a>

### 1. 定义容器

使用容器查询单位前，必须先在父元素上定义包含上下文。

```css
.component-wrapper {
  /* Define the container type. Use 'inline-size' for width-based scaling. */
  /* You can also use 'size' for both width and height, but it requires explicit sizing. */
  container-type: inline-size;
  
  /* Optional: Name the container for specific targeting */
  container-name: fluid-card;
}
```

<a id="2-use-container-query-units"></a>

### 2. 使用容器查询单位

使用 `cqi`、`cqb` 等容器查询单位，设置相对于容器尺寸的值。

* `cqi`：容器行内尺寸的 1%（水平书写时为宽度）。
* `cqb`：容器块尺寸的 1%（水平书写时为高度）。

**注意**：容器单位可以直接用于任何属性，无需 `@container` 查询规则。它们会根据最近一个已定义 `container-type` 的祖先自动解析。

```css
.component-title {
  /* Scale font size based on container width */
  /* 10cqi means 10% of the container's width */
  font-size: 10cqi;
}

.component-body {
  /* Scale padding based on container width */
  padding: 5cqi;
}
```

<a id="3-constrain-values-with-clamp"></a>

### 3. 使用 `clamp()` 约束值

为防止尺寸过大或过小，使用 CSS `clamp()`。它会影响用户缩放或调整基础字号的能力。为确保文本符合无障碍指南，最大值不能超过最小值的 2.5 倍。

**不要**在用户通过浏览器放大时缩小容器。这样才能在浏览器放大时将文本调整至默认尺寸的 200%，符合 WCAG 1.4.4 Resize Text（AA 级）。

```css
.component-title {
  /* Clamp font size between 1rem and 2.5rem, scaling with 5% of container width */
  font-size: clamp(1rem, 5cqi, 2.5rem);
}
```

<a id="fallback-strategies"></a>

### 回退策略

尺寸容器查询的 Baseline 状态：广泛可用。自 2023-02-14 起达到 Baseline。
支持：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 110（2023 年 2 月）和 Safari 16（2022 年 9 月）。

浏览器不支持容器查询时，应使用视口单位或标准媒体查询提供回退。

```css
.component-title {
  /* Fallback for browsers that do not support container units */
  font-size: clamp(1rem, 5vw, 2.5rem);
}

@supports (font-size: 1cqi) {
  .component-title {
    /* Use container units where supported */
    font-size: clamp(1rem, 5cqi, 2.5rem);
  }
}
```

此回退仍让文本缩放，但依据屏幕宽度而非组件宽度。应测试确认它适合你的场景。

