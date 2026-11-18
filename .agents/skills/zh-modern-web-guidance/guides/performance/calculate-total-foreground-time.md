<a id="calculate-total-foreground-time"></a>

# 计算前台停留总时间

本指南说明如何准确计算用户实际查看页面的总时长。传统的页面停留时间等指标，往往错误地计入页面处于后台的时间。使用 `VisibilityStateEntry` API 可以只测量“前台时间”，得到更能反映用户参与程度的指标。

<a id="implementing-foreground-time-calculation"></a>

## 实现前台时间计算

`PerformanceTimeline` API 会把可见性状态变化暴露为性能条目。无需响应每次 `visibilitychange` 事件并在整个会话中手动累加时间，而是可以随时查询完整的可见性历史。

必须：查询 `visibility-state` 性能条目，才能计算真实的前台时间。

```javascript
/**
 * Calculates total time the page was in the visible state.
 *
 * @returns {number} Total foreground time in milliseconds.
 */
function getTotalForegroundTime() {
  // MANDATORY: Query the visibility-state entries from the performance timeline.
  const entries = performance.getEntriesByType('visibility-state');

  // Fallback: If the browser does not support VisibilityStateEntry,
  // the API will gracefully return an empty array.
  if (entries.length === 0) {
    // Return total time since navigation start as a fallback.
    return performance.now();
  }

  let totalForegroundTime = 0;

  for (let i = 0; i < entries.length; i++) {
    // Only calculate duration for periods where the state was 'visible'
    if (entries[i].name === 'visible') {
      const start = entries[i].startTime;

      // The end time is the start time of the next state change,
      // or the current time if this is the final entry.
      const end = i + 1 < entries.length
          ? entries[i + 1].startTime
          : performance.now();

      totalForegroundTime += (end - start);
    }
  }

  return totalForegroundTime;
}
```

<a id="fallbacks--browser-support"></a>

## 回退与浏览器支持

页面可见性状态性能条目的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 115（2023 年 7 月）和 Edge 115（2023 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

`VisibilityStateEntry` API 是 Performance Timeline 的较新扩展，并非所有浏览器都支持。

由于 `performance.getEntriesByType('visibility-state')` 在不支持的浏览器中会返回空数组，特性检测可以直接融入计算流程。继续计算之前，应始终检查是否返回了条目。

如果 API 不受支持，建议回退为返回 `performance.now()`。它代表从导航开始到当前的总时间，在无法获取可见性历史时，可以作为用户参与时长的合理上限。

```javascript
const entries = performance.getEntriesByType('visibility-state');

// If the array is empty, the API is likely unsupported.
if (entries.length === 0) {
  // Fallback: Return total time since page load.
  return performance.now();
}
```
