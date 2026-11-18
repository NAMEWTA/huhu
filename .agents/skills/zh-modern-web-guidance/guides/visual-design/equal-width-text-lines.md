<a id="equal-width-text-lines"></a>
# 等宽文字行

海报式文字组合会缩放每一行，使其横跨容器全宽，可形成视觉醒目的标题。
使用 `text-fit`，浏览器在布局时缩放各行，因此在尺寸变化、文案改变和字体加载时都能保持正确。

对于单行填满容器的情况，例如标题或摘引，直接对该元素应用 `text-fit`；本指南讨论多行文字组合。

<a id="basic-implementation"></a>
## 基础实现

注意：组合中的换行可以是**强制的**，即每行独立为一个块，也可以是**自由的**，即由浏览器换行。两者可连续混合：全部强制、全部自由，或两者结合。

对于强制行：
- 用设有 `display: block` 的 `<span>` 包裹每一行。
- 为每个强制行的 `<span>` 应用 `white-space: nowrap`。

实现准则：
- 对标题本身使用 `text-fit: grow per-line-all <percentage>`。
- 使用 `per-line-all`，而不是 `per-line`。`per-line` 会跳过最后一行以及以强制换行结尾的行，因此每行一个块时，任何行都不会被缩放。
- `grow` 不能与 `shrink` 结合。根据哪种方案回退更好或更易计算，将基础 `font-size` 设为最大值或最小值，并相应地将 `text-fit` 设为 `shrink` 或 `grow`。如果没有使用 `shrink` 的理由，优先使用 `grow` 并将 `font-size` 设为最小值，这对大多数情况更安全。
- 始终使用百分比限制放大或缩小幅度，例如 `300%`，作为保护边界。
- 容器需要明确的行内尺寸。`text-fit` 不会改变内在尺寸，因此对 `fit-content`/`max-content` 宽度或按内容定尺寸的 flex/grid 项不起作用。
- 修剪首行上方和末行下方的行距，参见 `precise-text-alignment`，可通过 `npx -y modern-web-guidance@latest retrieve "precise-text-alignment"` 获取。
- 保持较小的 `line-height`，使用 `1` 或更低，否则不同字号行之间的间隙难以控制。
- 重要：计算后的 `font-size` 不变，因此 `em` 间距不会随之缩放。
- 如果存在自由行，应用 `text-wrap: balance` 或 `text-wrap: pretty`，避免孤词被意外过度强调。

<a id="spacing"></a>
### 间距

如果全部行都是强制行，以下方式可更好控制间距：
- 对每个行块应用 `text-box: trim-both cap alphabetic`，让盒子贴合自身字形。它按缩放后的度量修剪。更多信息见 `precise-text-alignment`，可通过 `npx -y modern-web-guidance@latest retrieve "precise-text-alignment"` 获取。
- 在标题上使用 Flexbox 或 Grid 配合 `gap` 设置行间距，而不是 `line-height`。这样间隙保持一致，不会随每行字号增大。

如果有些行自由换行，不要使用 `text-box`：它只修剪首行和末行，导致外侧两行贴合字形，内部间隙却保留行距。让 `line-height` 管理全部间距。

<a id="visual-design"></a>
## 视觉设计

- 各行字号差异明显时，文字组合效果最好。避免对行长度大致均匀的文本创建这种组合，否则字号既不相同、差异又不够明显，违背设计中的*对比*原则。可以通过强制短行保证差异：将需要强调的词包裹成块，让其余内容自由换行，即形成混合式组合。与 `text-wrap: balance` 配合时，这尤其重要。
- 用于西方文字时，优先配合 `text-transform: uppercase`，因为升部和降部容易形成局促空隙或与相邻行重叠，降低美观度。
- 强制短行时，选择强调后能增强信息表达的词。
- **限制：**放大的文字在视觉上也会更重，笔画显得更强。目前无法抵消这一点，例如无法为较大文字降低 `font-weight`，因为没有可用于计算的单位，缩放也不影响 `em` 等字体相对单位。

<a id="fallback-strategies"></a>
## 回退策略

<a id="for-text-box"></a>
### `text-box` 的回退

text-box 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Safari 18.2（2024 年 12 月）。
不支持的浏览器：Firefox。

`text-box` 无需独立回退：固定组合也保留较小的 `line-height`。它在 `text-box` 生效时不起额外作用，不支持时则能保持紧凑间距，代价是间隙会随各行字号缩放。

<a id="for-text-wrap-balance"></a>
### `text-wrap: balance` 的回退

text-wrap: balance 的 Baseline 状态：新近可用。自 2024-05-13 起纳入 Baseline。
支持的浏览器：Chrome 114（2023 年 5 月）、Edge 114（2023 年 6 月）、Firefox 121（2023 年 12 月）和 Safari 17.5（2024 年 5 月）。

<a id="for-text-fit"></a>
### `text-fit` 的回退

text-fit 的浏览器支持情况：支持有限。
支持的浏览器：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

强制行有简短且忠实的回退：按基础尺寸测量每行，再根据其与容器的比例缩放，并采用相同上限。

```css
@supports not (text-fit: grow) {
  .lockup > span {
    /* Shrink-wrap each line so its width is the text width */
    width: fit-content;
    /* --text-fit-scale is measured by the script; the cap mirrors the text-fit percentage */
    font-size: min(var(--text-fit-scale, 1) * 1em, 300%);
  }
}
```


```js
if (!CSS.supports('text-fit', 'grow per-line-all')) {
  const fit = lockup => {
    const lines = [...lockup.querySelectorAll(':scope > span')];
    // Unscale first: on a refit, offsetWidth would otherwise include the previous scale
    for (const line of lines) line.style.removeProperty('--text-fit-scale');
    // MANDATORY: all reads, then all writes. Interleaving them (e.g. reading
    // lockup.clientWidth inside the write loop) forces one reflow per line.
    const scales = lines.map(line => lockup.clientWidth / line.offsetWidth);
    lines.forEach((line, i) => line.style.setProperty('--text-fit-scale', scales[i]));
  };
  // Refit on resize and font load
  for (const lockup of document.querySelectorAll('.lockup')) {
    new ResizeObserver(() => fit(lockup)).observe(lockup);
  }
}
```


自由行没有忠实的回退，因为只有布局完成后才知道断行位置。应渐进降级为均衡标题，并采用 `clamp(2rem, 1rem + 5cqi, 5rem)` 这样的流式基础字号。混合式组合中，上述脚本仍可适配强制行；可换行块的测量宽度等于容器，因此保持缩放比例 1，只获得流式基础字号。

如果文字适配至关重要，可以考虑使用 `fitty` 等 JS 库，仅在不支持 `text-fit` 时按条件加载。
