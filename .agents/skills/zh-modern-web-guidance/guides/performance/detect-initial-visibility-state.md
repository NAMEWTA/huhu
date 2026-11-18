<a id="detect-initial-visibility-state"></a>

# 检测初始可见性状态

判断页面最初是否在后台加载，例如在新的后台标签页中打开，对于准确监控性能至关重要。后台加载的页面通常会延迟渲染，导致首次内容绘制等指标时间更长。识别这些页面后，可以将它们从性能分析中排除，避免数据失真。

最准确的方法是使用 `VisibilityStateEntry` API。无论脚本实际何时执行，它都会可靠地在浏览器性能时间轴上记录可见性变化。

<a id="detecting-initial-visibility-and-background-time"></a>

### 检测初始可见性与后台时间

必须：使用 `performance.getEntriesByType('visibility-state')` 获取准确的可见性历史。不要仅依赖脚本执行时的 `document.visibilityState`，因为这容易受到竞态条件影响。

```javascript
/**
 * Accurately determines visibility state history using the Performance API.
 */
function getVisibilityInfo() {
  // Retrieve VisibilityStateEntry members:
  const entries = performance.getEntriesByType('visibility-state');
  
  if (entries.length > 0) {
    const firstEntry = entries[0];
    
    // If the first performance entry for visibility is 'hidden',
    // the page was loaded in the background.
    const initiallyBackgrounded = firstEntry.name === 'hidden';
    
    // Find the precise, high-resolution timestamp of when the page 
    // was first backgrounded.
    let timeBackgrounded = null;
    for (const entry of entries) {
      if (entry.name === 'hidden') {
        // entry.startTime is used because it provides the exact browser 
        // timestamp of the visibility change, which is required for precision
        timeBackgrounded = entry.startTime;
        break;
      }
    }

    return {
      initiallyBackgrounded,
      timeBackgrounded
    };
  }
}
```

<a id="fallback-strategies"></a>

### 回退策略

页面可见性状态性能条目的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 115（2023 年 7 月）和 Edge 115（2023 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

对于不支持的环境，可以回退为检查 `document.visibilityState` 属性或监听 `visibilitychange` 事件。

**必须**：理解这种回退方法在**判断初始后台状态时通常非常不准确**。由于脚本可以异步加载和执行，页面可能先在后台标签页中打开，然后在脚本下载和执行完成*之前*就被用户切到前台。脚本最终运行时，`document.visibilityState` 会同步读到 `'visible'`，于是错误地认为页面最初在前台加载，完全漏掉初始隐藏状态。此外，回退时间戳也缺乏 Performance API 的内部精度。如果准确性是高优先级要求，就不要使用此回退。

```javascript
/**
 * Fallback implementation using document.visibilityState.
 * This approach is prone to race conditions if the script loads asynchronously.
 */
function getFallbackVisibilityInfo() {
  // Check the state exactly when this script executes.
  // This will fail to detect an initial background state if the user 
  // foregrounded the page before this script executed.
  let initiallyBackgrounded = document.visibilityState === 'hidden';
  
  // If it's hidden now, we approximate that it was hidden from load (time 0).
  let timeBackgrounded = initiallyBackgrounded ? 0 : null;

  // Listen for future visibility changes to capture if it is backgrounded later.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timeBackgrounded === null) {
      // performance.now() is used here as a fallback, but it only gives 
      // us the time the event listener fired, not the precise internal 
      // browser time the visibility actually changed.
      timeBackgrounded = performance.now();
    }
  });

  return {
    get initiallyBackgrounded() { return initiallyBackgrounded; },
    get timeBackgrounded() { return timeBackgrounded; }
  };
}

// Modern implementation using VisibilityStateEntry API.
function getVisibilityInfo() {
  // Code omitted here would be the same modern
  // implementation shown earlier in this guide
  // ...
}

// DO: Detect if the VisibilityStateEntry API is available
if ('VisibilityStateEntry' in window) {
  // DO: If VisibilityStateEntry is available, use it first:
  getVisibilityInfo();
} else {
  // DO: If VisibilityStateEntry is unavailable, fall back to `document.visibilityState`:
  getFallbackVisibilityInfo();
}
```
