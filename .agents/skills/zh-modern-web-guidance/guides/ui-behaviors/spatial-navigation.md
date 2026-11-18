<a id="spatial-navigation-directional-keypad-focus"></a>

# 空间导航（方向键焦点）

方向焦点导航（箭头键或方向手柄）让仅键盘和替代输入用户按可见二维布局浏览交互项，适合媒体轨道、仪表板面板、嵌套目录等空间界面。但必须谨慎实现，避免破坏视口滚动等原生行为。

本指南介绍复合控件内高性能、无障碍的二维方向导航。

---

<a id="core-architectural-principles"></a>

### 核心架构原则

实现自定义方向键空间焦点时，遵循：

1. **仅限复合控件：** 不要在普通文档文本流或预期顺序 Tab 导航的简单垂直列表覆盖方向键。只有存在匹配交互的合适复合角色时才用。一般文档流参见 `accessibility`（通过 `npx -y modern-web-guidance@latest retrieve "accessibility"` 获取）。
2. **保留边界原生滚动：** 按键方向没有可聚焦项时，**不要阻止默认行为**。让事件冒泡，浏览器原生滚动视口。无条件覆盖方向键破坏无障碍（WCAG 1.4.10）。
3. **确保焦点可见并对齐：** 变化后将新焦点滚入视野，例如 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`，保持完整可见。
4. **配合布局系统：** 每次按键处理中用实时 `getBoundingClientRect()` 确定候选位置。不要假定 DOM 顺序或固定网格代表视觉布局。现代布局参见 `css-layout`（通过 `npx -y modern-web-guidance@latest retrieve "css-layout"` 获取）。

---

<a id="accessible-focus-management"></a>

### 无障碍焦点管理

空间容器在页面顺序 Tab 导航中只暴露一个停靠点。内部使用 **Roving Tabindex 模式**：
* 活动项 `tabindex="0"`。
* 非活动项 `tabindex="-1"`。
* 导航时移动 `tabindex="0"` 并调用 `focus()`。

只有容器与项目具备适当复合角色和状态（grid/gridcell、listbox/option 等），该模式才适用于屏幕阅读器，仅有 tabindex 不够。

- 浏览多行交互元素时用 `grid` 语义。
- 多个交互控件选择后更新相关内容时用 `tablist`。
- 建议列表选择后填入关联输入时用 `combobox`。
- 可选择一项或多项的列表用 `listbox`。
- 有明确层级的交互项目集合用 `tree`。
- 类网格、可展开且有明确层级时用 `treegrid`。

---

<a id="visual-candidate-selection"></a>

### 选择视觉候选

非对称、换行或网格布局中，索引映射会失效。应针对当前按键从实时几何推导：

* **候选：** 容器内通过 `checkVisibility()` 的可聚焦后代。隐藏元素可能在 `(0, 0)` 具有零尺寸矩形，不得意外成为 `up`（上方）或 `left`（左方）方向的目标。
* **几何：** 按键处理中读取当前元素和所有候选的 `getBoundingClientRect()`。不要全局缓存，布局可能因各种原因变化，用户节奏的按键中少量几何读取成本低。
* **方向过滤：** 候选近边位于当前元素该轴远边或之外，才算该方向，允许少量亚像素舍入容差。例如 `right` 方向的候选需满足 `candidate.left >= current.right - tolerance`。不要用中心点判断方向。
* **优先对齐候选：** 通过方向过滤后，优先选择在与导航轴垂直的轴上，其范围与当前元素重叠的候选。选择导航轴上间隙最小者；若相同，再选垂直于导航轴方向上的中心偏移最小者。即使某项很宽，也能保持在相邻视觉行列。
* **回退评分：** 在与导航轴垂直的轴上没有重叠候选时，以 `gap + w * perpendicularCentreOffset` 评分取最小。`w >= 2` 可作起点，再按布局调整；权重大则更偏好对齐。
* **没有候选：** 返回空。处理器不得 `preventDefault()`，允许原生滚动。

实现可变化，但方向测试必须基于边缘，先重叠优先，再加权回退。这是算法核心，不要把缓存或固定权重说成普遍正确。

---

<a id="keypress-integration--scroll-cooperation"></a>

### 按键整合与滚动协作

事件路由**仅在**有效空间焦点转换发生时阻止视口滚动：

* 按住修饰键、`e.defaultPrevented` 已 true，或最内层目标自身使用方向键时，不拦截。用 `e.composedPath()[0]` 而非仅 `e.target`，`e.target` 可能被重定向到影子宿主（shadow host）。实用检查为 `target.matches(':read-write, select, input[type="range"], [role="slider"]')`；无法检查封闭 shadow root。
* 监听限定在控件容器，允许多个空间控件共存。
* 仅当当前聚焦元素本身是候选时处理。项目含自身可聚焦控件时，要么也作为候选，要么不干预；不要用 `closest()` 找父级替代。
* 找到候选时，`preventDefault()`，更新 roving `tabindex`，`focus()`，并 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`。
* 无候选则直接返回，不调用 `preventDefault()`，让原生滚动继续。

---

避免添加 `h`/`j`/`k`/`l` 或 `W`/`A`/`S`/`D` 等单字符快捷键。方向键不是字符键；无候选时保留滚动，也避免无谓阻断视口移动。
