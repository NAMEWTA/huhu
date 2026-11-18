<a id="expose-canvas-content-to-browser-features"></a>
# 让浏览器功能访问画布内容

普通 `<canvas>` 内容不会暴露给屏幕阅读器、索引、翻译工具、无障碍辅助工具、页内查找和打印等浏览器功能。借助 `HTML in canvas`，可以将真实 DOM 直接渲染到画布元素中。为 HTML `<canvas>` 添加 `content="drawable"` 后，会对其后代 HTML 元素进行布局；`drawable` 属性则标记可在画布渲染上下文中绘制的元素。你可以用它在画布内设置文字样式和布局，让无障碍、翻译、页内查找等浏览器功能访问画布内容，并为 HTML 应用 2D 和 3D 效果。

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


5. 在 `canvas.onpaint` 事件处理器中，将 HTML 内容渲染到画布。只有画布已经绘制元素后，才能绘制它：调用 `canvas.requestPaint()` 请求一个 `paint` 事件。

- 在 2D 上下文中，使用 `drawElementImage`。它从元素边框盒开始、在 CSS 变换之前，绘制 `drawable` 元素及其可绘制子树的最近一次快照：

```js
canvas.onpaint = () => {
  ctx.reset();
  // Draw the form element at x:0, y:0
  ctx.drawElementImage(form_element, 0, 0);
};
```


- 在 WebGL 和 WebGPU 上下文中，将元素复制到纹理。根据 `canvas.captureElementImage(element)` 确定纹理尺寸。其 `width` 和 `height` 使用画布网格，即底层存储像素，应通过 `Math.ceil()` 向上取整。如果元素尚无绘制记录，`captureElementImage()` 会抛出异常；调用 `requestPaint()`，在下一个 `paint` 事件重试。

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
```


- 在 WebGL 上下文中，先通过 `texImage2D` 预分配纹理底层存储。本指南的片段使用 WebGL 2 上下文（`canvas.getContext("webgl2")`）。调用 `texImage2D()`，用 `null` 代替像素数据，为指定尺寸和格式保留 GPU 内存，不上传任何像素。遵循以下规则：
  - 如上所示，根据 `captureElementImage()` 确定纹理尺寸。
  - 只在首次上传或尺寸改变时分配第 0 级，因为重新分配会清空纹理。使用可变存储：不可变的 `texStorage2D()` 存储无法在元素尺寸变化时调整大小。

```js
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


- 然后，在 WebGL 上下文中，通过 `texElementSubImage2D` 将 HTML 内容渲染到纹理。遵循以下规则：
  - 在配置中传入 `{ width, height }`，无论画布如何缩放，都能使复制结果填满已分配纹理。
  - 如果尺寸变化，按上文所示重新分配纹理。

```js
// Uploads the element into the texture. Returns false if the element has no
// paint record yet. In that case, it's uploaded on the next paint event.
function uploadElementWebGL(gl, canvas, texture, element, state) {
  const size = getElementImageSize(canvas, element);
  if (!size) return false;
  const { width, height } = size;

  // Bind the texture, and reallocate it if the size changed (see above).
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


- 在 WebGPU 上下文中，使用 `drawElementImageToTexture`。遵循以下规则：
  - 创建纹理时包含 `COPY_DST` 和 `RENDER_ATTACHMENT` 用途；若要在着色器中采样，再添加 `TEXTURE_BINDING`。用途错误会报告为 WebGPU 验证错误，而不是异常。
  - 将纹理尺寸作为 `size` 传入。没有 `size` 时，较大的元素会被裁切至纹理尺寸；有 `size` 时，元素会缩放以填满纹理。
  - WebGPU 纹理无法调整尺寸。元素尺寸变化时重新创建纹理，并重建引用它的绑定组。

```js
// WebGPU textures can't be resized. Create the texture once, and recreate it
// when the element size changes.
function ensureElementTexture(device, state, width, height) {
  if (state.texture?.width === width && state.texture?.height === height) {
    return state.texture;
  }
  state.texture?.destroy();
  state.texture = device.createTexture({
    size: { width, height },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  return state.texture; // Recreate the bind groups that used the previous texture.
}

const textureState = { texture: null };

canvas.onpaint = () => {
  const size = getElementImageSize(canvas, uiElement);
  if (!size) return;
  const previousTexture = textureState.texture;
  const texture = ensureElementTexture(device, textureState, size.width, size.height);
  if (texture !== previousTexture) {
    // New texture: create, or rebuild, the bind groups that reference it.
  }
  try {
    device.queue.drawElementImageToTexture({ source: uiElement }, { texture, size });
  } catch (err) {
    console.error('drawElementImageToTexture copy failed:', err);
  }
};
```


使用 `requestAnimationFrame` 循环渲染场景时，在循环内调用 `canvas.requestPaint()`，确保 HTML 内容被渲染到画布。`event.changedElements` 列出渲染发生变化的元素。确保只有后代 HTML 元素更新时，才重绘元素或重新上传纹理：

```js
function render() {
  // Request to update the canvas
  canvas.requestPaint();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

canvas.onpaint = (event) => {
  if (event.changedElements && event.changedElements.length > 0) {
    // Redraw the element, or update its texture, as shown above
  }
  // In WebGL and WebGPU, render the scene, and sync the element geometry as shown in step 6
};
```


6. 同步元素几何信息。

浏览器需要知道 HTML 元素绘制在哪里，使其 DOM 位置匹配绘制出的像素。点击、文本选择等命中测试，以及无障碍功能，都会使用这些几何信息：未更新几何信息的 `drawable` 元素仍会暴露在无障碍树中，但缺少几何信息。画布只会对通过 2D `drawElementImage()` 绘制，或通过 `updateElementGeometry()` 注册的元素进行命中测试。

- 对于 2D 上下文，浏览器会自动同步元素。`drawElementImage()` 将 DOM 命中测试边界和屏幕阅读器焦点环与绘制坐标对齐，因此无需设置 `style.transform`。如果要手动管理几何信息，例如同一元素绘制多次，向 `drawElementImage()` 传入 `{ preserveElementGeometry: true }`，再通过 `canvas.updateElementGeometry()` 应用变换。

- 对于 WebGL 或 WebGPU 的 3D 情况，画布无法知道 HTML 元素绘制在哪里，需要你告知。计算一个 `DOMMatrix`，将以 CSS 像素表示的元素边框盒映射到同样以 CSS 像素表示的画布。浏览器需要通过视口变换，将 3D 坐标空间映射到 CSS 坐标空间。为此执行以下步骤：
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

<a id="example-code"></a>
## 示例代码

<a id="2d-canvas"></a>
### 2D 画布

```html
<canvas id="canvas" content="drawable" style="width: 400px; height: 200px;">
  <div id="ui-element" drawable>
    <p>
      This text is rendered inside the canvas but is present in the DOM tree.
    </p>
    <input type="email" name="email" placeholder="enter your email" />
    <button type="button">Submit</button>
  </div>
</canvas>

<script>
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const uiElement = document.getElementById("ui-element");

  canvas.onpaint = () => {
    ctx.reset();
    // Draw the HTML element at x:0, y:0. The browser syncs the DOM location
    // with the drawn location.
    ctx.drawElementImage(uiElement, 0, 0);
  };

  // Handle resizing to match device pixels
  const observer = new ResizeObserver(([entry]) => {
    const dpc = entry.devicePixelContentBoxSize;
    canvas.width = dpc
      ? dpc[0].inlineSize
      : Math.round(entry.contentRect.width * window.devicePixelRatio);
    canvas.height = dpc
      ? dpc[0].blockSize
      : Math.round(entry.contentRect.height * window.devicePixelRatio);
    canvas.requestPaint();
  });

  const supportsDevicePixelContentBox =
    typeof ResizeObserverEntry !== "undefined" &&
    "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
  const options = supportsDevicePixelContentBox
    ? { box: "device-pixel-content-box" }
    : {};
  observer.observe(canvas, options);
</script>
```


<a id="webgl-canvas"></a>
### WebGL 画布

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

  // getElementImageSize(), allocateElementTexture(), and uploadElementWebGL()
  // are defined in step 5.
  // computeCanvasTransform() is defined in step 6.

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


<a id="webgpu-canvas"></a>
### WebGPU 画布

```html
<canvas id="canvas" content="drawable" style="width: 400px; height: 400px;">
  <div id="ui-element" drawable>
    <p>WebGPU UI Element</p>
  </div>
</canvas>

<script>
  const canvas = document.getElementById("canvas");
  const context = canvas.getContext("webgpu");
  const uiElement = document.getElementById("ui-element");

  // getElementImageSize() and ensureElementTexture() are defined in step 5.
  // computeCanvasTransform() is defined in step 6.

  // Setup WebGPU...
  // const device = ...
  const textureState = { texture: null };

  canvas.onpaint = () => {
    // 1. Copy HTML content to a texture that matches the element size
    const size = getElementImageSize(canvas, uiElement);
    if (size) {
      const previousTexture = textureState.texture;
      const texture = ensureElementTexture(device, textureState, size.width, size.height);
      if (texture !== previousTexture) {
        // New texture: create, or rebuild, the bind groups that reference it.
      }
      try {
        device.queue.drawElementImageToTexture({ source: uiElement }, { texture, size });
      } catch (err) {
        console.error('drawElementImageToTexture copy failed:', err);
      }
    }

    // ... Render your 3D scene here, calculating htmlElementMVP matrix ...

    // 2. Sync DOM position, hit testing, and accessibility bounds (same matrix math as WebGL)
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
- **强制要求**：为每个需要绘制的元素添加 `drawable`，包括画布的直接子元素。
- **强制要求**：使用 `onpaint` 事件处理器，将 HTML 内容渲染到画布。
- **强制要求**：2D 中使用 `drawElementImage`，WebGPU 中使用 `drawElementImageToTexture`，将 HTML 内容渲染到画布。
- **强制要求**：WebGL 中，在初始化或元素尺寸改变时，使用 `texImage2D()` 预分配一次纹理缓冲区。只在尺寸变化时重新分配，并将 `TEXTURE_MIN_FILTER` 设为 `LINEAR`。
- **强制要求**：WebGL 中，通过 `texElementSubImage2D` 将 HTML 内容渲染到纹理；该纹理需通过 `texImage2D()` 预分配，尺寸来自 `captureElementImage()`。
- **强制要求**：WebGPU 中，根据 `captureElementImage()` 确定纹理尺寸，只在尺寸改变时重新创建。创建纹理时包含 `COPY_DST` 和 `RENDER_ATTACHMENT` 用途，并将纹理尺寸作为 `size` 传入。
- **强制要求**：使 HTML 元素几何信息与渲染内容同步。2D 中由 `drawElementImage` 自动完成；WebGL 和 WebGPU 中调用 `canvas.updateElementGeometry(element, { canvasTransform })`。
- **强制要求**：使用 `ResizeObserver` 观察屏幕尺寸，并更新画布尺寸以匹配设备像素。
- **不要**在画布内嵌入跨源内容，因为不受支持。
- **不要**在 `onpaint` 事件处理器内初始化 `ResizeObserver`，这可能造成内存泄漏。

<a id="fallback-strategies"></a>
## 回退策略

HTML-in-canvas 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 157（2026 年 11 月）和 Edge 157（2026 年 11 月）。
不支持的浏览器：Firefox 和 Safari。

HTML-in-Canvas API 目前尚未被所有现代浏览器支持，因此通常需要回退策略。

不过，考虑到此 API 带来的性能提升，浏览器支持时应使用 HTML-in-Canvas。

回退策略取决于使用场景。例如，画布中的交互式 HTML 内容，在不支持 HTML-in-Canvas 时，可通过 CSS 将 HTML 内容放到画布上方。

<a id="html-in-canvas-polyfills"></a>
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
