<a id="dark-mode"></a>
# 深色模式

`color-scheme` 属性说明页面支持哪些配色方案，例如浅色或深色。它告知浏览器，可以自动为滚动条、表单控件和默认画布背景等原生界面元素设置主题，使其匹配站点设计，并尽量减少首次加载时的白色闪烁。

<a id="implementation"></a>
## 实现

<a id="1-declare-supported-schemes-in-html"></a>
### 1. 在 HTML 中声明支持的方案

强制要求：为帮助防止“未应用主题内容闪烁”（FOUC），在 `<head>` 中放置 `<meta>` 标签，让浏览器在开始渲染前就知道支持哪些主题。此 `<meta>` 标签会提前设置初始画布颜色，有助于避免 FOUC，但在所有浏览器或加载条件下，并不一定能完全消除闪烁。

```html
<!-- MANDATORY: Declare support for both light and dark themes -->
<meta name="color-scheme" content="light dark">
```


<a id="2-apply-page-wide-color-scheme-to-css-root-or-html"></a>
### 2. 在 CSS :root 或 html 上应用全页配色方案

强制要求：将 `color-scheme` 应用于 `html` 元素或 `:root` 伪类。浏览器会专门查看根元素，以确定整个视口的主题，包括根滚动条和初始“画布”背景。如果只应用到 `body`，这些全局界面表面可能仍保持浅色模式，因为 `body` 不控制窗口渲染上下文。

```css
/* MANDATORY: Apply color-scheme to :root or html for viewport-wide theming */
:root {
  /* MANDATORY: Automatically adapt native UI to user system preferences */
  color-scheme: light dark;
}
```


<a id="3-define-light-and-dark-color-tokens"></a>
### 3. 定义浅色和深色颜色令牌

可以用 `light-dark()` 定义自动适应不同 `color-scheme` 值的颜色令牌。

建议同时将原始颜色值保存在独立自定义属性中，这样更容易采用不同方式组合，需要时也更容易实现回退。

若要更精细地控制 `accent-color` 或 `scrollbar-color` 等内置界面颜色，作者**可以选择**通过自定义属性和/或 `light-dark()` 添加自己的动态颜色。该函数根据元素计算后的 `color-scheme` 自动选择正确颜色，无需冗余媒体查询，但基础实现并不要求使用它。

```css
:root {
  --color-brand-light: oklch(45% 0.23 270);
  --color-brand-dark: oklch(85% 0.15 210);
  --color-brand-text-light: white;
  --color-brand-text-dark: oklch(40% 0.23 270);

  --color-brand: light-dark(var(--color-brand-light), var(--color-brand-dark));
  --color-brand-text: light-dark(var(--color-brand-text-light), var(--color-brand-text-dark));

  /* MANDATORY: Automatically adapt native UI to user system preferences */
  color-scheme: light dark;
}

button.primary {
  /* These automatically adapt to color scheme */
  background-color: var(--color-brand);
  color: var(--color-brand-text);
}
```


可选：有许多系统颜色可用，也会自动适应当前配色方案及其他颜色模式，例如强制颜色模式。这些颜色包括 `canvas`、`canvastext`、`accentcolor`（需检查支持情况）、`buttonborder` 等。除了必须精确匹配某些默认浏览器界面，或用作回退与默认值的特定场景外，它们通常过于有限，实用性不高。

<a id="optional-tailor-color-pairs-to-context"></a>
#### 可选：根据上下文调整配色对

即使覆盖系统默认设置，使用 `prefers-color-scheme` 媒体查询定义**不同**的配色对仍可能有用，以顾及页面周围浏览器与操作系统界面的颜色；页面作为 iframe 使用时，则顾及周围页面的颜色。

例如，当系统设置为 `dark` 时，使用稍暗一点的浅色主题；当系统设置为 `light` 时，使用对比更强的深色主题，避免页面在视觉上被周围界面压过。

<a id="fine-grained-browser-ui-customization"></a>
## 精细定制浏览器界面

设置 `color-scheme` 已能让浏览器界面适应当前配色方案，但它会使用操作系统默认值或系统颜色，可能与网站设计不完全一致。
现代浏览器为这些部分提供了多种精细定制接口。
在尚未充分尝试现代浏览器提供的定制接口前，不要仅为改变外观就重新实现原生控件。

<a id="setting-the-accent-color"></a>
### 设置强调色

某些浏览器界面，例如已选中的复选框或滑块，会使用强调色。
它默认采用操作系统设置，但可以通过 `accent-color` 将其设为更符合页面的颜色，例如品牌色。

```css
html {
  accent-color: light-dark(var(--color-accent-light), var(--color-accent-dark));
}
```


<a id="issues-to-be-aware-of-when-using-accent-color"></a>
### 使用 accent-color 时需要注意的问题

浏览器对 `accent-color` 的渲染各不相同。
对于通常绘制在强调色背景上的指示标记，例如复选框勾号和单选按钮圆点，浏览器可能采用不同处理：
- **Chromium** 和 **Firefox** 通常选择有足够对比的标记颜色。
- **Safari** 则可能在浅色模式保留白色标记、深色模式保留黑色标记，同时调整其背后的强调色。该调整并非对每种提供的颜色都能产生足够对比，因此需在 Safari 中测试重要组合，包括浅色和深色配色方案。不要假设 Safari 会自动选择对比度最佳的标记颜色。

<a id="scrollbar-colors"></a>
### 滚动条颜色

可以将 `scrollbar-color` 与 `light-dark()` 结合，设置适应当前配色方案的自定义滚动条颜色。

```css
:root {
  --color-scrollbar-track: light-dark(#eee, #222);
  /* Example values: the thumb needs at least 3:1 contrast against the track */
  --color-scrollbar-thumb: light-dark(#6b6b6b, #8a8a8a);
  scrollbar-color: var(--color-scrollbar-thumb) var(--color-scrollbar-track);
}
```


<a id="issues-to-be-aware-of-when-using-scrollbar-color"></a>
### 使用 scrollbar-color 时需要注意的问题

- 不要为 `scrollbar-color` 设置动画或过渡。[WebKit 的一个缺陷](https://bugs.webkit.org/show_bug.cgi?id=311752)会使滚动条在每次 `scrollbar-color` 变化时闪烁。
- 只要计算后的 `scrollbar-width` 不是 `auto`，而是 `thin` 或 `none`，或计算后的 `scrollbar-color` 不是 `auto`，包括继承得到的 `scrollbar-color`，该元素上的旧式 `::-webkit-scrollbar` 伪元素就会被禁用。
- 对于覆盖式滚动条，例如 macOS 默认样式，`scrollbar-color` 会在滚动期间设置滑块样式，而轨道可能保持透明。确保滑块颜色相对于轨道色和可滚动容器背景都有足够对比度，不要只依赖轨道衬托滑块。

<a id="further-customization"></a>
### 进一步定制

大多数浏览器界面都提供伪元素，可完全定制其外观，例如：
- `::placeholder`
- `::spelling-error`
- `::grammar-error`
- `::selection`
- `::search-text`
- `::target-text`
- `::file-selector-button`

可以在这些伪元素上使用 `light-dark()` 颜色，使其适应当前配色方案。

<a id="4-varying-images-for-light-and-dark-mode"></a>
## 4. 为浅色和深色模式使用不同图片

对于 CSS 图片，也可以使用 `light-dark()` 提供不同图片值。

重要：`light-dark()` 的两个值必须属于相同类型，不能将颜色与图片混合。
如果其中一个必须是图片，用 `image(<color>)` 包裹颜色值。

<a id="js-based-theme-detection"></a>
## 基于 JS 的主题检测

大多数配色方案分支应在 CSS 中实现，它会自动适应变化。

任何读取 `matchMedia("(prefers-color-scheme: dark)").matches` 的 JS，也必须处理其 `change` 事件，因为系统偏好可能随时改变。

<a id="optional-implementing-a-color-scheme-toggle"></a>
## 可选：实现配色方案切换器

如果希望用户能为此站点手动覆盖系统默认设置，可以实现深色模式切换器。
大多数站点不需要在主界面中持续显示切换器。
通常默认遵循系统配色方案已足够，也可选择在独立设置界面提供选项。
关于实现深色模式切换器的最佳实践，无论是否持续显示，参见 `dark-mode-toggle`，可通过 `npx -y modern-web-guidance@latest retrieve "dark-mode-toggle"` 获取。

<a id="optional-component-specific-overrides"></a>
## 可选：针对特定组件覆盖

可以通过为特定元素设置 `color-scheme`，覆盖全局主题。

更多信息与注意事项见 `component-specific-light-dark-theme`，可通过 `npx -y modern-web-guidance@latest retrieve "component-specific-light-dark-theme"` 获取。

<a id="known-issues-to-be-aware-of"></a>
## 需要注意的已知问题

<a id="issues-to-be-aware-of-when-using-color-scheme"></a>
### 使用 color-scheme 时需要注意的问题

- Chrome 和 Firefox 会在 iframe 中遵循 `color-scheme`：它们按正确配色方案渲染嵌入页，并调整嵌入页的 `prefers-color-scheme` 媒体查询，使其反映嵌入上下文的 `color-scheme`。Safari 不会这样做，即使在 iframe 内，仍按系统设置解析 `prefers-color-scheme`。
  - **如果同时控制父页面和 iframe：**显式将父页面配色方案传给 iframe，可以在构建 iframe 时通过 URL 参数（`?theme=dark`），或通过 `postMessage()`，后者还可响应运行时变化。在 iframe 内，根据该信号为 `<html>` 设置类，和/或为 `:root` 设置 `color-scheme`，不要依赖 `prefers-color-scheme`。
  - **如果只控制嵌入页：**在 Safari 中，没有可靠方法能从 iframe 内检测嵌入上下文的 `color-scheme`。为嵌入 API 提供显式主题参数，例如查询字符串或 `postMessage` 协议，并向嵌入方提供文档。

<a id="fallback-strategies"></a>
## 回退策略

<a id="fallbacks--browser-support-for-color-scheme"></a>
### color-scheme 的回退与浏览器支持

color-scheme 的 Baseline 状态：广泛可用。自 2022-02-03 起纳入 Baseline。
支持的浏览器：Chrome 98（2022 年 2 月）、Edge 98（2022 年 2 月）、Firefox 96（2022 年 1 月）和 Safari 13（2019 年 9 月）。

`color-scheme` 属于**渐进增强**。
不支持的浏览器会忽略该属性，并使用默认的浅色界面。

为在旧浏览器中适应用户偏好，使用 `prefers-color-scheme` 媒体查询，在用户偏好深色模式时提供不同颜色。

- 应使用媒体查询切换 `:root` 或 `html` 上的自定义属性。
- 避免在单个组件上使用该媒体查询，除非组件需要颜色以外某种非常具体的深色模式定制。

```css
:root {
  /* Define brand colors for each mode */
  --color-brand-light: #0056b3;
  --color-brand-dark: #00e5ff;
  --color-brand-text-light: white;
  --color-brand-text-dark: #001f24;
  --color-brand: var(--color-brand-light);
  --color-brand-text: var(--color-brand-text-light);

  /* MANDATORY: Fallback for browsers without light-dark support */
  @media (prefers-color-scheme: dark) {
    --color-brand: var(--color-brand-dark);
    --color-brand-text: var(--color-brand-text-dark);
  }

  /* Ignored in older browsers */
  color-scheme: light dark;
}

button.primary {
	background-color: var(--color-brand);
	color: var(--color-brand-text);
}
```


<a id="fallbacks--browser-support-for-light-dark"></a>
### light-dark() 的回退与浏览器支持

light-dark() 的 Baseline 状态：新近可用。自 2024-05-13 起纳入 Baseline。
支持的浏览器：Chrome 123（2024 年 3 月）、Edge 123（2024 年 3 月）、Firefox 120（2023 年 11 月）和 Safari 17.5（2024 年 5 月）。

对于支持 `color-scheme` 但尚不支持 `light-dark()` 的浏览器，应先将浅色和深色版本定义为自定义属性，再使用 `prefers-color-scheme` 媒体查询设置相应模式的颜色，如下例所示：

```css
:root {
  /* Define browser UI accent color for each mode */
  --brand-accent-light: #0056b3;
  --brand-accent-dark: #00e5ff;
  --accent-color: var(--brand-accent-light);

  /* MANDATORY: Fallback for browsers without light-dark support */
  @media (prefers-color-scheme: dark) {
    --accent-color: var(--brand-accent-dark);
  }

  /* OPTIONAL: use light-dark() for more control of built-in UI colors */
  @supports (color: light-dark(white, black)) {
    --accent-color: light-dark(var(--brand-accent-light), var(--brand-accent-dark));
  }

  /* MANDATORY: Automatically adapt native UI to user system preferences */
  color-scheme: light dark;

  /* Example inherited color property */
  accent-color: var(--accent-color);
}

pre, code {
  color-scheme: dark;

  /* **Mandatory**: any inherited color properties must be set again, even if to the same design tokens */
  accent-color: var(--accent-color);
}
```


<a id="fallbacks--browser-support-for-light-dark-image-values"></a>
### light-dark() 图片值的回退与浏览器支持

light-dark() 图片值的 Baseline 状态：新近可用。自 2026-09-14 起纳入 Baseline。
支持的浏览器：Chrome 150（2026 年 6 月）、Edge 150（2026 年 7 月）、Firefox 150（2026 年 4 月）和 Safari 27（2026 年 9 月）。

对于不支持 `light-dark()` 图片值的浏览器，用 `image-set()` 作为开关：为每个选项赋予来自自定义属性的 `type()`，将未启用项设为不受支持的 MIME 类型，让浏览器丢弃该项。
启用项得到空值，因此它是没有 `type()` 的普通 `image-set()` 选项。

只需在 `:root` 定义一次开关，各处使用时都像 `light-dark()` 一样，只需内联提供两张图片。

```css
:root {
  --light-type: ;
  --dark-type: type("image/do-not-use");

  /* MANDATORY: Fallback for browsers without light-dark() image support */
  @media (prefers-color-scheme: dark) {
    --light-type: type("image/do-not-use");
    --dark-type: ;
  }
}

.hero {
  background-image: image-set(url(hero-light.png) var(--light-type), url(hero-dark.png) var(--dark-type));

  @supports (background-image: light-dark(url("a"), url("b"))) {
    background-image: light-dark(url(hero-light.png), url(hero-dark.png));
  }
}
```


- 只有选中的图片会被下载。
- 分辨率仍然有效：`image-set(url(a-1x.png) 1x var(--light-type), url(a-2x.png) 2x var(--light-type), url(b-1x.png) 1x var(--dark-type), url(b-2x.png) 2x var(--dark-type))`。
- **不要**为启用项使用 `type("")`。浏览器会将空字符串视为不受支持，并丢弃所有选项。
- 与 `light-dark()` 不同，此开关不会跟随子树上设置的 `color-scheme`。手动切换器，或任何设置了 `color-scheme` 的子树，也必须同时切换 `--light-type` 和 `--dark-type`。

<a id="alternative-one-custom-property-per-image"></a>
### 替代方案：每张图片一个自定义属性

只有少量图片变化时，这种方式更简单；但每张图片都需要自己的媒体查询分支，手动切换器也必须逐一切换它们。

```css
:root {
  --hero-image: url(hero-light.png);

  @media (prefers-color-scheme: dark) {
    --hero-image: url(hero-dark.png);
  }

  @supports (background-image: light-dark(url("a"), url("b"))) {
    --hero-image: light-dark(url(hero-light.png), url(hero-dark.png));
  }
}

.hero {
  background-image: var(--hero-image);
}
```


<a id="fallbacks--browser-support-for-image"></a>
### image() 的回退与浏览器支持

目前尚无主流浏览器原生支持 image()。

使用只有单个色标且没有位置的渐变，例如 `linear-gradient(blue)`。

css.types.gradient.linear-gradient.single_color_stop 能力的 Baseline 状态：新近可用。自 2025-04-04 起纳入 Baseline。
支持的浏览器：Chrome 135（2025 年 4 月）、Edge 135（2025 年 4 月）、Firefox 136（2025 年 3 月）和 Safari 18.4（2025 年 3 月）。

为获得更广泛的浏览器支持，可以为单个色标显式提供 `0 100%` 位置，例如 `linear-gradient(blue 0 100%)`。

<a id="fallbacks--browser-support-for-scrollbar-color"></a>
### scrollbar-color 的回退与浏览器支持

scrollbar-color 的 Baseline 状态：新近可用。自 2025-12-12 起纳入 Baseline。
支持的浏览器：Chrome 121（2024 年 1 月）、Edge 121（2024 年 1 月）、Firefox 64（2018 年 12 月）和 Safari 26.2（2025 年 12 月）。

此特性属于渐进增强，并非总是需要回退。

如果样式很重要，而且用户的 Baseline 目标为“Baseline 广泛可用”或更早版本，应提供非标准的 `::-webkit-scrollbar` 伪元素作为回退。

将旧式回退放在基础规则之后的 `@supports not (scrollbar-color: auto)` 块中，防止在同时原生支持标准属性与旧式 WebKit 选择器的浏览器里发生冲突。如果还在可滚动容器上设置了 `scrollbar-width: thin`，则在 `@supports not (scrollbar-color: auto)` 内，对同一选择器重设 `scrollbar-width: auto`，避免只支持 `scrollbar-width` 而不支持 `scrollbar-color` 的浏览器抑制 `::-webkit-scrollbar` 样式。

如果使用自定义属性定义颜色，它们会自动层叠到旧式 WebKit 选择器，无需重复定义。

```css
/* Legacy fallback for WebKit/Blink browsers */
@supports not (scrollbar-color: auto) {
  .scroller {
    /* Reset scrollbar-width: thin (if set) so it does not disable
       ::-webkit-scrollbar in browsers without scrollbar-color */
    scrollbar-width: auto;
  }

  .scroller::-webkit-scrollbar {
    /* Must define a base size (e.g., 8px for thin or 12px for default) for custom colors to render in WebKit */
    width: 12px;
    height: 12px;
  }

  .scroller::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
  }

  .scroller::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
}
```


<a id="fallbacks--browser-support-for-accent-color"></a>
### accent-color 的回退与浏览器支持

accent-color 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）、Firefox 92（2021 年 9 月）和 Safari 26.2（2025 年 12 月）。

`accent-color` 属于渐进增强。
不支持此属性的浏览器会忽略它，使用默认界面颜色。
