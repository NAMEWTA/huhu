<a id="accessibility-coding-guidelines"></a>
# 无障碍编码指南

本指南为 AI 编码代理提供可执行的建议与禁忌，确保 Web 应用对所有用户都可访问，包括使用辅助技术的用户。

始终牢记以下原则：

- **无障碍是最低要求，而不是上限。**符合标准只是起点，目标应是真正可用。
- **模式取决于具体使用场景。**任何检查清单都无法替代真实测试，包括邀请残障用户参与测试，以确认某个实现在其实际上下文中确实可访问。

目录：

- [1. 内容导航与结构](#1-content-navigability-and-structure)
  - [地标](#landmarks)
  - [标题](#headings)
  - [列表](#lists)
  - [表格](#tables)
  - [跳过链接](#skip-links)
  - [代码示例：正确使用地标、标题、列表、表格和跳过链接](#code-example-good-use-of-landmarks-headings-lists-tables-and-a-skip-link)
- [2. 语义 HTML 与 ARIA](#2-semantic-html-and-aria)
  - [优先使用原生 HTML](#prefer-native-html)
  - [ARIA 角色与状态](#aria-roles-and-states)
- [3. 无障碍名称与描述](#3-accessible-names-and-descriptions)
  - [命名机制](#naming-mechanisms)
  - [选择名称](#choosing-the-name)
  - [描述](#descriptions)
  - [代码示例：视觉隐藏工具类](#code-example-visually-hidden-utility)
- [4. 文档元数据与语言](#4-document-metadata-and-language)
  - [语言](#language)
  - [页面标题](#titles)
  - [iframe](#iframes)
  - [代码示例：使用 `<title>` 和 `<iframe>` 元素](#code-example-using-the-title-and-iframe-elements)
- [5. 键盘与焦点管理](#5-keyboard-and-focus-management)
  - [Tab 顺序与可聚焦性](#tab-order-and-focusability)
  - [键盘处理器](#keyboard-handlers)
  - [焦点指示器](#focus-indicators)
  - [目标尺寸](#target-sizes)
- [6. 替代文本与媒体](#6-alternate-text-and-media)
  - [图片](#images)
  - [内联 SVG](#inline-svgs)
  - [复杂图片与图表](#complex-images-and-charts)
  - [音频与视频](#audio-and-video)
  - [CSS 生成内容](#css-generated-content)
  - [内容可见性决策表](#content-visibility-decision-matrix)
- [7. 表单与输入控件](#7-forms-and-input-controls)
  - [标签与提示](#labels-and-hints)
  - [输入辅助与验证](#input-assistance-and-validation)
- [8. 实时区域](#8-live-regions)
  - [实时区域紧急程度表](#live-region-urgency-table)
  - [何时播报](#when-to-announce-live-regions)
  - [管理播报](#managing-announcements)
- [9. 颜色](#9-color)
- [10. 字体排版](#10-typography)
- [11. 动效与偏好](#11-motion-and-preferences)
- [12. 模态框与原生对话框](#12-modals-and-native-dialogs)
  - [原生 `<dialog>`](#native-dialog)
  - [自定义覆盖层](#custom-overlays)
- [13. 测试验证](#13-testing-validations)
  - [自动化检查](#automated-checks)
  - [手动测试](#manual-testing)

<a id="1-content-navigability-and-structure"></a>
## 1. 内容导航与结构

<a id="landmarks"></a>
### 地标

- **将所有内容放在地标内：**使用 `<header>`、`<nav>`、`<main>`、`<aside>` 和 `<footer>` 包裹页面各个相应部分，让辅助技术用户能够在区域之间跳转。（1.3.6 识别目的，AAA 级）
- **使用正确的地标：**用 `<header>` 容纳介绍性内容，用 `<nav>` 容纳全站或页内导航链接，用 `<main>` 容纳页面主要内容，用 `<aside>` 容纳与主要内容存在间接关联的内容，用 `<footer>` 容纳相关内容的信息，例如作者、版权信息和相关文档链接。（1.3.1 信息和关系，A 级）
- **每页使用一个 `<main>` 地标：**避免在单页中使用多个 `<main>` 元素。（1.3.1 信息和关系，A 级）
- **为导航区域提供可区分的无障碍名称：**如果页面包含多个 `<nav>`，为每个元素设置 `aria-label`，其值应是可区分该区域的无障碍名称，例如 `<nav aria-label="Primary">`、`<nav aria-label="Secondary">` 等。（最佳实践）
- **不要过度使用地标：**地标过多会削弱其价值。尤其要避免为 `<section>` 添加标签，因为这会使其成为 `region` 地标；只有其他地标均不适用时，才最后考虑 `region`。（最佳实践）

<a id="headings"></a>
### 标题

- **使用标题组织主要内容：**按层级顺序使用 `<h1>`–`<h6>` 元素，让屏幕阅读器用户获得可导航的大纲。（1.3.1 信息和关系，A 级）
- **强制要求：不要使用“假”标题：**绝不要使用看起来像标题的 `<div>` 或 `<span>`，而不采用标准的 `<h1>`–`<h6>` 元素。（1.3.1 信息和关系，A 级）
- **避免错误嵌套标题：**如果子标题在视觉上的重要性低于父标题，确保它在标题层次结构中的级别也更低。（1.3.1 信息和关系，A 级）
- **每页使用一个 `<h1>` 元素：**用 `<h1>` 表示页面主标题。单页中有多个 `<h1>`，会使屏幕阅读器用户难以识别真正的主标题。（最佳实践）
  - **例外：**如果页面包含通过 `<dialog>`、`role="dialog"` 或 `role="alertdialog"` 标记的模态对话框，可以使用 `<h1>` 标记其主标题，因为对话框是独立于页面的新窗口。
- **避免“跳过”标题级别：**例如，不要从 `<h1>` 直接跳到 `<h4>`，以免破坏逻辑层次。（最佳实践）
- **避免将标题放在 `<summary>` 元素内：**某些浏览器仍将该元素暴露为按钮，这会移除其子元素的所有角色，包括标题角色。如果标题必须充当展开触发器，应使用手风琴，或通过 ARIA 实现的展开控件，让标题元素包裹按钮，而不是使用 `<details>` 和 `<summary>`。（最佳实践）

<a id="lists"></a>
### 列表

- **对重复且连续的内容使用列表：**`<ul>`/`<ol>` 会让辅助技术提前告知列表项数量，并让用户跳过整个列表。（1.3.1 信息和关系，A 级）
- **使用正确的列表元素：**对于顺序**不重要**的无序列表，例如相关商品列表，使用 `<ul>`；对于顺序**重要**的有序列表，例如操作步骤，使用 `<ol>`。（1.3.1 信息和关系，A 级）
- **不要对非列表内容使用列表：**不要用列表标记各段独立文本，因为屏幕阅读器遇到列表会播报列表信息，可能让用户听到关于相关内容的困惑且冗余的信息。（1.3.1 信息和关系，A 级）
- **不要为复选框和单选按钮使用列表：**正确标记后，即使没有列表标记，屏幕阅读器也已经会播报复选框或单选按钮的数量，以及当前聚焦控件在组内的序号。额外的列表标记会导致重复。（1.3.1 信息和关系，A 级）

<a id="tables"></a>
### 表格

- **使用正确的表格元素：**用 `<table>` 标识表格，`<caption>` 提供标题及说明用的无障碍名称，`<tr>` 标识表格各行，`<th>` 和 `<td>` 分别标识表头单元格与数据单元格。（1.3.1 信息和关系，A 级）
- **在 `<th>` 元素上使用 `scope`：**`scope` 属性表明 `<th>` 是行表头（`<th scope="row">`）还是列表头（`<th scope="col">`）。（1.3.1 信息和关系，A 级）
- **强制要求：不要用表格布局：**屏幕阅读器会播报有关布局的冗余信息，可能使用户困惑；表格标记还会影响内容阅读顺序和键盘焦点顺序。应使用 CSS Grid/Flexbox 实现视觉布局。（1.3.1 信息和关系，A 级）
- **避免过度复杂的表格：**跨行、跨列、嵌套表格以及可展开或折叠行，在视觉上可能合理且满足相关 WCAG 成功准则，但整体结构可能使屏幕阅读器用户迷失方向、难以导航。此时，应拆分成更小、更易且更高效导航的表格。（最佳实践）

<a id="skip-links"></a>
### 跳过链接

- **提供跳过链接**：在重复内容之前，例如带导航的站点页头或很长、无限的列表之前，提供跳过链接，让键盘用户轻松绕过它们。（2.4.1 跳过区块，A 级）
  - **注意：**当跳过链接的目标通常不可聚焦时，屏幕放大器有时不会跟随焦点。
    推荐的解决方法是使用 `tabindex="-1"`，让目标可以通过程序聚焦，但不进入 Tab 顺序。
    如果目标内部包含可聚焦元素，这又会产生另一种可用性问题：点击目标内部，总会将**顺序焦点导航起点**设在目标本身，而不是可聚焦元素之间的位置。
    同时满足这两种用户预期的方法，是将预期目标内第一个有意义的元素设为跳过链接的实际目标，并设置 `tabindex="-1"`，例如标题 `<h1 id="content" tabindex="-1">`。
    注意，该元素之前的所有内容都会被跳过，包括目标区域内其他相关内容，因此可能给其他辅助技术用户留下可用性缺口。
- **避免在不需要的地方使用跳过链接：**如果一组页面唯一的公共元素只是一个返回首页的链接，就不需要跳过链接。（最佳实践）
- **避免过度使用跳过链接：**单页通常一个跳过链接就足够，或使用两个分别覆盖主要和次要的公共导航链接组。多个不必要的跳过链接会增加页面上的 <kbd>Tab</kbd> 停靠点，使仅用键盘导航的用户感到烦躁。（最佳实践）

```html
<!-- Good: Skip to main content -->
<a href="#content" class="skip-link">Skip to main content</a>
<main id="content">...</main>
```

<a id="code-example-good-use-of-landmarks-headings-lists-tables-and-a-skip-link"></a>
### 代码示例：正确使用地标、标题、列表、表格和跳过链接

```html
<!-- Good: Semantic landmarks, heading hierarchy, skip link -->
<header>
  <a href="#platform-dashboard" class="skip-link visually-hidden">Skip to content</a>
  <nav aria-label="Primary">
    <ul>
      <li><a href="/">Home</a></li>
    </ul>
  </nav>
</header>
<main>
  <h1 id="platform-dashboard" tabindex="-1">Platform Dashboard</h1>
  <section>
    <h2>User Statistics</h2>
    <table>
      <caption>Monthly active users</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col">Users</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>January</td>
          <td>12,000</td>
        </tr>
      </tbody>
    </table>
    <h3>Notes</h3>
    <ul>
      <li>Results do not include users without active subscriptions</li>
      <li>Results are accurate as of 31 December 2025</li>
    </ul>
  </section>
</main>
```

<a id="2-semantic-html-and-aria"></a>
## 2. 语义 HTML 与 ARIA

<a id="prefer-native-html"></a>
### 优先使用原生 HTML

- **优先使用 HTML 元素和属性，而不是 ARIA：**避免 `<div role="button">` 或 `<a role="button">`，改用 `<button>`。原生 HTML 元素和属性默认已经内置正确的角色和行为，包括键盘支持。`<button>` 已隐含 `role="button"`，`required` 已隐含 `aria-required`，无需额外 JavaScript 保证正确角色与行为。（最佳实践）
  - **例外：**当 HTML 不提供相关功能时，需要 ARIA。例如，没有明确用于构建标签页导航组件的 HTML 元素，但 ARIA 提供了适合此用途的角色和状态属性。
- **不要添加冗余 ARIA 角色或属性：**避免 `<ul role="list">`、`<nav role="navigation">` 和 `<input required aria-required="true">`。（最佳实践）
  - **例外：**Safari 会在 `<nav>` 之外的 `<ul>`/`<ol>` 应用 `list-style: none` 或 `display: flex`/`grid` 时移除列表语义。此时需要 `role="list"` 来恢复语义。
- **不要将交互式 ARIA 角色应用到结构性 HTML 元素：**使用 `<li><span role="button">Button in a list</span></li>`，不要使用 `<li role="button">Button in a list</li>`，以免破坏容器的列表语义。（4.1.2 名称、角色、值，A 级）
  - **例外：**可以为语义相近的结构性 HTML 元素设置 ARIA 角色，例如树视图：`<ul role="tree"><li role="treeitem">…</li>…</ul>`。

<a id="aria-roles-and-states"></a>
### ARIA 角色与状态

- **使 ARIA 实现与实际行为匹配：**为元素设置 `role="tab"` 后，它必须像标签页一样工作，包括键盘交互。很多 ARIA 模式无法仅用 CSS 实现，需要 JavaScript。（4.1.2 名称、角色、值，A 级）
- **管理切换状态：**使用 `aria-expanded` 和 `aria-pressed` 传达自定义控件的切换状态。（4.1.2 名称、角色、值，A 级）
- **慎重选择 `disabled` 与 `aria-disabled`：**`disabled` 会将元素完全移出焦点顺序，且 `tabindex="0"` 也不能恢复它，这对工具栏按钮或链接常常不合适。`aria-disabled="true"` 会保持元素可聚焦，让用户能够到达并了解其已禁用；但它只向辅助技术传达状态，因此还必须在 JavaScript 中阻止指针点击、键盘触发等激活行为。（4.1.2 名称、角色、值，A 级）
- **强制要求：不要向屏幕阅读器隐藏交互元素：**不要为会获得焦点的交互元素或其父元素设置 `aria-hidden="true"`。（4.1.2 名称、角色、值，A 级）
- **强制要求：不要抹去交互元素的角色：**对交互元素设置 `role="presentation"` 或 `role="none"` 会移除其语义。元素仍会暴露给辅助技术并被屏幕阅读器播报，但其角色和任何状态信息都不会被播报，导致困惑和潜在的意外行为。（4.1.2 名称、角色、值，A 级）
- **不要假设自定义元素没有 ARIA：**自定义元素可通过 `ElementInternals` 附加 ARIA，一些自动测试工具无法看到它。因此，标记中缺少 `role`/`aria-*` 属性，并不能证明元素没有语义。应使用浏览器的无障碍树检查器验证。（最佳实践）

<a id="3-accessible-names-and-descriptions"></a>
## 3. 无障碍名称与描述

每个交互元素和某些地标都需要无障碍名称，许多元素也受益于无障碍描述。名称应简短，用于标识元素；描述则补充上下文。

<a id="naming-mechanisms"></a>
### 命名机制

- **优先使用原生命名机制：**表单控件用 `<label>`，`<table>` 用 `<caption>`，`<fieldset>` 用 `<legend>`，`<figure>` 用 `<figcaption>`。（最佳实践）
- **通过 `for`/`id` 显式关联 `<label>` 与控件：**这不仅确保控件由 `<label>` 内容正确标记，也会扩大目标区域，让用户激活标签*或*其关联控件时，都能将焦点移至控件。其他标记方式，例如 `aria-labelledby`，并非普遍支持这一行为。此外，一些辅助技术，尤其是语音识别软件，即使采用等价且支持无障碍的方式，如将 `<input>` 嵌套在 `<label>` 中，仍要求显式设置 `for`/`id` 关系。（4.1.2 名称、角色、值，A 级）
- **存在可见标签时，优先使用 `aria-labelledby` 而不是 `aria-label`：**这能避免重复，改善可维护性，也更利于翻译。（最佳实践）
- **不要将 `title` 作为命名机制：**此属性值只在鼠标悬停时显示，任何浏览器都无法通过键盘显示或以其他方式访问它。（最佳实践）
  - **例外：**`<iframe>` 是例外，`title` 属性是为它提供无障碍名称的标准方式。
- **不要将 `placeholder` 作为命名机制：**此属性值最初显示在 `<input>` 或 `<textarea>` 内，但用户一输入文本就会消失，从而不再有视觉提示说明字段代表什么。大多数浏览器中，`placeholder` 文本与背景的对比度很低，难以被用户感知。（3.3.2 标签或说明，A 级）
- **不要为不应命名的元素设置 `aria-label`/`aria-labelledby`：**例如普通 `<div>`、`<span>`，以及其他没有角色的自定义元素。这些属性只用于为具有显式或隐式组件角色（例如按钮、链接和标签页）、地标、图片或 iframe 角色的元素提供无障碍名称。（1.3.1 信息和关系，A 级）
  - **例外：**自定义元素可能通过 `ElementInternals` 设置了隐式角色，因此缺少 `role` 属性不能作为最终判断。

<a id="choosing-the-name"></a>
### 选择名称

- **避免不一致的链接文本：**如果多个超链接将用户带到同一目标页，确保每个链接都有相同的无障碍名称，通常应与可见链接文本一致。例如，目标页为 `profile.html` 时，所有链接统一使用“我的个人资料”**或**“个人资料”作为无障碍名称，不要一处用前者、另一处用后者。（最佳实践）
- **通过无障碍名称区分外观相同但执行不同操作的控件：**例如页面可能有多个“编辑”按钮，分别用于编辑用户名、密码和地址。其用途从周围内容看可能很明显，但屏幕阅读器用户可能只听到“编辑，按钮”。可用以下技术解决：（4.1.2 名称、角色、值，A 级）
  - **使用视觉隐藏文本：**将文本包含在 DOM 中，但通过 CSS 从视觉上隐藏，例如 `<button>Edit <span class="visually-hidden">first name</span></button>`。完整 CSS 见[代码示例：视觉隐藏工具类](#code-example-visually-hidden-utility)。
  - **为控件设置 `aria-label`：**属性值应包含可见文本及重要上下文，例如 `<button aria-label="Edit name">Edit</button>`、`<button aria-label="Edit address">Edit</button>` 等。
  - **使用 `aria-labelledby` 或 `aria-describedby` 将控件与其相关内容关联：**在 `aria-labelledby` 中串联 ID，可将相关文本追加到控件的无障碍名称，例如 `<p id="firstName">First name</p> <button id="editFirstName" aria-labelledby="editFirstName firstName">Edit</button>`；`aria-describedby` 则将上下文作为无障碍描述提供，例如 `<p id="firstName">First name</p> <button aria-describedby="firstName">Edit</button>`。
- **将控件的可见文本包含在无障碍名称中：**所有用于标记控件的可见文本，都必须原样包含在控件的无障碍名称里。名称可在可见文本前后补充信息，但可见文本本身不能不同。例如，可见链接文本为 “Read more”，无障碍名称可以是 “Read more about [subject]”，因为可见文本未被修改地包含其中；但不能是 “Read some more about [subject]”，因为 “Read” 与 “more” 之间插入了 “some”，与可见文本不符。（2.5.3 名称中的标签，A 级）
- **不要在同一视图中，为效果不同的控件复用无障碍名称：**确保各个无障碍名称都能消除歧义。（4.1.2 名称、角色、值，A 级）
  - **例外：**两个独立对话框中的两个按钮都叫“关闭”是可以的，因为每次只能访问其中一个对话框；但同一对话框中多个效果不同的“编辑”按钮则不可以。
- **不要为指向不同 `href` 目标的超链接复用无障碍名称：**例如，避免 `<a href="annualreport2025.html">Annual Report</a>` 与 `<a href="annualreport2026.html">Annual Report</a>`；改用 `<a href="annualreport2025.html">Annual Report 2025</a>` 与 `<a href="annualreport2026.html">Annual Report 2026</a>`，或等价的控件消歧技术。
- **不要将描述、错误消息或说明塞进标签：**冗长标签会让屏幕阅读器用户困惑和烦躁。应使用 `aria-describedby` 以程序方式将额外内容关联到字段。例如：`<label for="yourComments">Your comments</label><p id="yourCommentsWarning">Please do not include any personal information in this field.</p><textarea id="yourComments" aria-describedby="yourCommentsWarning"></textarea>`。屏幕阅读器会先播报标签，再播报控件类型，最后才播报额外信息；用户已了解这些信息时可以跳过。（最佳实践）
- **不要在标签中重复 ARIA 已暴露的状态信息：**例如通过 `aria-expanded`、`aria-checked`、`aria-selected`、`aria-pressed` 等属性暴露的信息。重复会造成冗余和歧义。（最佳实践）
- **不要在标签中包含角色名称：**这会导致重复。例如 `<nav aria-label="Primary navigation">` 会被读为 “Primary navigation, navigation”，即重复播报“导航”。（最佳实践）

<a id="descriptions"></a>
### 描述

- **将明确关联控件的说明、错误消息和其他重要信息标识为描述：**描述示例包括：（1.3.1 信息和关系，A 级）
  - 创建账户时的密码要求列表。
  - 与先前提交表单中的某字段相关的错误消息。
  - 额外说明，例如“必须先同意条款与条件，才能提交表单”。
- **确保相关元素获得焦点时，辅助技术能够获取描述：**采用以下方式之一：（1.3.1 信息和关系，A 级）
  - 如果描述已在页面上可见，使用 `aria-describedby` 以程序方式将其与元素关联。
  - 如果描述在页面上不可见，且明确只面向屏幕阅读器用户，即提供可见描述并不适当或没有帮助，则为元素设置 `aria-description`，提供合适的描述。
- **避免为每个元素都提供描述：**如果主要标签已经提供足够信息，例如“名字”，额外描述很可能是冗余的。（最佳实践）
  - **例外：**与控件关联的内联错误消息，例如文本框上方或下方的错误消息，以及需要在元素获得焦点时播报的次要标签，不受此限制。
- **避免在描述中包含元素属性已提供的信息：**例如为已有 `required` 属性的 `<input>` 增加“这是必填字段”描述，会导致重复播报。（最佳实践）
  - **例外：**`aria-invalid="true"` 是例外。许多屏幕阅读器到达带此属性且值为 `true` 的 `<input>` 时会播报“无效”，表示字段有错误，却不会说明具体错误。此时需要提供描述，即用户可读的实际错误消息。只有存在错误消息时，才应添加此属性并设为 true。
- **避免在 `aria-describedby` 目标中包含交互元素**，除非该元素内容单独作为描述朗读时仍然合理。例如：（最佳实践）
  - 以下是可以接受的，因为整段文本播报时有完整含义：`<p id="description">I understand the <a href="tandc.html">terms and conditions</a>.</p>`。
  - 以下不合适，因为描述会被播报为 “Please don't include personal information in this field. Learn more.”，其中 “Learn more” 脱离了预期上下文：`<p id="description">Please don't include personal information in this field. <a href="…">Learn more</a></p>`。应仅将纯文本包含在被引用的描述中：`<p><span id="description">Please don't include personal information in this field.</span> <a href="…">Learn more</a></p>`。

<a id="code-example-visually-hidden-utility"></a>
### 代码示例：视觉隐藏工具类

`.visually-hidden` 工具类为屏幕阅读器提供文本，而不在视觉上呈现。它常用于跳过链接、仅图标按钮的额外上下文，以及补充标签。

```css
/* Hides content visually but keeps it in the accessibility tree.
   :focus-within / :active opt elements out — useful for skip links and
   any focusable content wrapped in this class. */
.visually-hidden:where(:not(:focus-within, :active)) {
  position: absolute !important;
  clip-path: inset(50%) !important;
  overflow: hidden !important;
  width: 1px !important;
  height: 1px !important;
  margin: -1px !important;
  padding: 0 !important;
  border: 0 !important;
  white-space: nowrap !important;
}
```

当隐藏内容可聚焦时，例如跳过链接或可接收焦点的包装元素，`:focus-within`/`:active` 例外可使它变为可见。根据具体情况设置可见状态样式；例如，指向主要内容的跳过链接通常应固定定位在视口左上角，避免页面其他内容发生位移。

<a id="4-document-metadata-and-language"></a>
## 4. 文档元数据与语言

<a id="language"></a>
### 语言

- **声明页面的自然语言：**始终在页面的 `<html>` 元素上设置 `lang`，并设为页面内容的主要自然语言，例如 `<html lang="en">`。（3.1.1 页面语言，A 级）
- **声明页面自然语言的变化：**如果页面出现语言变化，为受影响内容的父元素或容器设置 `lang`，其值为相应语言的短代码。例如：`<p>In Germany, you may be greeted by someone saying <span lang="de">Guten Morgen</span>.</p>`。（3.1.2 局部语言，AA 级）
- **不要将 `lang` 设为与内容自然语言不符的值：**这会使屏幕阅读器和其他文字转语音软件以难以理解的方式朗读内容。（3.1.1 页面语言，A 级；3.1.2 局部语言，AA 级）

<a id="titles"></a>
### 页面标题

- **为所有页面的 `<head>` 添加 `<title>` 元素：**这也包括通过 `<iframe>` 嵌入文档的页面。（2.4.2 页面标题，A 级）
- **提供唯一的页面标题：**每个页面都应有自己的标题，清晰无歧义地反映其目的或内容。（2.4.2 页面标题，A 级）
- **将页面独有内容放在 `<title>` 前面：**例如 `<title>Page Topic | Site Name</title>`。（最佳实践）
- **在单页应用（SPA）页面转换时更新标题：**例如显示联系表单时，标题是 `<title>Contact Us</title>`；表单成功提交后，更新为 `<title>Thank you for contacting us!</title>`。（2.4.2 页面标题，A 级）
- **不要在页面 `<head>` 中放置空 `<title>`：**无论页面看起来多么简短或无关紧要，都不要使用 `<title></title>`。页面标题会显示在浏览器标签页中，便于用户在打开多个标签页时区分页面；页面打开时，屏幕阅读器通常也会播报标题。（2.4.2 页面标题，A 级）
- **避免多个页面使用相同标题，或使用含糊标题：**这种情况下，用户必须查看实际页面内容，才能区分各页。（2.4.2 页面标题，A 级）

<a id="iframes"></a>
### iframe

- **为 `<iframe>` 元素提供描述性的 `title`：**所有 `<iframe>` 都应包含 `title` 属性，其值必须清楚且无歧义地描述 `<iframe>` 内容。（4.1.2 名称、角色、值，A 级）
- **不要禁用 iframe 滚动**：不要对 iframe 使用已弃用的 `scrolling="no"` 或 `overflow: hidden`。放大页面或增大文字的用户，需要滚动才能访问溢出的内容。（1.4.4 调整文字大小，AA 级；1.4.10 重排，AA 级）

<a id="code-example-using-the-title-and-iframe-elements"></a>
### 代码示例：使用 `<title>` 和 `<iframe>` 元素

```html
<!-- Good: Distinct title and language declaration -->
<html lang="en">
<head>
  <title>Analytics Reports | Guidance Platform</title>
</head>
<body>
  <p>The motto is <span lang="la">"Carpe diem"</span>.</p>
  <iframe title="Interactive Sales Chart" src="/chart"></iframe>
</body>
</html>
```

<a id="5-keyboard-and-focus-management"></a>
## 5. 键盘与焦点管理

<a id="tab-order-and-focusability"></a>
### Tab 顺序与可聚焦性

- **提供合理的 Tab 顺序：**确保元素获得焦点的次序符合适当的顺序。（2.4.3 焦点顺序，A 级）
  - **注意：**在从左到右阅读的语言中，焦点从上到下、从左到右移动时，Tab 顺序是合理的；而在从右到左阅读的语言中，焦点应从上到下、从右到左移动。
- **只在必要时使用 `tabindex`：**对于需要焦点、已应用适当交互角色但默认不可聚焦的元素，设置 `tabindex="0"`，例如 `<span role="button" tabindex="0">Print</span>`。（2.4.3 焦点顺序，A 级）
- **正确管理进出更新内容的焦点：**例如页面出现对话框时，确保焦点立即移入对话框，被限制在对话框内容中，并在关闭后返回最初触发对话框的元素。（2.4.3 焦点顺序，A 级）
- **不要为默认已可聚焦的交互元素设置 `tabindex="0"`：**`<button>`、带 `href` 的 `<a>` 以及 `<input>` 等原生元素，已可通过键盘聚焦，因此不需要 `tabindex="0"`。（2.4.3 焦点顺序，A 级）
- **不要为静态、非交互或隐藏元素设置 `tabindex="0"`：**只有激活后执行特定操作的元素，才应进入页面的 Tab 顺序。静态、非交互和隐藏元素，无论临时还是永久隐藏，都不得可聚焦。（2.4.3 焦点顺序，A 级）
- **强制要求：不要使用正数 `tabindex`：**绝不要为元素设置 `tabindex="1"` 或任何大于 0 的值，这会强行赋予页面一个与设计或用户预期不符的 Tab 顺序。（2.4.3 焦点顺序，A 级）

<a id="keyboard-handlers"></a>
### 键盘处理器

- **为自定义模拟交互元素添加 <kbd>Enter</kbd>/<kbd>Space</kbd> 处理器：**为类似按钮的元素实现自定义键盘处理器时，<kbd>Enter</kbd> 应在 `keydown` 处理，<kbd>Space</kbd> 应在 `keyup` 处理，匹配原生 `<button>` 的行为：<kbd>Enter</kbd> 可重复触发，<kbd>Space</kbd> 在释放时触发。（2.1.1 键盘，A 级）
- **不要为原生交互元素添加键盘处理器：**`<button>`、`<input>` 和带必需 `href` 的 `<a>` 等原生元素，默认已支持 <kbd>Enter</kbd>，除 `<a>` 外也支持 <kbd>Space</kbd>，因此添加这些键盘处理器是冗余的。（最佳实践）
  - **例外：**如果通过 `role="button"` 将 `<a>` 改作按钮，仍需添加 `keyup` 处理器支持 <kbd>Space</kbd>，以匹配原生 `<button>` 行为。

<a id="code-example-keyboard-handlers"></a>
#### 代码示例：键盘处理器

```javascript
// Good: Keyboard handlers for complex custom widgets (e.g., Tree items, tabs).
// NOTE: This pattern applies ONLY to non-standard UI where no native HTML tag exists.
// Always prioritize native <button> or <input> elements for standard interactions.
// Elements MUST have the appropriate ARIA role (e.g., role="treeitem" or role="tab").
customWidget.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    toggleWidgetState();
  }
  if (e.key === ' ') {
    e.preventDefault(); // Prevent page scrolling on Spacebar keydown
  }
});

customWidget.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    toggleWidgetState();
  }
});

function toggleWidgetState() {
  // E.g., Manage toggle/expanded states for custom controls
  const isExpanded = customWidget.getAttribute('aria-expanded') === 'true';
  customWidget.setAttribute('aria-expanded', !isExpanded);
}
```

<a id="focus-indicators"></a>
### 焦点指示器

- **为焦点指示器设置样式时使用 `:focus-visible`：**定义自定义焦点指示器时，始终显式为 `:focus-visible` 状态设置样式，而不是 `:focus`。（最佳实践）
- **优先使用浏览器原生焦点指示器：**除非为满足对比度或设计要求而需要自定义焦点样式，否则将焦点指示交给浏览器。（最佳实践）
- **强制要求：没有替代的自定义焦点指示器时，不要禁用浏览器原生指示器：**使用 `outline: none;` 隐去原生焦点指示器时，应提供等效的自定义指示器，且其与相邻内容的对比度至少为 `3:1`。（2.4.7 焦点可见，AA 级；1.4.11 非文本对比度，AA 级）
- **焦点环优先使用 `outline` 而不是其他属性：**如果必须依赖 `box-shadow` 实现焦点环，应通过 `forced-colors` 媒体查询，为高对比度模式提供基于 `outline` 的回退。（最佳实践）
- **将自定义焦点轮廓与 `outline-offset` 配合使用：**这样可在视觉上将焦点环与元素分开。（最佳实践）

<a id="code-example-custom-focus-indication"></a>
#### 代码示例：自定义焦点指示

```css
/* Good: High contrast focus border */
:where(a:any-link, button):focus-visible {
  outline: 3px solid #ff0055;
  outline-offset: 3px;
}
```

<a id="target-sizes"></a>
### 目标尺寸

- **将交互元素的目标尺寸设为至少 24×24 CSS 像素：**通过 `min-block-size` / `min-inline-size` 或内边距保证目标尺寸，而不是使用 `width` / `height`，使内容可以扩大目标，但不会缩小它。（2.5.8 目标尺寸〔最低要求〕，AA 级）
  - **例外：**交互元素的目标*可以*小于 24×24 CSS 像素，*前提是*其位置满足以下条件：以每个元素的边界框中心为圆心绘制直径 24 CSS 像素的圆，这些圆不得与附近目标相交，也不得与其他小于 24×24 CSS 像素目标的圆相交。
- **在粗略指针设备上增大目标：**使用 `@media (pointer: coarse) { … }`。（2.5.8 目标尺寸〔最低要求〕，AA 级）
- **不要为自定义手势使用 `touch-action: none;`：**这会禁用通过该元素滚动页面。应限制到实际需要的轴：水平滑动使用 `pan-y`，让页面仍可垂直滚动；垂直滑动使用 `pan-x`。只有原生触摸行为都不适用的元素，例如绘图画布，才保留 `none`。（2.1.1 键盘，A 级）

<a id="6-alternate-text-and-media"></a>
## 6. 替代文本与媒体

<a id="images"></a>
### 图片

- **强制要求：为全部 `<img>` 元素设置 `alt` 属性：**对于使用屏幕阅读器的用户，浏览器会以此属性值替代图片。（1.1.1 非文本内容，A 级）
- **提供有信息价值的视觉描述：**描述图片的用途，例如用“搜索”，而不是“放大镜”。（1.1.1 非文本内容，A 级）
- **为装饰性视觉内容设置 `alt=""`：**这会阻止屏幕阅读器播报它们。（1.1.1 非文本内容，A 级）
- **不要使用套话前缀：**避免“……的图片”“……的照片”之类表述。（最佳实践）
- **不要在文件名中使用下划线：**如果文件名可能作为回退被播报，应使用连字符。（最佳实践）

<a id="code-example-providing-a-text-description-for-img-elements"></a>
#### 代码示例：为 `<img>` 元素提供文本描述

```html
<!-- Decorative -->
<img src="divider.png" alt="">

<!-- Informative (Functional) -->
<a href="/search">
  <img src="glass.png" alt="Search the platform">
</a>
```

<a id="inline-svgs"></a>
### 内联 SVG

- **为非装饰性 SVG 的 `<svg>` 元素设置 `role="img"`：**确保它们普遍被作为图片暴露。（4.1.2 名称、角色、值，A 级）
- **为非装饰性 SVG 提供文本描述：**使用以下方法之一：（1.1.1 非文本内容，A 级）
  - 在 `<svg>` 内嵌套一个包含文本描述的 `<title>` 子元素；**或**
  - 为 `<svg>` 设置 `aria-label`，其值为适当的文本描述。
- **向辅助技术隐藏装饰性 SVG：**为装饰性 `<svg>` 设置 `aria-hidden="true"`，防止屏幕阅读器播报。（1.1.1 非文本内容，A 级）

<a id="code-example-providing-a-text-description-for-non-decorative-svgs-using-the-title-element"></a>
#### 代码示例：使用 `<title>` 为非装饰性 SVG 提供文本描述

```html
<!-- Inline non-decorative SVG: example that uses the <title> element -->
<svg role="img" viewBox="0 0 24 24">
  <title>Home</title>
  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
</svg>
```

<a id="code-example-providing-a-text-description-for-non-decorative-svgs-using-the-aria-label-attribute"></a>
#### 代码示例：使用 `aria-label` 为非装饰性 SVG 提供文本描述

```html
<!-- Inline non-decorative SVG: example that uses the aria-label attribute -->
<svg role="img" viewBox="0 0 24 24" aria-label="Home">
  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
</svg>
```

<a id="code-example-identifying-decorative-svgs"></a>
#### 代码示例：标识装饰性 SVG

```html
<!-- Inline Decorative SVG (hide from assistive technologies) -->
<svg aria-hidden="true" viewBox="0 0 24 24">
  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
</svg>
```

<a id="complex-images-and-charts"></a>
### 复杂图片与图表

- **为复杂图片提供长描述：**对图表和信息图使用 `<figure>`/`<figcaption>` 或 `aria-describedby`。（1.1.1 非文本内容，A 级）
- **提供语义化数据表作为替代：**为图表和其他复杂可视化提供语义化数据表，作为可访问的替代内容。（1.1.1 非文本内容，A 级）

<a id="code-example-complex-graph-with-figcaption"></a>
#### 代码示例：带 figcaption 的复杂图表

```html
<!-- Complex graph with figcaption -->
<figure>
  <img src="chart.png" alt="Sales growth graph 2024.">
  <figcaption>Sales grew 20% in Q3 due to new platform launch.</figcaption>
</figure>
```

<a id="audio-and-video"></a>
### 音频与视频

- **强制要求：为纯音频内容和音视频组合内容提供文字稿：**文字稿应逐字呈现全部对话，并包含重要非语音声音的文本描述，例如音效。（1.2.1 纯音频和纯视频〔预录制〕，A 级；1.2.3 音频描述或媒体替代〔预录制〕，AA 级）
- **强制要求：为纯视频内容提供文本描述或音轨：**例如，为说明如何使用某个产品的动画提供文字说明，或提供描述视频动作的独立音轨。（1.2.1 纯音频和纯视频〔预录制〕，A 级）
- **强制要求：为视频提供同步字幕：**为视频内容的音轨提供 WebVTT 字幕。字幕应逐字且与音轨同步，包含全部对话，以及有意义的非语音内容，例如音效和配乐传达的其他重要信息，如“响起不祥的音乐”。（1.2.2 字幕〔预录制〕，A 级）
  - **例外：**如果视频只是已有文本的装饰性替代，而且已明确说明这一点，则不需要字幕。
- **为视频提供音频描述：**在视频中加入额外音轨，补充屏幕上显示的视觉内容。音频描述应传达主音轨未描述或说出的场景信息，并利用对话已有的停顿播报。（1.2.3 音频描述或媒体替代〔预录制〕，A 级；1.2.5 音频描述〔预录制〕，AA 级）

<a id="code-example-video-and-audio-content-with-captions-and-transcript"></a>
#### 代码示例：带字幕和文字稿的视频与音频内容

```html
<!-- Video with Captions tracks -->
<video controls>
  <source src="intro.mp4" type="video/mp4">
  <track src="caps.vtt" kind="captions" srclang="en" label="English">
</video>

<!-- Audio with expandable transcript details -->
<audio controls src="podcast.mp3" aria-details="podcast-transcript"></audio>
<details id="podcast-transcript">
  <summary>View Transcript</summary>
  <div class="transcript-content">
    Welcome to the show...
  </div>
</details>
```

<a id="css-generated-content"></a>
### CSS 生成内容

- **CSS 生成内容的替代文本：**使用 `content` 的替代文本参数，例如 `content: url(icon.svg) / "Save";`，并将有意义的文本保留在 DOM 中。详细说明见 `accessible-generated-content`，可通过 `npx -y modern-web-guidance@latest retrieve "accessible-generated-content"` 获取。（1.1.1 非文本内容，A 级）

<a id="content-visibility-decision-matrix"></a>
### 内容可见性决策表

| 意图 | 视觉可见 | 屏幕阅读器可访问 | 可聚焦 | 结构模式 |
| :--- | :--- | :--- | :--- | :--- |
| **对所有人可见** | 是 | 是 | 是 | 标准呈现 |
| **仅屏幕阅读器可访问** | 否 | 是 | 是，若为交互元素 | 视觉隐藏工具类，例如 `.visually-hidden` |
| **仅视觉可见** | 是 | 否 | 否 | `aria-hidden="true"` |
| **对所有人隐藏** | 否 | 否 | 否 | `hidden` 属性 / `display: none` |

**经验规则：**如果元素能够获得键盘焦点，就不得通过 `aria-hidden="true"` 隐藏。

**注意：**只在最后不得已时，才使用仅屏幕阅读器可访问的内容。如果内容重要，就应让所有人都能看到。

<a id="7-forms-and-input-controls"></a>
## 7. 表单与输入控件

<a id="labels-and-hints"></a>
### 标签与提示

- **强制要求：为所有表单控件提供标签：**不要依赖当前选中的输入项或值来标记控件。（3.3.2 标签或说明，A 级）
- **以程序方式关联标签：**使用 `<label for="id">` 关联 `<input id="id">`。（1.3.1 信息和关系，A 级）
- **不要将占位文本作为主要标签：**占位文本不是持久标签，只应用于提供简短提示，例如适当输入的示例。（3.3.2 标签或说明，A 级）
- **通过 `aria-describedby` 将提示与输入关联：**把帮助文本关联到输入框，并将提示放在输入框上方，避免编辑时被自动填充弹出层遮挡。（1.3.1 信息和关系，A 级）

<a id="code-example-a-labeled-form-control-with-a-hint-for-passwords"></a>
#### 代码示例：带标签和密码提示的表单控件

```html
<!-- Good: Semantic forms with hints for passwords -->
<form>
  <label for="pwd">Password:</label>
  <span id="pwd-hint">Must contain at least 8 characters.</span>
  <input id="pwd" type="password" aria-describedby="pwd-hint" autocomplete="current-password" required>
</form>
```

<a id="input-assistance-and-validation"></a>
### 输入辅助与验证

- **强制要求：使用 `autocomplete` 属性：**对明确收集用户个人信息的 `<input>`、`<textarea>` 和 `<select>` 设置 `autocomplete`，并使用正确值，例如 `"email"` 或 `"given-name"`。（1.3.5 识别输入目的，AA 级）
- **提供表单验证约束：**使用 `required` 表示必填输入；只有 `required` 不适用时，才使用 `aria-required="true"`。（4.1.2 名称、角色、值，A 级）
- **不要在焦点变化时触发上下文切换：**避免仅因焦点变化事件就自动提交表单或跳转页面。（3.2.1 获得焦点时，A 级；3.2.2 输入时，A 级）

<a id="8-live-regions"></a>
## 8. 实时区域

实时区域让辅助技术播报与导航或焦点变化无关的内容更新。它们很容易被误用：区域太多或过于嘈杂，很快就会成为屏幕阅读器用户的垃圾信息。

<a id="live-region-urgency-table"></a>
### 实时区域紧急程度表

| 紧急程度 | 对应视觉形式 | `aria-live` 值 | 行为影响 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| **关键** | 模态框 / 警报 | `assertive`，或 `role="alert"` | 立即打断并清空语音队列 | 会话超时、API 失败 |
| **常规** | 轻提示 / 横幅 | `polite` | 在下一次合适停顿时播报 | 搜索结果、“已保存”状态 |
| **被动** | 静默文本 | `off` | 仅在用户导航到它时播报 | 实时字符计数 |

**经验规则：**仅对需要立即注意、或妨碍安全继续操作的关键且有时效要求的更新使用 `assertive`，例如数据丢失、会话超时或网络断开。

<a id="when-to-announce-live-regions"></a>
### 何时播报实时区域

- **通过实时区域播报动态错误：**使用 `aria-live`，或将焦点移至错误列表。（4.1.3 状态消息，AA 级）
- **不要为过渡状态使用实时区域**，例如“正在加载……”或“正在更新……”，除非它们提供实质性信息；通常这些播报只会制造噪声。应改用 HTML `<progress>` 元素或 ARIA `progressbar` 角色。（最佳实践）

```html
<!-- Session Timeout Warning with controls -->
<div role="alert" class="timeout-warning">
  Your session will expire in 2 minutes.
  <button type="button" onclick="extendSession()">Extend Session</button>
</div>
```

<a id="managing-announcements"></a>
### 管理播报

- **集中管理不可见播报的实时区域：**每页使用一个 `polite` 区域和一个 `assertive` 区域，并按需配置 `aria-atomic`，可使播报保持一致、更易维护。许多框架提供自己的播报器抽象，应使用它。（最佳实践）
- **对频繁变化的区域防抖：**如果区域每秒可能更新多次，例如用户输入时组合框的结果数量，应防抖，避免向用户密集播报。（最佳实践）
- **可能与其他播报冲突时稍作延迟：**用户正在输入或焦点正在调整时，在播报前短暂延迟，避免实时区域更新与其他语音重叠。（最佳实践）
- **不要向惰性 DOM 添加实时区域更新：**对话框打开或某部分变为 `inert` 时，排队或防抖中的消息可能不再播报，或从用户无法访问的 DOM 中播报。应协调实时区域更新与对话框或 inert 状态变化。（4.1.3 状态消息，AA 级）

<a id="9-color"></a>
## 9. 颜色

关于可访问的颜色，包括对比度要求、浅色与深色配色方案、强制颜色模式等，参见 `color`，可通过 `npx -y modern-web-guidance@latest retrieve "color"` 获取。

<a id="10-typography"></a>
## 10. 字体排版

关于易读的字体排版，参见 `typography`，可通过 `npx -y modern-web-guidance@latest retrieve "typography"` 获取。

<a id="11-motion-and-preferences"></a>
## 11. 动效与偏好

参见 `motion`，可通过 `npx -y modern-web-guidance@latest retrieve "motion"` 获取。

<a id="12-modals-and-native-dialogs"></a>
## 12. 模态框与原生对话框

现代浏览器提供创建模态对话框的原生方案，无需自行实现焦点陷阱、管理外部内容的可访问性、保证内容位于顶层，以及将背景变暗。这些工作都容易出错，而且需要大量 JavaScript 事件追踪来维护。

<a id="native-dialog"></a>
### 原生 `<dialog>`

- **使用原生 `<dialog>` 元素：**通过 `.showModal()` 以模态状态打开对话框。处于模态状态时，浏览器会将外部内容设为惰性，即从无障碍树隐藏外部内容，并禁止与之交互或聚焦。（1.3.2 有意义的顺序，A 级；2.4.3 焦点顺序，A 级；4.1.2 名称、角色、值，A 级）
  - **注意：**使用 `<dialog>` 时，仍可导航到浏览器自身的界面。
- **不要为原生模态对话框实现焦点陷阱：**`<dialog>` 以模态状态打开时，浏览器会将外部内容设为惰性，这已经足以保证只有对话框内部内容可聚焦。（最佳实践）

<a id="code-example-html--javascript-native-dialog-with-standard-close-events"></a>
#### 代码示例：HTML 与 JavaScript——具有标准关闭事件的原生 `<dialog>`

```html
<!-- Dialog opens natively with showModal() and locks focus -->
<button id="open-btn">Open Dialog</button>

<dialog id="accessible-modal" aria-labelledby="title-id">
  <h2 id="title-id">Account Settings</h2>
  <p>Update your details here.</p>
  <button onclick="this.closest('dialog').close()">Close Dialog</button>
</dialog>

<script>
  document.getElementById('open-btn').addEventListener('click', () => {
    document.getElementById('accessible-modal').showModal();
  });
</script>
```

<a id="custom-overlays"></a>
### 自定义覆盖层

- **为自定义覆盖层使用 `inert` 属性：**当无法使用 `<dialog>` 时，例如某些非模态覆盖层、框架约束，或 `<dialog>` 的顶层和定位行为与设计冲突的布局，对外部内容设置 `inert`，确保键盘、指针和辅助技术无法与其交互。为此必须安排好元素结构，使自定义覆盖层不成为设置了 `inert` 的元素的后代。（1.3.2 有意义的顺序，A 级；2.4.3 焦点顺序，A 级）
- **为自定义覆盖层设置 `role="dialog"`：**将此角色应用于覆盖层容器，确保辅助技术将其识别为对话框。（4.1.2 名称、角色、值，A 级）
- **将焦点移到覆盖层：**确保键盘和屏幕阅读器焦点移到覆盖层容器，让屏幕阅读器用户和仅用键盘的用户能开始导航其内容。不要让焦点留在外部内容中。（1.3.2 有意义的顺序，A 级；2.4.3 焦点顺序，A 级）

<a id="13-testing-validations"></a>
## 13. 测试验证

<a id="automated-checks"></a>
### 自动化检查

- **通过 axe-core 或 Lighthouse 审计执行自动化检查：**捕获缺少替代文本或对比度不足等问题，例如使用 Chrome DevTools MCP 中的 Lighthouse。
- **不要仅依赖分数：**100% 的得分并不能保证实际可用性。

<a id="manual-testing"></a>
### 手动测试

- **仅用键盘验证顺序导航：**只使用键盘快捷键，例如 <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd>、方向键、<kbd>Enter</kbd>、<kbd>Space</kbd> 和 <kbd>Esc</kbd>，确认每个交互元素都可到达且可操作，并且焦点从不被困住。
- **使用标准浏览器组合测试屏幕阅读器：**采用常用配对，例如 JAWS 配 Chrome、NVDA 配 Firefox、Narrator 配 Edge、macOS 和 iOS 上的 VoiceOver 配 Safari，以及 Android 上的 TalkBack 配 Chrome。
