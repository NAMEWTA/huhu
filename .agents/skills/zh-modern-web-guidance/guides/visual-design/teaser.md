<a id="teaser"></a>

# 内容预览

<a id="overview"></a>

## 概述

要淡出容器内容的末尾（例如付费墙文本的预览），应使用带线性渐变的 CSS Masking，不要使用半透明覆盖层，因为后者会限制背景设计和交互。

- 此方法适用于在来源处已经截断的内容，而非仅通过 CSS 在视觉上截断。如果要提示滚动容器还有更多内容可滚动，请改看 `scrollability-affordance-hints`（通过 `npx -y modern-web-guidance@latest retrieve "scrollability-affordance-hints"` 获取）。只有几行纯文本且仅需省略号时，使用 `line-clamp`。
- 此方法用于块级内容。单行溢出的处理见 `single-line-overflow`（通过 `npx -y modern-web-guidance@latest retrieve "single-line-overflow"` 获取）。

<a id="choosing-a-treatment"></a>

## 选择呈现方式

- 内容在其他地方继续时，使用**淡出**。
- 付费墙内容在淡出上叠加**模糊**，让读者看到还有文字，却不能读出其内容。

遮罩或模糊只改变内容的绘制方式。内容仍存在于 DOM、无障碍树、页面查找及复制粘贴中。

- 不要在淡出部分保留链接或控件：它们依然可以获得焦点，却无法看清。
- 将操作入口（例如订阅按钮）放在被遮罩元素之后，而非内部，避免它也被淡出。

<a id="fading-the-end-of-the-teaser"></a>

## 淡出预览内容的末尾

```css
.teaser {
  /* 用行高确定淡出范围（3lh 是示例值），不要用百分比：
     百分比会随内容增长，导致长摘录的大部分内容被淡出。 */
  mask-image: linear-gradient(to top, transparent, black 3lh);
}
```

- 如果由 CSS 而非标记截断摘录，用 `max-block-size` 与 `overflow: clip` 限制，避免预览变成滚动容器。遮罩保持相同。
- 对垂直书写模式，让渐变朝向块方向（`vertical-rl` 用 `to left`，`vertical-lr` 用 `to right`）。不要重复整段渐变，改用 CSS 变量指定方向。

<a id="optional-blur-the-end-of-the-faded-text"></a>

## 可选：模糊淡出文本的末尾

用覆盖在预览末尾的伪元素绘制模糊。伪元素上的遮罩让模糊逐渐增强，避免起点出现明显分界线。

必须：将伪元素放在淡出元素的父元素上，而非淡出元素自身。被遮罩元素内部的 `backdrop-filter` 不会模糊该元素的文字。

```html
<div class="teaser-blur">
  <div class="teaser">…</div>
</div>
```

```css
.teaser-blur {
  position: relative;
}

/* 先开始淡出，再开始模糊，见下方说明。 */
.teaser-blur .teaser {
  mask-image: linear-gradient(to top, transparent, black 9lh);
}

.teaser-blur::after {
  /* 示例值：文字也会淡出，因此很小的半径就足够。 */
  --blur: 0.1em;
  /* 伪元素超出文字范围的距离。 */
  --bleed: calc(2 * var(--blur));
  content: "";
  position: absolute;
  inset-inline: calc(-1 * var(--bleed));
  inset-block-end: calc(-1 * var(--bleed));
  /* 示例值：模糊覆盖的文字范围，应短于淡出范围。 */
  block-size: calc(5lh + var(--bleed));
  backdrop-filter: blur(var(--blur));
  /* 从文字末尾逐渐引入模糊。 */
  mask-image: linear-gradient(to top, black 5lh, transparent);
}
```

- 必须：让伪元素在行内两侧及末尾超出文字范围。`backdrop-filter` 只在自身元素内部绘制，没有这段延伸时，模糊文字会在文本边缘被直线截断。
- 延伸范围至少与模糊半径一样大。模糊扩散范围超过其半径，因此示例使用半径的两倍。

保留 `.teaser` 上的淡出，让模糊文字融入背景，而非以生硬边缘结束。

- 必须：在模糊之前开始淡出文字，使淡出范围长于模糊范围（示例淡出 9lh，模糊 5lh）。
  - 相同不透明度下，模糊文字比清晰文字显得更重。如果两者同时开始，文字会在模糊起点变得更突出，然后才淡出。
  - 模糊只能作用于已经淡出的文字，因此淡出范围也不能长到让被模糊部分近乎透明。
- 保持较小的模糊半径。遮罩在清晰文字和模糊文字之间交叉淡化，半径过大会让清晰文字的重影透过模糊显现。
- 若希望模糊半径本身朝文字末尾逐渐增大，而非交叉淡化，在预览末尾叠放 4–6 个覆盖元素。
  - 每层使用比前一层更大的 `backdrop-filter: blur()` 半径，例如 `1px`、`2px`、`4px`、`8px`。
  - 每层设置与相邻层重叠的 `mask-image` 带状区域，使各级平滑混合。
  - 每一级都会增加一个元素和一次合成处理。不要为了避免额外元素而改用 SVG 滤镜（`backdrop-filter: url(…)`）。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-masks"></a>

### 遮罩的回退方案和浏览器支持

Masks 的 Baseline 状态：广泛可用。自 2023-12-07 起纳入 Baseline。
支持版本：Chrome 120（2023 年 12 月）、Edge 120（2023 年 12 月）、Firefox 53（2017 年 4 月）和 Safari 15.4（2022 年 3 月）。

无需回退。不要添加 `-webkit-mask-image` 声明。

<a id="fallbacks--browser-support-for-the-lh-unit"></a>

### `lh` 单位的回退方案和浏览器支持

lh unit 的 Baseline 状态：广泛可用。自 2023-11-21 起纳入 Baseline。
支持版本：Chrome 109（2023 年 1 月）、Edge 109（2023 年 1 月）、Firefox 120（2023 年 11 月）和 Safari 16.4（2023 年 3 月）。

无需回退。

<a id="fallbacks--browser-support-for-backdrop-filter"></a>

### `backdrop-filter` 的回退方案和浏览器支持

backdrop-filter 的 Baseline 状态：新近可用。自 2024-09-16 起纳入 Baseline。
支持版本：Chrome 76（2019 年 7 月）、Edge 79（2020 年 1 月）、Firefox 103（2022 年 7 月）和 Safari 18（2024 年 9 月）。

模糊属于渐进增强：没有 `backdrop-filter` 时，文字不会模糊，但仍会淡出。无需回退。

Safari 和 Firefox 的 `backdrop-filter` 不会应用 SVG 滤镜引用（`url(…)`），因此基于 SVG 的模糊在那里完全不会产生模糊效果。
