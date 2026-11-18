<a id="soft-edge-content-fade"></a>
# 内容边缘柔和渐隐

<a id="overview"></a>
## 概述
要为容器边缘应用透明度渐变，例如表示还有内容可滚动，或让文字渐隐，使用 CSS 遮罩配合线性渐变。它比半透明覆盖层更合适，因为它真正淡化的是内容本身，使背景自然透出，同时不干扰文本选择或指针事件。

<a id="implementation"></a>
## 实现
实现边缘柔和渐隐：

<a id="fading-the-bottom-edge-of-a-container"></a>
### 让容器底部边缘渐隐
这适合表示可滚动区域下方还有更多内容。

```css
.container {
  /* Enable scrolling */
  overflow-y: auto;
  
  /* MANDATORY: Use vendor prefix for wider support in older browsers */
  -webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
  
  /* Standard property for modern browsers */
  mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
}
```


<a id="fading-both-top-and-bottom-edges"></a>
### 同时让顶部和底部边缘渐隐
可以在单个渐变中使用多个色标，让两侧边缘同时渐隐。

```css
.dual-fade-container {
  /* Content is visible between 10% and 90% of the height */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
}
```


<a id="fallback-strategies"></a>
## 回退策略
遮罩的 Baseline 状态：广泛可用。自 2023-12-07 起纳入 Baseline。
支持的浏览器：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

如果浏览器不支持 `mask-image` 或带前缀版本：
- 内容不会渐隐，会显示清晰的硬边缘。
- 确保没有渐隐效果时，界面功能正常、内容可读，即采用渐进增强。
- 可以使用半透明覆盖层作为回退，但要注意，这要求知道背景色，而且除非使用 `pointer-events: none`，否则可能干扰文本选择。

```css
/* Fallback using an overlay for browsers that do not support masking */
@supports (not (mask-image: linear-gradient(to bottom, black, transparent))) and (not (-webkit-mask-image: linear-gradient(to bottom, black, transparent))) {
  .container {
    position: relative;
  }
  
  .container::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 20%;
    /* Fallback assumes a solid background color (e.g., white) */
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1));
    pointer-events: none; /* Allow interaction with text underneath */
  }
}
```

