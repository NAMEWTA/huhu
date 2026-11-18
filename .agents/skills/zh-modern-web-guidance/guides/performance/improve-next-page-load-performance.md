<a id="improve-next-page-load-performance"></a>

# 改善下一页的加载性能

对于正在网站中导航的用户，改善页面加载性能最有效的方法之一，是在他们访问下一页*之前*就开始加载该页。可以通过 Speculation Rules API 实现这种称为推测加载的技术。

<a id="how-it-works"></a>

## 工作原理

推测加载通过基于 JSON 的推测规则，告诉浏览器哪些链接可以预取或预渲染，从而改善用户点击它们后的页面加载性能。

规则可以使用 `urls` 键列出硬编码的 URL 列表，这称为列表规则；也可以使用 `where` 键，包含一组 href 条件和 CSS 选择器来查找页面链接，这称为 `document` 规则。

规则还可以包含可选的 `eagerness` 属性，指定何时预取或预渲染页面。`eagerness` 可以设置为 `immediate`、`eager`、`moderate` 或 `conservative`。`immediate` 会尽早开始推测；其余值分别等待用户信号，例如短时间悬停、较长时间悬停，或开始点击页面。

可以组合不同的 eagerness 设置，先积极预取，再在用户表现出更多交互意图时进行预渲染。

<a id="when-to-use-it"></a>

## 何时使用

推测加载尤其适用于内容不经常变化、页面生成成本较低的静态页面，特别是已经在边缘缓存的页面。它也可用于动态页面，但必须谨慎处理内容可能过期的问题。

推测加载通常用于同源链接，虽然更高级的选项也允许部分跨源推测。本指南重点介绍更常见的同源使用场景。

对于用户接下来很可能访问的页面，例如头条文章，或学习课程等分步流程中的下一页，较积极的推测加载是不错的选择。

当用户下一步行为不明确、页面上有许多访问概率相近的链接时，更保守的推测加载更合适。等待悬停或开始点击等更多信号，仍然可以提前启动下一页加载；即使没有完成全部预取或预渲染，也能改善用户体验。

同样，预取比预渲染更保守，客户端和服务器都消耗更少资源，但给用户带来的收益也更小。初次实现时适合选择预取，等开发者明确提出要求后，再扩展到预渲染。

<a id="how-to-use-it"></a>

## 如何使用

推测规则采用 JSON 格式，可以放在 `<script type="speculationrules">` 标签中。该标签可位于文档的 `<head>` 或 `<body>`，也可以通过 JavaScript 动态添加。

还可以在全局或单条规则中使用 `tag`。设置后，该标签会包含在 `Sec-Speculation-Tags` 请求头中，让服务端识别发生了哪些推测请求。

<a id="example-of-a-simple-url-list-rule-for-prefetching-predefined-urls"></a>

### 使用简单 URL 列表规则预取预定义 URL 的示例

```html
<script type="speculationrules">
  {
    "tag": "product-page-speculations",
    "prefetch": [
      {
        "urls": ["/product/1", "/product/2", "/product/3"]
      }
    ]
  }
</script>
```

<a id="example-of-a-simple-document-rule-for-prerendering-all-same-origin-links-on-a-page"></a>

### 使用简单 document 规则预渲染页面上所有同源链接的示例

```html
<script type="speculationrules">
  {
    "tag": "all-links-speculations",
    "prerender": [{
      "where": { "href_matches": "/*" }
    }]
  }
</script>
```

<a id="example-of-a-complex-document-rule-for-prerendering-links-with-exclusions-for-interactive-sites"></a>

### 为交互式网站设置带排除项的复杂 document 预渲染规则示例

```html
<script type="speculationrules">
  {
    "tag": "speculations-with-exclusions",
    "prerender": [{
      "where": {
        "and": [
          { "href_matches": "/*" },
          { "not": {"href_matches": "/wp-admin"}},
          { "not": {"href_matches": "/*\\?*(^|&)add-to-cart=*"}},
          { "not": {"selector_matches": ".do-not-prerender"}},
          { "not": {"selector_matches": "[rel~=nofollow]"}}
        ]
      }
    }]
  }
</script>
```

<a id="example-of-a-mixed-rule-set"></a>

### 混合规则集示例

下面的规则集会积极预取所有链接，并在获得更多信号后，以 `moderate` eagerness 进一步预渲染同一批链接。

```html
<script type="speculationrules">
  {
    "prefetch": [{
      "tag": "prefetch-speculations",
      "where": { "href_matches": "/*" },
      "eagerness": "eager"
    }],
    "prerender": [{
      "tag": "prerender-speculations",
      "where": { "href_matches": "/*" },
      "eagerness": "moderate"
    }]
  }
</script>
```

<a id="best-practices"></a>

## 最佳实践

- **应当**使用推测规则预取和预渲染用户接下来可能访问的页面。
- **应当**将推测规则用于内容不经常变化、页面生成成本较低的静态网站，尤其是已有边缘缓存的网站。
- **应当**对动态页面更加谨慎：它们的内容更容易变化、过期，生成成本也可能更高。
- **应当**优先采用 document 规则而不是列表规则，因为它们更灵活，可以在多个页面共享同一规则，还能预取和预渲染事先未知的页面。
- **应当**考虑预取与预渲染的权衡，并按使用场景选择。预渲染成本更高，在显示动态状态的复杂应用中可能产生更多意外副作用，但用户体验更好。不确定时，询问开发者的偏好。
- **应当**考虑各个 `eagerness` 等级的权衡，并选择适合当前场景的等级。更积极的推测能提供更好的用户体验，但消耗更多资源，也可能在显示动态状态的复杂应用中产生更多意外副作用。不确定时，询问开发者的偏好。
- **不要**过度使用推测规则，例如推测页面上的每个链接。浏览器存在数量限制，非 eager 推测的限制为 2 个。`immediate` 应只用于极少数链接。
- **不要**推测可能触发状态变化的 URL，例如 `/logout` 或 `/add-to-cart`；如果 document 规则可能选中它们，必须显式排除。
- **不要**在单页应用（SPA）中使用推测规则。它面向每次导航都加载新文档的多页应用（MPA）。SPA 每次导航并不会加载新文档，因此推测规则无法按预期工作。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

Speculation rules 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 109（2023 年 1 月）和 Edge 109（2023 年 1 月）。
不支持的浏览器：Firefox 和 Safari。

不过，推测加载属于渐进增强，可以安全使用。考虑到潜在性能收益，非常建议采用。不支持推测规则的浏览器会直接忽略它们。
