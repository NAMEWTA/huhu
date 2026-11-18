<a id="apply-webgl-shaders-to-html-content"></a>
# 将 WebGL 着色器应用到 HTML 内容

WebGL 着色器提供强大的 GPU 加速视觉效果，可实现动态波纹扭曲、光照模型、调色和自定义顶点变换等高级能力。HTML-in-Canvas API 允许开发者将 WebGL 纹理应用到 HTML 内容，从而以原生方式，将高性能片元和顶点着色器用于按钮、输入框、富文本等完全可交互的界面组件，同时保留原生无障碍、文本选择和 DOM 事件处理。

<a id="how-to-implement"></a>
## 实现方法

1. 检查浏览器是否支持 HTML-in-Canvas：

```js
if ('content' in HTMLCanvasElement.prototype) {
  // Use HTML in Canvas API
} else {
  // Use fallback strategy
}
```


2. 为 HTML `<canvas>` 元素添加 `content="drawable"` 属性。
3. 将 HTML 内容放入 `<canvas>` 内，为每个需要绘制的元素添加 `drawable`。带 `drawable` 的元素会捕获其子树，但不包含同样标记为 `drawable` 的嵌套后代。

```html
<canvas id="canvas" content="drawable">
  <div id="html-content" drawable></div>
</canvas>
```


4. 缩放画布网格，使其匹配设备缩放因子，避免模糊：

```js
const observer = new ResizeObserver(([entry]) => {
  const dpc = entry.devicePixelContentBoxSize;
  canvas.width = dpc
    ? dpc[0].inlineSize
    : Math.round(entry.contentRect.width * window.devicePixelRatio);
  canvas.height = dpc
    ? dpc[0].blockSize
    : Math.round(entry.contentRect.height * window.devicePixelRatio);
});

const supportsDevicePixelContentBox =
  typeof ResizeObserverEntry !== "undefined" &&
  "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
const options = supportsDevicePixelContentBox
  ? { box: "device-pixel-content-box" }
  : {};
observer.observe(canvas, options);
```


5. 先通过 `texImage2D` 预分配纹理的底层存储。本指南的片段使用 WebGL 2 上下文（`canvas.getContext("webgl2")`）。

调用 `texImage2D()`，用 `null` 代替像素数据，先为指定尺寸和格式保留 GPU 内存，不上传任何像素。遵循以下规则：
  - 根据 `canvas.captureElementImage(element)` 确定纹理尺寸。其 `width` 和 `height` 使用画布网格，即底层存储像素，应通过 `Math.ceil()` 向上取整。如果元素尚无绘制记录，`captureElementImage()` 会抛出异常；调用 `requestPaint()`，在下一个 `paint` 事件重试。
  - 只在首次上传或尺寸改变时分配第 0 级，因为重新分配会清空纹理。使用可变存储：不可变的 `texStorage2D()` 存储无法在元素尺寸变化时调整大小。

```js
// Returns the element's size in canvas grid pixels, or null if the element
// has no paint record yet.
function getElementImageSize(canvas, element) {
  let elementImage;
  try {
    elementImage = canvas.captureElementImage(element);
  } catch (err) {
    canvas.requestPaint(); // No paint record yet: retry on the next paint event.
    return null;
  }
  const width = Math.ceil(elementImage.width);
  const height = Math.ceil(elementImage.height);
  elementImage.close();
  return width > 0 && height > 0 ? { width, height } : null;
}

// Binds the texture, and allocates its storage on the first upload, and when
// the element size changes. `state` stores the allocated size.
function allocateElementTexture(gl, texture, state, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (state.width === width && state.height === height) return;

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,                // Mipmap level
    gl.RGBA8,         // Internal format: 8 bits per RGBA channel
    width,            // Size in canvas grid pixels
    height,
    0,                // Border: must be 0
    gl.RGBA,          // Format and type that match RGBA8
    gl.UNSIGNED_BYTE,
    null              // null reserves GPU memory without uploading pixels
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  state.width = width;
  state.height = height;
}

const texture = gl.createTexture();
const textureState = { width: 0, height: 0 };
```


6. 在 `canvas.onpaint` 事件处理器中，通过 `texElementSubImage2D` 将 HTML 内容渲染到纹理。遵循以下规则：
  - 只有画布已经绘制元素后，才能上传它。在 `paint` 事件中上传，通过 `canvas.requestPaint()` 请求一次绘制。
  - 在配置中传入 `{ width, height }`，无论画布如何缩放，都能使复制结果填满已分配纹理。
  - 如果尺寸变化，按第 5 步重新分配纹理。

```js
// Uploads the element into the texture. Returns false if the element has no
// paint record yet. In that case, it's uploaded on the next paint event.
function uploadElementWebGL(gl, canvas, texture, element, state) {
  const size = getElementImageSize(canvas, element);
  if (!size) return false;
  const { width, height } = size;

  // Bind the texture, and reallocate it if the size changed (step 5).
  allocateElementTexture(gl, texture, state, width, height);
  gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, element, { width, height });
  return true;
}

canvas.onpaint = () => {
  try {
    uploadElementWebGL(gl, canvas, texture, uiElement, textureState);
  } catch (err) {
    console.error('texElementSubImage2D copy failed:', err);
  }
};
```


  使用 `requestAnimationFrame` 循环渲染场景时，在循环内调用 `canvas.requestPaint()`，确保 HTML 内容被渲染到画布。`event.changedElements` 列出渲染发生变化的元素。确保只有后代 HTML 元素更新时，才重新上传纹理：

  ```js
  function render() {
    // Request to update the canvas
    canvas.requestPaint();
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  canvas.onpaint = (event) => {
    if (event.changedElements && event.changedElements.length > 0) {
      // Update the texture with uploadElementWebGL()
    }
    // Render the scene, and sync the element geometry as shown in step 7
  };
  ```


7. 同步元素几何信息。

计算一个 `DOMMatrix`，将以 CSS 像素表示的元素边框盒映射到同样以 CSS 像素表示的画布。浏览器需要通过视口变换，将 3D 坐标空间映射到 CSS 坐标空间。为此执行以下步骤：
  - 规范化 HTML 元素。HTML 元素按像素定尺寸，例如宽 200px；WebGL 通常将对象视为“单位方形”，例如范围从 -0.5 到 0.5。如果不规范化，200px 的按钮看起来就会大 200 倍。这一步还会翻转 Y 轴，因为 CSS 中向下为正，而 WebGL 中向上为正。
  - 将 WebGL MVP 矩阵转换为 DOM 矩阵。
  - 映射到画布视口。这一步是“重新缩放”阶段：将单位空间中的运算结果拉伸回屏幕上 `<canvas>` 元素的 CSS 像素尺寸，并将 Y 轴翻转回来。
  - 计算最终变换。按 Viewport * MVP * Normalization，即视口、模型视图投影、规范化的顺序相乘。合并成最终变换后，得到一张“映射”，准确告知浏览器该 HTML 元素应放在哪里，才能与 3D 绘制结果对齐。透视除法由浏览器执行。

  ```js
  // Maps the element's border box (CSS pixels) to the canvas (CSS pixels), for a
  // quad that spans -0.5 to 0.5 in model space and is drawn with the `mvp` matrix.
  function computeCanvasTransform(canvas, element, mvp) {
    const width = element.offsetWidth;
    const height = element.offsetHeight;

    // 1. Normalize the HTML element (CSS pixels -> WebGL Model Space)
    const toGLModel = new DOMMatrix()
      // Scale pixels to 1 unit, flip Y (as in CSS it points down, and in WebGL it points up)
      .scale(1 / width, -1 / height, 1 / height)
      // Center the origin: (0,0) becomes (-width/2, -height/2) before scaling
      .translate(-width / 2, -height / 2);

    // 2. Convert WebGL MVP Matrix to DOM Matrix
    const mvpDOM = new DOMMatrix(Array.from(mvp));

    // 3. Map to the canvas viewport, in CSS pixels
    const clipToCanvasViewport = new DOMMatrix()
      // Move center (0,0) to center of canvas
      .translate(canvas.clientWidth / 2, canvas.clientHeight / 2)
      // Scale normalized clip (-1..1) to viewport size, and flip Y back
      .scale(canvas.clientWidth / 2, -canvas.clientHeight / 2, canvas.clientHeight / 2);

    // 4. Multiply: (Clip -> Pixels) * (MVP) * (pixels -> unit square)
    return clipToCanvasViewport.multiply(mvpDOM).multiply(toGLModel);
  }
  ```


然后将该变换作为 `canvasTransform` 传给 `canvas.updateElementGeometry()`。它会将 HTML 元素移动到其渲染像素正上方，确保用户点击按钮或选择文字时，命中的是真实 HTML 元素。浏览器也会将此变换用于元素的无障碍边界，例如屏幕阅读器焦点环：

  ```js
  canvas.updateElementGeometry(targetHTMLElement, {
    canvasTransform: computeCanvasTransform(canvas, targetHTMLElement, htmlElementMVP),
  });
  ```


通过以下选项控制命中测试：
  - 每次 `updateElementGeometry()` 调用都会将元素移到命中测试顺序的最上方。传入 `{ preserveHitTestOrder: true }` 可保留原位置。
  - 调用 `canvas.clearElementGeometry(element)` 可将元素移出命中测试，例如隐藏元素时。
  - 传入 `{ canvasClip }`，它是位于 `canvasTransform` 坐标空间中的 `DOMRectInit`，可限制可命中的区域，例如只绘制元素的一部分时。

<a id="example-code"></a>
## 示例代码

```html
<canvas id="canvas" content="drawable" style="width: 400px; height: 400px;">
  <div id="ui-element" drawable>
    <p>WebGL UI Element</p>
    <button>Action</button>
  </div>
</canvas>

<script>
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl2");
  const uiElement = document.getElementById("ui-element");

  // getElementImageSize() and allocateElementTexture() are defined in step 5.
  // uploadElementWebGL() is defined in step 6.
  // computeCanvasTransform() is defined in step 7.

  // Setup WebGL texture...
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const textureState = { width: 0, height: 0 };

  canvas.onpaint = () => {
    // 1. Update texture with HTML content
    try {
      uploadElementWebGL(gl, canvas, texture, uiElement, textureState);
    } catch (err) {
      console.error('texElementSubImage2D copy failed:', err);
    }

    // ... Render your 3D scene here, calculating htmlElementMVP matrix ...

    // 2. Sync DOM position, hit testing, and accessibility bounds with 3D scene
    canvas.updateElementGeometry(uiElement, {
      canvasTransform: computeCanvasTransform(canvas, uiElement, htmlElementMVP),
    });
  };
</script>
```


<a id="best-practices"></a>
## 最佳实践

- **强制要求**：使用 HTML-in-Canvas API 前，检查浏览器支持情况。
- **强制要求**：始终为 `<canvas>` 添加 `content="drawable"`。
- **强制要求**：始终为画布的直接子元素添加 `drawable`。
- **强制要求**：为每个希望独立于父元素绘制的元素添加 `drawable`。
- **强制要求**：使用 `onpaint` 事件处理器，将 HTML 内容渲染到画布。
- **强制要求**：初始化或元素尺寸改变时，使用 `texImage2D()` 预分配一次纹理缓冲区。只在尺寸变化时重新分配，并将 `TEXTURE_MIN_FILTER` 设为 `LINEAR`。
- **强制要求**：通过 `texElementSubImage2D` 将 HTML 内容渲染到纹理；该纹理需通过 `texImage2D()` 预分配，尺寸来自 `captureElementImage()`。
- **强制要求**：调用 `canvas.updateElementGeometry(element, { canvasTransform })`，使 HTML 元素几何信息与渲染内容同步。
- **强制要求**：使用 `ResizeObserver` 观察屏幕尺寸，并更新画布尺寸以匹配设备像素。
- **不要**在画布内嵌入跨源内容，因为不受支持。
- **不要**在 `onpaint` 事件处理器内初始化 `ResizeObserver`，这可能造成内存泄漏。

<a id="fallback-strategies"></a>
### 回退策略

HTML-in-canvas 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 157（2026 年 11 月）和 Edge 157（2026 年 11 月）。
不支持的浏览器：Firefox 和 Safari。

HTML-in-Canvas API 目前尚未被所有现代浏览器支持，因此通常需要回退策略。

不过，考虑到此 API 带来的性能提升，浏览器支持时应使用 HTML-in-Canvas。

回退策略取决于使用场景。例如，画布中的交互式 HTML 内容，在不支持 HTML-in-Canvas 时，可通过 CSS 将 HTML 内容放到画布上方。

<a id="html-in-canvas-polyfill"></a>
### HTML-in-Canvas polyfill

使用以下 polyfill 脚本，在不支持的浏览器中模拟 HTML-in-Canvas API。

1. 安装或嵌入该库：

```
# Install
npm install three-html-render
```


```
# Embed
<script src="https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.js"></script>
```


2. 运行 `installHtmlInCanvasPolyfill()` 方法，转换 HTML-in-Canvas。
