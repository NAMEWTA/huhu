<a id="optimize-image-priority"></a>

# 优化图片优先级

浏览器通过启发式规则为图片分配加载优先级，但默认规则不一定符合页面最大内容绘制（LCP）的需要。

在 `<img>` 元素上使用 `fetchpriority`，可以明确告诉浏览器图片的重要程度，让关键图片更快加载，同时避免非必要图片争用带宽。

当图片距离屏幕足够远时，`loading=lazy` 属性会完全阻止下载，从而进一步帮助确定图片加载的先后顺序。

<a id="how-to-implement"></a>

## 如何实现

1. **识别 LCP 图片**：确定哪张图片最可能成为最大内容绘制的候选对象，通常是页面顶部的主视觉图片。
2. **提高 LCP 优先级**：给 LCP 候选图片的 `<img>` 元素添加 `fetchpriority="high"`。
3. **降低非关键图片的优先级**：对于次要 UI 的图片，或用户交互后才出现的图片，例如大型菜单、模态框或屏幕外的轮播幻灯片，添加 `fetchpriority="low"`。
4. **优化懒加载**：绝不要对 LCP 图片使用 `loading="lazy"`。对于普通的首屏以下图片，使用 `loading="lazy"` 就足以将请求推迟到用户滚动到附近时。不要再给这些图片添加 `fetchpriority="low"`，因为用户滚动到它们时，应以正常优先级加载。将 `fetchpriority="low"` 留给位置上属于“首屏内”、但初始不可见的图片，例如隐藏的轮播幻灯片或大型菜单。对于这些隐藏图片，也可以同时使用 `loading="lazy"`；浏览器会安排请求时机，并遵循低优先级设置。
5. **优先采用默认优先级**：如果图片应当使用正常加载优先级，直接省略 `fetchpriority` 属性，不要显式设置为 `auto`。这种写法在依赖浏览器原生启发式规则的同时，让 HTML 更简洁。

<a id="example-code"></a>

## 示例代码

```html
<!-- Elevate priority for the LCP image -->
<img src="/images/hero-lcp.jpg"
     alt="Main Banner"
     fetchpriority="high"
     width="800" height="400">

<!-- Deprioritize initially hidden images above the fold -->
<!-- Additionally use `loading="lazy"` if there are likely to be many images-->
 <div class="carousel">
     <img src="/images/gallery-alt.jpg"
          alt="Gallery Image 1"
          width="400" height="300">
     <img src="/images/gallery-alt.jpg"
          alt="Gallery Image 2"
          fetchpriority="low"
          loading="lazy"
          width="400" height="300">
<div>

<!-- Deprioritize images revealed only after user interaction -->
<img src="/images/mega-menu-promo.jpg"
     alt="Special Offer"
     fetchpriority="low"
     width="300" height="150">

<!-- Use lazy loading ALONE for standard below-the-fold images -->
<img src="/images/footer-logo.png"
     alt="Footer Logo"
     loading="lazy"
     width="120" height="60">

<!-- Omit fetchpriority for images with standard priority -->
<img src="/images/standard-image.jpg"
     alt="Standard Image"
     width="400" height="300">
```

<a id="best-practices"></a>

## 最佳实践

- **必须**：始终为 LCP 图片设置 `fetchpriority="high"`。
- **必须**：最多只对 1–2 张关键图片使用 `fetchpriority="high"`，避免网络争用以及优先级提升效果被稀释。
- **必须**：对于位置上属于“首屏内”但初始隐藏的图片，例如隐藏的轮播幻灯片、大型菜单图片，使用 `fetchpriority="low"`。
- **必须**：**不要**对已经使用 `loading="lazy"` 的普通首屏以下图片设置 `fetchpriority="low"`。这些图片进入视口后应当以正常优先级加载。
- **建议**：避免使用 `fetchpriority="auto"`。需要默认优先级时，直接省略该属性，让 HTML 保持简洁。
- **不要**将 `fetchpriority="high"` 与 `loading="lazy"` 组合使用。
- **不要**使用已弃用的 `importance` 属性。它已被 `fetchpriority` 取代，而且没有任何浏览器支持它。
- **不要**使用已弃用的 `loading="auto"` 值。Chrome 最初曾支持它，但后来已移除，目前没有任何浏览器支持。

<a id="fallback-strategy"></a>

## 回退策略

Fetch priority 的 Baseline 状态：Newly available。自 2024-10-29 起纳入 Baseline。
支持的浏览器：Chrome 103（2022 年 6 月）、Edge 103（2022 年 6 月）、Firefox 132（2024 年 10 月）和 Safari 17.2（2023 年 12 月）。

`fetchpriority` 属性是 `<img>` 元素的渐进增强能力。不支持它的浏览器会忽略该属性，继续使用默认的优先级启发式规则。
