<a id="measure-interaction-and-soft-navigation-paint-timing"></a>

# 测量交互与软导航的绘制时序

在初始页面加载之后，标准绘制与响应性指标留下了测量空缺：

- **`LargestContentfulPaint`（`largest-contentful-paint`）**只测量初始的“硬”文档加载，并在用户第一次与页面交互后停止产生条目。
- **`PerformanceEventTiming` 以及 `event` / 交互到下一次绘制（INP）**只测量输入到*紧接着的下一帧*之间的响应性，例如按钮激活状态或加载转圈，不会跟踪后续异步绘制，例如 `fetch()` 完成后渲染新内容，或客户端路由切换完成后的绘制。
- 在框架代码之外观察单页应用（SPA）的路由变化可能很困难。只监控 URL 更新会多报与路由无关的变化，例如锚点变化，或同一次路由切换中的多次“重定向”。

`InteractionContentfulPaint`（`interaction-contentful-paint`）和 `PerformanceSoftNavigation`（`soft-navigation`）性能条目类型补上了这一空缺。它们在 `fetch`、`await`、`setTimeout` 等异步任务之间传递交互因果关系，从而将新的内容绘制和单页应用（SPA）路由切换直接归因到触发它们的用户交互。

<a id="how-to-implement"></a>

## 如何实现

<a id="1-observe-contentful-paints-triggered-by-interactions"></a>

### 1. 观察由交互触发的内容绘制

使用设置了 `type: 'interaction-contentful-paint'` 和 `buffered: true` 的 `PerformanceObserver`，观察由任意用户交互导致的、内容尺寸逐渐增大的绘制。

每个 `InteractionContentfulPaint` 条目提供：

- `interactionId`：发起该过程的用户交互的唯一标识符，与 `PerformanceEventTiming.interactionId` 和 `PerformanceSoftNavigation.interactionId` 匹配。
- `startTime`：发起交互的开始时间戳，相对于初始硬导航的时间原点。
- `paintTime` 和 `presentationTime`：分别表示渲染阶段结束的时间，以及绘制像素真正呈现在屏幕上的时间。
- `duration`：从交互开始到绘制呈现的经过时间，即 `presentationTime - startTime`。
- `largestContentfulPaint`：一个 `LargestContentfulPaint` 快照对象，包含该次交互截至当前所绘制最大元素的信息，包括 `element`、`size`、`url`、`id`、`renderTime`、`loadTime`。

```javascript
/**
 * Observes contentful paints caused by user interactions and invokes a callback
 * whenever an interaction produces a larger contentful paint.
 *
 * @param {(entry: PerformanceEntry) => void} onInteractionPaint
 */
export function observeInteractionPaints(onInteractionPaint) {
  // Feature-detect support before calling observe() so unsupported browsers
  // do not throw or log console warnings.
  if (
    typeof PerformanceObserver === 'undefined' ||
    !PerformanceObserver.supportedEntryTypes?.includes('interaction-contentful-paint')
  ) {
    return null;
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // entry.duration is already calculated as (entry.presentationTime - entry.startTime),
      // giving the total time from the user interaction to this contentful paint.
      onInteractionPaint(entry);
    }
  });

  // MANDATORY: Pass buffered: true to capture interaction paints that occurred
  // before this observer was registered.
  observer.observe({ type: 'interaction-contentful-paint', buffered: true });
  return observer;
}
```

<a id="2-measure-largest-contentful-paint-lcp-for-spa-soft-navigations"></a>

### 2. 测量 SPA 软导航的最大内容绘制（LCP）

当可信用户交互同时引起可见 URL 变化和内容绘制时，浏览器会发出软导航条目。计算每次软导航的 LCP：

1. 同时观察 `'soft-navigation'` 和 `'interaction-contentful-paint'` 条目，并设置 `buffered: true`。
2. **必须**：收到 `'soft-navigation'` 条目时，调用 `softNavEntry.getLargestInteractionContentfulPaint()` 为其建立初始 LCP 候选。如果应用在更新 URL *之前*就绘制内容，例如先渲染视图再调用 `history.pushState()`，那么这些早期的 `interaction-contentful-paint` 条目会在 `soft-navigation` 条目之前发出，并且仍携带*上一次*的 `navigationId`。
3. **必须**：通过 `entry.interactionId === softNavEntry.interactionId` 将后续 `'interaction-contentful-paint'` 条目关联到活动软导航，**不要**通过 `entry.navigationId` 匹配。使用 `interactionId` 能包含 URL 更新前发生的绘制，同时排除新路由上稍后发生的无关交互绘制。

```javascript
/**
 * Tracks FCP and LCP for each client-side soft navigation and reports finalized
 * route metrics when the user navigates to a new route or hides the page.
 *
 * @param {(report: {
 *   url: string,
 *   navigationId: number,
 *   interactionId: number,
 *   fcpDuration: number,
 *   lcpDuration: number | null,
 *   lcpElement: Element | null,
 *   lcpSize: number | null
 * }) => void} onSoftNavReport
 */
export function trackSoftNavigationLCP(onSoftNavReport) {
  const supported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('soft-navigation') &&
    PerformanceObserver.supportedEntryTypes?.includes('interaction-contentful-paint');

  if (!supported) {
    return null;
  }

  let activeSoftNav = null;
  let activeLcpEntry = null;

  function finalizeCurrentSoftNav() {
    if (!activeSoftNav) return;

    onSoftNavReport({
      // activeSoftNav.name holds the destination URL of the soft navigation.
      url: activeSoftNav.name,
      navigationId: activeSoftNav.navigationId,
      interactionId: activeSoftNav.interactionId,
      // activeSoftNav.duration is (activeSoftNav.presentationTime - activeSoftNav.startTime),
      // which represents First Contentful Paint (FCP) relative to interaction start.
      fcpDuration: activeSoftNav.duration,
      // activeLcpEntry.duration is (activeLcpEntry.presentationTime - activeSoftNav.startTime),
      // representing the soft navigation's LCP duration relative to interaction start.
      lcpDuration: activeLcpEntry ? activeLcpEntry.duration : null,
      lcpElement: activeLcpEntry?.largestContentfulPaint?.element ?? null,
      lcpSize: activeLcpEntry?.largestContentfulPaint?.size ?? null,
    });

    activeSoftNav = null;
    activeLcpEntry = null;
  }

  const softNavObserver = new PerformanceObserver((list) => {
    for (const softNavEntry of list.getEntries()) {
      // Finalize the previous route's metrics before resetting state for the new route.
      finalizeCurrentSoftNav();

      activeSoftNav = softNavEntry;
      // MANDATORY: Seed the LCP candidate with getLargestInteractionContentfulPaint()
      // to capture any attributed contentful paints that occurred before the URL updated.
      activeLcpEntry = softNavEntry.getLargestInteractionContentfulPaint();
    }
  });

  const icpObserver = new PerformanceObserver((list) => {
    for (const icpEntry of list.getEntries()) {
      // MANDATORY: Match by interactionId (not navigationId) so only paints caused
      // by the soft navigation's initiating interaction update the route's LCP.
      if (activeSoftNav && icpEntry.interactionId === activeSoftNav.interactionId) {
        activeLcpEntry = icpEntry;
      }
    }
  });

  softNavObserver.observe({ type: 'soft-navigation', buffered: true });
  icpObserver.observe({ type: 'interaction-contentful-paint', buffered: true });

  // Finalize the active route's LCP when the page is backgrounded or unloaded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      finalizeCurrentSoftNav();
    }
  });

  return { softNavObserver, icpObserver, finalizeCurrentSoftNav };
}
```

<a id="3-measure-core-web-vitals-across-soft-navigations-with-web-vitals"></a>

### 3. 使用 `web-vitals` 测量跨软导航的 Core Web Vitals

如果目标是把跨硬导航与软导航的标准 Core Web Vitals，即 LCP、CLS 和 INP，上报到分析端点，应使用 `web-vitals` 库 v6.0.0+ 并设置 `{ reportSoftNavs: true }`，不要手动分割每种指标的时间轴。

```javascript
import { onLCP, onFCP, onCLS, onINP } from 'web-vitals';

function sendToAnalytics(metric) {
  // Example-only endpoint; replace with your real telemetry URL.
  navigator.sendBeacon(
    '/analytics',
    JSON.stringify({
      name: metric.name,
      value: metric.value,
      navigationType: metric.navigationType,
      navigationURL: metric.navigationURL,
    }),
  );
}

// Pass { reportSoftNavs: true } to report metrics per soft navigation in addition
// to the initial hard navigation.
onLCP(sendToAnalytics, { reportSoftNavs: true });
onFCP(sendToAnalytics, { reportSoftNavs: true });
onCLS(sendToAnalytics, { reportSoftNavs: true });
onINP(sendToAnalytics, { reportSoftNavs: true });
```

<a id="best-practices"></a>

## 最佳实践

- **应当**在调用 `observer.observe()` 前，使用 `PerformanceObserver.supportedEntryTypes?.includes(...)` 检测 `'interaction-contentful-paint'` 和 `'soft-navigation'` 是否受支持。
- **应当**在观察 `'interaction-contentful-paint'` 和 `'soft-navigation'` 时传入 `{ buffered: true }`，避免分析代码异步初始化时漏掉早期条目。
- **应当**在处理新的 `soft-navigation` 条目时调用 `softNavEntry.getLargestInteractionContentfulPaint()`，把 URL 更新前的绘制纳入 LCP。
- **应当**使用 `interactionId` 将 `interaction-contentful-paint` 条目匹配到软导航，不使用 `navigationId`。
- **应当**使用 `entry.duration` 或 `entry.presentationTime - entry.startTime` 测量交互绘制延迟，不要直接报告 `entry.presentationTime`。所有 `PerformanceEntry` 时间戳都以初始硬加载的时间原点为基准，而非软导航开始时间。
- **不要**依赖 `performance.getEntriesByType('soft-navigation')` 监控长时间运行的单页应用，因为浏览器缓冲区只保留最初 50 条软导航条目。

<a id="fallback-strategies"></a>

## 回退策略

交互内容绘制性能条目的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 151（2026 年 7 月）和 Edge 151（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

软导航性能条目的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 151（2026 年 7 月）和 Edge 151（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

如果 Baseline 目标包含不支持 `InteractionContentfulPaint` 或 `PerformanceSoftNavigation` 的浏览器，应将这些 API 视为真实用户监控（RUM）的渐进增强：

1. **特性检测与优雅降级**：在注册观察器前，检查 `PerformanceObserver.supportedEntryTypes?.includes('interaction-contentful-paint')` 和 `PerformanceObserver.supportedEntryTypes?.includes('soft-navigation')`。不支持时跳过注册，确保应用不会抛错。
2. **继续保留标准硬导航观察器**：在所有浏览器中继续观察标准的 `'largest-contentful-paint'`、`'event'` 和 `'layout-shift'` 条目。无论是否支持软导航，`LargestContentfulPaint` 都会在首次用户交互时结束，因此在支持的浏览器中测量软导航不会改变或破坏初始硬加载的 LCP 测量。
