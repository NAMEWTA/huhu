<a id="state-aware-sticky-headers"></a>

# 感知状态的粘性页头

粘性页头是常见 UI 模式，但在“吸附”后往往需要改变外观，以维持可读性或节省空间。传统方案需要 JavaScript 滚动监听器，可能造成性能问题。现代 CSS 可以通过**滚动状态查询**原生处理。

<a id="implementation-steps"></a>

## 实现步骤

<a id="1-create-the-sticky-container"></a>

### 1. 创建粘性容器

需要一个同时作为粘性元素和滚动状态查询容器的容器。

```html
<!-- Wrap in a section to define the containment area for the sticky element -->
<div class="section">
  <div class="sticky-container">
    <div class="sticky-header">
      Section Header
    </div>
  </div>
  <div class="content">
    <!-- Content goes here -->
  </div>
</div>
```


<a id="2-apply-css-for-sticky-behavior-and-container-type"></a>

### 2. 设置粘性行为与容器类型的 CSS

在 `position: sticky` 元素上设置 `container-type: scroll-state`，不要设在可滚动祖先上。始终指定 `container-name`，因为查询可能嵌套，未命名容器会冲突。也可以与尺寸查询组合，例如 `container-type: scroll-state inline-size`。

```css
.sticky-container {
  position: sticky;
  top: 0;
  /* MANDATORY: Always specify a container name to avoid collisions if CQs are nested */
  container-type: scroll-state;
  container-name: section-header;
  z-index: 10;
}

.sticky-header {
  /* Base styles for the header */
  background: #f0f0f0;
  padding: 20px;
  transition: background-color 0.3s, box-shadow 0.3s;
}
```


**重要：**由滚动状态容器的**后代**查询滚动状态。`@container` 查询中的样式不会作用于 `.sticky-container` 自身，而会作用于它的子元素（如 `.sticky-header`）。不能通过容器自身的滚动状态查询来设置容器元素样式。

给滚动视口添加 `scroll-padding-top`，将值设为不小于粘性元素高度。这样控件获得焦点时，应能始终显示在粘性内容下方，符合 WCAG 2.4.11 焦点不被遮挡（最小值），该标准要求获得焦点的组件不能被完全遮住。

```css
html {
  /* Accounts for the height of the header */
  scroll-padding-top: var(--header-height); 
}
```


<a id="3-target-the-stuck-state"></a>

### 3. 匹配吸附状态

使用 `@container scroll-state(...)` 查询，在页头吸附时应用样式。

```css
/* Apply styles when the named container is stuck at the top */
@container section-header scroll-state(stuck: top) {
  .sticky-header {
    background: #0056b3;
    color: white;
    box-shadow: 0 4px 6px rgb(0 0 0 / 0.15);
  }
}
```


**提示：**也可以使用 `stuck: block-start` 或 `stuck: inline-start` 等逻辑属性，查询相对于排版流的边缘而非物理边缘，更好地支持国际化（i18n）和从右到左（RTL）布局。

<a id="notes-on-dimension-changes"></a>

### 尺寸变化注意事项

如果没有禁用滚动锚定，在吸附状态改变影响布局的属性（height、padding、font-size）可能造成视觉闪烁。粘性元素下方普通流内容的滚动锚定会调整滚动偏移，以补偿布局变化，从而把元素推离吸附位置并引发振荡。

禁用粘性元素父级的滚动锚定，可以避免这一问题：

```css
.section {
  overflow-anchor: none;
}
```


将 `overflow-anchor: none` 应用于 `position: sticky` 元素的直接父级，不要作用于 `:root` 或 `body`，否则会禁用整个页面的滚动锚定。这样设置后，就能在吸附状态自由修改任意属性，包括盒模型属性和 transform。

不要：对吸附在**底部**的元素依赖 `overflow-anchor: none`。滚动锚定只补偿当前滚动位置上方的布局偏移，因此对底部吸附元素无效。对底部吸附页头，避免在吸附状态修改盒模型属性。

<a id="fallback-strategies"></a>

### 回退策略

容器滚动状态查询的浏览器支持状态：有限可用。
支持的浏览器：Chrome 144（2026 年 1 月）和 Edge 144（2026 年 1 月）。
不支持：Firefox 和 Safari。

滚动状态查询属于渐进增强。不支持 `container-type: scroll-state` 的浏览器中，页头仍会因 `position: sticky` 而吸附顶部，但不会改变外观。多数场景推荐采用这种方式。

如果粘性并非必要，而没有差异样式的 `position: sticky` 比完全不吸附体验更差，也可以将 `position: sticky` 及相关声明包在 `@supports` 查询中：

```css
.sticky-container {
  @supports (container-type: scroll-state) {
	  position: sticky;
	  top: 0;
	  container-type: scroll-state;
	  container-name: section-header;
	  z-index: 10;
	}
}
```


**提示：**如果“吸附”样式需要不同背景色来保证可读性，可考虑调整布局，让默认样式在所有地方都能工作（渐进增强）。如果必须回退，可将 `position: sticky` 行为本身放在 `@supports (container-type: scroll-state)` 查询里。

如果视觉变换对设计绝对必要（例如吸附状态加入背景或紧凑布局，没有它内容就不可读），可使用 `IntersectionObserver` 实现稳健的 JavaScript 回退。必须把 CSS 样式复制到 `.is-stuck` class 下。以下通用 polyfill 通过 `getComputedStyle` 向上遍历，找到正确滚动容器（默认视口），匹配 `@container scroll-state(stuck: top)` 的行为：

```javascript
function getScrollParent(node) {
  if (node == null || node === document.body || node === document.documentElement) {
    return null; // default to viewport
  }
  if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
    const overflow = getComputedStyle(node).overflow;
    if (overflow !== 'visible' && overflow !== 'clip') {
      return node;
    }
  }
  return getScrollParent(node.parentNode);
}

document.querySelectorAll('.sticky-container').forEach(container => {
  const root = getScrollParent(container);
  
  const topOffset = parseFloat(getComputedStyle(container).top) || 0;
  
  const observer = new IntersectionObserver(
    ([e]) => {
      // Toggle the fallback class on the sticky header container
      e.target.classList.toggle('is-stuck', e.intersectionRatio < 1);
    },
    { 
      root: root,
      threshold: [1],
      rootMargin: `-${topOffset + 1}px 0px 0px 0px` 
    }
  );
  
  observer.observe(container);
});
```


*注意：这个通用 IntersectionObserver 模式也可用作 `scroll-state(scrollable)` 查询的 polyfill。*
