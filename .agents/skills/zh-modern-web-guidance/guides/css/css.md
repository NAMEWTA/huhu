<a id="css-modern-architecture"></a>

# CSS：现代架构

这些指南为编写可维护、符合标准的 CSS 提供高密度参考。

- [1. 基础](#1-foundations)
- [2. 继承与层叠](#2-inheritance-and-the-cascade)
- [3. 选择器与作用域](#3-selectors-and-scoping)
  - [复杂元素匹配优先使用 CSS 选择器而非 JS](#prefer-css-selectors-over-js-for-complex-element-targeting)
  - [使用 `:is()` 或 `:where()`，避免为回退重复 CSS 规则](#use-is-or-where-instead-of-css-rule-duplication-for-fallbacks)
  - [避免过度匹配](#avoid-overmatching)
    - [用 `:not()` 而非覆盖排除无关状态/目标](#use-not-instead-of-overrides-to-exclude-irrelevant-statestargets)
    - [排除可能深度嵌套的子树时优先 `@scope` 而非 `:not()`](#prefer-scope-over-not-for-excluding-potentially-deeply-nested-subtrees)
    - [针对特例可以覆盖](#overrides-are-fine-for-specialization)
    - [不使用全局重置](#no-global-resets)
  - [嵌套与作用域](#nesting-and-scoping)
- [4. 交互](#4-interactivity)
- [5. 设计令牌与主题](#5-design-tokens-and-theming)
  - [主题](#theming)
- [6. 响应式设计](#6-responsive-design)
- [7. 排版](#7-typography)
- [8. 视觉效果](#8-visual-effects)
- [9. 形状](#9-shapes)
- [10. 过渡与动画](#10-transitions--animations)
- [11. 生成内容](#11-generated-content)

<a id="1-foundations"></a>

## 1. 基础

对知识重复保持警惕。优先使用变量，避免重复；但只要可能，应优先使用内置约定，例如：
- 使用 `currentColor`，而不是定义变量后把 `color` 设为该变量
- 使用 `inherit` 关键字，而不是在父元素定义变量，并在父子元素的同一属性上都使用它
- 使用 `em` 单位，而不是 `font-size: var(--size)`
- 使用 `cqw`/`cqh`（或逻辑版本 `cqi`/`cqb`），而不是重复盒模型值
- 代码重复不等于知识重复。目标是稳健性和可维护性，而不是节省字符。
- 优先使用**逻辑属性和值**而非物理属性（例如用 `margin-inline-start` 代替 `margin-left`），使样式适应不同书写模式和方向。即使页面作者不打算本地化，外部翻译工具也经常在页面上下文中显示译文。
- 不要不加区分地使用逻辑属性。问自己“RTL 时是否希望它翻转？”；如果不希望，使用物理属性。
- 考虑不同显示模式（深色、高对比度）、视口尺寸和输入方式（触摸、键盘、指针）。

<a id="2-inheritance-and-the-cascade"></a>

## 2. 继承与层叠

**避免**为了管理特异性而引入 BEM 命名约定。应使用层叠层、`:where()` 等现代 CSS 特性，让层叠行为可预测，并符合作者意图。

使用层叠层（`@layer`）定义明确优先级区域（例如 `reset`、`base`、`theme`、`components`、`utilities`），并提前声明顺序（例如 `@layer reset, base, theme, components, utilities;`）。在各层内部，使用 `:where()` 让选择器只根据有意义的信号竞争，而非偶然过滤条件（`:not()` 边界情况、远处祖先等）；它也适合可轻易覆盖的一次性默认值。

使用 `inherit`、`initial`、`unset`、`revert` 等关键字替代显式值，提高可维护性，更准确表达意图。例如：
- 子元素的过渡应与父元素 `transition-*` 属性一致时，不要重复声明，使用 `transition: inherit`，减少重复、提高可维护性。
- 使用 `initial` 将属性重置为初始值，而不是直接写出该值，更清晰地表达意图。

<a id="3-selectors-and-scoping"></a>

## 3. 选择器与作用域

现代浏览器原生选择器能减少对预处理器和复杂 JS 状态跟踪的依赖。

<a id="prefer-css-selectors-over-js-for-complex-element-targeting"></a>

### 复杂元素匹配优先使用 CSS 选择器而非 JS

- **应使用** `:has()` 根据子状态为父元素设置样式，而不是在 JS 中管理类（例如用 `label:has(:checked)` 代替手动维护 `label.has-checked`）。更多说明见 `child-state-based-styling`（运行 `npx -y modern-web-guidance@latest retrieve "child-state-based-styling"`）和 `content-based-styling`（运行 `npx -y modern-web-guidance@latest retrieve "content-based-styling"`）。
- **不要**嵌套 `:has()`，也不要在其中使用伪元素，这是浏览器 API 限制。
- 需要为某一类型的每第 n 个元素设置样式时，使用 `:nth-child(<An+B> of <selector>)`。例如 `details:nth-child(1 of [open])` 选择遇到的第一个已打开 `<details>`；而 `details[open]:first-child` 仅在第一个子元素本身已打开时才选择它。

<a id="use-is-or-where-instead-of-css-rule-duplication-for-fallbacks"></a>

### 使用 `:is()` 或 `:where()`，避免为回退重复 CSS 规则

**不要**为了可能不支持的伪类而复制 CSS 规则提供回退；应使用 `:is()` 或 `:where()`，利用其容错解析规则。

```css
/* BAD: duplicate rules instead of using `:where()` */
[popover]:popover-open {
  /* styles for native popovers */
}
[popover].\:popover-open {
  /* same styles again, for polyfilled popovers */
}

/* GOOD */
[popover]:where(:popover-open, .\:popover-open) {
  /* same styles in one rule */
}
```

不要将此方法用于伪元素，因为 `:is()` 和 `:where()` 不支持伪元素。

<a id="avoid-overmatching"></a>

### 避免过度匹配

编写能够表达**意图**的选择器。

<a id="use-not-instead-of-overrides-to-exclude-irrelevant-statestargets"></a>

#### 用 `:not()` 而非覆盖排除无关状态/目标

意图是排除本质无关的状态或元素时，使用 `:not()`。

例如，要在列表项之间添加底边框，不要这样写：

```css
.fancy-list li {
  border-bottom: 1px solid silver;
}

.fancy-list li:last-child {
  border-bottom: none;
}
```

这可能意外覆盖其他规则设置的、原本需要的 `border-bottom`。真实意图是只给非最后一个 `li` 加底边框，上面的绕行写法没有准确表达。以下方式更清晰：

```css
.fancy-list li:not(:last-child) {
  border-bottom: 1px solid silver;
}
```

同样，不要这样写：

```css
button:hover {
  background: var(--color-blue);
}

button:disabled {
  background: var(--color-neutral);
}
```

如果调换两条规则顺序，禁用按钮也会出现 hover 背景！应这样写：

```css
button:hover:not(:disabled) {
  background: var(--color-blue);
}

button:disabled {
  background: var(--color-neutral);
}
```

由于第一条规则没有过度匹配，无论如何调整顺序都能正确工作。

如果**必须**覆盖（例如使用实验容器查询，而 `not` 分支同时也是回退），有时可以用 `revert-layer` 移除值，避免覆盖逻辑与具体值耦合。注意，这只在要回退到的值也位于层叠层中时有效。

<a id="prefer-scope-over-not-for-excluding-potentially-deeply-nested-subtrees"></a>

#### 排除可能深度嵌套的子树时优先 `@scope` 而非 `:not()`

虽然 `:not()` + 后代选择器可以排除子树，但对深度嵌套结构效果不好。例如 `.card :not(.content *)` 对嵌套卡片不会如预期工作。`@scope` 会考虑层级接近程度，从而解决问题：

```css
@scope (.card) to (.content) {
  /* styles for elements inside .card but not inside .content */
}
```

即使卡片嵌套，这也能按预期工作。

<a id="overrides-are-fine-for-specialization"></a>

#### 针对特例可以覆盖

这样是可以的：

```css
button {
  background: var(--color-neutral);
}

button.primary {
  background: var(--color-blue);
}
```

两条规则都表达合理**意图**：按钮一般使用中性色，主要按钮使用蓝色。

<a id="no-global-resets"></a>

#### 不使用全局重置

**不要**使用全局重置（对 `*` 设置样式），因为 Web Components 或优先级更低的层叠层在不使用 `!important` 时无法覆盖它。应针对具体元素类型及/或条件应用重置样式。

<a id="nesting-and-scoping"></a>

### 嵌套与作用域

只要能提高可维护性和可读性，就使用原生 CSS 嵌套组织相关样式。

当接近程度应比纯粹特异性更重要时，优先使用 `@scope`，而非嵌套。这常见于可以任意顺序嵌套、但应由最近匹配项（按元素到祖先顺序）胜出的选择器，例如主题类。

例如下面不会如预期工作：
```css
.dark .invert { color-scheme: light }
.light .invert { color-scheme: dark }
```

如果 `.invert` 同时嵌套在 `.dark` 和 `.light` 中，两条规则特异性相同，因此总是解析为深色模式。使用 `@scope` 可以解决：

```css
@scope (.dark) {
  .invert { color-scheme: light }
}

@scope (.light) {
  .invert { color-scheme: dark }
}
```

<a id="4-interactivity"></a>

## 4. 交互

焦点环、触摸目标、自定义手势见 `accessibility`（运行 `npx -y modern-web-guidance@latest retrieve "accessibility"`）。

<a id="5-design-tokens-and-theming"></a>

## 5. 设计令牌与主题

在 `:root` 上通过 CSS 自定义属性定义整个设计使用的核心变量（颜色、字体、尺寸等），确保视觉一致，并便于团队扩展 UI 设计。**不要**内联指定非简单样式值。例如 `background: transparent`、`padding: 0` 可以，`background: #f06`、`padding: .3em` 则不可以。例外是保持代码简小远比长期维护和演进重要的场景，例如测试用例。

通常将其分层组织，每层建立在上一层之上。例如：
1. 第 1 层：字面设计令牌（如 `--color-blue-10`、`--color-gray-90`、`--font-sans-serif`、`--size-xl` 等）
2. 第 2 层：语义设计令牌（如 `--color-accent`、`--color-neutral`、`--font-body`、`--font-heading` 等）
3. 第 3 层：通用 UI 设计令牌（如 `--ui-border`、`--surface-bg-subtle` 等）
4. 第 4 层：组件专用设计令牌（如 `--button-bg-primary-hover`、`--button-border-color-secondary` 等）

场景范围越小，所需层级越少。例如快速演示或玩具应用只用一层就足够，不要过度设计。在另建约定前，先检查已有命名和分层约定。

<a id="theming"></a>

### 主题

- 深色模式：见 `dark-mode`（运行 `npx -y modern-web-guidance@latest retrieve "dark-mode"`）及 `component-specific-light-dark-theme`（运行 `npx -y modern-web-guidance@latest retrieve "component-specific-light-dark-theme"`）。
- 强制颜色模式：见 `color`（运行 `npx -y modern-web-guidance@latest retrieve "color"`）。
- 生成浅色和深色变体：见 `color`（运行 `npx -y modern-web-guidance@latest retrieve "color"`）。
- 为浏览器生成 UI 设置主题（选区、滚动条、表单控件）：见 `browser-ui-theming`（运行 `npx -y modern-web-guidance@latest retrieve "browser-ui-theming"`）。

<a id="6-responsive-design"></a>

## 6. 响应式设计

组件适应分配空间、布局应对移动浏览器 UI 显隐、媒体加载前预留空间、随视口缩放文字，见 `responsive-design`（运行 `npx -y modern-web-guidance@latest retrieve "responsive-design"`）。

<a id="7-typography"></a>

## 7. 排版

Web UI 文本的可读性、无障碍和美观指导见 `typography`（运行 `npx -y modern-web-guidance@latest retrieve "typography"`）。

<a id="8-visual-effects"></a>

## 8. 视觉效果

表现深度、纹理、抬升效果、图层混合、美观渐变和弹性图案背景等外观增强，见 `visual-effects`（运行 `npx -y modern-web-guidance@latest retrieve "visual-effects"`）。

<a id="9-shapes"></a>

## 9. 形状

- 使用 `corner-shape: squircle` 获得更美观曲线，作为普通圆角的渐进增强。
- 使用椭圆 `border-radius`（例如 `10px / 20px`），无需额外元素即可得到按比例曲线。

<a id="10-transitions--animations"></a>

## 10. 过渡与动画

参见 `motion`（运行 `npx -y modern-web-guidance@latest retrieve "motion"`）。渲染性能（`content-visibility`、containment）见 `performance`（运行 `npx -y modern-web-guidance@latest retrieve "performance"`）。

<a id="11-generated-content"></a>

## 11. 生成内容
通过 CSS 添加装饰或辅助内容，同时不破坏屏幕阅读器及复制粘贴，见 `accessible-generated-content`（运行 `npx -y modern-web-guidance@latest retrieve "accessible-generated-content"`）。

