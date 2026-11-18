<a id="optimize-preload-priority"></a>

# 优化预加载优先级

通过 `<link rel="preload">` 预加载资源，可以告诉浏览器该资源很快就会用到。不过，预加载会继承资源类型的默认优先级，而图片的默认优先级尤其低。使用 `fetchpriority` 可以细调相对优先级，特别是让图片预加载以高优先级进行，更早开始并获得更多带宽资源。

<a id="how-to-implement"></a>

## 如何实现

1. **识别预加载候选资源**：找到浏览器无法尽早发现、但对页面外观至关重要的资源，例如视频封面图片或 CSS 背景图片。
2. **提高关键图片的预加载优先级**：对于默认未被优先处理的 LCP 图片或其他关键图片，使用 `<link rel="preload" fetchpriority="high">`，确保其优先级高于其他预加载。注意，字体默认已经是高优先级。
3. **降低非关键预加载的优先级**：对于初始渲染并不关键的资源，例如背景视频或次要字体，使用 `<link rel="preload" fetchpriority="low">`。
4. **配合资源类型设置**：不同 `as` 类型有不同的默认优先级；需要时使用 `fetchpriority` 覆盖默认设置。

<a id="example-code"></a>

## 示例代码

```html
<!-- Elevate priority for a video poster image that acts as the LCP candidate -->
<link rel="preload" href="/images/video-poster.jpg" as="image" fetchpriority="high">

<!-- Elevate priority for a critical LCP image that is hidden in CSS -->
<link rel="preload" href="/images/hero-background.jpg" as="image" fetchpriority="high">

<!-- Deprioritize a secondary font to avoid network contention -->
<link rel="preload" href="/fonts/secondary-font.woff2" as="font" type="font/woff2" fetchpriority="low" crossorigin>
```

<a id="best-practices"></a>

## 最佳实践

- **必须**：最多只为 1–2 个关键图片预加载设置 `fetchpriority="high"`，避免网络争用以及优先级提升效果被稀释。
- **必须**：对最大内容绘制（LCP）图片使用 `fetchpriority="high"`。
- **应当**将页面预加载总量限制为最多 2 张图片和 2–3 个必要字体，防止带宽争用。
- **应当**为希望提前开始、但又不能牺牲关键资源加载的预加载设置 `fetchpriority="low"`，尤其是非关键字体。
- **应当**正确指定 `as` 属性，确保预加载结果能够被使用。
- **应当**优先通过 HTML 中的 `<img>` 标签，让浏览器静态发现 LCP 图片等关键资源，不要依赖背景图预加载。
- **应当**确保字体预加载始终带有 `crossorigin` 属性，即使字体同源也是如此。
- **不要**使用已弃用的 `importance` 属性，它已被 `fetchpriority` 取代。

<a id="fallback-strategy"></a>

## 回退策略

Fetch priority 的 Baseline 状态：Newly available。自 2024-10-29 起纳入 Baseline。
支持的浏览器：Chrome 103（2022 年 6 月）、Edge 103（2022 年 6 月）、Firefox 132（2024 年 10 月）和 Safari 17.2（2023 年 12 月）。

`<link rel="preload">` 上的 `fetchpriority` 属性属于渐进增强。不支持的浏览器仍会按该资源类型的默认优先级进行预加载。为确保兼容，始终提供正确的 `as` 和 `type` 属性。
