<a id="defer-rendering-heavy-content"></a>

# 推迟渲染繁重内容

内容较多的网页，例如无限滚动列表、复杂仪表板或信息密集的文章，可能出现初始渲染缓慢和交互迟钝。现代 Web 技术可以推迟处理当前不可见内容的渲染工作，在不破坏无障碍体验或用户预期的前提下显著提升性能。

可以使用 CSS 的 `content-visibility` 属性和 HTML 的 `hidden="until-found"` 属性优化渲染。两者都能改善性能，但适用场景不同。

<a id="when-to-use-which"></a>

## 如何选择

| 场景 / 示例 | 使用的特性 | 性能收益 |
| :--- | :--- | :--- |
| **1. 首屏以下**（推迟初始加载） | **`content-visibility: auto`** | 浏览器会自动推迟布局与绘制工作，直到容器滚动到接近视口的位置，让常规页面加载保持顺畅。 |
| **2. 状态切换**（快速切换视图） | **`content-visibility: hidden`** | 跳过隐藏 div 的布局计算，但保留样式包含状态，从而无需结构变化即可即时切换，优于 `display: none`。 |
| **3. 可搜索且延迟渲染**（可折叠的展开内容） | **`hidden="until-found"`** | 将渲染性能与页内查找的可访问性结合的详细方法，参见 `search-hidden-content`（通过 `npx -y modern-web-guidance@latest retrieve "search-hidden-content"` 获取）。 |

<a id="how-to-implement-content-visibility-auto"></a>

## 如何实现 `content-visibility: auto`

<a id="choosing-off-screen-content"></a>

### 选择屏幕外内容

**必须**：仔细确定哪些元素适合设置 `content-visibility: auto`。
- **应当**选择完全位于**初始首屏以下**、体积较大且布局自包含的区块，例如无限信息流中的卡片项、末尾评论，或页面底部内容较重的布局区域。
- **不要**将此属性应用到初始首屏视口内的元素。这样会迫使浏览器在渲染前计算可见性边界，反而拖慢关键页面加载性能。
- **应当**选择内部 DOM 结构较深或较复杂的元素，以尽可能减少渲染成本。

<a id="implementation-steps"></a>

### 实现步骤

1. **必须**：识别已经确认在初始加载时位于屏幕外的繁重区域。
2. **必须**：为每个这样的屏幕外元素设置 `content-visibility: auto`。
3. **必须**：通过 `contain-intrinsic-size` 为每个元素提供预计布局尺寸。

<a id="how-to-use-contain-intrinsic-size"></a>

### 如何使用 `contain-intrinsic-size`

**必须**：将 `content-visibility: auto` 与 `contain-intrinsic-size` 配合使用。否则，浏览器会在元素位于屏幕外时将其高度压缩为 0px，用户滚动时就会出现严重的布局位移和滚动条跳动。

CSS 简写属性 `contain-intrinsic-size` 用来提供占位尺寸。使用 `auto` 关键字，浏览器就能在元素真正渲染后“记住”其准确尺寸；元素再次离开屏幕时，会使用计算后的尺寸代替原占位值。

<a id="example-code"></a>

### 示例代码

```css
/* DO ONLY apply this class to items OUTSIDE the initial layout viewport */
.heavy-section-deferred {
  /* MANDATORY: Skips rendering calculations when off-screen */
  content-visibility: auto;
  
  /* Mandatory: Provide an estimated size to prevent layouts shifts.
    - 'auto' is optional and enables the browser to remember the actual size
      once rendered. It must be paired with a <length> value to be used for
      the first render.
    - 'none' tells the browser not to apply any intrinsic width to this element.
      It can be used for either the height or the width value.
    - '150px' is the estimated height of this element. This can be any valid
      CSS <length> value.
   */
  contain-intrinsic-size: auto none auto 150px; 
}
```

<a id="how-to-implement-content-visibility-hidden"></a>

## 如何实现 `content-visibility: hidden`

1. **识别繁重区域**：找到初始隐藏的布局区块，例如大型数据表格中的附加行。
2. **应用 CSS**：给元素添加 `content-visibility: hidden`。
3. **显示元素**：需要显示元素时，将 `content-visibility` 改为 `visible` 或 `auto`。

<a id="example-code-1"></a>

### 示例代码

```css
.cached-view {
  /* Hides content but caches rendering state */
  content-visibility: hidden;
}

.cached-view.is-active {
  content-visibility: visible;
}
```

由于 `content-visibility: hidden` 会将元素及其子节点从无障碍树和页内查找中排除，若内容在隐藏时仍需要被发现，**不要**使用它。如果希望隐藏内容仍能通过浏览器原生页内查找进行搜索，请使用 `hidden="until-found"`，详见 `search-hidden-content`（通过 `npx -y modern-web-guidance@latest retrieve "search-hidden-content"` 获取）。

<a id="best-practices"></a>

## 最佳实践

- **应当**将 `contain-intrinsic-size` 与 `content-visibility: auto` 配合使用。否则滚动时会重新计算高度，造成视口布局跳动或视觉异常。
- **不要**对初始首屏视口内的元素设置 `content-visibility: auto`，因为这会延迟关键页面渲染。
- **必须验证无障碍体验**：应用 `content-visibility: auto` 时，**必须**验证键盘顺序导航能否到达相关元素。在某些辅助技术配置下，使用 `content-visibility: auto` 的屏幕外节点可能被排除在无障碍树或顺序导航路径之外，直到焦点被强制移入其中。应仅使用键盘，测试跨越屏幕外边界的线性导航。

<a id="fallback-strategies"></a>

## 回退策略

<a id="content-visibility-fallback"></a>

### `content-visibility` 的回退

content-visibility 的 Baseline 状态：Newly available。自 2025-09-15 起纳入 Baseline。
支持的浏览器：Chrome 108（2022 年 11 月）、Edge 108（2022 年 12 月）、Firefox 130（2024 年 9 月）和 Safari 26（2025 年 9 月）。

浏览器不支持 `content-visibility` 时会忽略它。多数情况下，`content-visibility: auto` 无需回退，只是失去性能收益。但不支持的浏览器会让设置了 `content-visibility: hidden` 的元素完全可见。应通过特性检测实现回退。

```css
/* Default for everyone */
.inactive {
  display: none;
}

/* Modern Browsers only */
@supports (content-visibility: hidden) {
 .inactive {
    display: block; /* Turn the layout box back on */
    content-visibility: hidden;
  }
}
```
