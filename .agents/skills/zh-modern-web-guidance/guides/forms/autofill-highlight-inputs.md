<a id="customize-the-styling-of-autofilled-form-fields"></a>
# 自定义自动填充表单字段的样式

使用 CSS `:autofill` 伪类，为自动填充的 `<input>`、`<select>` 和 `<textarea>` 元素替换浏览器默认的高亮样式。它匹配由浏览器填充、或由用户选择自动填充建议后填入的字段；一旦用户编辑字段，即使最终值与原值完全相同，也不再匹配。

它从不匹配复选框、单选按钮、文件或按钮类型的输入、表单关联的自定义元素，以及 `contenteditable`：浏览器不会自动填充这些对象。自定义元素 shadow DOM 内的原生控件可以匹配；应从内部设置样式，或通过 `::part(name):autofill` 设置样式。

<a id="how-to-implement"></a>
## 如何实现

- 至少添加一种不依赖颜色的指示方式，例如更粗的内嵌轮廓。浏览器默认的高亮只依赖颜色。
- 不要移除焦点轮廓（`outline: none`）。如果自动填充样式使用 `outline`，请为 `:autofill:focus-visible` 提供除了颜色以外也有所区别的轮廓，例如不同的粗细、样式或偏移，以便用户仍能感知焦点。
- 不要修改会影响布局的属性（`border-width`、`padding`）；该状态随用户操作切换，这样做会引起内容位移。

```css
input:autofill {
  /* Non-color indicator without layout shift: a thicker inset ring */
  box-shadow: inset 0 0 0 2px var(--autofill-ring-color);
  border-color: var(--autofill-ring-color);
}
```

<a id="overriding-the-background-and-text-color"></a>
### 覆盖背景和文本颜色

优先保留浏览器的背景和文本颜色。用户已经习惯了默认高亮表示“此处已自动填充”，替换它会打破这种认知关联。
所有浏览器也都会在用户代理样式表中，以 `!important` 为自动填充字段设置 `background-color`、`background-image` 和 `color`，因此覆盖它们需要变通方法。

如果设计确实要求修改：

```css
input:autofill {
  /* Fill: an inset box-shadow paints over the UA's `!important` background */
  box-shadow:
    inset 0 0 0 2px var(--autofill-ring-color),
    inset 0 0 0 100vmax var(--autofill-background-color);
  /* Text color: -webkit-text-fill-color is not set by the UA */
  -webkit-text-fill-color: var(--autofill-text-color);
  /* The caret still follows the UA's `color`, so set it explicitly */
  caret-color: var(--autofill-text-color);
}
```

注意事项：
- 用户代理的文本颜色是 `FieldText`：浅色方案下为黑色，深色方案下为白色。确保填充背景与其搭配时仍然易读（例如使用 `light-dark()`），这样即使文本颜色覆盖没有生效，字段也仍可阅读。
- 填充绘制在浏览器的颜色之上，而不是页面背景之上，因此 `--autofill-background-color` 应使用不透明颜色。
- 这条规则会替换字段上的其他 `box-shadow`（例如使用 `box-shadow` 实现的焦点环）；请在同一声明中重新列出这些阴影。
- `-webkit-text-fill-color` 只改变实际绘制的文本。`color` 以及由它决定的 `currentColor` 仍会解析为用户代理的 `FieldText`。

<a id="fallback-strategies"></a>
## 回退策略

:autofill 的浏览器支持：可用性有限。
支持：Chrome 110（2023 年 2 月）、Edge 110（2023 年 2 月）和 Safari 15（2021 年 9 月）。
不支持：Firefox。

Firefox 仅在自动填充的用户名和密码字段上匹配 `:autofill`（缺陷 1923525）。没有可用的变通方案；其他字段会保留默认底色。

Chrome 110 之前和 Safari 15 之前仅支持 `:-webkit-autofill`。如果它们属于你的 Baseline 目标范围，请用 `:is()` 包住这两个名称，避免未知伪类使整条规则失效：

```css
input:is(:autofill, :-webkit-autofill) {
  /* same declarations as above */
}
```

这是渐进增强：不支持的浏览器继续保留默认高亮。不要添加 JavaScript 回退方案。
