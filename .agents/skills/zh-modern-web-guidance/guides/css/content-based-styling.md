<a id="content-based-styling"></a>

# 根据内容设置样式

过去，要根据组件内容应用不同布局，需要 JavaScript 或 HTML 模板语言中的条件逻辑注入 `.card--has-image`、`.card--text-only` 等修饰类。

`:has()` 伪类作为父选择器，消除了这种需要。它可以根据指定后代元素存在与否，有条件地为容器设置样式。

使用 `:has()`，可以完全通过 CSS 根据组件实际 DOM 内容定义不同布局变体。还可以结合 `:not()`，明确选择**不存在**某内容的情况以定义默认布局。

<a id="implementing-content-based-container-styling"></a>

### 实现基于内容的容器样式

**强制要求**：必须在容器元素上使用 `:has()`，检测指定子内容是否存在。

构建根据内容改变布局的组件：

1. **定义默认样式**：向容器应用基础布局（例如简单的单列堆叠）。
2. **应用基于内容的覆盖**：使用 `:has([child-selector])` 选择容器，为内容存在的情况应用新布局（例如多列网格）。

*示例：存在图片时切换为并排布局的卡片。*

```css
/* 1. Define the default state on the component container */
/* This applies when there is NO image */
.article-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}

/* 2. Apply styles when a specific child element is present */
/* MANDATORY: Target the container and use :has() to check for the descendant */
.article-card:has(img) {
  /* Change the layout to a row if an image exists */
  flex-direction: row;
  align-items: center;
}

/* Optional: Style the image itself (no :has() needed here) */
.article-card img {
  width: 150px;
  height: auto;
  border-radius: 4px;
}

/* You can also combine :has() and :not() to explicitly target the ABSENCE of content */
/* This selects a card that DOES NOT have an image */
.article-card:not(:has(img)) {
  /* E.g., apply a different background color for text-only cards */
  background-color: #f9f9f9;
}
```

```html
<!-- Assume an <h1> precedes these components in the document layout -->
<!-- A card WITH an image (will use row layout) -->
<article class="article-card">
  <img src="thumbnail.jpg" alt="Article thumbnail" />
  <div class="content">
    <h2>Card With Image</h2>
    <p>This card lays out its content horizontally.</p>
  </div>
</article>

<!-- A card WITHOUT an image (will use default column layout) -->
<article class="article-card">
  <div class="content">
    <h2>Text-Only Card</h2>
    <p>This card lays out its content vertically, and gets its background color from the :not(:has()) rule.</p>
  </div>
</article>
```

**性能提示**：使用 `:has()` 时，将选择器限定到尽可能具体的组件容器（例如 `.article-card`）。如果样式变化很局部，避免以 `body:has(img)` 等高层元素作锚点，因为宽泛的 `:has()` 查询可能触发更多布局重新计算。

<a id="fallback-strategies"></a>

### 回退策略

:has() 的 Baseline 状态：广泛可用。自 2023-12-19 起达到 Baseline。
支持：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 121（2023 年 12 月）和 Safari 15.4（2022 年 3 月）。

如果基于内容的布局样式对用户体验或页面设计至关重要，必须为不支持 `:has()` 的浏览器提供回退。纯装饰效果可以将 `:has()` 作为无需回退的渐进增强。

**强制要求**：为关键布局实现回退时，必须在 CSS 中使用 `@supports not selector(:has(*))` 定义传统的类回退（例如 `.has-image`）。

与基于交互状态的样式不同，内容是否存在通常在渲染时已知。最稳妥的回退是：如果数据中存在子元素（例如图片），由服务端模板引擎或静态站点生成器为容器注入 `.has-image` 等类。

如果不能服务端渲染，必须用包含 `CSS.supports()` 的小脚本检测内容，并在加载时或动态内容注入后添加该类。

```css
/* Fallback CSS for older browsers */
/* We check if the browser DOES NOT support the :has() selector */
@supports not selector(:has(*)) {
  /* Define a traditional modifier class that applies the exact same layout overrides */
  .article-card.has-image {
    flex-direction: row;
    align-items: center;
  }
  
  .article-card:not(.has-image) {
    background-color: #f9f9f9;
  }
}
```

```javascript
/* Fallback JavaScript for older browsers (if not using SSR to add the class) */
/* Check for support before running the script to avoid unnecessary work in modern browsers */
if (!CSS.supports('selector(:has(*))')) {
  // Find all components that need checking
  const cards = document.querySelectorAll('.article-card');
  
  cards.forEach(card => {
    // If the critical content exists, manually add the fallback class
    if (card.querySelector('img')) {
      card.classList.add('has-image');
    }
  });
}
```

