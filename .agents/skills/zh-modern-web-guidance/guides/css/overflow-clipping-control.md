<a id="overflow-clipping-control"></a>

# 溢出裁切控制

`overflow: hidden` 像粗略工具，几乎总是严格沿 padding-box 裁切；`overflow: clip` 结合 `overflow-clip-margin` 则可精细控制块容器布局。

通过 `overflow: clip` 和 `overflow-clip-margin` 精确指定裁切位置。可以把边界与内部盒模型边缘对齐，或按指定偏移量（安全边距）向元素盒外扩展。这种现代方式性能很好，无需像旧方案那样，仅为让子元素显著阴影等视觉效果完整显示，就添加具有自定义 padding 和负 margin 的额外包裹容器。

替换元素（`<img>`、`<video>`、`<canvas>` 等）默认使用 `overflow: clip` 与 `overflow-clip-margin: content-box`，因此可干净地约束使用 `object-fit` 或 `border-radius` 的图片。

<a id="how-to-implement"></a>

## 如何实现

1. **应用 `overflow: clip`**：确保目标元素启用 `overflow: clip`。块布局容器必须设置 `overflow: clip`，`overflow-clip-margin` 才会生效。`overflow` 若为 `hidden`、`auto` 或 `scroll`，浏览器会忽略 `overflow-clip-margin`。`overflow: clip` 禁止一切滚动，包括用户滚动和 JavaScript 程序化滚动。
2. **对齐盒边缘**：使用关键字精确对齐内部盒模型边缘：
   - `content-box`：在内容区起始处准确裁切，使 padding 区域完全干净；内容恰好止于 padding 边缘，适合嵌套布局模块。
   - `padding-box`（默认）：在边框内边缘裁切。
   - `border-box`：在边框外边缘裁切，允许内容位于半透明边框下方或与之部分重叠。
3. **定义指定偏移量（向外延展）**：提供长度（例如 `15px`、`5px`），在裁掉像素前建立安全区，使子元素阴影可越过边界而不被裁切，同时不扩展布局几何尺寸。
4. **结合盒边缘和偏移量**：同时指定盒边缘与长度偏移（例如 `content-box 15px`），从特定边缘向外偏移。

<a id="example-code"></a>

## 示例代码

以下展示动态容器布局控制，包括自动的内部内容弧线嵌套边框、子元素阴影保护，以及渐进增强回退。

<a id="block-containers-nested-rounded-curves"></a>

### 块容器：嵌套圆角曲线

* 对带圆角和自定义 padding 的父容器应用 `overflow-clip-margin: content-box`。
* 沿同心的内部内容盒边界，为内层媒体和页脚组件应用相似圆角，无需自定义 `calc()` 逻辑即可解决不协调的嵌套曲线。

```html
<div class="nested-curve-parent">
  <img src="avatar.jpg" alt="Nested Curve Demo">
  <div class="nested-curve-footer">Card Footer</div>
</div>
```

```css
/**
 * Standard block layout container with outer corner radii and padding.
 * Keeps base level 1 fallback clipping roughly at the inner padding box.
 */
.nested-curve-parent {
  /* Level 1 Fallback: clips child roughly at the padding box */
  overflow: hidden;
}

/* Inner footer component with 12px rounded to visually demonstrate automatic concentric corner clipping */
.nested-curve-footer {
  background: #111;
  color: #fff;
}

@supports (overflow-clip-margin: content-box) {
  .nested-curve-parent {
    /* MANDATORY: overflow: clip is required on non-replaced elements */
    overflow: clip;
    /* Automatically curves clipping edge to match inner content-box radius */
    overflow-clip-margin: content-box;
  }
}
```

<a id="block-containers-child-element-shadow-bleed"></a>

### 块容器：子元素阴影向外延展

* 应用 `overflow: clip`，并用延伸的 `overflow-clip-margin` 长度偏移建立可见安全区，让子元素阴影超出父容器时不被裁切，且不改变布局几何尺寸。否则阴影会在父边界被裁掉。

```html
<div class="safety-zone-parent">
  <h4>Clipped Container</h4>
  <p>Inner content boundaries safely contained.</p>
  <!-- Child button element positioned inside with a prominent shadow -->
  <button class="demo-glowing-btn">Submit</button>
</div>
```

```css
/**
 * Standard block layout container clipping inner content.
 * Base fallback uses overflow: hidden, which abruptly slices child element shadows.
 */
.safety-zone-parent {
  /* Level 1 Fallback: clips overflowing content but truncates child shadows */
  overflow: hidden;
}

/* Child button element positioned inside with an expanded shadow */
.demo-glowing-btn {
  display: block;
  box-shadow: 0 8px 13px rgba(229, 46, 113, 0.7);
}

@supports (overflow-clip-margin: 15px) {
  .safety-zone-parent {
    overflow: clip;
    /* Establishes a visible safety zone allowing child element shadows to render safely outside */
    overflow-clip-margin: 15px;
  }
}
```

<a id="strategic-implementation--best-practices"></a>

## 实现策略与最佳实践

- **应当**在使用 `overflow-clip-margin` 的目标元素上设置 `overflow: clip`；标准块布局容器必须将 `overflow` 严格设置为 `clip`，才能启用自定义或内部曲线裁切边距。
- **应当**对带 padding 和圆角的容器设置 `overflow-clip-margin: content-box`，自动将内部无圆角子元素裁成几何上精确的嵌套曲线，无需手动减去 padding。
- **应当**在应用 `filter: drop-shadow()` 等外部视觉效果时，为 `overflow-clip-margin` 配置长度偏移，避免在包围盒处生硬截断，又不改变或扩展布局几何。
- **不要**对需要 JavaScript 程序化滚动的容器，或作为 `position: sticky` 元素直接布局上下文的容器使用 `overflow: clip`，因为 `clip` 会完全禁用滚动。

<a id="fallback-strategies"></a>

## 回退策略

overflow: clip 的 Baseline 状态：广泛可用。自 2022-09-12 起达到 Baseline。
支持：Chrome 90（2021 年 4 月）、Edge 90（2021 年 4 月）、Firefox 81（2020 年 9 月）和 Safari 16（2022 年 9 月）。

overflow-clip-margin 的浏览器支持：有限可用。
支持：Firefox 148（2026 年 2 月）。
不支持：Chrome、Edge 和 Safari。

目标环境缺少 `overflow: clip` 或 `overflow-clip-margin` 原生支持时，渐进增强回退直接取决于视觉意图：
- 以 `overflow: hidden` 作为基础体验，保证核心边界得到保持。
- 对阴影或外部角标不可被裁切的元素，回退到 `overflow: visible`。

<a id="complete-progressive-enhancement-fallback-implementation"></a>

### 完整渐进增强回退实现

```html
<!-- 1. Nested rounded edges fallback -->
<div class="demo-container-fallback">
  <img src="example.jpg" alt="Nested Curve Fallback">
  <div class="demo-footer-fallback">Footer</div>
</div>

<!-- 2. Child element shadow bleed fallback -->
<div class="demo-safety-parent">
  <h4>Container</h4>
  <p>Inner boundaries contained.</p>
  <button class="demo-glowing-btn">Submit</button>
</div>
```

```css
/**
 * 1. Block Container Nested Curves Fallback
 * Keeps base level 1 fallback clipping roughly at the inner padding box.
 */
.demo-container-fallback {  
  /* Level 1 Fallback: clip child roughly at padding box */
  overflow: hidden;
}

.demo-container-fallback img {
  object-fit: cover;
  display: block;
}

@supports (overflow-clip-margin: content-box) {
  .demo-container-fallback {
    overflow: clip;
    overflow-clip-margin: content-box;
  }
}

/**
 * 2. Child Element Shadow Bleed Fallback
 * Base fallback clips content using overflow: hidden, abruptly truncating child element shadows.
 */
.demo-safety-parent {  
  /* Level 1 Fallback */
  overflow: hidden;
}

.demo-glowing-btn {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: #e52e71;
  box-shadow: 0 8px 13px rgba(229, 46, 113, 0.65);
}

@supports (overflow-clip-margin: 15px) {
  .demo-safety-parent {
    overflow: clip;
    overflow-clip-margin: 15px;
  }
}
```