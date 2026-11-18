<a id="responsive-design"></a>

# 响应式设计

<a id="overall-best-practices"></a>

## 整体最佳实践

- 使用 `@container` 查询创建组件驱动的响应式布局，使其适应父容器尺寸，而非视口。详情见 `size-aware-styling`（运行 `npx -y modern-web-guidance@latest retrieve "size-aware-styling"`）。
- 用动态视口单位（`dvh`、`dvw`）代替 `vh`/`vw`，避免移动浏览器 UI（例如地址栏）显隐时破坏布局。
- 为 `<img>`、`<video>` 等媒体元素使用 `aspect-ratio`，在加载期间预留空间，避免累积布局偏移（CLS）。

响应式 UI 的布局机制（flexbox、grid、容器查询单位、视口单位）见 `css-layout`（运行 `npx -y modern-web-guidance@latest retrieve "css-layout"`）。

<a id="responsive-typography"></a>

## 响应式排版

- **应当**在 `clamp()` 中结合相对视口和相对字体单位，使字号随视口缩放，同时保持在预期范围内。例如 `clamp(2rem, 1rem + 5vw, 4rem)`。调整两类单位的比例可控制字号变化速度。最小值和最大值使用相对字体单位，最大值不超过最小值的 2.5 倍。用户缩放时视口单位不会增长，因此只有字号下限超过视口计算值后，文本才开始增长；最大值不超过最小值 2.5 倍时，最高可到 500% 的浏览器缩放仍能将文字放大到 200%（WCAG 1.4.4 Resize Text 要求文字可放大至 200%，且不丢失内容或功能）。
- **不要**只用 `vw` 设置字号而不配合 `clamp()`，因为极端屏幕上文字可能过小或过大。

若要让字号和间距随容器而非视口缩放，见 `fluid-scaling`（运行 `npx -y modern-web-guidance@latest retrieve "fluid-scaling"`）。

