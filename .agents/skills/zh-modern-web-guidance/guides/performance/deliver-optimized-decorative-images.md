<a id="deliver-optimized-decorative-images"></a>

# 提供经过优化的装饰图片

通过 CSS 提供经过优化的装饰图片，可以在不牺牲视觉质量的情况下改善感知性能。使用 CSS 的 `image-set()` 函数，可以为同一背景图或遮罩图片向浏览器提供多个选项，包括 AVIF、WebP 等现代格式，以及 `1x`、`2x` 等不同分辨率。浏览器会动态选择兼容且满足设备像素密度要求的最小图片。

**注意**：如果图片可能成为最大内容绘制（LCP）元素，例如大型主视觉横幅，需要注意，浏览器的预加载扫描器无法发现通过 CSS 的 image-set() 引用的图片。这可能显著推迟图片加载并损害 LCP。对于 LCP 候选图片，应考虑改用标准 HTML `<img>` 或 `<picture>` 标签；也可以配合带 `media` 属性的 `<link rel=preload>` 预加载图片。

<a id="implementation"></a>

### 实现

`image-set()` 函数可以用在 CSS 接受 `<image>` 值的任何位置，最常见的是 `background-image`、`content` 或 `mask-image`。虽然同时通过 `type()` 提供图片格式并声明 `1x` 或 `2x` 等分辨率能获得最佳效果，但这两个参数都不是必填项。

```css
.gallery-item {
  /* Provide multiple resolutions and formats using image-set() */
  /* MANDATORY: Always order your formats from most optimized (AVIF) to least optimized (JPEG/PNG). 
     The browser will stop at the first supported format. */
  background-image: image-set(
    url("gallery.avif") type("image/avif") 1x,
    url("gallery-2x.avif") type("image/avif") 2x,
    url("gallery.webp") type("image/webp") 1x,
    url("gallery-2x.webp") type("image/webp") 2x,
    url("gallery.jpg") type("image/jpeg") 1x,
    url("gallery-2x.jpg") type("image/jpeg") 2x
  );
  
  /* Standard decorative properties */
  background-size: cover;
  background-position: center;
}
```

<a id="fallback-strategies"></a>

### 回退策略

image-set() 的 Baseline 状态：Widely available。自 2023-09-18 起纳入 Baseline。
支持的浏览器：Chrome 113（2023 年 5 月）、Edge 113（2023 年 5 月）、Firefox 89（2021 年 6 月）和 Safari 17（2023 年 9 月）。

对于不支持 `image-set()` 的旧浏览器，**必须**在 `image-set()` 规则*之前*提供标准图片声明。这种渐进增强策略利用了 CSS 的层叠特性：不支持的规则会被忽略。

```css
.gallery-item {
  /* MANDATORY: Fallback for browsers that do not support image-set() */
  background-image: url("gallery.jpg");
  
  /* Modern browsers will apply this and override the fallback */
  background-image: image-set(
    url("gallery.avif") type("image/avif") 1x,
    url("gallery-2x.avif") type("image/avif") 2x,
    url("gallery.jpg") type("image/jpeg") 1x,
    url("gallery-2x.jpg") type("image/jpeg") 2x
  );
}
```
