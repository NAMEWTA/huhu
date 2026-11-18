<a id="identify-causes-of-poor-inp"></a>

# 识别 INP 较差的原因

交互响应较差会让用户觉得页面很慢，甚至完全损坏。交互到下一次绘制（INP）是一项基于 Event Timing API 的指标，通过测量最差的一次交互并排除部分异常值，衡量页面的响应性。

网页响应迟钝的根因难以识别，尤其因为它取决于用户交互，以及设备能力、网络状况等环境条件。相比页面加载这类更容易重复、更可预测的场景，交互问题更难诊断。实验室数据只能复现真实用户场景的一小部分，因此必须在真实用户环境中测量 INP 缓慢的原因。

Event Timing API 可以将 INP 时长拆为三个部分：输入延迟（Input Delay，即交互发生时已经在进行的处理）、处理时长（Processing Duration，即交互直接引起的延迟）和呈现延迟（Presentation Delay，即交互之后渲染下一帧产生的延迟）。这样可以分别判断问题是否来自其他代码、交互本身的 JavaScript，或者浏览器处理渲染更新的过程，而不是立即认定交互代码有问题。

还可以进一步了解导致交互延迟的 JavaScript、样式重新计算与布局工作。通过 JS Self-Profiling API 获取完整性能追踪属于重型方案，本身就容易引起性能问题。Long Animation Frames API 更轻量，可以在真实用户环境中识别运行缓慢的 JavaScript，并区分 INP 交互期间的样式重新计算和布局开销：

- **脚本级强制样式与布局（`forcedStyleDuration` 和 `forcedLayoutDuration`）**：报告在**输入延迟**或**处理时长**阶段，运行中脚本内部触发的同步样式重新计算，例如修改 DOM 后调用 `getComputedStyle()`，以及强制布局/回流，例如修改后读取 `getBoundingClientRect()` 或 `offsetWidth`。
- **帧级渲染样式与布局（`styleDuration` 和 `layoutDuration`）**：报告帧渲染更新期间重新计算样式与更新布局分别耗费的时间，有助于解释较高的**呈现延迟**。

区分样式重新计算与布局非常关键，因为它们的根因和修复方法不同：样式时长高，通常指向昂贵的 CSS 选择器匹配或大范围样式失效，可以通过简化选择器、缩小规则作用域改善；布局时长高，则指向昂贵的几何计算或同步布局抖动，可以通过先批量读取 DOM 再写入、简化 DOM 结构或使用 CSS containment 改善。

<a id="how-to-implement"></a>

## 如何实现

直接从原始 Event Timing API 计算 INP 比较复杂，有许多细节需要处理。建议使用真实用户监控（RUM）工具或库收集数据。

`web-vitals` 是 Google 提供的开源库，可以计算包括 INP 在内的 Core Web Vitals，并提供 INP 交互的各部分时长和长动画帧数据。

<a id="get-attributions-for-inp-interactions-using-web-vitals-library"></a>

## 使用 web-vitals 库获取 INP 交互的归因信息

`web-vitals` 是一个用于测量 Core Web Vitals 及其他性能指标的小型库。`onINP()` 函数可以识别最慢交互，并通过 Long Animation Frames API 提供 INP 各部分、交互期间执行的脚本，以及样式和布局时长的信息。

```javascript
// Use the attribution build to get Long Animation Frame data
// alongside the INP metric value.
import { onINP } from 'web-vitals/attribution';

onINP((metric) => {
  const { attribution } = metric;
  const longestScript = attribution.longestScript;

  // Sum rendering-phase style and layout durations across all LoAF entries
  // intersecting the INP interaction (primarily explains presentationDelay).
  let renderStyleDuration = 0;
  let renderLayoutDuration = 0;
  for (const entry of attribution.longAnimationFrameEntries) {
    renderStyleDuration += entry.styleDuration ?? 0;
    renderLayoutDuration += entry.layoutDuration ?? 0;
  }

  // Beacon script, style, and layout attribution for the INP interaction,
  // so you can identify the root cause in production.
  navigator.sendBeacon(
    '/analytics',
    JSON.stringify({
      name: 'INP',
      value: metric.value,
      // These fields give the INP subparts:
      inputDelay: attribution.inputDelay,
      presentationDelay: attribution.presentationDelay,
      processingDuration: attribution.processingDuration,
      interactionTarget: attribution.interactionTarget,
      // These fields identify which script function was responsible
      // for the longest processing during the INP interaction.
      invokerType: longestScript?.entry?.invokerType,
      sourceURL: longestScript?.entry?.sourceURL,
      sourceFunctionName: longestScript?.entry?.sourceFunctionName,
      sourceCharPosition: longestScript?.entry?.sourceCharPosition,
      // subpart indicates which phase (input delay, processing, or
      // presentation delay) the longest script overlapped with most.
      subpart: longestScript?.subpart,
      intersectingDuration: longestScript?.intersectingDuration,
      // Synchronous style and layout work forced inside the longest script
      // (with forcedStyleAndLayoutDuration as a combined fallback):
      forcedStyleDuration: longestScript?.entry?.forcedStyleDuration,
      forcedLayoutDuration: longestScript?.entry?.forcedLayoutDuration,
      forcedStyleAndLayoutDuration: longestScript?.entry?.forcedStyleAndLayoutDuration,
      // Rendering-phase style and layout work across the interaction's frames
      // (with totalStyleAndLayoutDuration as a combined fallback):
      renderStyleDuration,
      renderLayoutDuration,
      totalStyleAndLayoutDuration: attribution.totalStyleAndLayoutDuration
    })
  );
});
```

<a id="best-practices"></a>

## 最佳实践

- **应当**先查看 INP 的组成部分，识别延迟来自已经运行的 JavaScript（输入延迟）、交互事件处理器的 JavaScript（处理时长），还是后续渲染（呈现延迟）。
- **应当**进一步识别阻塞最严重的 JavaScript，尤其是输入延迟和处理时长阶段。
- **应当**在诊断较高处理时长或呈现延迟时，区分样式重新计算（`styleDuration`、`forcedStyleDuration`）与布局（`layoutDuration`、`forcedLayoutDuration`）：样式时间高意味着昂贵的 CSS 选择器或大范围失效，而布局时间高意味着 DOM 几何瓶颈或同步布局抖动。
- **应当**优先使用 Long Animation Frames API 获取这些补充细节，而不是 JS Self-Profiling API 等运行时开销更大的方案。
- **应当**在没有其他 RUM 方案时使用 `web-vitals` 库。它能识别 INP 交互，并利用 Long Animation Frames API 提供组成部分与交互期间所执行脚本的信息。
- **应当**将需要的信息通过信标回传分析服务，而不是只写入本地日志。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

事件计时性能条目的 Baseline 状态：Newly available。自 2025-12-12 起纳入 Baseline。
支持的浏览器：Chrome 76（2019 年 7 月）、Edge 79（2020 年 1 月）、Firefox 89（2021 年 6 月）和 Safari 26.2（2025 年 12 月）。

大多数现代浏览器支持 Event Timing API，计算 INP 及其组成部分需要此 API。不支持它的浏览器无法测量 INP。

长动画帧性能条目的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 123（2024 年 3 月）和 Edge 123（2024 年 3 月）。
不支持的浏览器：Firefox 和 Safari。

Long Animation Frames API 提供可选的补充细节，可以安全使用，无需回退。多数情况下，它发现的性能优化机会同样适用于其他浏览器。

如果 Baseline 目标支持 Long Animation Frames API（`long-animation-frames`），但不支持独立的样式与布局时长属性，即 `PerformanceLongAnimationFrameTiming` 的 `styleDuration` 和 `layoutDuration`，或 `PerformanceScriptTiming` 的 `forcedStyleDuration` 和 `forcedLayoutDuration`，则回退到合并的样式与布局计时：

- 对脚本内部同步强制样式与布局工作，使用 `PerformanceScriptTiming` 的 `script.forcedStyleAndLayoutDuration`。
- 对合并的样式与布局工作，使用 `web-vitals/attribution` 中的 `metric.attribution.totalStyleAndLayoutDuration`，或者对每个 `PerformanceLongAnimationFrameTiming` 条目计算 `(entry.paintTime || entry.startTime + entry.duration) - entry.styleAndLayoutStart`。
