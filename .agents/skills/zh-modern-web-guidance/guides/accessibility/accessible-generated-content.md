<a id="accessible-generated-content"></a>
# 可访问的生成内容

- **不要**使用 `content` 传达有意义的文本，例如标签、状态或操作说明；这些内容应保留在 DOM 中（WCAG F87）。替代文本参数用于降低装饰内容意外承载含义时的影响，而不是允许这样设计。
- 使用 `content` 的替代文本参数，为屏幕阅读器提供替代文本，例如 `content: url(cloud.svg) / "Save";`。
- 使用 `content: "text" / "";`，防止纯装饰文本被屏幕阅读器播报。
- **不要**为图片使用空替代文本参数，因为图片默认已经是呈现性内容。例如这样是错误的：`content: url(cloud.svg) / "";`。
- **不要**使用替代文本参数描述表情符号，除非描述不同于表情符号的官方名称。例如，不要写 `content: "🎉" / "celebration";`，但可以写 `content: "🎉" / "Yay!";`。

**只有**当替代文本与主值不同，且 DOM 中尚未存在该文本时，才使用替代文本参数。也就是说，以下做法是错误的：

HTML：
```html
<button class="save">Save</button>
```

CSS：
```css
button.save::before {
  content: url(cloud.svg) / "Save";
}
```

屏幕阅读器会将其读为“Save save”，即重复播报“保存”。

<a id="fallback-strategies"></a>
## 回退策略

生成内容的替代文本的 Baseline 状态：新近可用。自 2024-07-09 起纳入 Baseline。
支持的浏览器：Chrome 77（2019 年 9 月）、Edge 79（2020 年 1 月）、Firefox 128（2024 年 7 月）和 Safari 17.4（2024 年 3 月）。

如果你的 Baseline 目标包含不支持 `/` 替代文本语法的浏览器，在该声明前添加单值 `content` 回退，避免不支持的浏览器将整条声明视为无效 CSS 并丢弃：

```css
.more-link::after {
  /* Fallback: render the glyph in browsers without `/` support
     (screen readers there will still announce it) */
  content: " →";
  content: " →" / "";
}
```

对于非空替代文本（`content: url(...) / "..."`），单值 `content: url(...)` 回退可让图片在旧浏览器中保持可见，但会丢失替代文本。如果旧浏览器中也必须有该标签，应将其放入 DOM，例如通过视觉隐藏的 `<span>` 或 `aria-label`，并使用不带 `/` 的普通 `content: url(...)` 声明。
