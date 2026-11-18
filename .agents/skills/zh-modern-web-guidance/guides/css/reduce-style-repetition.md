<a id="reduce-style-repetition-with-css-functions"></a>

# 使用 CSS 函数减少样式重复

维护大型样式表经常产生重复逻辑，尤其是处理渐变或响应式布局模式等设计系统令牌时。

CSS `@function` 规则可以把这些逻辑封装为可复用、带参数的函数，使 CSS 更可维护、更一致，并遵循 DRY（不要重复自己）。

<a id="the-function-syntax"></a>

## `@function` 语法

自定义函数使用 `@function` 定义，后跟带短横线的名称和参数列表，通过 `result` 属性返回值。

```css
@function --my-function(--input1 <length>, --input2: default-value) returns <length> {
  /* Logic goes here */
  result: var(--input1);
}
```

<a id="key-concepts"></a>

### 关键概念
- **参数：** 必须以双短横线（`--`）开头。
- **默认值：** 可以用冒号（`:`）提供默认值。
- **结果：** `result` 属性决定返回值，函数体内最后声明的 `result` 胜出。
- **作用域：** 函数内部定义的参数和变量具有局部作用域。
- **类型：** 可以用尖括号记法（例如 `<color>`）要求参数和返回值匹配 CSS 类型，也可用 `type` 函数允许多种类型（例如 `type(<number> | <percentage>)`）。

<a id="practical-examples"></a>

## 实用示例

<a id="1-design-system-tokens-gradients"></a>

### 1. 设计系统令牌（渐变）
封装渐变逻辑，确保整个应用配色渐变一致。`--angle` 提供可覆盖的默认值，既保持一致性，又允许调整。

```css
@function --fancy-gradient(--start-color <color>, --end-color <color>, --angle: 98deg) returns <image>{
  result: linear-gradient(in oklab var(--angle), var(--start-color), var(--end-color) );
}

.card {
  background: --fancy-gradient(#ed73d7, #5d87e9);
}
```

<a id="2-conditional-layout-logic"></a>

### 2. 条件布局逻辑
可以在函数内部直接使用 `@media` 等查询，根据环境返回不同值。注意：`@function` 不会在第一个 `result` 处立即“返回”，而是遵循 CSS 层叠，根据屏幕尺寸、容器尺寸或其他查询，解析为最后一个匹配值。

```css
@function --grid-template(--count <number>){
  /* MANDATORY: Put default value first. */
  result: 1fr; /* Default: stack */
  @media (min-width: 800px) {
    result: repeat(var(--count), 1fr); /* Grid on larger screens */
  }
}

main {
  display: grid;
  grid-template-columns: --grid-template(2);
}
```

<a id="best-practices"></a>

## 最佳实践
- **使用双短横线名称：** 函数名和参数始终以 `--` 开头。
- **提供默认值：** 合理默认值能提高函数稳健性。
- **保持简单：** 将函数用于确实重复或复杂的逻辑，不要过度设计简单属性值对。
- **使用类型：** 确保参数和返回值符合预期类型。
- **考虑预编译替代：** 对不依赖用户输入、媒体查询或其他客户端变化的函数，考虑 CSS 预编译器，避免客户端进行不必要的工作。

<a id="fallback-strategies"></a>

### 回退策略

@function 的浏览器支持：有限可用。
支持：Chrome 139（2025 年 8 月）和 Edge 139（2025 年 8 月）。
不支持：Firefox 和 Safari。

不支持 CSS 函数的浏览器中，通过函数设置的值无效。先为属性提供回退值；支持函数的浏览器会覆盖该值。

```css
.card {
  /* Provide fallback, in this case a solid color. */
  background: #5d87e9;
  background: --fancy-gradient(#ed73d7, #5d87e9);
}

main {
  /* Provide fallback, in this case a simple stacked default. */
  grid-template-columns: 1fr;
  grid-template-columns: --grid-template(2);
}
```

若要求同时减少样式重复并支持其他浏览器，考虑具有函数能力的 CSS 预编译器，例如 Sass。

