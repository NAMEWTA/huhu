<a id="dark-mode-toggles"></a>

# 深色模式切换控件

深色模式切换控件允许用户为单个站点覆盖系统配色方案。
通过更新 `<meta name="color-scheme">` 应用覆盖值：`light dark` 表示“跟随系统偏好”，`light` 或 `dark` 则固定某种明确方案。
颜色（`light-dark()`）、系统颜色和原生 UI 都依据 CSS `color-scheme` 属性，因此切换控件需要让该属性与 `<meta>` 保持同步（参见[在 CSS 中反映覆盖值](#reflect-the-override-in-css)）。

<a id="persistent-toggle-settings-control-or-no-toggle-at-all"></a>

## 常驻切换控件、设置项，还是不需要切换控件？

大多数站点不需要在站点 UI（页头、导航、页脚等）中常驻显示配色切换控件。
默认跟随系统偏好；如果确实需要手动覆盖，把控件放在独立的设置界面：设置页、面板或覆盖层。

固定一种不同于操作系统的方案是合理但少见的意图；少见意图应通过渐进披露呈现，不应让控件始终可见。

常驻切换控件主要出现在面向开发者或相关人群（例如设计师）的站点，这些用户切换配色的频率远高于普通 Web 用户。
不要仅因开发者站点常见此模式就添加它：开发者对此控件的兴趣并不代表普通用户。

<a id="implementation"></a>

## 实现

首先按 `dark-mode`（通过 `npx -y modern-web-guidance@latest retrieve "dark-mode"` 获取）中的全部步骤支持两种方案，并默认跟随系统偏好。

<a id="data-model"></a>

### 数据模型

深色模式切换控件的数据模型通常有三种状态：
1. 系统（没有存储值）：UI 跟随系统配色。这应当是理想的默认值。
2. 浅色（存储为 `"light"`）：无论系统配色如何，UI 都使用浅色主题。
3. 深色（存储为 `"dark"`）：无论系统配色如何，UI 都使用深色主题。

此状态通常保存在 `localStorage`，并反映在文档头部的 `<meta name="color-scheme">` 元素中。

<a id="reflect-the-override-in-css"></a>

### 在 CSS 中反映覆盖值

`<meta>` 仅是一个*呈现提示*：作者 CSS 中任何 `color-scheme` 声明都会覆盖它。
由于 `dark-mode`（通过 `npx -y modern-web-guidance@latest retrieve "dark-mode"` 获取）在 `:root` 上设置 `color-scheme: light dark`，仅更新 `<meta>` **不会产生效果**，因为 CSS 优先。
将 `<meta>` 映射回该属性，让层叠遵循它：

```css
:root {
  color-scheme: light dark;

  &:has(> head > meta[name="color-scheme"][content="dark"]) {
    color-scheme: dark;
  }
  &:has(> head > meta[name="color-scheme"][content="light"]) {
    color-scheme: light;
  }
}
```

**不要**把根元素默认值硬编码为 `color-scheme: light` 或 `color-scheme: dark`；基础声明**必须**保持为 `light dark`。
CSS **不得**依赖 JS：即使 JS 从未运行，`<meta>` 仍为 `light dark`，站点继续跟随系统偏好，不会出问题。

<a id="persistence-and-fouc-prevention"></a>

### 持久化与防止 FOUC

将覆盖值保存在 `localStorage`；恢复系统默认时移除该条目。

为避免错误配色短暂闪现，在紧跟 `<meta>` 元素的内联脚本中应用存储值（**不能**使用 `type=module`，**不能**使用 `defer`）：

```html
<meta name="color-scheme" content="light dark">
<script>
document.querySelector('meta[name="color-scheme"]').content = localStorage.getItem("color-scheme") ?? "light dark";
</script>
```

- 此内联脚本**仅用于**防止 FOUC。保持尽可能小；处理配色切换的其他 JS 可以稍后加载。
- 极少情况下访问 `localStorage` 会抛错（例如站点数据被阻止），但由于脚本不做其他事，唯一副作用只是控制台错误。如果需要可用 `try .. catch` 包裹。确保即使无法持久化，主题仍能应用到页面。
- 覆盖值可能从另一个标签页改变：处理 `window` 的 `storage` 事件以保持同步。
- 当系统偏好变化为与存储值相同时，**不要**用 `matchMedia()` 删除存储值。
很多用户的操作系统会根据时间自动切换配色；每当两者恰好一致就删除存储值，会使用户无法固定配色方案。

<a id="branching-for-html-and-non-color-values"></a>

### HTML 和非颜色值的分支处理

颜色无需额外处理：一旦将 `<meta>` 映射到 `color-scheme`（如上），`light-dark()` 就会遵循覆盖值。
本节针对其他值的适配，例如 `font-weight`、媒体来源等。

当页面仅跟随系统偏好时，可使用 `(prefers-color-scheme: dark)` 分支，包括在 `<picture>` 或 `<video>` 来源中使用。
覆盖配色方案会带来额外复杂性：系统偏好不再是真实依据，而只接受媒体查询的 API 没有直接替代方案。

不要完全依赖 JS 应用的 `.dark` 等类来分支，因为 JS 未加载且操作系统默认为深色时，这些类会不正确。

可以组合媒体查询与 `:root:has(> head > meta[name="color-scheme"][content="dark"])`（或 `light`）选择器进行分支。
关于优雅的实现方式，参见 `selector-atrule-combinations`（通过 `npx -y modern-web-guidance@latest retrieve "selector-atrule-combinations"` 获取）。

控件自身的选项也属于非颜色分支：在标记中包含两种状态（图标加视觉隐藏的操作文本，例如“切换到深色主题”），用上述选择器隐藏未激活的选项。
`display: none` 也会将多余选项从辅助技术中移除，因此当系统偏好改变时，控件无需 JS 也能保持正确。

对于 HTML 中的媒体，目前唯一办法是将两种版本作为独立元素放入，并相应切换可见性。
对 `<source>` 元素使用 `display: none` 无法起效。

<a id="user-interface"></a>

## 用户界面

<a id="two-or-three-states"></a>

### 两种还是三种状态？

在所有情况下，UI 都**必须**支持恢复或设置为系统配色方案。

在空间受限的切换控件中，优先显示两种状态，例如站点框架（页头、导航、页脚等）中的常驻控件：这些位置空间有限，而且调整设置通常与用户目标无关。

独立设置界面（页面、面板或覆盖层）中的配色控件则是另一种场景，**可以**明确展示全部三种状态（“浅色”“深色”“系统”）：用户正在有意识地决定未来行为，而且有空间解释选项。

如果站点实现了感知上下文的配色（例如操作系统为深色时使用更暗的浅色模式），也适合明确显示三种状态，因为此时“浅色”和“系统（当前为浅色）”确实有区别。

<a id="two-state-toggles"></a>

### 两态切换控件

使用此类控件时，用户通常想临时改善舒适度（“现在太亮了”），而不是确保当前状态长期保留。
因此，两态切换控件只需显示三种设置中的两种：系统（以便恢复设置）和当前系统的相反方案，后者存储为当下的字面值。

仅有的两种状态应是：

1. **系统默认**——没有存储值，`<meta>` 内容为 `light dark`。显示当前解析后的值，例如浅色时显示太阳图标。
2. **覆盖值**——按字面存为 `light` 或 `dark`。

本质上这是一个三态控件（`light dark`、`light`、`dark`），其中与当前系统偏好相同的显式状态不可到达。

用户切换时：

1. 目标方案 = 当前*实际呈现*方案的相反值（有存储值则用存储值，否则用系统偏好）。用户意图是“选择我现在看到的相反方案”，而**不是**“选择系统默认值的相反方案”。
2. 如果目标与当前系统偏好不同，将其按字面存储。
3. 如果目标与当前系统偏好相同，用户是在撤销调整：移除存储值。不要存储它，否则会在用户不知情时固定配色，使其不再随未来的系统变化而改变。
4. 将 `<meta>` 内容设为存储值，没有存储值则设为 `light dark`。

重要：仅在存储时检查差异，绝不能事后追溯检查。系统偏好后来变为与存储值相同时，**必须**保留存储值。
很多用户的操作系统会根据时间自动切换配色；每当两者恰好一致就删除存储值，会使用户无法固定配色方案。

示例场景，初始操作系统设为浅色：

1. 用户切换。深色不同于系统偏好，因此存储 `dark`，站点变为深色。
2. 操作系统设置变为深色。站点保持深色（存储值现在与系统偏好相同，但仍保留）。
3. 操作系统设置变回浅色。站点保持深色。
4. 用户切换。目标（浅色）与系统偏好相同，因此移除存储值，站点重新跟随系统。

<a id="three-state-toggles"></a>

### 三态切换控件

当空间更充裕，且用户已经在考虑设置长期偏好时，三态控件可以更清晰。
此时数据模型直接对应三个 UI 选项：系统、浅色和深色。

为降低认知负担，“系统”选项还应显示当前系统设置，例如通过：
- 图标，例如在系统图标的右下方放一个太阳图标。
- 文本，例如“系统（当前为浅色）”。
