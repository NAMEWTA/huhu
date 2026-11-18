<a id="precise-text-alignment"></a>
# 精确对齐文字

<a id="the-problem"></a>
## 问题

浏览器会在文字字符上下自动加入额外空白，以容纳行高及字体特有度量，例如升部和降部。这种“幽灵空白”使标准 CSS 无法实现像素级精确的垂直对齐。

常见问题包括：
- **图标错位**：即使使用 `align-items: center`，文字看起来仍比旁边图标更高或更低。
- **内边距不准确**：设置了 `padding: 12px` 的按钮，由于字体内部行距，上方或下方看起来留白更多。
- **边缘齐平**：如果不用“魔法数字”负外边距，就无法将大写字母顶部与容器或相邻图片顶部精确对齐。

<a id="the-solution"></a>
## 解决方案

`text-box-trim` 和 `text-box-edge` 属性，简写为 `text-box`，允许基于特定字体度量修剪内部行距。将文字盒裁切到**大写字母高度**，即大写字母顶部，以及**字母基线**，即大多数字母底部，可确保元素边界框匹配其视觉内容。

<a id="implementation-strategy"></a>
### 实施策略

1. **强制要求**：为包含文字的元素应用 `text-box-trim: trim-both`，或 `text-box` 简写。
2. **强制要求**：通过 `text-box-edge` 指定修剪使用的度量。大多数界面对齐使用 `cap alphabetic`。
3. **应当**用它在 flex 或 grid 容器中实现视觉垂直居中。
4. **应当**用它确保 CSS `padding` 值与文字到容器边缘的视觉间隙一致。
5. **不要**将它用于需要传统行间距保证可读性的长篇正文。它最适合标题、按钮和界面标签。

<a id="implementation-guide"></a>
## 实现指南

<a id="use-case-1-trim-internal-leading-for-badges"></a>
### 场景 1：修剪徽章的内部行距

不同字体在文字上下具有不同的内置间距，这使匹配设计或让徽章文字视觉居中变得困难。要让容器内边距紧贴文字，使用 `text-box: trim-both cap alphabetic`，尤其适合徽章、标签等紧凑界面组件。它使各侧内边距都从文字边缘开始计算。

```css
.badge {
  padding: 10px;
  background: hotpink;
  border-radius: 10px;
  /* 
    Trims the top to the cap-height and 
    the bottom to the alphabetic baseline.
  */
  text-box: trim-both cap alphabetic;
}
```


<a id="use-case-2-center-text-with-icons"></a>
### 场景 2：让文字与图标居中对齐

用 Flexbox 对齐文字和图标时，“幽灵空白”常使文字看起来略偏离中心。修剪文字盒可确保布局引擎按实际可见字母高度对齐。

```css
.button {
  display: inline-flex;
  align-items: center;
  gap: 8px; 
}
/* 
  text-box does NOT inherit, and must be applied directly to the text element.
*/
.button-text{
  /* 
    The flex container now centers against the 
    visible letters, not the invisible font box.
  */
  text-box: trim-both cap alphabetic;
}
```


<a id="use-case-3-align-text-flush-with-top-edges"></a>
### 场景 3：让文字与顶部边缘齐平

要让标题与相邻图片或装饰元素顶部完美对齐，使用 `trim-start cap alphabetic`。即使不修剪结束边缘，也必须定义结束边缘。

```css
.hero {
  display: flex;
  align-items: flex-start;
}

h1 {
  /* MANDATORY: The bottom edge must also be defined, even though only the top is trimmed. */
  text-box: trim-start cap alphabetic;
}
```


<a id="best-practices"></a>
## 最佳实践

- **应当**使用 `text-box` 简写保持简洁：`text-box: <trim-direction> <edges>`。
- **应当**始终指定两侧边缘，即使只修剪一侧；使用默认 `text` 边缘时除外。
- **应当**结合 `line-height` 控制间距。修剪移除文字首行与末行外围的行距，但 `line-height` 仍影响多行文字之间的距离。
- **不要**应用到所有元素。只在需要精确对齐的地方使用。

<a id="fallback-strategies"></a>
### 回退策略

text-box 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Safari 18.2（2024 年 12 月）。
不支持的浏览器：Firefox。

`text-box` 是渐进增强。在不支持的浏览器中，文字按默认行距渲染，布局仍然可用，只是略欠精确。无需特殊回退代码，因为旧浏览器会安全地忽略这些属性。

<a id="other-considerations"></a>
## 其他考虑

1. **字体度量**：不同字体有不同内部度量。`cap alphabetic` 是可靠的默认值，但某些字体或场景可能需要 `ex`，即 x-height，才能更好地对齐小写字母。
2. **多行文字**：修剪作用于区块首行和末行，内部各行不受影响。
