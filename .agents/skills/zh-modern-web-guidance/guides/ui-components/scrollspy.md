<a id="build-a-scrollspy-navigation"></a>

# 构建滚动监听导航

滚动监听导航是一种常见 UI 模式，会自动高亮与当前视口中页面章节对应的导航链接，让用户滚动长文档时清楚知道所在位置。

此模式常见于两类场景：
- **单页网站：** 主要站点导航链接到同一页面的不同章节，而非独立 URL。
- **长篇内容：** 目录或侧栏导航跟踪用户在文章、指南或文档中的阅读位置。

<a id="how-to-implement"></a>

## 实现方法

传统滚动监听模式需要 JavaScript 和 `IntersectionObserver` API。现代 CSS 通过 `scroll-target-group` 属性与 `:target-current` 伪类提供原生实现。

1. **确保导航链接使用片段标识符：** 导航必须由 `<a>` 锚点链接组成，用片段标识符（例如 `<a href="#section-1">`）指向同页章节，并与内容章节的 `id` 匹配。
2. **启用滚动目标分组：** 对导航链接容器应用 `scroll-target-group: auto`，告诉浏览器把这些链接视为跟踪各自目标的标记。
3. **设置活动链接样式：** 用导航链接的 `:target-current` 伪类，在目标章节位于滚动容器可见区域时应用样式。
4. **语义状态：** 滚动停止时通过脚本更新活动链接的 `aria-current="true"`，确保正确向辅助技术传达状态。

<a id="example-code"></a>

## 示例代码

此示例在用户滚动各章节时，高亮固定导航菜单中的活动链接。

```css

/* MANDATORY: The container of markers must have scroll-target-group: auto */
nav {
  /* Enables automatic tracking of fragment links */
  scroll-target-group: auto;
}
/* MANDATORY: Use :target-current to style the link whose target is in view. */
nav a:target-current {
  color: var(--accent, #007bff);
  border-bottom-color: var(--accent, #007bff);
}
```

```html
<nav>
  <a href="#intro">Introduction</a>
  <a href="#features">Features</a>
  <a href="#pricing">Pricing</a>
</nav>

<main>
  <!-- MANDATORY: Each section must have a unique ID matching a link fragment in the <nav> and tabindex="-1" so it can receive focus. -->
  <section id="intro" tabindex="-1">
    <h2>Introduction</h2>
    <!-- content -->
  </section>
  <section id="features" tabindex="-1">
    <h2>Features</h2>
    <!-- content -->
  </section>
  <section id="pricing" tabindex="-1">
    <h2>Pricing</h2>
    <!-- content -->
  </section>
</main>

<script type="module">
  if (CSS.supports('scroll-target-group: auto')) {
    const syncAriaCurrent = () => {
      const currentLink = document.querySelector('nav a:target-current');
      document.querySelectorAll('nav a').forEach(link => {
        link.setAttribute('aria-current', link === currentLink ? 'true' : 'false');
      });
    };
    // Update the aria on initial page load. Ensure the DOM content is loaded, either by using `<script type="module">` or an event listener for `DOMContentLoaded`.
    syncAriaCurrent();
    // Update the aria after scroll ends
    document.addEventListener('scrollend', syncAriaCurrent);
  }
</script>
```

<a id="accessibility-considerations"></a>

## 无障碍考量

为确保用户选择锚点后仍能浏览可滚动区域，给对应目标元素添加 `tabindex="-1"`。这样元素可以接收焦点，键盘用户能够滚动容器或轻松从该内容继续导航。

```html
<li><a href="#section-2">Section 2</a></li>
…
<!-- Adding a tabindex="-1" attribute to the section target will mean that it can receive focus after being navigated to -->
<section id="section-2" tabindex="-1">
  <h2>Section 2</h2>
</section>
```

为确保不同浏览器和辅助技术组合具有一致可操作性，如果滚动容器不是 `<body>`，应让其可接收焦点（设置 `tabindex="0"`），并提供描述内容的无障碍名称；若本身没有隐式角色（`<main>` 等元素已有），还应提供合适角色，例如 `role="region"`。

<a id="best-practices"></a>

## 最佳实践

- **要**在导航链接专用容器上使用 `scroll-target-group: auto`，让浏览器明确知道跟踪哪些链接。
- **要**确保目标具有唯一 `id`，并与链接的 `href` 匹配。
- **要**为章节提供足够垂直空间：章节大到同一时间只显示一两个时，`scroll-target-group` 最能清晰识别可见目标。
- **必须：** 为了无障碍，用 `aria-current` 同步视觉状态。`:target-current` 只处理视觉部分，不会向屏幕阅读器暴露状态。
- **避免**仅用颜色表示活动状态：加入字重、下划线或指示点等其他视觉线索，或确保颜色之间有足够对比，使色觉差异用户也能识别。

<a id="fallback-strategies"></a>

## 回退策略

scroll-target-group 的浏览器支持：有限可用。
支持版本：Chrome 140（2025 年 9 月）和 Edge 140（2025 年 9 月）。
不支持：Firefox 和 Safari。

不支持 `scroll-target-group` 的浏览器，应使用基于 `IntersectionObserver` API 的回退。

```html
<script>
  // Feature detection for scroll-target-group
  const supportsScrollTargetGroup = CSS.supports('scroll-target-group: auto');

  if (!supportsScrollTargetGroup) {
    const navLinks = document.querySelectorAll('nav a');
    const sections = document.querySelectorAll('main section');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach(link => {
            const isActive = link.getAttribute('href') === `#${id}`;
            // Use the escaped colon class for consistent styling
            link.classList.toggle('target-current', isActive);
            link.setAttribute('aria-current', isActive);
          });
        }
      });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });

    sections.forEach(section => observer.observe(section));
  }
</script>

<style>
  /* Fallback style if :target-current is not supported.
     Use :is() to combine the native pseudo-class with a fallback class for older browsers. DO NOT use `nav a:target-current, nav a.target-current, as the unrecognized pseudoselector invalidates the entire rule in older browsers. */
  nav a:is(:target-current, .target-current) {
    color: var(--accent, #007bff);
    border-bottom-color: var(--accent, #007bff);
    font-weight: bold;
  }
</style>
```
