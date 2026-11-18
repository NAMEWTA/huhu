<a id="build-accessible-switch-controls"></a>
# 构建无障碍开关控件

在 `<input type="checkbox" switch>` 上使用 HTML `switch` 属性，并关联一个 `<label>`，即可构建二元开关，保留原生表单提交、键盘导航与屏幕阅读器语义（参见 `checkbox`，通过 `npx -y modern-web-guidance@latest retrieve "checkbox"` 获取；以及 `forms`，通过 `npx -y modern-web-guidance@latest retrieve "forms"` 获取）。

<a id="markup"></a>
## 标记

为标准复选框 input 添加布尔属性 `switch`：

```html
<label>
  Enable notifications
  <input id="notifications" type="checkbox" switch>
</label>
```

- 标签可以包裹 input，也可以通过 `for`/`id` 建立关联。所有样式都作用于 input，因此不依赖标签结构。
- 选中时，input 会提交标准的复选框值。在 JavaScript 中，应监听 `change`（或 `input`）事件，并读取 `.checked`，而不是 `.value`。

<a id="styling"></a>
## 样式

使用 `accent-color` 自定义控件的高亮颜色（参见 `brand-consistent-forms`，通过 `npx -y modern-web-guidance@latest retrieve "brand-consistent-forms"` 获取），并确保焦点样式清晰可见，与相邻颜色的对比度至少为 3:1（WCAG 1.4.11 非文本对比度）：

```css
input[type="checkbox"][switch] {
  accent-color: var(--accent-color, #1769e0);
  margin: 0;
  cursor: pointer;
}

input[type="checkbox"][switch]:focus-visible {
  outline: 3px solid var(--focus-color, #d35400);
  outline-offset: 4px;
}
```

<a id="fallback-strategies"></a>
## 回退策略

<a id="fallbacks--browser-support-for-switch-control"></a>
### switch-control 的回退方案与浏览器支持

<input type="checkbox" switch> 的浏览器支持：可用性有限。
支持：Safari 17.4（2024 年 3 月）。
不支持：Chrome、Edge 和 Firefox。

如果你的 Baseline 目标不支持 `<input type="checkbox" switch>`，仅在 `'switch' in HTMLInputElement.prototype` 为 `false` 时加载 `input-switch-polyfill`。不要无条件加载。该 polyfill 通过设置 `role="switch"`、应用开关样式（`appearance: none`）、同步计算后的 `accent-color`，并提供指针拖动支持，来增强带有 `switch` 属性的复选框。

使用适合项目的包加载方式。下面的示例假设当前配置能够解析模块说明符：

```javascript
if (!('switch' in HTMLInputElement.prototype)) {
  import('input-switch-polyfill');
}
```

<a id="fallbacks--browser-support-for-accent-color"></a>
### accent-color 的回退方案与浏览器支持

accent-color 的浏览器支持：可用性有限。
支持：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）、Firefox 92（2021 年 9 月）和 Safari 26.2（2025 年 12 月）。

`accent-color` 属性属于渐进增强。
不支持该属性的浏览器会忽略它，并使用默认界面颜色。
