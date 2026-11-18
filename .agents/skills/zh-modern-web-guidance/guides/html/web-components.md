<a id="web-components-orientation"></a>

# Web Components 入门指引

Web Components 包括 Custom Elements、Shadow DOM 和 HTML Templates：这些平台原语用于构建可复用、不依赖框架的组件，并将组件标记和样式与文档隔离。适用于设计系统、可嵌入组件和自包含 UI。

以下规则适用于各个方面。请获取当前任务对应的专项指南；每篇指南都会重述所需上下文，并记录该主题独有的 API 和陷阱。

<a id="decide-whether-you-even-need-a-custom-element"></a>

## 先判断是否需要自定义元素

只有在标签上需要封装行为、生命周期或可复用且由 JS 支持的 API 时，才使用自定义元素。以下情况**不要**构建自定义元素：

- 普通 HTML 元素加 CSS 已经够用。经过样式设置的 `<button>` 或 `<details>` 比重新实现更易访问，成本也更低。
- 组件只有展示作用，没有行为。给原生元素添加 class 性能更好，也能用 `@layer` 或 `@scope` 限定样式范围。
- 只需要服务器端的样式隔离，没有交互；作用域样式表或声明式 Shadow DOM（无须升级）可能已经足够。

重建原生语义（如自定义 `<my-button>` 重新实现焦点、激活行为和 ARIA）是最常见的误用：只有复用原生元素，才能直接获得平台的无障碍能力。如果确实需要 `<my-button>` 这类包装器，通常是为了共享样式接口、添加额外标记或提供原生元素无法表达的行为，那么应包装真正的 `<button>`，而不是重新实现它（关于向内部原生元素转发样式，参见 `styling-web-components`，通过 `npx -y modern-web-guidance@latest retrieve "styling-web-components"` 获取）。

判断标准是是否需要**封装状态、可由脚本调用的 API，或原生元素无法表达的行为**，而不只是不同外观。点赞／收藏切换符合条件：它保存持续的业务状态，将该状态作为样式接口暴露给外围页面，并派发自己的 `change` 事件；这些都不是仅设置样式的 `<button>` 所能提供的。仅在按下时变色的按钮则不符合，应使用 `<button>` + CSS。确实构建组件时，按需要用自定义状态或属性建模状态（参见 `custom-elements`，通过 `npx -y modern-web-guidance@latest retrieve "custom-elements"` 获取）。

<a id="match-the-tool-to-the-codebase"></a>

## 让工具与代码库相匹配

某个功能是否应该成为自定义元素，取决于项目已经采用的技术。Agent 往往过度抽象，太容易引入新元素；拿不准时，更轻量的选项（原生元素、CSS、服务器模板）通常更合适，日后复用或行为确实需要时，再升级为自定义元素。按大致优先级，可参考以下判断：

- **代码库已经有组件模型（React、Vue、Svelte 等）。**应用内部 UI 默认使用该框架的组件。只有当组件必须脱离框架使用或在框架之外继续存在时，才使用自定义元素：例如跨应用或跨框架共享的设计系统原语、嵌入框架不控制的标记中的 widget，或必须以普通 HTML 工作的输出（电子邮件、CMS、SSR 片段）。不要为普通应用内视图再建立一套并行组件系统。
- **没有工具链，以静态标记为主。**优先普通 HTML + CSS，或服务器模板／局部模板。只有在标签上确实需要行为、生命周期或由 JS 支持的 API 时，自定义元素才值得引入；如果只是共享标记，服务器 include 或 `<template>` 无须发送任何 JS 就能完成。
- **静态站点生成器配合交互岛。**静态渲染标记，只让自定义元素负责交互部分。对于“大量标记、少量交互”，把标记放在 Light DOM（或声明式 Shadow DOM）中，由小型自定义元素进行渐进增强，而不是用 JS 重新渲染一切。
- **仍可进一步使用内置元素。**尽量发挥原生元素的能力（CSS、少量监听器、偶尔用伪元素），通常优于自定义元素，因为可以直接保留平台的无障碍能力与行为。当变通方案不再可维护时，再转向自定义元素，例如不得不对抗内置行为，或使用体验已经差于清晰组件 API 的时候。原生元素需要一点 JS，本身不是替换它的理由。

<a id="cross-cutting-rules"></a>

## 通用规则

以下规则适用于后续所有指南：

- **必须**使用至少包含一个连字符的 kebab-case 标签名（如 `my-element`）。这用于区分自定义元素与当前及未来的内置元素。
- **必须**在构造函数中先调用 `super()`，再访问 `this`；如果任何读写 `this` 的语句先于它执行，就会抛出异常。
- **必须**在 shadow 模板内使用语义元素（`<button>`、`<nav>`、`<ul>`）。shadow 树的大多数无障碍失败来自缺少语义的标记；slot 不会改变投影内容的角色。
- **必须**注意，ARIA `id` 引用（`aria-labelledby`、`aria-describedby`、`aria-controls`）不能跨越 shadow 边界；引用元素与所指向 `id` 必须位于同一棵树中。
- **必须**通过 `attachShadow({ mode: 'open' })` 附加 shadow root（声明式 Shadow DOM 则使用 `shadowrootmode="open"`）；`mode: 'closed'` 会让页面脚本、测试框架和遍历 shadow 树的自动化无障碍检查器无法访问 `element.shadowRoot`。
- 避免使用定制内置元素（`extends HTMLButtonElement` 配合 `is="…"`）；Safari 已永久拒绝实现它们。

<a id="use-case-guide-matrix"></a>

## 用例指南矩阵

确定任务并获取相应指南：

| 如果需要…… | 获取 |
| :--- | :--- |
| 定义带有行为和生命周期的新语义标签 | `custom-elements`（通过 `npx -y modern-web-guidance@latest retrieve "custom-elements"`） |
| 将样式和标记限制在组件内，并投影使用方内容 | `shadow-dom`（通过 `npx -y modern-web-guidance@latest retrieve "shadow-dom"`） |
| 在服务器上渲染组件的 shadow 树（SSR），避免未设置样式的内容闪现 | `prerendering-custom-elements`（通过 `npx -y modern-web-guidance@latest retrieve "prerendering-custom-elements"`） |
| 跨 shadow 边界设置样式（主题、`::part`、自定义属性） | `styling-web-components`（通过 `npx -y modern-web-guidance@latest retrieve "styling-web-components"`） |
| 将自定义控件的值提交给外围 `<form>` | `form-associated-custom-elements`（通过 `npx -y modern-web-guidance@latest retrieve "form-associated-custom-elements"`） |
| 让自定义元素具备无障碍能力（角色、焦点、跨 shadow root 的 ARIA） | `accessible-web-components`（通过 `npx -y modern-web-guidance@latest retrieve "accessible-web-components"`） |
