<a id="brand-consistent-range-slider"></a>
# 与品牌一致的范围滑块

<a id="use-the-native-range-input"></a>
## 使用原生范围输入控件

使用带有标签的 `<input type="range">`，不要用 `<div>` 元素或自定义指针处理器重造滑块。原生控件保留了键盘和指针交互、触摸行为与无障碍支持。按使用场景配置 `min`、`max`、`step` 和 `value`。

```html
<label for="range-slider">Volume</label>
<input type="range" id="range-slider" value="70"/>
```

如果数值需要格式化标签或单位，应通过普通 DOM 内容展示，并在数值变化时更新 `aria-valuetext`。不要在滑块伪元素上使用 `::before` 或 `::after`，因为表单控件上的生成内容不具备跨浏览器互操作性。如果需要随滑块手柄移动的提示框，应通过 CSS 锚点定位将其绑定到手柄；参见 `position-aware-tooltips`（通过 `npx -y modern-web-guidance@latest retrieve "position-aware-tooltips"` 获取），了解如何让提示框在翻转后仍保持正确朝向。

<a id="choose-the-styling-approach"></a>
## 选择样式方案

如果只需简单自定义颜色，请使用 `brand-consistent-forms`（通过 `npx -y modern-web-guidance@latest retrieve "brand-consistent-forms"` 获取），并保留浏览器的原生渲染：

```css
input[type="range"] {
  accent-color: var(--brand-color);
}
```

`accent-color` 并不是完整的滑块样式 API。它对手柄、轨道和填充的影响取决于用户代理。如果需要控制轨道、手柄、尺寸、形状或填充，应使用下文的伪元素。

<a id="style-the-track-and-thumb"></a>
## 设置轨道和手柄样式

使用 `appearance: none`、`margin: 0` 和 `border: 0` 重置操作系统默认样式。为统一跨浏览器渲染，WebKit 与 Firefox 的伪元素应分别放在独立规则块中；并通过 `margin-block-start: calc((var(--slider-track-size) - var(--slider-thumb-size)) / 2)` 让 WebKit 手柄居中，Firefox 会自动将其居中。把供组件使用方调整的值定义为 input 上的自定义属性，使主题无需直接操作伪元素。

```css
input[type="range"] {
  --slider-track-size: 0.5rem;
  --slider-thumb-size: 1.25rem;
  --slider-track-radius: 999px;
  --slider-thumb-radius: 50%;
  --slider-track-color: #d9d9d9;
  --slider-fill-color: #06c;
  --slider-thumb-color: var(--slider-fill-color);
  --slider-direction: to right;

  /* reverse gradient direction for right-to-left layouts */
  &:dir(rtl) {
    --slider-direction: to left;
  }

  /* Read min and max from attributes; --control-value is synced by the script below. */
  --attr-min: attr(min type(<number>), 0);
  --attr-max: attr(max type(<number>), 100);
  --control-value: attr(value type(<number>), 50);
  --slider-progress: calc(
    progress(var(--control-value), var(--attr-min), var(--attr-max)) * 100%
  );

  appearance: none;
  inline-size: 100%;
  block-size: 2.5rem; /* Preserve a generous interaction area. */
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}

/* WebKit/Blink. */
input[type="range"]::-webkit-slider-runnable-track {
  block-size: var(--slider-track-size);
  border: 0;
  border-radius: var(--slider-track-radius);
  background: linear-gradient(
    var(--slider-direction),
    var(--slider-fill-color) var(--slider-progress),
    var(--slider-track-color) var(--slider-progress)
  );
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  inline-size: var(--slider-thumb-size);
  block-size: var(--slider-thumb-size);
  margin-block-start: calc(
    (var(--slider-track-size) - var(--slider-thumb-size)) / 2
  );
  border: 0;
  border-radius: var(--slider-thumb-radius);
  background: var(--slider-thumb-color);
}

/* Firefox. */
input[type="range"]::-moz-range-track {
  block-size: var(--slider-track-size);
  border: 0;
  border-radius: var(--slider-track-radius);
  background: var(--slider-track-color);
}

input[type="range"]::-moz-range-progress {
  block-size: var(--slider-track-size);
  border-radius: var(--slider-track-radius);
  background: var(--slider-fill-color);
}

input[type="range"]::-moz-range-thumb {
  inline-size: var(--slider-thumb-size);
  block-size: var(--slider-thumb-size);
  border: 0;
  border-radius: var(--slider-thumb-radius);
  background: var(--slider-thumb-color);
}
```

确保轨道颜色与背景色的对比度至少为 `3:1`。

移除原生外观后，始终提供清晰的键盘焦点指示器。确保它与背景色或相邻轨道的对比度至少为 `3:1`，并且不要只依赖颜色：

```css
input[type="range"]:focus-visible {
  outline: 2px solid var(--slider-fill-color);
  outline-offset: 4px;
}
```

<a id="style-the-active-track"></a>
## 设置活动轨道样式

当轨道已填充部分与未填充部分采用不同样式时，Firefox 通过 `::-moz-range-progress` 暴露已填充部分。WebKit/Blink 没有对应伪元素，因此应在 `input` 事件中将实时输入值同步到 `--control-value`：

```js
const slider = document.querySelector('#range-slider');

function syncSliderValue() {
  slider.style.setProperty('--control-value', slider.value);
}

syncSliderValue();
slider.addEventListener('input', syncSliderValue);
```

<a id="limitations"></a>
## 限制

- 不要把 WebKit 和 Firefox 伪选择器合并到同一个逗号分隔列表中，例如 `::-webkit-slider-thumb, ::-moz-range-thumb`；浏览器遇到无法识别的厂商伪元素时，会丢弃整条规则。

<a id="fallbacks"></a>
## 回退方案

<a id="fallbacks--browser-support-for-accent-color"></a>
### accent-color 的回退方案与浏览器支持

accent-color 的浏览器支持：可用性有限。
支持：Chrome 93（2021 年 8 月）、Edge 93（2021 年 9 月）、Firefox 92（2021 年 9 月）和 Safari 26.2（2025 年 12 月）。

`accent-color` 属性属于渐进增强。
不支持该属性的浏览器会忽略它，并使用默认界面颜色。

<a id="fallbacks--browser-support-for-progress-and-attr"></a>
### `progress()` 和 `attr()` 的回退方案与浏览器支持

progress() 的 Baseline 状态：新近可用。自 2026-09-01 起达到 Baseline。
支持：Chrome 138（2025 年 6 月）、Edge 138（2025 年 6 月）、Firefox 155（2026 年 9 月）和 Safari 26（2025 年 9 月）。

不支持 `progress()` 时，使用 `calc()` 计算 `--slider-progress`：

```css
@supports not (opacity: progress(1, 0, 100)) {
  input[type="range"] {
    --slider-progress: calc(
      (var(--control-value) - var(--attr-min)) /
      (var(--attr-max) - var(--attr-min)) * 100%
    );
  }
}
```

attr() 的浏览器支持：可用性有限。
支持：Chrome 133（2025 年 2 月）、Edge 133（2025 年 2 月）和 Firefox 155（2026 年 9 月）。
不支持：Safari。

不支持带类型的 `attr()` 时，通过 JavaScript 将 input 的 `min` 和 `max` 属性同步到 `--attr-min` 和 `--attr-max`：

```js
function syncSliderValue() {
  slider.style.setProperty('--attr-min', slider.min || 0);
  slider.style.setProperty('--attr-max', slider.max || 100);
  slider.style.setProperty('--control-value', slider.value);
}
```
