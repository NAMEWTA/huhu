<a id="build-a-payment-form-that-follows-best-practice"></a>
# 构建符合最佳实践的支付表单

支付表单是整个结账流程中最关键的环节。糟糕的支付表单设计，是用户放弃购物车的常见原因。

创建一个让用户在桌面和移动设备上都能尽可能轻松填写支付信息的表单。充分利用浏览器内置的自动填充、校验和数据输入约束能力。

<a id="how-to-implement"></a>
## 如何实现

下面列出构建好用的支付表单时最重要的准则。

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

在支付表单中添加地址字段时，要认识到地址格式具有多样性，即使同一国家内部也是如此。不要预设所谓“正常”地址的格式。

如果数据要求允许，可以考虑使用单个 `<textarea>` 元素填写地址。这种方案对不同的本地和国际地址格式最为灵活。

<a id="use-autocomplete-for-billing-address"></a>
### 为账单地址使用自动填充

默认将账单地址设为与配送地址相同。提供编辑账单地址的链接，或使用 summary 和 details 元素，而不是直接展示整份账单地址表单，以减少视觉干扰。

像处理配送地址一样，为账单地址使用正确的 autocomplete 值，让用户不必重复输入数据。如果不同分区内具有相同名称的输入框需要不同的值，应在 autocomplete 属性中加入前缀词。例如：

```html
<!-- Prefix with shipping or billing; note that the valid token is address-line1 (no hyphen before the digit) -->
<input autocomplete="shipping address-line1" ...>
...
<input autocomplete="billing address-line1" ...>
```

<a id="show-checkout-progress"></a>
### 展示结账进度

在通往付款的每一步中，使用页面标题和描述明确的按钮文字，清楚说明现在要做什么，以及接下来是哪一步。

使用输入控件的 `enterkeyhint` 属性，设置移动键盘的回车键标签。例如，在多页表单中使用 `enterkeyhint="previous"` 和 `enterkeyhint="next"`，表单最后一个输入框使用 `enterkeyhint="done"`，搜索框则使用 `enterkeyhint="search"`。

<a id="help-users-avoid-re-entering-payment-data"></a>
### 帮助用户避免重复输入支付数据

确保在支付卡表单中添加正确的 `autocomplete` 值。如果不提供自动填充，用户可能会将卡片信息记在纸上，或以不安全的方式存储。

```html
<!-- cc-number tells autofill this is a card number, not a generic number field -->
<!-- inputmode="numeric" gives a numeric keyboard without the increment/decrement spinner -->
<!-- DO NOT use type="number" — it adds increment/decrement controls and strips leading zeros -->
<input id="cc-number" name="cc-number" type="text" autocomplete="cc-number"
       inputmode="numeric" maxlength="19" pattern="[\d ]{13,19}" required>

<!-- cc-name autofills with the name exactly as it appears on the card; Unicode pattern allows international names -->
<input id="cc-name" name="cc-name" type="text" autocomplete="cc-name"
       maxlength="50" pattern="[\p{L} \-\.]+" required>

<!-- cc-exp autofills the full expiry date as MM/YY -->
<!-- MANDATORY: Place format hints above the input so autocomplete popovers or virtual keyboards do not obscure them during editing -->
<span id="exp-hint" class="hint">Format: MM/YY</span>
<input id="cc-exp" name="cc-exp" type="text" autocomplete="cc-exp"
       aria-describedby="exp-hint" maxlength="5" required>

<!-- cc-csc autofills the security code; DO NOT use type="password" here -->
<input id="cc-csc" name="cc-csc" type="text" autocomplete="cc-csc"
       inputmode="numeric" maxlength="4" pattern="[0-9]{3,4}" required>
```

<a id="show-format-hints-above-the-input"></a>
### 将格式提示显示在输入框上方

字段具有特定格式要求时，例如有效期的 `MM/YY` 格式，应将提示放在输入框**上方**的可见元素中，并使用 `aria-describedby` 将两者关联，如上面的 `cc-exp` 示例所示。放在输入框下方的提示，很容易在用户正需要查看时被移动键盘或自动填充弹出层遮挡。

不要只用 `placeholder` 属性提供格式提示，也绝不能用它替代 `<label>`：用户一开始输入，占位文字就会隐藏，编辑时无法再拿它对照。占位文字可以作为标签及持续可见提示之外的补充线索。

<a id="dont-mask-the-security-code"></a>
### 不要遮蔽安全码

卡片安全码应使用 `type="text"` 配合 `inputmode="numeric"`，而不是 `type="password"`。如果三位或四位安全码被遮蔽，用户就无法检查是否输错，错误数字往往要等付款被拒绝时才会发现；而安全码本来就印在用户手中的卡上，遮蔽它增加的保护很有限。

<a id="use-a-single-input-for-payment-card-and-phone-numbers"></a>
### 支付卡号和电话号码使用单个输入框

支付卡号和电话号码应使用单个输入框，不要把号码拆成几个部分。这样更便于输入，校验也更简单，还能让浏览器自动填充。对于 PIN 和银行代码等其他数字数据，也可考虑采用相同方式。

<a id="validate-carefully"></a>
### 谨慎校验

应当实时校验输入，并在表单提交前再次校验。一种方式是为支付卡号输入框添加 pattern 属性。如果用户尝试提交无效值，浏览器会显示警告消息并聚焦该输入框。

不过，pattern 正则表达式必须足够灵活，以兼容支付卡号的不同长度：从 14 位（或更少）到 20 位（或更多）。卡片安全码，也称 CSC、CVC、CVV 或其他名称，包含 3 位或 4 位数字。

允许用户在输入新卡号时包含空格，因为实体卡上的号码通常就是这样分组显示的。这对用户更友好，无需告诉他们“做错了什么”，也不容易打断转化流程；处理前去掉号码中的空格也很直接。

<a id="help-save-users-from-accidentally-missing-data-fields"></a>
### 帮助用户避免意外漏填字段

为必填字段添加 `required` 属性。现代浏览器会对漏填内容自动提示，并将焦点移到对应字段。

<a id="fallback-strategies"></a>
## 回退策略

enterkeyhint 的 Baseline 状态：已广泛可用。自 2021-11-02 起达到 Baseline。
支持：Chrome 77（2019 年 9 月）、Edge 79（2020 年 1 月）、Firefox 94（2021 年 11 月）、Safari 13.1（2020 年 3 月）和 Safari iOS 13.4（2020 年 3 月）。

电子邮件、电话和 URL <input> 类型的 Baseline 状态：已广泛可用。自 2015-07-29 起达到 Baseline。
支持：Chrome 5（2010 年 5 月）、Edge 12（2015 年 7 月）、Firefox 4（2011 年 3 月）、Safari 5（2010 年 6 月）和 Safari iOS 3（2009 年 6 月）。

inputmode 的 Baseline 状态：已广泛可用。自 2021-12-07 起达到 Baseline。
支持：Chrome 66（2018 年 4 月）、Edge 79（2020 年 1 月）、Firefox 95（2021 年 12 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

自动填充属于渐进增强。在不支持自动填充的浏览器中，用户只需手动填写支付信息。语义 HTML 约束（如 `type`、`inputmode`、`pattern` 和 `required`）仍会正常工作，用于校验输入并提供正确的虚拟键盘。
