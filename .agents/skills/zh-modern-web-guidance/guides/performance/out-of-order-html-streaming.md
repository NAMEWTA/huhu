<a id="out-of-order-ooo-html-streaming"></a>

# 乱序（OOO）HTML 流式传输

乱序（Out-of-Order，OOO）HTML 流式传输，也称为声明式局部更新，是传统 HTML“从上到下”线性处理方式的替代方案。开发者可以在文档前部定义占位符，然后使用同一网络流中稍后到达的内容，或新的命令式 JavaScript 流式 API，为这些位置“打补丁”。

<a id="quick-overview"></a>

## 快速概览

该特性主要包含两种机制：

1. **声明式补丁（基于 HTML）**：使用新的处理指令 `<?marker>`、`<?start>`、`<?end>` 和 `<template for>`，在服务器内容流入时替换 DOM 内容。
2. **命令式设置与流式处理（基于 JS）**：提供一组新方法，例如 `streamHTML()`、`setHTMLUnsafe()`，以原生性能设置 HTML，或将可读流直接导入 DOM 元素，并支持可选的脚本执行。

<a id="best-practices"></a>

## 最佳实践

* **优先传输首屏内容**：先传输关键 UI，包括页头、主视觉区、主要导航和主要内容。对于评论、广告、相关内容等“高开销”或低优先级组件，使用占位符。
* **实现原生加载状态**：使用 `<?start>` 与 `<?end>` 标记包裹回退内容。对应的 `<template for>` 到达后，浏览器会自动替换两个标记之间的全部内容。
* **尽量降低累积布局偏移（CLS）**：始终为占位符提供稳定尺寸。如果最终内容尺寸未知，使用骨架屏或 CSS `aspect-ratio` 预留空间，防止突兀位移。

<a id="accessibility-considerations"></a>

## 无障碍考虑

乱序更新可能让屏幕阅读器用户、认知障碍用户，以及不使用鼠标或触摸操作页面的人感到困惑。尤其需要确保：如果被替换的占位符中包含当前活动元素，焦点不能丢失。

另外，当用户主观感受到内容流入耗时较长时，可能需要提供“正在加载……”等文字进度信息，并放入动态区域（live region），避免用户以为页面已经“坏了”。

虽然你可能想在流式传输过程中通知每一次页面内容变化，但过多通知会打断并困扰用户，即使出发点是好的。特别注意：

* 必须：仅为表示进度的文字容器设置动态区域标记。不要把整个内容放进动态区域，否则流式传输完成后，屏幕阅读器会朗读完整的“补丁”内容，让用户难以承受。
* 必须：不要用 `role="alert"` 传递进度信息。NVDA 等屏幕阅读器会先朗读“Alert”，再读动态区域文本；如果相关内容并非警报，这会让用户烦扰。

选择合适方案时，要考虑流式传输内容的类型，以及这些内容正在填充的组件类型。

例如，考虑以下场景。

1. **由多个面板组成的仪表板式界面**：用户能够把主要内容区域作为整体进行交互之前，各面板的内容会分阶段加载；其中一些面板加载耗时较长，可能达到一分钟甚至更久。此时需要基于动态区域的通知。为受影响面板的容器设置 `aria-busy="true"`，让屏幕阅读器用户知道内容尚未准备好交互。流式传输完成后，将其设为 `false`。
   * 必须：不要把动态区域通知嵌套在 `aria-busy="true"` 的面板内，否则屏幕阅读器会等到全部内容加载完成后才播报通知。
   * 必须：加载过程中焦点必须保持原位；加载期间或完成后都不能自动移到这些内容上。
2. **单页应用**：应用由一个 HTML 文档组成。激活链接时不会打开新页面，而是通过流式传输用新内容自动替换当前页面。除非流入内容渲染较慢造成延迟，否则不需要动态区域通知。不过，流式传输完成后，焦点应移到新内容开头。
3. **随用户滚动而流入内容的商品页**：页面加载时显示 10 件商品，用户滚动时通过流式传输增加更多商品。加载期间有短暂延迟，显示“正在加载更多商品……”信息，随后被新内容替换。与第一个场景类似，应把这条信息放入动态区域，为更新内容的容器设置 `aria-busy`，完全加载后重置为 `aria-busy="false"`；焦点保持原位，不移动到新内容。
4. **子菜单内容通过流式传输渲染的大型菜单**：无论子菜单内容在折叠时乱序流入，还是在展开后几乎立即流入，其交互方式都可以与非流式内容相同。对屏幕阅读器用户的影响很小，因此无需动态区域或额外焦点管理。
5. **调用 API 检查当前状态后，添加到页头的个人资料小组件**：页面初始加载时，页头右侧显示“登录”链接。如果用户已登录，该链接会立即替换为个人资料菜单按钮。对这类用户而言，变化几乎察觉不到。与上一场景一样，无需动态区域通知，也不应把焦点移到新内容。

<a id="implementation-details"></a>

## 实现细节

<a id="1-declarative-html-markers"></a>

### 1. 声明式 HTML 标记

浏览器会查找特定的处理指令，确定应当在哪个位置应用内容补丁。

```html
<!-- A simple insertion point -->
<div id="sidebar">
  <?marker name="dynamic-comments">
</div>

<!-- A replacement range with loading state -->
<main>
  <?start name="main-content">
    <div class="skeleton" role="status">Loading main content...</div>
  <?end>
</main>

... (other content) ...

<!-- Later in the same stream, provide the content -->
<template for="dynamic-comments">
  <div class="comments">...</div>
</template>

<template for="main-content">
  <article>
    <h1>The Real Content</h1>
    <p>This replaces the skeleton div automatically.</p>
  </article>
</template>
```

`<template>` 替换某个插入点之后，该插入点就不再存在，无法再次使用。不过，`<template>` 内部可以包含新的插入点，供流中稍后到达的内容使用。

```html
 <?start name="replaced-content">
  <div class="skeleton">
<?end>
<!-- Later in the same stream, provide initial content -->
<template for="replaced-content">
  <?start name="replaced-content">
    <div>Quickly computed result</div>
  <?end>
</template>
<!-- Later in the same stream, provide full content -->
<template for="replaced-content">
  <?start name="replaced-content">
    <div>Full result</div>
  <?end>
</template>
```

<a id="2-imperative-js-streaming"></a>

### 2. 命令式 JS 流式处理

浏览器提供 24 个方法，即 6 种操作、每种 4 个变体，可以通过静态字符串或流更新 DOM。

<a id="api-reference-matrix"></a>

#### API 参考矩阵

| 操作 | 静态（安全） | 流式（安全） | 静态（不安全） | 流式（不安全） |
| :--- | :--- | :--- | :--- | :--- |
| **设置** | `setHTML()` | `streamHTML()` | `setHTMLUnsafe()` | `streamHTMLUnsafe()` |
| **替换** | `replaceWithHTML()` | `streamReplaceWithHTML()` | `replaceWithHTMLUnsafe()` | `streamReplaceWithHTMLUnsafe()` |
| **在前方插入** | `beforeHTML()` | `streamBeforeHTML()` | `beforeHTMLUnsafe()` | `streamBeforeHTMLUnsafe()` |
| **前置** | `prependHTML()` | `streamPrependHTML()` | `prependHTMLUnsafe()` | `streamPrependHTMLUnsafe()` |
| **追加** | `appendHTML()` | `streamAppendHTML()` | `appendHTMLUnsafe()` | `streamAppendHTMLUnsafe()` |
| **在后方插入** | `afterHTML()` | `streamAfterHTML()` | `afterHTMLUnsafe()` | `streamAfterHTMLUnsafe()` |

<a id="key-concepts"></a>

#### 关键概念

* **安全与不安全**：
  * **安全**方法，例如 `setHTML()`，默认使用内置清理器移除 `<script>` 标签等潜在危险内容。还可以通过选项传入自定义 `Sanitizer` 对象，在默认清理器之外继续应用。
  * **不安全**方法，例如 `setHTMLUnsafe()`，默认不进行清理，但仍可传入自定义 `Sanitizer`。若要允许新内容中的脚本执行，必须在选项中显式传入 `{ runScripts: true }`。**重要**：只有面对可信内容、且安全方法不能满足需要时，才使用不安全方法。
* **静态与流式**：
  * **静态**方法接收字符串或 `TrustedHTML`，并立即应用。
  * **流式**方法返回 `WritableStream`。这样可以将内容，例如 `fetch` 响应，直接输送到 DOM，浏览器会随着分块到达逐步渲染。

<a id="example-streaming-a-fetch-response"></a>

#### 示例：流式处理 Fetch 响应

可以将 fetch 响应直接输送到 DOM，无需手动处理数据分块。

```javascript
const main = document.querySelector('main');
const response = await fetch('/api/partial-update');

// Pipe the stream directly into the element
await response.body
  .pipeThrough(new TextDecoderStream())
  .pipeTo(main.streamHTMLUnsafe({ runScripts: true }));

// Or use the `textStream()` convenience method which streams directly without needing the intermediate `TextDecoderStream()` step
await response
  .textStream()
  .pipeTo(main.streamHTMLUnsafe({ runScripts: true }))
```

<a id="use-case-reference-matrix"></a>

## 使用场景参考

* **岛屿架构**：在静态 HTML 上为独立交互组件注入交互能力，无需完整框架运行时。
* **推迟高开销区块**：立即交付页面外壳，再在依赖大量数据库工作的组件准备好后流式发送。
* **单页应用（SPA）更新**：使用 `streamHTML()` 流式处理 SPA 的大型 UI 切换，无需等待完整 JSON 载荷后再手动构建 DOM。

<a id="anti-patterns--warnings-do-not-do-this"></a>

## 反模式与警告（不要这样做）

* **不要让所有内容都使用 OOO 流式传输。** 页面过度碎片化会增加流的复杂度；如果浏览器花太多时间修补小节点，还可能延迟内容出现。
* **不要忽略 Trusted Types。** 在强制执行 Trusted Types 的环境中使用 `*Unsafe` 方法时，按要求传入经过清理的策略对象。
* **不要假定脚本执行顺序。** `<template for>` 内的脚本一旦被补入文档就会执行，不要依赖它与其他延迟模板之间存在特定顺序。
* **不要在没有 polyfill 策略时使用。** 在该特性进入 Baseline 前，应确保有回退方案，或使用 `html-setters-polyfill` 与 `template-for-polyfill` 支持目标浏览器。

<a id="fallback-strategies"></a>

## 回退策略

<template for> 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

HTML setter 方法的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 157（2026 年 11 月）和 Edge 157（2026 年 11 月）。
不支持的浏览器：Firefox 和 Safari。

HTML 流式 setter 目前还没有得到任何主流浏览器的原生支持。

HTML 处理指令的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

可以使用 `template-for-polyfill` 和 `html-setters-polyfill` 等 polyfill，为不支持的浏览器模拟 API 接口。

不支持 `html-processing-instructions` 的浏览器会将 `<?marker>`、`<?start>` 和 `<?end>` 解析为注释。`template-for-polyfill` 仍能把这些注释识别为标记，因此所有浏览器都应使用相同的处理指令语法。不要为了不支持的浏览器而将标记改写为 HTML 注释或元素。
