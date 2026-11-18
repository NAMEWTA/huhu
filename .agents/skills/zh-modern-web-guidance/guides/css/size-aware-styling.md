<a id="size-aware-styling"></a>

# 感知尺寸的样式

<a id="overview"></a>

## 概述

感知尺寸的样式使组件根据可用空间，而非整个屏幕尺寸，改变布局或外观。它适合卡片、导航栏等可能放在狭窄侧边栏或宽阔主区等不同布局位置的组件。

推荐使用容器查询，因为它让组件真正模块化。无需预先知道组件放在哪里，也无需编写复杂媒体查询覆盖每一种可能布局。

<a id="implementation"></a>

## 实现

<a id="1-define-the-container"></a>

### 1. 定义容器

强制要求：必须先告诉浏览器要测量哪个元素作为容器。

```css
.card-container {
  /* Define the container type. Use 'inline-size' for width-based queries. */
  /* You can also use 'size' for both width and height, but it requires explicit sizing. */
  container-type: inline-size;
}
```

<a id="2-apply-styles-based-on-container-size"></a>

### 2. 根据容器尺寸应用样式

使用 `@container`，在容器达到指定尺寸时应用样式。

```css
/* Default styles for small containers (stacked layout) */
.card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Styles for larger containers (side-by-side layout) */
/* This triggers when the container is wider than 400px */
@container (min-width: 400px) {
  .card {
    flex-direction: row;
    align-items: center;
  }
  
  .card-image {
    width: 150px;
    height: 150px;
  }
}
```

<a id="3-conditionally-show-content"></a>

### 3. 有条件显示内容

也可以通过容器查询在空间充足时显示更多细节，空间不足时隐藏。

```css
.card-details {
  /* Hide extra details by default in small spaces */
  display: none;
}

@container (min-width: 600px) {
  .card-details {
    /* Show details when there is plenty of room */
    display: block;
  }
}
```

<a id="fallback-strategies"></a>

### 回退策略

尺寸容器查询的 Baseline 状态：广泛可用。自 2023-02-14 起达到 Baseline。
支持：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 110（2023 年 2 月）和 Safari 16（2022 年 9 月）。

对不支持容器查询的浏览器，最佳做法是使用安全默认布局（例如垂直堆叠），并在整体屏幕尺寸允许时，通过媒体查询渐进增强。

```css
/* Default safe stacked layout */
.card {
  display: flex;
  flex-direction: column;
}

/* Fallback using media queries for older browsers */
@media (min-width: 600px) {
  .card {
    flex-direction: row;
  }
}

/* Overwrite with container queries where supported */
@supports (container-type: inline-size) {
  @media (min-width: 600px) {
    .card {
      /* Reset media query fallback if needed, or let container query handle it */
      flex-direction: column;
    }
  }
  
  @container (min-width: 400px) {
    .card {
      flex-direction: row;
    }
  }
}
```

这确保旧浏览器用户仍能获得可用布局，即使它无法完美适应每一种具体容器宽度。

