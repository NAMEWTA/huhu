<a id="component-specific-lightdark-themes"></a>

# 组件专属的浅色／深色主题

`color-scheme` 属性通常设在根元素上，但也可以设在单个元素上，强制它使用与页面其他部分不同的配色方案。
当组件必须始终以某种配色方案呈现时（例如总是深色或浅色），这种方式很有用。

示例用途包括：

- 出于美观考虑，即使页面为浅色模式也常采用深色模式的元素，例如代码块、媒体播放器、照片图库。
- 包含专为浅色背景设计的媒体（例如图片、视频、插画、打印预览）的区域，即使页面其他部分是深色模式，也可以设为浅色。
- 由用户级设置控制 color-scheme 的元素，例如组件预览。
- 不同时支持浅色和深色模式的嵌入内容。
- 设计工具、地图、可视化、游戏等。

<a id="when-to-change-colors-vs-when-to-force-color-scheme"></a>

## 何时改变颜色，何时强制 `color-scheme`？

并非所有在浅色模式下采用深底浅字，或在深色模式下采用浅底深字的元素，都需要不同的 `color-scheme`。
例如，主要按钮在浅色模式下可能是蓝底白字，但并不因此需要 `color-scheme: dark`。

通常可以这样判断：使用不同 `color-scheme` 的元素是建立自身视觉上下文的复杂表面，而非简单的浅层容器。

考虑给元素使用不同 `color-scheme` 时，问自己：

- 尚未另行定制的浏览器内置 UI（如表单控件、滚动条等）应使用该配色方案，还是适应页面配色方案？→ 如果是前者，不要使用 `color-scheme`。
- `light-dark()` 颜色应与页面其他部分一样解析，还是按覆盖值解析？→ 如果是前者，不要使用 `color-scheme`。
- 后代是否应该处于该 `color-scheme`？如果不是，不要使用 `color-scheme`。

<a id="basic-implementation"></a>

## 基本实现

组件专属覆盖通常用于已经通过全局 `color-scheme` 支持多种配色方案的页面，但这并非严格必要。
关于正确实现全页面深色模式，参见 `dark-mode`（通过 `npx -y modern-web-guidance@latest retrieve "dark-mode"` 获取）。

设置全页面 `color-scheme`，并使用对它敏感的颜色 token（例如通过 `light-dark()`）之后，只需在特定组件上设置 `color-scheme`，即可覆盖该子树的颜色模式：

```css
pre, code, .dark {
  color-scheme: dark;
}
```


注意，一些浏览器无论如何都会自动将组件调整为其他配色方案。
要在所有情况下强制指定配色方案，使用 `only`，即使用 `color-scheme: only dark;`，而非 `color-scheme: dark;`。

<a id="adapting-non-color-values"></a>

### 适配非颜色值

`light-dark()` 目前仅适用于颜色。

<a id="best-practices"></a>

## 最佳实践

- **必须遵守**：不要在没有背景的元素上设置 `color-scheme`，否则可能混用来自不同配色方案的背景和文字颜色对，导致文本无法阅读。
- **可选**：虽然复用全页面深色模式的颜色对更简单，但也可以为这些组件定义不同颜色对。例如，浅色页面中的深色组件，可能需要比同一个组件放在整体深色页面时稍浅一些。

<a id="known-issues-to-be-aware-of"></a>

## 需要了解的已知问题

<a id="important-gotcha-inheritance-of-light-dark-colors"></a>

### 重要陷阱：`light-dark()` 颜色的继承

**`light-dark()` 在计算值阶段解析。**
这意味着任何设置为 `light-dark()` 颜色、且被继承的 `<color>` 属性，只会把两个颜色中的一个传给后代，而不会传递 `light-dark()` 表达式本身。

包括：

- 会继承的内置颜色属性，如 `color`、`accent-color`、`fill`、`stroke`、`text-shadow`、`caret-color`。
- 通过 `syntax: <color>` 和 `inherits: true` 注册的可继承自定义属性。
- 其他任何设为 `inherit` 的 `<color>` 属性。

因此应当：

- **不要**将用于保存**设计 token** 的自定义属性（如 `--surface-color`）注册为 `<color>`。Token 需要保持 `light-dark()` 表达式未解析，让后代能够在不同 `color-scheme` 下重新解析。
- 在元素上设置 `color-scheme` 时，重新指定所有可能直接或通过设计 token 设置为 `light-dark()` 值的继承 `<color>` 属性，即使仍指定同一个设计 token。
- **不要**在覆盖了 `color-scheme` 的元素上，对 `<color>` 属性使用 `inherit`（其后代可以使用）。
- **应当**在相反用途下使用已注册的 `<color>` 属性：即有意保存祖先已解析颜色的快照，防止它在后代 `color-scheme` 下重新解析。例如，捕获页面背景色用于其他位置。
- 如果需要对颜色设置动画，在动画元素上使用另一个经 `@property` 注册的 `<color>` 属性（颜色插值需要注册）；它是每个元素的动画目标，而非设计 token，因此不与上面的规则冲突。

示例：

```css
:root {
	--accent-color: light-dark(blue, skyblue);
	--surface-color: light-dark(white, #222);
	--text-color: light-dark(#111, white);

	color-scheme: light dark;
	accent-color: var(--accent-color);
	color: var(--text-color);
}

body {
	/* --surface-color dynamically switches despite being inherited because --surface-color is not registered */
	background: var(--surface-color);
}

pre, code {
	color-scheme: dark;
	background: var(--surface-color);

	/* Without this, accent-color would be blue, not skyblue! */
	accent-color: var(--accent-color);

	/* Without this, text-color would be #111, not white! */
	color: var(--text-color);
}
```


<a id="issues-to-be-aware-of-when-using-color-scheme"></a>

### 使用 color-scheme 时需要了解的问题

- Chrome 和 Firefox 对 iframe 尊重 `color-scheme`：它们用正确配色方案渲染嵌入页面，并调整嵌入页面的 `prefers-color-scheme` 媒体查询，使其反映嵌入上下文的 `color-scheme`。Safari 则不这样做，即使在 iframe 内，也将 `prefers-color-scheme` 解析为系统设置。
  - **如果父页面和 iframe 都由你控制：**显式将父页面配色方案传给 iframe，可以在构造 iframe 时通过 URL 参数（`?theme=dark`）传递，也可以使用 `postMessage()`，后者还支持响应运行时变化。在 iframe 内，根据该信号给 `<html>` 设置 class，和／或给 `:root` 设置 `color-scheme`，而不是依赖 `prefers-color-scheme`。
  - **如果只控制嵌入页面：**在 Safari 中，无法从 iframe 内可靠检测嵌入上下文的 `color-scheme`。在嵌入 API 中暴露显式主题参数（如查询字符串或 `postMessage` 协议），并向嵌入方说明用法。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-color-scheme"></a>

### color-scheme 的回退与浏览器支持

color-scheme 的 Baseline 状态：广泛可用。它自 2022-02-03 起进入 Baseline。
支持的浏览器：Chrome 98（2022 年 2 月）、Edge 98（2022 年 2 月）、Firefox 96（2022 年 1 月）和 Safari 13（2019 年 9 月）。

`color-scheme` 属性属于**渐进增强**。
不支持的浏览器会忽略它，使用默认浅色模式 UI。

为了在旧浏览器中适应用户偏好，使用 `prefers-color-scheme` 媒体查询，在用户偏好深色模式时提供不同颜色。

- 应当使用媒体查询切换 `:root` 或 `html` 上的自定义属性。
- 避免在单个组件上使用该媒体查询，除非组件需要超出颜色之外、非常特定的深色模式定制。

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

light-dark() 的 Baseline 状态：新近可用。它自 2024-05-13 起进入 Baseline。
支持的浏览器：Chrome 123（2024 年 3 月）、Edge 123（2024 年 3 月）、Firefox 120（2023 年 11 月）和 Safari 17.5（2024 年 5 月）。

对于支持 `color-scheme`、但尚不支持 `light-dark()` 的浏览器，应先将浅色与深色版本的颜色定义为自定义属性，再通过 `prefers-color-scheme` 媒体查询设置对应模式的颜色，如下例：

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

