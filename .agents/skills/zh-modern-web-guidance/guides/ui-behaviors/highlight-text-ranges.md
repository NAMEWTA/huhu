<a id="highlight-text-ranges"></a>

# 高亮文本范围

CSS Custom Highlight API 可在不修改 DOM 结构的情况下，为任意文本范围设置样式，实现搜索结果高亮、语法着色、协作编辑光标或拼写语法错误标记，无需额外元素包裹或 `innerHTML` 操作。

<a id="core-implementation"></a>

## 核心实现

收集目标文本节点，创建 `Range` 和 `Highlight`，注册到 `HighlightRegistry`，再用 `::highlight()` 设置样式。

<a id="1-collect-text-nodes-and-create-ranges"></a>

### 1. 收集文本节点并创建范围

用 `TreeWalker` 收集目标元素内所有文本节点，再创建指向所需字符偏移的 `Range`。

```javascript
const article = document.querySelector("article");

// MANDATORY: Use TreeWalker to collect text nodes — do not manipulate innerHTML.
const treeWalker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
const allTextNodes = [];
let currentNode = treeWalker.nextNode();
while (currentNode) {
  allTextNodes.push(currentNode);
  currentNode = treeWalker.nextNode();
}

// MANDATORY: Set range start/end on text nodes, not element nodes.
const range = new Range();
range.setStart(textNode, matchStartIndex);
range.setEnd(textNode, matchEndIndex);
```

缓存文本节点列表，仅在 DOM 内容实际改变时重建，因为遍历树开销较大。

<a id="2-create-a-highlight-from-the-ranges"></a>

### 2. 从范围创建 Highlight

将一个或多个 `Range` 分组为 `Highlight`。共享样式的多个范围应属于同一个高亮。

```javascript
const searchHighlight = new Highlight(...matchingRanges);
```

<a id="3-register-the-highlight-in-the-registry"></a>

### 3. 在注册表中注册高亮

用类似 `Map` 的 `CSS.highlights`（`HighlightRegistry`）为每个 `Highlight` 注册自定义名称。

```javascript
// MANDATORY: Clear previous highlights before registering new ones
// to avoid stale ranges persisting on the page.
CSS.highlights.clear();

CSS.highlights.set("search-results", searchHighlight);
```

多个高亮重叠时，通过 `priority` 控制层叠，优先级高的绘制在上方。

```javascript
const primary = new Highlight(...primaryRanges);
primary.priority = 1;

const secondary = new Highlight(...secondaryRanges);
secondary.priority = 0; // painted first (behind primary)

CSS.highlights.set("primary", primary);
CSS.highlights.set("secondary", secondary);
```

<a id="4-style-with-highlight"></a>

### 4. 使用 `::highlight()` 设置样式

CSS 中按名称用 `::highlight()` 伪元素设置已注册高亮的样式。

```css
::highlight(search-results) {
  background-color: #0000FF;
  color: white;
}
```

只有有限的 CSS 属性可在 `::highlight()` 中使用：`color`、`background-color`、`text-decoration` 及其长写、`text-shadow`、`-webkit-text-stroke-color`、`-webkit-text-fill-color`、`-webkit-text-stroke-width`。`background-image`、`font-size`、`padding` 等会被忽略。

<a id="accessibility"></a>

## 无障碍

**避免：** 用自定义高亮替代语义 HTML。

自定义高亮纯属呈现，不暴露到无障碍树。如果高亮文本具有文档语义相关性（例如用户选中的段落），或高亮传达含义（例如 HTML 教程中标示标题元素或 ARIA 属性来展示用法），改用 `<mark>`。自定义高亮留给搜索结果等短暂纯视觉效果，或含义可由邻近标记推断的语法着色（例如高亮文字前的“+”表示新增语法）。

确保高亮背景与文字对比足够，满足 WCAG 2.2 1.4.3 对比度（最低，AA 级）。字号小于 18 磅的常规文字或小于 14 磅的粗体文字，对比度至少为 4.5:1；大于 18 磅的常规文字或大于 14 磅的粗体文字，至少为 3:1。

确保高亮背景与相邻颜色至少 3:1，以满足 WCAG 2.2 1.4.11 非文本内容（AA 级）。
如果文字还有其他视觉指示，例如 `text-decoration: underline;` 或细微 `text-shadow`，进一步表明高亮，可低于 3:1。

高亮不得只靠颜色传达意义。例如错误高亮应配合 `text-decoration: wavy underline`、相邻文字标签或图标。

<a id="fallback-strategies"></a>

## 回退策略

Custom highlights 的 Baseline 状态：新近可用。自 2026-03-24 起纳入 Baseline。
支持版本：Chrome 105（2022 年 9 月）、Edge 105（2022 年 9 月）、Firefox 149（2026 年 3 月）和 Safari 17.2（2023 年 12 月）。

不支持 CSS Custom Highlight API 时，应提供功能完整的基础体验，即使没有视觉高亮文字仍清晰可读。

使用 API 前可检测支持：

```javascript
if (CSS.highlights) {
  // CSS Custom Highlight API is supported.
} else {
  // Fallback: wrap matches in <mark> elements.
}
```

高亮对体验至关重要时，回退为用 `<mark>` 包裹匹配文本。这会修改 DOM，应保留事件监听器并避免破坏文档结构。

```javascript
if (!CSS.highlights) {
  // Walk text nodes and wrap matches in <mark>, preserving structure.
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

  const term = searchTerm.toLowerCase();
  for (const textNode of nodes) {
    const text = textNode.textContent;
    let pos = text.toLowerCase().indexOf(term);
    if (pos === -1) continue;

    const frag = document.createDocumentFragment();
    let last = 0;
    while (pos !== -1) {
      frag.append(text.slice(last, pos));
      const mark = document.createElement("mark");
      // textContent assignment avoids HTML injection.
      mark.textContent = text.slice(pos, pos + term.length);
      frag.append(mark);
      last = pos + term.length;
      pos = text.toLowerCase().indexOf(term, last);
    }
    frag.append(text.slice(last));
    textNode.replaceWith(frag);
  }
}
```
