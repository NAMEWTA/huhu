<a id="resolution-optimized-pseudo-elements"></a>

# 优化伪元素图片的分辨率

在 `::before`、`::after` 等 CSS 伪元素中使用分辨率优化图片，可以添加装饰图标或结构性图形，而无需给 HTML 增加额外 DOM 节点。将伪元素与 CSS `image-set()` 函数组合，可以提供 AVIF、WebP 等多种格式，以及 `1x`、`2x` 等多种分辨率。浏览器会根据用户设备能力自动选择最合适的图片。

<a id="implementation"></a>

### 实现

可以直接在伪元素的 `content` 属性中使用 `image-set()`，或者在其 `background-image` 中使用，同时设置 `content: ""`。虽然同时通过 `type()` 提供格式并声明 `1x`、`2x` 等分辨率可以获得最佳结果，但这两个参数都不是必填项。

```css
.icon-button::before {
  /* Using image-set directly in the content property */
  /* MANDATORY: Always order your formats from most optimized (AVIF) to least optimized (JPEG/PNG). 
     The browser will stop at the first supported format. */
  content: image-set(
    url("icon.avif") type("image/avif") 1x,
    url("icon-2x.avif") type("image/avif") 2x,
    url("icon.webp") type("image/webp") 1x,
    url("icon-2x.webp") type("image/webp") 2x,
    url("icon.png") type("image/png") 1x,
    url("icon-2x.png") type("image/png") 2x
  );
  
  display: inline-block;
  margin-right: 8px;
  vertical-align: middle;
}
```

<a id="fallback-strategies"></a>

### 回退策略

image-set() 的 Baseline 状态：Widely available。自 2023-09-18 起纳入 Baseline。
支持的浏览器：Chrome 113（2023 年 5 月）、Edge 113（2023 年 5 月）、Firefox 89（2021 年 6 月）和 Safari 17（2023 年 9 月）。

对于不支持 `image-set()` 的旧浏览器，**必须**在 `image-set()` 规则*之前*提供标准图片声明。这种渐进增强策略依赖 CSS 的层叠机制：不支持的规则会被忽略。

```css
.icon-button::before {
  /* MANDATORY: Fallback for browsers that do not support image-set() */
  content: url("icon.png");
  
  /* Modern browsers will apply this and override the fallback */
  content: image-set(
    url("icon.avif") type("image/avif") 1x,
    url("icon-2x.avif") type("image/avif") 2x,
    url("icon.png") type("image/png") 1x,
    url("icon-2x.png") type("image/png") 2x
  );
}
```