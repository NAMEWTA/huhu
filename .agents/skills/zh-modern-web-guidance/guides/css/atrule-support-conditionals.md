<a id="conditionally-apply-css-based-on-at-rule-support"></a>

# 根据 At-rule 支持情况有条件应用 CSS

使用 `@supports at-rule(@<at-rule name>) {…}`，仅在浏览器支持某个 at-rule 时，有条件地应用指定 CSS 规则或声明。它可以包含完整规则，也可以结合 CSS 嵌套，有条件地应用某些声明。

```css
.foo {
  background: var(--accent-color);

  @supports at-rule(@property) {
    background-image: var(--rainbow-gradient);
    animation: sliding-rainbow 1s linear infinite;
  }
}
```

不要只为了有条件地应用正在检测的 at-rule 本身而使用 `@supports at-rule()`，却不做任何其他处理。

```css
/* BAD: CSS already ignores rules the browser doesn't understand, so this is unnecessary */
@supports at-rule(@starting-style) {
  @starting-style {
    /* ... */
  }
}
```

<a id="detecting-at-rules-without-supports-at-rule"></a>

## 不适合使用 `@supports at-rule()` 时如何检测 at-rule 支持 { #detecting-at-rules-without-supports-at-rule }

由于浏览器支持情况或需要更深入检测而无法使用 `at-rule()` 时，可以采用以下方法。

<a id="try-properties-values-or-selectors-first"></a>

### 先尝试属性、值或选择器

`@supports` 已能检测属性、值和选择器（通过 `@supports selector(...)`）。很多情况下，无需检查 at-rule 本身，就能用这些方式检测特性支持。

例如检测自定义函数时，可以用 `@supports (color: --foo())`，而不是 `@supports at-rule(@function)`。

另一些情况下，某些伪类或伪元素仅在特定 at-rule 受支持时才可用，也能用于检测支持。

<a id="supports-container-types"></a>

### 检测容器查询类型 { #supports-container-types }

`at-rule()` 只能根据**名称**检测 at-rule，不能检测其他语法或描述符。例如以下写法不会生效：

```css
@supports at-rule(@container style(--a: 1)) {
  /* ... */
}
```

很多容器查询类型可以通过 `container-type` 配合合适的值检测。例如滚动状态查询使用 `@supports (container-type: scroll-state)`，尺寸查询使用 `@supports (container-type: size)`，`anchored()` 查询使用 `@supports (container-type: anchored)`。

但样式查询没有对应的 `container-type`。重要：不要尝试用 `@supports (container-type: style)` 检测样式查询支持，它不会生效。

可以改用一个始终为真的样式查询：

```css
@container style(--a: 1) or (not (style(--a: 1))) {
  /* Rules here will only be applied if style queries are supported */
}
```

只要两处属性名和值保持相同，无论用什么名称和值，这段代码都会在支持样式查询的浏览器中匹配。

<a id="supports-atproperty"></a>

### 已注册的自定义属性（`@property`） { #supports-atproperty }

如果有条件应用的 CSS 可以缩减为单个属性，可为此专门注册一个自定义属性：

```css
/* Use a custom property to conditionally include the dash animation */
@property --progress-dash-animation {
  syntax: "*";
  inherits: false;
  initial-value: , progress-dash 3s ease-in-out infinite;
}

.spinner {
  /* The dash animation is only included if @property is supported */
  animation:
    progress-spin var(--_used-spinner-duration) linear infinite
    var(--progress-dash-animation, );
}
```

更通用的办法是注册一个不继承的属性，并在根元素上将其设为 ` `（一个空格）：

```css
@property --supports-atproperty {
	syntax: "*";
	inherits: false;
}

:root {
	--supports-atproperty: ;
}

body {
  /* The background is only applied if @property is supported */
	background: var(--supports-atproperty, green);
}
```

注意：
- 两种方案都要求空白是可接受的替代值。其他情况需要使用下文的 JS 方法。
- 通用方案依赖不继承特性，因此不适用于根元素上的声明。

<a id="using-javascript-as-a-last-resort"></a>

### 最后才使用 JavaScript

对于完整 at-rule，在 JavaScript 中检查特定接口是否存在。例如定义了 `globalThis.CSSFunctionRule`，就说明支持 `@function`。

需要更深入检测（例如特定 prelude、嵌套规则或描述符）时，可以设置测试并检查解析结果：

```js
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  @page {
    @top-left {
      content: "test";
    }
  }
`);
const SUPPORTS_PAGE_MARGINS = Boolean(sheet.cssRules[0]?.cssRules?.[0]);
```

重要：
- 用 JS 检测 CSS 特性支持时，不要直接通过 JS 应用样式。应给根元素添加类，然后在 CSS 中据此分支。
- 即使不认识 prelude，容器查询仍会被解析，因此无法从 CSSOM 结构检测某些容器查询类型是否受支持。
- 不要使用 `CSS.registerProperty` 检测 `@property`，前者支持范围稍广。

<a id="fallback-strategies"></a>

## 回退策略

at-rule() 的浏览器支持：有限可用。
支持：Chrome 148（2026 年 5 月）、Edge 148（2026 年 5 月）和 Firefox 157（2026 年 9 月）。
不支持：Safari。

除非已在你的支持目标范围内，否则**只能**使用 `@supports (at-rule())` 检测支持范围比 `@supports (at-rule())` 本身更窄的 at-rule。

对于早于此特性发布的 at-rule，如需根据其支持情况有条件应用 CSS，请使用[上一节的指导](#detecting-at-rules-without-supports-at-rule)。

要检测 `@supports at-rule()` **本身**的支持，可以使用所有支持 `@supports at-rule()` 的浏览器都保证具备的 at-rule，例如 `@supports at-rule(@media) { ... }`。

