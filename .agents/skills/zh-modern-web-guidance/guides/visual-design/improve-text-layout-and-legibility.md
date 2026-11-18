<a id="improve-text-layout-and-legibility"></a>
# 改善文字布局与辨识度

文字布局，尤其是行尾和段落末尾的布局，会影响页面的辨识度和美观。CSS 提供多种换行选项，可改善特定场景。

对标题等短文字块，使用 `text-wrap: balance`。它指示浏览器尽可能均匀地将文字分配到各行，形成更对称的外观。

CSS 属性 `text-wrap: pretty` 启用更复杂的换行算法，可提高正文排版质量。它专门用于避免孤词，即段落最后一行只剩一个单词，并让长文字块的参差边缘更美观。

<a id="implementation"></a>
## 实现

<a id="1-identify-text-elements-"></a>
### 1. **识别文字元素**：

使用 `text-wrap: balance` 时，选择标题和表格表头等短文字块。避免选择带边框、背景等可见盒子的元素，因为这可能在布局中造成意外的视觉空白区域。

使用 `text-wrap: pretty` 时，选择可能包含较长连续文字，且孤词或不佳断行最明显的元素，包括：
  - `<p>`
  - `<blockquote>`
  - `<li>`
  - 其他可能包含较长连续文字的元素。

<a id="choosing-the-right-wrapping-method"></a>
#### 选择正确的换行方法

| 比较项 | `text-wrap: balance` | `text-wrap: pretty` | `text-wrap: wrap`（默认） |
| :--- | :--- | :--- | :--- |
| **最适合** | 短区块，如标题 | 长区块，如段落、列表 | 性能关键内容 |
| **视觉目标** | 各行长度对称 | 避免末行孤词 | 快速、标准换行 |
| **行数约束** | 最多 6–10 行，受算法限制 | 最适合 3 行及以上 | 无限制 |
| **性能成本** | **高**：二分搜索算法 | **中**：回看算法 | **低**：标准贪心算法 |

<a id="2-apply-the-chosen-wrapping-"></a>
### 2. **应用所选换行方式**：

将 `text-wrap: balance` 专门应用于短的多行元素，例如标题（`h1`-`h6`）、副标题或摘引。

```css
/* Target specific heading elements for balanced wrapping */
h1, h2, h3, h4, h5, h6 {
  /* Enables balanced line-breaking logic */
  text-wrap: balance;
}
```


使用 `text-wrap: pretty` 启用优化算法，它评估段落最后几行，以找到最佳断行点。

```css
/* Apply to multi-line text blocks to prevent orphaned words */
p, blockquote, li, .pretty-text {
  /* Enables pretty line-breaking logic for body copy */
  text-wrap: pretty;
}
```


<a id="critical-constraints-and-performance"></a>
### 关键约束与性能

<a id="text-wrap-balance"></a>
#### text-wrap: balance

* **行数限制：**为保持性能，浏览器会限制尝试均衡的行数，Chromium 通常为 **6 行**，Firefox 为 **10 行**。如果文字超出限制，浏览器回退到标准 `wrap` 行为。避免对可能超过这些限制的文字块使用 `text-wrap: balance`。
* **定向应用：**不要全局应用 `text-wrap: balance`，例如 `* { text-wrap: balance; }`。浏览器使用的迭代二分搜索算法计算成本高，应将其限制在具体的短文字元素上。
* **与宽度的关系：**`text-wrap: balance` 不改变容器宽度（`inline-size`），只影响文字在该宽度*内部*的换行方式。这可能在容器末尾留下空白，影响依赖满宽文字块的布局。

<a id="text-wrap-pretty"></a>
#### text-wrap: pretty

* **性能与质量**：强制要求：认识到 `text-wrap: pretty` 比默认的 `wrap` 贪心算法计算成本更高，因为它会评估多行，通常是最后四行，以优化断行点。如果页面文字内容极多，避免将它全局应用到每个元素。
* **最适合多行文字**：`pretty` 的好处在三行及以上段落中最明显，对较短的单行文字几乎没有效果。
* **浏览器特有行为**：注意实现细节各不相同。基于 Chromium 的浏览器通常关注最后四行，其他引擎可能评估整个段落。

<a id="fallback-strategies"></a>
### 回退策略

text-wrap: balance 的 Baseline 状态：新近可用。自 2024-05-13 起纳入 Baseline。
支持的浏览器：Chrome 114（2023 年 5 月）、Edge 114（2023 年 6 月）、Firefox 121（2023 年 12 月）和 Safari 17.5（2024 年 5 月）。

text-wrap: pretty 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 117（2023 年 9 月）、Edge 117（2023 年 9 月）和 Safari 26（2025 年 9 月）。
不支持的浏览器：Firefox。

在不支持 `text-wrap: balance` 或 `text-wrap: pretty` 的浏览器中，属性会被忽略，文字使用默认 `wrap` 行为换行。这是一种可平稳降级到标准排版的渐进增强，确保所有浏览器中的内容都完全可读，同时为支持的浏览器提供更好体验。

如果关键布局必须采用精细文字排版，可使用 JavaScript 库，但要注意它可能较慢，并导致性能问题。
