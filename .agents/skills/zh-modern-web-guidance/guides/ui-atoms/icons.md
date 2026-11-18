<a id="using-and-managing-icons"></a>

# 使用与管理图标

<a id="choosing-an-icon-technique"></a>

## 选择图标技术

图标的存储方式与渲染方式是两个独立选择。例如，SVG sprite 既可以为 CSS 图标系统提供图标，也可以通过 `<use>` 引用。

* **CSS 图标系统：**需要由 CSS 决定何时显示、显示哪个图标时使用。单色图标用 mask，多色图标用背景图像。
* **SVG 配合 `<use>`：**复用 symbol，且其内置样式选项已经足够时使用。CSS 不能任意设置被引用 SVG 内容的样式或动画，但如果 symbol 在设计时支持，就可以传入继承属性和自定义属性。例如，path 可以使用 `fill="var(--icon-accent, currentColor)"`，让 CSS 为图标该部分着色。
* **内联 SVG：**需要任意设置 SVG 内部内容样式或动画时使用。
* **`<img>` 配合 CSS filter：**避免用它给图标重新着色。Filter 无法可靠地将任意 CSS 颜色值应用到图像，重新着色既麻烦又不灵活。

决策时问两个问题。CSS 是否需要选择或替换图标（组件默认值、状态变化、主题）？如果是，使用 CSS 图标系统。是否需要控制图标内部超出颜色的部分？如果是且图标源由你控制，就为 symbol 设计自定义属性并使用 `<use>`；如果不控制源文件，内联 SVG。第三方图标集很少暴露自定义属性，因此通过 `<use>` 引用时，除了颜色几乎没有其他控制能力。

无论选择哪种方法，确保所有图标在浅色和深色配色方案下，与背景至少有 3:1 对比度。更多细节参见 `color` 的对比度章节（通过 `npx -y modern-web-guidance@latest retrieve "color"` 获取）。

<a id="embedded-or-remote-icons"></a>

### 嵌入或远程图标

CSS 图标系统和 `<use>` 都可以从 data URI、独立文件或 sprite 获取图标。嵌入方式（data URI 或内联 SVG）避免请求，并能随首次绘制渲染，但会使 CSS 或 HTML 变大，也不能单独缓存，因此适合每页都出现的少量图标。独立文件可分别缓存、按需加载，代价是每个文件一个请求。Sprite 通过一次可缓存请求加载整组图标，但无论是否使用都会下载每个图标，而且 `<use>` 只能引用同源 sprite。少量核心图标优先嵌入，更大的图标集使用 sprite 或独立文件。

如果页面同时渲染数千个图标，应对真实页面和资源进行基准测试。一次压力测试中，内联 SVG 在这个规模下略有性能优势，但结果取决于浏览器和具体实现。[Cloud Four 的 SVG 图标压力测试](https://cloudfour.com/thinks/svg-icon-stress-test/)

<a id="primary-approach-css-driven-icon-engine"></a>

## 主要方式：CSS 驱动的图标引擎

将图标视为设计 token：每个图标是保存图像的自定义属性，任意元素通过设置 `--icon-start` 或 `--icon-end` 即可显示。引擎结合了三项 CSS 能力：

* **注册自定义属性（`@property`）**防止 `--icon-start` 和 `--icon-end` 被继承，使组件上的图标不会向子元素传播。
* **容器样式查询（`@container style(...)`）**检测元素是否被指定图标，并渲染它，无须修改 class 或标记。
* **CSS mask 和 `currentColor`**在伪元素中渲染图标，跟随元素文字颜色。尺寸、颜色、间距和垂直偏移从可继承的 `--icon-style-*` 属性读取，并提供合理回退，因此可从祖先重新设置整个子树。`--icon-style-` 前缀避免这些设置与同样位于 `--icon-*` 下的图标 token 冲突。

<a id="defining-icon-design-tokens"></a>

### 定义图标设计 token

将 SVG 图标和任何 `--icon-style-*` 覆盖定义为可复用自定义属性，使用内联 SVG data URI 或根相对 URL（如 `url("/icons/trash.svg")`）。图标从外部 SVG 文件加载时，使用根相对 URL 或嵌入 data URI。通过自定义属性使用的相对 URL，可能相对于使用图标的样式表解析，而非定义自定义属性的样式表。如果两份样式表在不同目录，URL 就可能解析到错误文件。

要让 URL 相对于定义图标 token 的样式表，注册属性本应有所帮助：已注册 `<url>` 或 `<image>` 的计算值会相对于声明它的样式表解析。不要依赖将 token 注册为 `<image>` 并把 URL 放进 `initial-value` 的做法。Chrome 和 Safari 会相对于文档解析 `initial-value` 中的 URL，因此这种做法只有 Firefox 可用。Chrome 还会把 `:root` 上声明的值相对于文档解析，除非 syntax 以 `<url>` 开头。

如果相对 URL 无法避免，例如样式表分布在不同目录，使用以 `<url>` 开头的 syntax 注册 token，并在 `:root` 声明实际 URL。这样所有浏览器都会相对于声明的样式表解析：

```css
@property --icon-caret {
  /* The syntax must start with <url>. A syntax that starts with <image> resolves against the document in Chrome. */
  syntax: "<url> | <image> | none";
  inherits: true;
  initial-value: none;
}

:root {
  /* Declared here, the URL resolves against this stylesheet */
  --icon-caret: url("icons/caret.svg");
}
```


现在每个图标需要在两个位置声明，样板代码明显增多，所以只有项目存在不同目录的样式表、且图标数量可管理时才值得使用。图标超过十几个后，用脚本通过 `CSS.registerProperty` 注册 `--icon-*` token（排除 `--icon-style-*`），使用相同 syntax，而不是手写每个 `@property`。注册属性是全局的，且无法在 shadow root 中工作，因此不适合所有项目。如果可以使用根相对 URL 或 data URI，它们更简单，也普遍可用。

```css
:root {
  /* Optional: override the built-in fallbacks (1em, currentColor, 0.3em, -0.02em) */
  --icon-style-size: 1em;
  --icon-style-spacing: 0.4em;
  --icon-trash: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z'/%3E%3C/svg%3E");
  --icon-favorite: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'/%3E%3C/svg%3E");
}
```


<a id="rendering-icons-from-tokens"></a>

### 从 token 渲染图标

元素把 `--icon-start`（前置）或 `--icon-end`（后置）设为上面的某个 token，就能显示图标。两部分 CSS 将赋值转为渲染结果。

首先，用 `@property` 注册 `--icon-start` 和 `--icon-end`。`"*"` syntax 接受任意值，关键是 `inherits: false`：没有它，按钮上的图标会被所有后代继承，而每个后代也会渲染这个图标。

```css
@property --icon-start {
  syntax: "*";
  inherits: false;
}

@property --icon-end {
  syntax: "*";
  inherits: false;
}
```


其次，容器样式查询检测元素上是否设置该属性，并在伪元素中渲染图标。因为伪元素不继承 `--icon-start`（它被注册为不继承），第一条声明通过 `inherit` 显式转发值。其余声明处理尺寸、mask、对齐和间距。填充默认为 `currentColor`，因此图标采用元素文字颜色，并跟随其过渡。

```css
/* Style query for elements configuring a start icon */
@container style(--icon-start) {
  ::before {
    --icon-start: inherit; /* Forward the value inside the query block */
    content: "" / var(--icon-style-alt, "");
    display: inline-block;
    width: var(--icon-style-size, 1em);
    height: var(--icon-style-size, 1em);
    background-color: var(--icon-style-color, currentColor);
    mask: var(--icon-start) no-repeat center / contain;
    /* Center on the cap height, nudged slightly up for optical balance */
    vertical-align: calc(0.5cap - var(--icon-style-size, 1em) / 2 + var(--icon-style-voffset, -0.02em));
    flex: none;
    pointer-events: none;
    forced-color-adjust: none;
  }

  /* Automatically add spacing ONLY if the element has other text or sibling content */
  :where(:not(.icon, :empty))::before {
    margin-inline-end: var(--icon-style-spacing, 0.3em);
  }
}
```


每条声明都有作用：

* **`vertical-align`**：`middle` 对齐到 x-height 的一半，大多数图标集看起来会偏低。以 `0.5cap` 居中，在 `--icon-style-size` 增大时仍固定图标中心；较小的负 `--icon-style-voffset` 补偿视觉上对图标上方空间比下方空间更敏感的感受。
* **`flex: none`**：空伪元素最小尺寸为零，因此 flex 按钮标签较长时，它最先缩小，甚至完全消失。图标尺寸是设计决定，不应交由布局压力随意调整。
* **`pointer-events: none`**：防止图标截获点击或成为 `event.target`。
* **`forced-color-adjust: none`**：否则在强制颜色模式下，浏览器会替换 `background-color`，使 mask 图标消失。该设置保留 mask 填充，且 `currentColor` 仍跟随强制文字颜色。
* **`content: "" / var(--icon-style-alt, "")`**：生成内容的替代文本，让纯图标控件通过 `--icon-style-alt` 从图标取得无障碍名称（见下方“纯图标控件”）。默认空替代文本让装饰性图标对辅助技术隐藏。

后置图标采用同样模式，将 `--icon-start`、`::before` 换为 `--icon-end`、`::after`。使用 `mask: var(--icon-end)`，并用 `margin-inline-start` 取代 `margin-inline-end` 设置间距。

<a id="standalone-and-icon-only-elements"></a>

### 独立图标与纯图标元素

对于独立图标或纯图标按钮，直接将 `.icon` 应用于空元素（纯图标控件时就是按钮自身），通过 `--icon` 设置图标。这里 `--icon` 是较高层属性；`.icon:empty` 规则将它映射到 `--icon-start`，形成前置图标：

```css
.icon:empty {
  --icon-start: var(--icon);
}
```


<a id="usage-examples"></a>

## 使用示例

<a id="component-defaults-in-the-stylesheet"></a>

### 样式表中的组件默认值

将图标作为自定义属性的主要好处是参与层叠。在选择器上设置图标，所有匹配元素都能得到它，无须修改标记：

```css
.button-delete {
  --icon-start: var(--icon-trash);
}

a[href^="http"]:not([href*="example.com"]) {
  --icon-end: var(--icon-external);
}
```


```html
<button class="button-delete">Delete item</button>
```


<a id="changing-icons-with-state"></a>

### 随状态改变图标

图标只是一个属性，因此状态变化就是普通 CSS 覆盖。无须显示或隐藏第二个元素，也无须切换 class：

```css
.button-expand {
  --icon-start: var(--icon-caret-right);
}

.button-expand[aria-expanded="true"] {
  --icon-start: var(--icon-caret-down);
}
```


外观同样如此：在工具栏等容器上设置 `--icon-style-size`、`--icon-style-color` 或 `--icon-style-spacing`，内部所有图标都会更新。

<a id="one-off-icons-with-inline-styles"></a>

### 通过内联样式设置一次性图标

没有组件规则覆盖的元素，可以内联设置同一属性，例如 `<button style="--icon-start: var(--icon-trash)">`。把它视为特殊情况下的出口，而非默认方式：同一类元素重复使用同一图标后，就应移到样式表规则中。

<a id="icon-only-controls"></a>

### 纯图标控件

纯图标按钮使用上面的 `.icon` class 和 `--icon`。通过 `aria-label` 为按钮提供无障碍名称，或让图标通过 `--icon-style-alt` 提供；两者都没有时，CSS 生成的图标只是装饰。独立且传达信息的图标，应通过 `role="img"` 和 `aria-label` 暴露 `.icon` 元素：

```css
.button-close {
  --icon: var(--icon-close);
  --icon-style-alt: "Close";
}
```


```html
<!-- Icon-only interactive control, icon and name from the stylesheet -->
<button class="icon button-close"></button>

<!-- Icon-only interactive control, named via aria-label -->
<button class="icon" style="--icon: var(--icon-trash);" aria-label="Delete item"></button>

<!-- Standalone informative icon -->
<span class="icon" style="--icon: var(--icon-favorite);" role="img" aria-label="Favorite"></span>
```


<a id="working-with-svg-directly"></a>

## 直接使用 SVG

CSS 图标系统不合适时，将内联 SVG 与 `<use>` 配合，而不是当作二选一。图标在页面首次出现时内联 SVG，重复出现时用 `<use href="#id">` 引用；本地引用不增加请求，也没有跨源限制。跨多页共享的图标，才使用外部 sprite（`<use href="/icons.svg#id">`）。

使用 `<use>` 时，被引用内容克隆到 shadow 树中，因此页面 CSS 无法选择内部元素。继承可以进入：包括 `color`、`currentColor` 和任意自定义属性。除了 SVG 展示属性，现代 CSS 也能修改许多几何属性，因此你控制的图标可以精确暴露所需接口，例如 `stroke-width="var(--icon-stroke, 2)"`，甚至为特定 path 设置 `d: var(--icon-path, path(…))`。

css.properties.d 能力的浏览器支持状态：有限可用。
支持的浏览器：Chrome 52（2016 年 7 月）、Edge 79（2020 年 1 月）和 Firefox 97（2022 年 2 月）。
不支持：Safari。

Safari 不支持 CSS `d`，因此只有在可接受这个支持缺口时才使用这种定制。如果不控制图标源，直接内联。

需要了解的 `<use>` 陷阱：

* `viewBox` 必须位于 `<symbol>` 或被引用的 `<svg>` 上；包裹 `<use>` 的外层 `<svg>` 不会从引用自动取得它，因此给包装器设置 `width`、`height`，将 `viewBox` 保留在 symbol 上。
* 样式双向都不会跨边界：外部 sprite 内的 `<style>` 不作用于页面，页面样式表也不作用于被引用树内部。只有继承属性和自定义属性能穿过。
* 外部引用仅允许同源；跨源 sprite 会静默失败。
* 内联到文档中的 sprite 与页面共享 `id` 命名空间，因此应为 symbol id 加命名空间，避免冲突。

将装饰性 SVG 标记为 `aria-hidden="true"`，并为所在控件提供自己的无障碍名称，与 CSS 图标系统一致。

<a id="fallback-strategies"></a>

## 回退策略

<a id="registered-custom-properties"></a>

### 注册自定义属性

注册自定义属性的 Baseline 状态：新近可用。它自 2024-07-09 起进入 Baseline。
支持的浏览器：Chrome 85（2020 年 8 月）、Edge 85（2020 年 8 月）、Firefox 128（2024 年 7 月）和 Safari 16.4（2023 年 3 月）。

没有 `@property`，`--icon-start` 和 `--icon-end` 会像普通可继承自定义属性一样工作，元素设置图标后，后代也会渲染。为避免这一点，在样式查询中重置子元素的属性（`@container style(--icon-start) { * { --icon-start: initial; } }`），与下方 Safari 变通方案相同。

<a id="container-style-queries"></a>

### 容器样式查询

容器样式查询的 Baseline 状态：新近可用。它自 2026-05-19 起进入 Baseline。
支持的浏览器：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 151（2026 年 5 月）和 Safari 18（2024 年 9 月）。

为支持没有容器样式查询的浏览器，使用 class 或组件选择器作为回退接口。图标选择仍保留在自定义属性中；只用内联样式选择器会遗漏 CSS 规则指定的图标。

```css
:where(.icon-start, .icon:empty)::before {
  content: image-set(linear-gradient(transparent 0 100%), var(--icon-start)) / var(--icon-style-alt, "");
  /* icon styles */
}

:where(.icon-start)::before {
  --icon-start: inherit;
}

:where(.icon:empty)::before {
  --icon-start: var(--icon);
}

:where(.icon-start:not(.icon, :empty))::before {
  margin-inline-end: var(--icon-style-spacing, 0.3em);
}
```


后置图标采用同样的 class 接口回退，将 `.icon-start`、`--icon-start`、`::before` 换为 `.icon-end`、`--icon-end`、`::after`。对非空内容用 `margin-inline-start` 而不是 `margin-inline-end` 设置间距。

这个 `image-set()` 模式会在自定义属性未设置时使 `content` 无效，从而回退为 `none`，伪元素自动消失，无须添加或移除 class。它不会移除伪元素的其他样式，也不会阻止与其他 `::before` 或 `::after` 规则冲突，因此只在这些伪元素可专用于图标时使用。

<a id="safari-browser-workarounds"></a>

### Safari 浏览器变通方案

Safari 有两个影响图标的渲染缺陷：WebKit [#301609](https://bugs.webkit.org/show_bug.cgi?id=301609) 可能使图标在用户交互前不出现，[#320220](https://bugs.webkit.org/show_bug.cgi?id=320220) 也影响渲染。以下变通方案处理两者：

```css
@keyframes webkit-301609 {}

@supports ((-webkit-nbsp-mode: normal) or (-webkit-touch-callout: none) or (font: -apple-system-body)) and (content-visibility: auto) {
  @layer webkit-301609-fix {
    ::before, ::after {
      animation: webkit-301609 0s;
    }
  }
}
```


`@supports` 查询只针对 Safari，`@layer` 用于减少动画冲突。

WebKit 缺陷 #325900 可能在某些情况下阻止直接覆盖 `--icon-start` 生效，例如悬停时更换图标。这影响不继承的注册属性的变通方案。对于 Safari，将 `--icon-start` 注册为可继承，并在样式查询内对后代重置：

```css
@supports ((-webkit-nbsp-mode: normal) or
           (-webkit-touch-callout: none) or
           (font: -apple-system-body)) and (content-visibility: auto) {
  /* Override previous declaration */
  @property --icon-start {
    syntax: "*";
    inherits: true;
  }

  @layer webkit-325900-fix {
    @container style(--icon-start) {
      * {
        --icon-start: initial;
      }
    }
  }
}
```


重置阻止图标值传播到后代。将它保留在层中，可以让未分层的图标声明优先于重置规则。
