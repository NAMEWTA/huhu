<a id="visually-stable-mixed-fonts"></a>
# 保持视觉稳定的混合字体

混合不同字体族时，例如插入行内代码片段，或为不同主题切换字体族，x-height，即小写字母高度的差异，可能使一种字体看起来比另一种小很多或大很多，从而降低辨识度并造成布局偏移。

`font-size-adjust` 可根据特定字体度量，通常是 x-height，调整字号，规范化文字的视觉大小。

<a id="implementation-steps"></a>
### 实施步骤

1. **强制要求**：对字体一致性关键的元素应用 `font-size-adjust`，例如使用 Web 字体的容器或混合字体族的区块。
2. **强制要求**：在元素上使用 `from-font`，让嵌套元素的字号自动匹配主字体的比例。
3. **强制要求**：当用于参考的字体比例来自不同主题时，为 `font-size-adjust` 指定具体数值比例覆盖，例如 `font-size-adjust: 0.5`，独立地规范化比例。

<a id="example-normalizing-x-height-automatically"></a>
### 示例：自动规范化 x-height

使用 `from-font` 是最稳健的方式。它从第一个可用字体提取 x-height 比例，并应用于子元素中的字体。

```css
.content-area {
  font-family: "MyCustomWebFont";
  /* Automatically extract and apply x-height ratio from MyCustomWebFont */
  font-size-adjust: from-font;
}
.content-area span{
  font-family: "MyOtherCustomWebFont"
}
```


<a id="example-specifying-a-specific-x-height"></a>
### 示例：指定具体的 x-height

如果待调整字体不是参考字号字体的子元素，则指定数值来调整 x-height。

```css
.theme{
  font-family: Verdana, sans-serif;
}
.theme.alternate{
  font-family: Times;
  /* Set to the aspect ratio (x-height / font-size) of the primary font */
  font-size-adjust: 0.51;
}
```


<a id="fallback-strategies"></a>
### 回退策略

font-size-adjust 的 Baseline 状态：新近可用。自 2024-07-25 起纳入 Baseline。
支持的浏览器：Chrome 127（2024 年 7 月）、Edge 127（2024 年 7 月）、Firefox 118（2023 年 9 月）和 Safari 17（2023 年 9 月）。

**强制要求**：在不支持 `font-size-adjust` 的浏览器中，字体会按其自然的 `font-size` 值渲染。必须通过 `@supports` 块提供有效的回退策略来缓解：

- 使用 `@supports not (font-size-adjust: from-font)` 检测 `font-size-adjust` 支持情况，并提供回退样式，例如调整行高或字号。
- 选择 x-height 与主字体相近的字体。
- 为替代和嵌套字体族设置具体的 `font-size` 和 `line-height` 覆盖。

```css
/* Feature detection for font-size-adjust */
@supports not (font-size-adjust: from-font) {
  .content-area {
    /* Manual adjustment for browsers without support (if needed) */
    line-height: 1.6;
    font-size: 1.2rem;
  }
}
```

