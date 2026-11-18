<a id="build-a-styled-progress-bar"></a>

# 构建带样式的进度条

`<progress>` 是表示任务完成进度的语义元素，例如下载或上传信息、完成多步骤流程中的一部分。原生元素有助于无障碍，屏幕阅读器可获得隐式 `role="progressbar"` 并播报数值。

本指南实现可全面定制样式的水平进度条。

<a id="progress-bar-or-progress-ring"></a>

## 进度条还是进度环？

- 空间受限或更适合正方形宽高比时，考虑圆形进度条（进度环）：`progress-ring`（通过 `npx -y modern-web-guidance@latest retrieve "progress-ring"` 获取）。
- 多数不确定进度场景优先用加载旋转指示器（`spinner`，通过 `npx -y modern-web-guidance@latest retrieve "spinner"` 获取）。只有不确定状态短暂、很快会切换为确定进度条时才用不确定进度条，例如等待上传元数据后才能显示百分比。

<a id="markup"></a>

## 标记

1. **使用原生 `<progress>`：** 提供内建无障碍和与平台一致的行为。
2. 需要不同于默认 0–1 的范围时设置 `max`。
3. 确定进度设置 `value`；不确定状态（例如具体反馈开始前）省略 `value`。
4. 使用 `<label for="...">`、`aria-labelledby` 或 `aria-label` 将进度元素与标签关联。

<a id="what-type-of-customization-is-needed"></a>

## 需要哪种程度的定制？

有限样式定制可使用以下属性：
- `accent-color` 改变进度条颜色。
- `width` / `inline-size` 改变宽度。
- `height`/`block-size` 行为不一致，先测试。
- `writing-mode: vertical-lr` 用于垂直进度条。
- 绘制后应用的效果：`opacity`、`filter`、`clip-path`、遮罩、变换、`box-shadow` 等。

若有限定制已足够，跳过下一节。

警告：某些属性（例如 `border-radius`、`background`、`border`）会悄然禁用默认进度条样式。如果需要超出上述范围的样式，必须按下一节实现完全自定义。不要抱着“也许能工作”的想法随意添加更多样式。

<a id="fully-custom-styling"></a>

## 完全自定义样式

<a id="1-basic-setup"></a>

### 1. 基础设置

- 必须使用 `appearance: none` 启用自定义样式。
- 用 `border: 0 solid` 重置用户代理边框。
- 要将活动条裁剪到元素的圆角，使用 `overflow: clip`，或给活动条应用相同 `border-radius`。不要在条上用 `border-radius: inherit`，它依赖 Shadow DOM 的具体元素结构。

```css
progress {
  /* Reset default browser styles */
  appearance: none;
  border: 0 solid;
  /* Clip bar to element’s border-radius  */
  overflow: clip;
}
```

<a id="2-styling"></a>

### 2. 样式

- 在 `progress` 元素本身设置轨道样式。
- 用适合各浏览器的伪元素选中填充条：WebKit/Blink 用 `::-webkit-progress-value`，Firefox 用 `::-moz-progress-bar`。
- 必须：不要把 `-webkit-` 和 `-moz-` 伪元素放在同一规则中，整条规则会被判定无效并忽略。`:is()` 和 `:where()` 也无效，因为它们不支持伪元素。
- 每个浏览器专属伪元素应恰好出现一次。特定状态的定制（例如不确定片段的尺寸和动画）应通过 `progress` 元素自身的自定义属性传递。
- 可选：对填充的 `inline-size` 添加过渡，让确定值变化时动画而非跳变。Firefox 在布局中确定填充尺寸，会忽略此过渡，但无害。

```css
progress {
  --progress-bar-radius: 1e5px;
  border-radius: var(--progress-bar-radius);
  /* Apply color for custom progress track (background) */
  background: var(--progress-bar-track, var(--color-neutral-90));
  /* Subtle depth on the empty part of the track */
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.1);
}

/* Let <progress> styling show through */
progress::-webkit-progress-bar {
  background: transparent;
}

/* Webkit, Chrome */
progress::-webkit-progress-value {
  background: var(--progress-bar-fill, var(--accent-color));
  border-radius: var(--progress-bar-radius);
  transition: inline-size 0.3s;
}

/* Firefox */
progress::-moz-progress-bar {
  background: var(--progress-bar-fill, var(--accent-color));
  border-radius: var(--progress-bar-radius);
  transition: inline-size 0.3s;
}
```

<a id="3-indeterminate-state-styling"></a>

### 3. 不确定状态样式

**为不确定状态添加自定义动画：** 将填充伪元素变成短片段，沿轨道滑动。
- 为填充本身设置样式，不要在 `progress` 上用背景重新绘制。
- 不确定填充只通过动画存在：关键帧用真实 `inline-size` 设置长度（覆盖 Chromium 用户代理的行内 `inline-size`），并用 `translate` 移动。不要用 `scale` 改长度，它会扭曲填充上的图案。
- `translate` 百分比相对填充自身宽度解析，因此应以轨道单位表示位置：将 `progress` 设为 inline-size 容器，在关键帧中使用 `cqi`。在 `from, to` 中加入 `margin-right: auto`，使 Chromium 在 RTL 下也把填充布局到物理左侧。
- 用变换移动填充，不用外边距。
  - 变换让动画保留在合成器中，除非同时对 `inline-size` 动画。
  - 外边距在 RTL 下有两个不同问题：
    - Firefox 仅用物理左外边距定位不确定填充，所以 RTL 下 `margin-inline-start` 无效，填充不会移动。
    - Chromium 和 WebKit 将填充作为普通块布局；一旦外边距将填充推过轨道末端，外边距之和超过轨道，标准 CSS 会在 RTL 下忽略 `margin-left`，使片段跳到边缘而非滑出。
  - `translate` 在布局后应用，两种问题都不存在。
- 要在 RTL 下镜像运动（如 Chrome 原生条），在 `:dir(rtl)` 下反转动画：

```css
progress:dir(rtl) {
  --progress-bar-indeterminate-animation: progress-bar-indeterminate var(--progress-bar-indeterminate-animation-duration) infinite linear reverse;
}
```

- 在 `progress` 上定义公开的 `--progress-bar-indeterminate-*` 属性（名称已限定状态），让使用者无需了解 `:indeterminate` 就能覆盖。
- 要改变片段长度（例如前缘先加速、后缘随后追上），将 `--progress-bar-indeterminate-animation` 设为两个并行动画：一个关键帧用 `cqi` 对 `translate` 动画（位置），另一个对 `inline-size` 动画（长度），使各自有独立关键帧和缓动。不要在单个关键帧列表中同时塑造两条边；每帧 `animation-timing-function` 会作用于该帧全部属性。
- `--progress-bar-animation` 对两种状态都适用，可实现确定状态下的流光等效果。`revert-rule` 让它仅在有设置时覆盖，尽量保持可组合性。
- 永远不要禁用不确定动画（`animation: none` 会在 Chromium 留下零宽填充）。减少动态效果时改为降低速度。

```css
progress {
  /* Lets the fill position itself in track units (cqi) */
  container-type: inline-size;
  /* Segment length relative to the track */
  --progress-bar-indeterminate-size: 30%;
  --progress-bar-indeterminate-animation-duration: 1.5s;

  /* Respect prefers-reduced-motion */
  @media (prefers-reduced-motion: reduce) {
    --progress-bar-indeterminate-animation-duration: 10s;
  }
}

progress:indeterminate {
  --progress-bar-animation: var(
      --progress-bar-indeterminate-animation,
      progress-bar-indeterminate var(--progress-bar-indeterminate-animation-duration) infinite linear
    );
}

/* Add to the existing pseudo-element rules */
progress::-webkit-progress-value {
  animation: var(--progress-bar-animation, revert-rule);
}

progress::-moz-progress-bar {
  animation: var(--progress-bar-animation, revert-rule);
}

/* Physical: left to right regardless of direction (reverse under :dir(rtl) to mirror). */
@keyframes progress-bar-indeterminate {
  from, to {
    inline-size: var(--progress-bar-indeterminate-size);
    /* Pin to the physical left; Chromium would otherwise lay the fill out at the inline start */
    margin-right: auto;
  }
  from { translate: -100%; } /* Own width: fully outside the left edge */
  to { translate: 100cqi; }  /* Track width: fully outside the right edge */
}
```

<a id="additional-accessibility-considerations"></a>

### 其他无障碍考量

除前述指南外：
* **播报完成但不抢夺焦点：** 不要为 `<progress>` 设置 `tabindex` 或调用 `.focus()`；它不可交互，移入焦点会打断键盘用户。后台任务完成时，更新礼貌级别状态元素（`role="status"` 或 `aria-live="polite"`）。
* **不要在 `<progress>` 内添加回退文字：** 现代浏览器会忽略 `<progress>` 内部的文字，辅助技术也不使用。
* 避免在无标签的通用 `<div>` 上组合 `aria-busy` + `aria-describedby`。屏幕阅读器对 `aria-busy` 支持不一致，无名称、无角色的 `<div>` 上的 `aria-describedby` 会被辅助技术忽略。如果区域内容加载中尚未准备好，用 `hidden` 或 `aria-hidden="true"` 隐藏。
* **要**确保自定义样式下进度条与轨道有合适对比度。
* **考虑其他不确定状态表示方式：** 与其他内容并行显示的不确定进度动画，可能使部分用户分心。

<a id="fallback-strategies"></a>

## 回退策略

<a id="fallbacks--browser-support-for-accent-color"></a>

### accent-color 的回退方案和浏览器支持

accent-color 的浏览器支持：有限可用。
支持版本：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）、Firefox 92（2021 年 9 月）和 Safari 26.2（2025 年 12 月）。

`accent-color` 属于渐进增强。
不支持的浏览器会忽略它并使用默认 UI 颜色。

若不支持 `accent-color` 且必须设置进度条样式，则使用完全自定义样式的方法。

<a id="fallbacks--browser-support-for-revert-rule"></a>

### `revert-rule` 的回退方案和浏览器支持

revert-rule 的 Baseline 状态：新近可用。自 2026-09-14 起纳入 Baseline。
支持版本：Chrome 148（2026 年 5 月）、Edge 148（2026 年 5 月）、Firefox 150（2026 年 4 月）和 Safari 27（2026 年 9 月）。

不支持 `revert-rule` 时，若未设置 `--progress-bar-animation`，`animation: var(--progress-bar-animation, revert-rule)` 会回退为持续时间 `0s` 的 `animation-name: revert-rule`；没有 `@keyframes revert-rule` 时，这是无害的空操作。
