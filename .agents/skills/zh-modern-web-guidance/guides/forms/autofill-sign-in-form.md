<a id="build-a-sign-in-form-that-follows-best-practice"></a>
# 构建符合最佳实践的登录表单

使用跨平台浏览器能力，构建安全、无障碍且易于使用的登录表单。

只要用户需要登录你的站点，良好的登录表单设计就至关重要。对于网络较差、使用移动设备、时间紧迫或压力较大的用户尤其如此。设计糟糕的登录表单会带来很高的跳出率。每次跳出都可能意味着流失一位客户，并让用户感到不满，不只是错失一次登录机会。

<a id="how-to-implement"></a>
## 如何实现

下面列出构建好用的登录表单时最重要的准则。

<a id="use-meaningful-valid-html"></a>
### 使用有意义且有效的 HTML

充分利用专门用于构建表单的元素和属性：

- `<form>`、`<input>`、`<label>` 和 `<button>`
- `type`、`autocomplete` 和 `inputmode`

它们可以启用浏览器内置功能、改善无障碍体验，并为标记提供语义。

<a id="use-the-label-element-to-label-form-fields-for-data-entry"></a>
### 使用 `<label>` 元素标注需要用户输入的表单字段

为 `<input>`、`<select>` 或 `<textarea>` 标注标签时，使用 `<label>`。让标签的 `for` 属性与输入控件的 `id` 具有相同的值，即可建立关联。

<a id="make-the-most-of-html-attributes"></a>
### 充分利用 HTML 属性

使用合适的 `<input>` 元素及其 `type` 属性，让移动设备提供正确的键盘，并启用浏览器的基本内置校验，从而简化数据输入。

电子邮件地址始终使用 `type="email"`，电话号码始终使用 `type="tel"`。

每个 `<input>`、`<select>` 和 `<textarea>` 元素都**应当**具有合适的 `autocomplete` 属性，以改善无障碍体验，并帮助用户避免重复输入数据。

用户名和电子邮件输入框保存的是标识符，不是普通文章。添加 `spellcheck="false"`，避免浏览器将它们改写成与账户不匹配的内容。对于 `input type="email"`，`autocorrect` 和 `autocapitalize` 始终处于禁用状态；对于非电子邮件形式的用户名，则需要显式禁用它们。

<a id="make-buttons-helpful"></a>
### 让按钮真正帮助用户

按钮应使用 `<button>`。也可以使用 `<input type="submit">`，但不要用 `div` 或其他任意元素冒充按钮。按钮元素具有无障碍行为和内置表单提交功能，也容易设置样式。

为每个提交按钮提供说明其作用的文字，使用清晰易懂的标签。例如，使用**登录**，而不是**继续**或**提交**。

<a id="use-a-single-name-input-where-possible"></a>
### 尽可能只使用一个姓名输入框

除非有充分理由需要分别存储名字、姓氏、称谓或姓名的其他部分，否则允许用户在一个输入框中填写姓名。单一姓名输入框可以简化表单、支持剪切粘贴，并让自动填充更简单。单个姓名输入框使用 `autocomplete="name"`。

```html
<input type="text" id="fullname" name="fullname" autocomplete="name">
```

允许使用来自不同语言和地区的姓名。校验时避免使用只能匹配拉丁字符的正则表达式。仅允许拉丁字符会排除姓名或地址中含有其他字母体系字符的用户。应允许匹配 Unicode 字母，并确保后端能安全地处理 Unicode 输入和输出。现代浏览器已广泛支持正则表达式中的 Unicode 功能。

<a id="show-sign-in-progress"></a>
### 展示登录进度

在通往登录的每一步中，使用页面标题和描述明确的按钮文字，清楚说明现在要做什么，以及接下来是哪一步。

使用输入控件的 `enterkeyhint` 属性，设置移动键盘的回车键标签。例如，在多页表单中使用 `enterkeyhint="previous"` 和 `enterkeyhint="next"`，表单最后一个输入框使用 `enterkeyhint="done"`，搜索框则使用 `enterkeyhint="search"`。

<a id="help-users-avoid-re-entering-sign-in-data"></a>
### 帮助用户避免重复填写登录数据

确保在登录表单中添加正确的 `autocomplete` 值。

这让浏览器能够安全保存登录信息，并正确填入表单，帮助用户完成操作。如果不提供自动填充，用户可能更倾向于将登录信息记在纸上，或以不安全的方式保存在设备中。

<a id="validate-carefully"></a>
### 谨慎校验

实时校验输入，并在表单提交前再次校验。电子邮件输入框使用 `type="email"`，浏览器会自动检查格式。为必填字段添加 `required` 属性，防止空值提交。

<a id="put-sign-in-in-its-own-form-element"></a>
### 将登录放在独立的 `<form>` 元素中

要求用户输入数据时，始终使用 `<form>` 元素。

不要用 `<div>` 包住输入框，然后完全依靠 JavaScript 提交数据。通常更适合使用 `<form>`。它让站点可以被屏幕阅读器和其他辅助设备访问，启用一系列浏览器内置功能，更容易为旧浏览器实现基本可用的登录流程，而且在 JavaScript 失败时仍可能正常工作。

<a id="dont-double-up-inputs"></a>
### 不要要求重复输入

有些站点强制用户输入两次电子邮件地址或密码。这样可能减少少数用户的错误，却给所有用户增加了额外工作，并提高放弃率。当浏览器能自动填充电子邮件地址或建议强密码时，要求输入两次也没有意义。更好的方式是让用户确认其电子邮件地址，这一步无论如何都需要做，并让他们在必要时轻松重置密码。

<a id="keep-passwords-privatebut-enable-users-to-see-them-if-they-want"></a>
### 默认隐藏密码，同时允许用户自行查看

密码输入框应使用 `type="password"` 隐藏文本，并帮助浏览器理解该字段用于密码。（注意，浏览器会使用多种技术判断输入控件的角色，并决定是否提示保存密码。）

应添加**显示密码**切换按钮，让用户检查已经输入的内容；也不要忘记提供**忘记密码**链接。

<a id="give-mobile-users-the-right-keyboard"></a>
### 为移动用户提供正确的键盘

使用 `<input type="email">`，为移动用户提供合适的键盘，并启用浏览器内置的基本电子邮件地址校验，无需 JavaScript！

如果需要用电话号码而不是电子邮件地址，`<input type="tel">` 会在移动设备上启用电话拨号键盘。必要时还可以使用 `inputmode` 属性，例如 `inputmode="numeric"` 很适合输入 PIN。

<a id="prevent-mobile-keyboard-from-obstructing-the-sign-in-button"></a>
### 防止移动键盘遮挡登录按钮

如果没有谨慎设计，移动键盘可能覆盖表单，甚至部分遮住登录按钮。用户可能还没意识到发生了什么，就已经放弃。

尽可能只在登录页面顶部显示电子邮件（或电话）、密码输入框和登录按钮，将其他内容放在下面，以避免这一问题。

<a id="help-users-to-avoid-re-entering-data"></a>
### 帮助用户避免重复输入数据

可以帮助浏览器正确保存数据并自动填充，让用户不必记住和手动输入电子邮件及密码。这在移动设备上尤其重要，对放弃率较高的电子邮件输入框更是关键。它包含两个方面：

1. `autocomplete`、`name`、`id` 和 `type` 属性帮助浏览器理解输入框的作用，从而保存以后可用于自动填充的数据。现代浏览器还要求 input 具有稳定的 `name` 或 `id` 值，不能每次页面加载或站点部署时随机生成；同时，input 必须位于带有 `submit` 按钮的 `<form>` 中，才能保存自动填充数据。
1. `autocomplete` 属性帮助浏览器利用已保存的数据正确填充输入框。

电子邮件输入框应使用 `autocomplete="username"`，因为现代浏览器的密码管理器能够识别 `username`；即使它仍应使用 `type="email"`，并可能采用 `id="email"` 和 `name="email"`，也是如此。密码输入框应使用适合的 `autocomplete` 值，帮助浏览器区分新密码与当前密码，分别为 `autocomplete="new-password"` 和 `autocomplete="current-password"`。

<a id="use-autocompletecurrent-password-for-an-existing-password"></a>
### 已有密码使用 autocomplete="current-password"

强制要求：登录表单中的密码输入框使用 `autocomplete="current-password"`，告知浏览器应填入其为该站点保存的当前密码。

登录表单示例：

```
<input type="password" autocomplete="current-password" id="current-password" …>
```

<a id="enable-the-browser-to-suggest-a-strong-password"></a>
### 允许浏览器建议强密码

现代浏览器会通过启发式规则判断何时展示密码管理器界面，并建议强密码。

浏览器内置密码生成器让用户和开发者无需自行判断什么才是“强密码”。浏览器能安全保存密码，并在需要时自动填入，因此用户无需记住或手动输入。鼓励用户使用内置密码生成器，还能提高他们为站点使用独立强密码的可能性，减少重复使用可能在其他地方泄露的密码。

<a id="help-save-users-from-accidentally-missing-inputs"></a>
### 帮助用户避免意外漏填输入框

强制要求：为电子邮件和密码字段都添加 `required` 属性。现代浏览器会对漏填内容自动提示，并聚焦对应字段。

```html
<input type="email" id="email" name="email" autocomplete="username" required>
<input type="password" id="password" name="password" autocomplete="current-password" required>
```

<a id="allow-password-pasting"></a>
### 允许粘贴密码

有些站点不允许向密码输入框粘贴文本。

禁止粘贴密码会令用户不满，促使他们使用容易记住、因而可能更容易被破解的密码；英国国家网络安全中心等组织还指出，这种限制实际上可能降低安全性。用户只有尝试粘贴后才会发现不被允许，因此禁止粘贴也无法避免剪贴板漏洞。

<a id="fallback-strategies"></a>
### 回退策略

电子邮件、电话和 URL <input> 类型的 Baseline 状态：已广泛可用。自 2015-07-29 起达到 Baseline。
支持：Chrome 5（2010 年 5 月）、Edge 12（2015 年 7 月）、Firefox 4（2011 年 3 月）、Safari 5（2010 年 6 月）和 Safari iOS 3（2009 年 6 月）。

inputmode 的 Baseline 状态：已广泛可用。自 2021-12-07 起达到 Baseline。
支持：Chrome 66（2018 年 4 月）、Edge 79（2020 年 1 月）、Firefox 95（2021 年 12 月）、Safari 12.1（2019 年 3 月）和 Safari iOS 12.2（2019 年 3 月）。

autocorrect 的 Baseline 状态：新近可用。自 2026-09-11 起达到 Baseline。
支持：Chrome 153（2026 年 9 月）、Edge 153（2026 年 9 月）、Firefox 136（2025 年 3 月）、Safari 14.1（2021 年 4 月）和 Safari iOS 14.5（2021 年 4 月）。

自动填充属于渐进增强。在不支持自动填充的浏览器中，用户只需手动填写登录凭据。语义 HTML 约束（如 `type`、`inputmode` 和 `required`）仍会正常工作，用于校验输入并提供正确的虚拟键盘。
