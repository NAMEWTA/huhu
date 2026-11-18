<a id="build-an-address-form-that-follows-best-practice"></a>
# 构建符合最佳实践的地址表单

创建一个让用户在桌面和移动设备上都能尽可能轻松输入地址数据的表单。充分利用浏览器内置的自动填充、校验和数据输入约束能力。

<a id="how-to-implement"></a>
## 如何实现

下面列出构建好用的地址表单时最重要的准则。

<a id="use-meaningful-valid-html"></a>
### 使用有意义且有效的 HTML

充分利用专门用于构建表单的元素和属性：

-   `<form>`、`<input>`、`<label>` 和 `<button>`
-   `type`、`autocomplete` 和 `inputmode`

它们可以启用浏览器内置功能、改善无障碍体验，并为标记提供语义。

<a id="use-the-label-element-to-label-form-fields-for-data-entry"></a>
### 使用 `<label>` 元素标注需要用户输入的表单字段

为 `<input>`、`<select>` 或 `<textarea>` 标注标签时，使用 `<label>`。让标签的 `for` 属性与输入控件的 `id` 具有相同的值，即可建立关联。

<a id="make-the-most-of-html-attributes"></a>
### 充分利用 HTML 属性

使用合适的 `<input>` 元素及其 `type` 属性，让移动设备提供正确的键盘，并启用浏览器的基本内置校验，从而简化数据输入。

电子邮件地址始终使用 `type="email"`，电话号码始终使用 `type="tel"`。

```html
<!-- type="email"/"tel" gives mobile users the right keyboard and enables built-in validation -->
<input type="email" id="email" name="email" autocomplete="email" required>
<input type="tel" id="phone" name="phone" autocomplete="tel">
```

每个 `<input>`、`<select>` 和 `<textarea>` 元素都**应当**具有合适的 `autocomplete` 属性，以改善无障碍体验，并帮助用户避免重复输入数据。

<a id="make-buttons-helpful"></a>
### 让按钮真正帮助用户

按钮应使用 `<button>`。也可以使用 `<input type="submit">`，但不要用 `div` 或其他任意元素冒充按钮。按钮元素具有无障碍行为和内置表单提交功能，也容易设置样式。

为每个提交按钮提供说明其作用的文字。在结账流程的每一步中，使用描述明确的行动提示，说明当前进度并清晰告知下一步。例如，配送地址表单的提交按钮应标为**前往付款**，而不是**继续**或**保存**。

<a id="use-a-single-name-input-where-possible"></a>
### 尽可能只使用一个姓名输入框

除非有充分理由需要分别存储名字、姓氏、称谓或姓名的其他部分，否则允许用户在一个输入框中填写姓名。单一姓名输入框可以简化表单、支持剪切粘贴，并让自动填充更简单。单个姓名输入框使用 `autocomplete="name"`。

```html
<input type="text" id="fullname" name="fullname" autocomplete="name">
```

允许使用来自不同语言和地区的姓名。校验时避免使用只能匹配拉丁字符的正则表达式。仅允许拉丁字符会排除姓名或地址中含有其他字母体系字符的用户。应允许匹配 Unicode 字母，并确保后端能安全地处理 Unicode 输入和输出。现代浏览器已广泛支持正则表达式中的 Unicode 功能。

<a id="allow-for-a-variety-of-address-formats"></a>
### 兼容多种地址格式

构建地址表单时，要认识到地址格式具有多样性，即使同一国家内部也是如此。不要预设所谓“正常”地址的格式。

如果可能，街道地址使用一个 `<textarea>` 元素。

```html
<!-- textarea handles multi-line international address formats that split inputs can't accommodate -->
<textarea id="address" name="address" autocomplete="street-address" required></textarea>
```

这种方案对不同的本地和国际地址格式最为灵活。

如果数据模型要求地址分行，每行使用一个 `<input>`，并配置 `address-line1`、`address-line2`（需要时还包括 `address-line3`）这些 `autocomplete` 标记，使自动填充仍能工作。不要把街道地址拆进未配置这些标记的多个输入框，而且只把第一行设为必填。

```html
<!-- Alternative: one input per line, each with its own autocomplete token -->
<input type="text" id="address-line1" name="address-line1" autocomplete="address-line1" required>
<input type="text" id="address-line2" name="address-line2" autocomplete="address-line2">
```

<a id="help-save-users-from-accidentally-missing-data-fields"></a>
### 帮助用户避免意外漏填字段

为必填字段添加 `required` 属性。

```html
<input type="text" id="city" name="city" autocomplete="address-level2" required>
```

<a id="fallback-strategies"></a>
### 回退策略

html.elements.input.autocomplete 能力的 Baseline 状态：已广泛可用。自 2015-07-29 起达到 Baseline。
支持：Chrome 14（2011 年 9 月）、Edge 12（2015 年 7 月）、Firefox 4（2011 年 3 月）和 Safari 6（2012 年 7 月）。

自动填充属于渐进增强。在不支持自动填充的浏览器中，用户只需手动输入地址详情。语义 HTML 约束（如 `type`、`inputmode` 和 `required`）仍会作为标准表单校验正常工作。
