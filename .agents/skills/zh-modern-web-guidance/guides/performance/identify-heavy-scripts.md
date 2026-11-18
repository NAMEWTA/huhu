<a id="identify-heavy-running-javascript"></a>

# 识别运行开销大的 JavaScript

运行开销大的 JavaScript 会损害页面加载性能和交互性。现代 Web 应用比以往更加依赖来自多种来源的 JavaScript，包括应用代码本身及其依赖的框架代码，也包括增加聊天小组件、视频播放器等功能的第三方脚本。后台的分析与营销脚本也是常见影响因素，而且很容易被忽略。

识别网页响应迟钝的根因并不容易，需要一定专业知识来执行 Web 性能追踪或性能分析，并解释结果。此外，真实用户环境的数据通常与实验室数据差异很大，实验室只能复现真实场景的一小部分。因此，性能问题的根因可能难以定位，交互问题尤其如此。

Long Animation Frames API 是一个轻量 API，可以在真实用户环境中识别运行开销大的 JavaScript。高开销脚本既可能是单次运行时间很长的脚本，也可能是在页面生命周期中多次运行的脚本。

<a id="how-to-implement"></a>

## 如何实现

使用 `PerformanceObserver` 接口监控长动画帧。当一个动画帧渲染超过 50ms 时，它会产生一个 `long-animation-frame` 条目。条目包含该长动画帧的相关信息，包括帧时长以及帧内执行的脚本。

`long-animation-frame` 条目的 `scripts` 属性是一个 `PerformanceScript` 对象数组。每个 `PerformanceScript` 对象都包含在该长动画帧内执行的脚本信息，包括脚本的 `sourceURL` 和 `duration`。

<a id="example-of-identifying-the-longest-running-scripts-that-contribute-to-long-animation-frames"></a>

### 识别导致长动画帧的最长运行脚本示例

```javascript
// Accumulate all script entries across the page lifecycle so no
// data is lost between observer callbacks.
const allScripts = [];

const observer = new PerformanceObserver(list => {
  // Collect all script entries across frames to find the biggest offenders.
  allScripts.push(...list.getEntries().flatMap(entry => entry.scripts));

  // Group by sourceURL so you can identify which scripts contribute
  // the most total time, even if each individual invocation is short.
  const scriptSource = [...new Set(allScripts.map(script => script.sourceURL))];
  const scriptsBySource = scriptSource.map(sourceURL => ([sourceURL,
      allScripts.filter(script => script.sourceURL === sourceURL)
  ]));
  const processedScripts = scriptsBySource.map(([sourceURL, scripts]) => ({
    sourceURL,
    count: scripts.length,
    totalDuration: scripts.reduce((subtotal, script) => subtotal + script.duration, 0)
  }));

  // Only include scripts above a certain threshold to reduce noise.
  const heavyScripts = processedScripts.filter(script => {
    return script.totalDuration > 100;
  });

  // Sort by total duration so the worst offenders appear first,
  // making it easier to prioritize optimization efforts.
  heavyScripts.sort((a, b) => b.totalDuration - a.totalDuration);

  // Log to the console for local debugging. In production, replace
  // this with a call to send the data to your analytics service.
  console.table(heavyScripts);
});

// Use buffered: true to capture any long frames that occurred before
// this observer was registered.
observer.observe({type: 'long-animation-frame', buffered: true});
```

<a id="best-practices"></a>

## 最佳实践

- **应当**优先使用 Long Animation Frames API，而不是 JS Self-Profiling API 等运行时开销更大的替代方案。
- **应当**汇总关键信息，因为 Long Animation Frames API 提供的细节很多。
- **应当**在生产环境中将需要的信息发送给分析服务。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

长动画帧性能条目的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 123（2024 年 3 月）和 Edge 123（2024 年 3 月）。
不支持的浏览器：Firefox 和 Safari。

不支持 Long Animation Frames API 的浏览器会忽略它，因此可以安全使用，无需回退。多数情况下，它识别出的性能优化机会也适用于其他浏览器。
