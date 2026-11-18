<a id="debounce-and-batch-multiple-analytics-events"></a>

# 为多个分析事件防抖并批量发送

大多数分析、遥测以及 Core Web Vitals 分析数据的优先级都低于响应用户，因此可以放心地推迟到用户离开页面时再发送。例外是需要提供实时更新的场景，此时时效性很重要。

既提供实时分析更新、又尽量减少信标请求的最佳方式，是将 `fetchLater()` 与 `activateAfter` 配置选项组合使用。这样可以有效地进行防抖，把指定时间窗口内发生的所有分析事件合并为一个信标；即使用户在超时到期前离开页面，也能可靠发送。

<a id="how-to-implement"></a>

## 如何实现

1. **安排请求**：一旦有相关分析数据可用，就调用 `fetchLater()`，传入数据载荷以及 `activateAfter` 值。数据会进入发送队列，在指定时间过后发送；如果用户更早离开页面，则在离开时发送。

2. **合并多个事件**：如果在 `activateAfter` 超时到期前发生新的分析事件，取消此前安排的请求，再次调用 `fetchLater()`，使用相同的 `activateAfter` 值，将完整的事件队列作为一个载荷传入。

3. **超时后重置事件队列**：如果新的分析事件发生时，已安排的信标已经成功发送，即 `fetchLater()` 返回结果的 `activated` 值为 `true`，则重置事件队列。

3. **其余交给浏览器处理**：如果用户在 `activateAfter` 超时到期前离开页面或关闭标签页，浏览器仍会可靠地发送最近一次 `fetchLater()` 调用所提交的载荷。

<a id="example-code"></a>

## 示例代码

下面的代码跟踪页面上的全部 `load` 和 `click` 事件，并将 10 秒超时窗口内发生的所有事件合并发送。

```javascript
// Replace with your analytics endpoint.
const ANALYTICS_ENDPOINT = '/path/to/analytics/endpoint';

// Replace with a time window of your choice. All analytics events that
// occur within this time window will be batched together.
const BATCH_WINDOW = 10 * 1000;

// The maximum number of events to batch. Pick a number that is unlikely
// to overflow the fetchLater() quota for the page.
const MAX_QUEUE_SIZE = 100;

const eventQueue = [];
let fetchLaterResult;
let fetchLaterController;

function trackEvent(eventData) {
  // If the previously queued beacon has already been sent, or if the
  // max queue size has been met, reset the queue.
  if (fetchLaterResult?.activated || eventQueue.length > MAX_QUEUE_SIZE) {
    fetchLaterController = null;
    fetchLaterResult = null;
    eventQueue.length = 0;
  }

  eventQueue.push(eventData);

  // Abort any pending beacons before creating a new one.
  if (fetchLaterController) {
    fetchLaterController.abort();
  }
  fetchLaterController = new AbortController();

  // Schedule a fetch for the events to be sent when the batch window expires.
  // IMPORTANT: wrap the call in a try/catch to handle quota errors.
  try {
    fetchLaterResult = fetchLater(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(eventQueue),
      signal: fetchLaterController.signal,
      activateAfter: BATCH_WINDOW,
    });
  } catch (error) {
    // Handle errors as needed.
  }
}

// Track page loads.
window.addEventListener('load', () => {
  trackEvent({type: 'page_load'});
});

// Track click events.
window.addEventListener('click', (event) => {
  trackEvent({type: 'click', target: serializeElement(event.target)});
});
```

<a id="best-practices"></a>

## 最佳实践

- **应当**使用带 `activateAfter` 选项的 `fetchLater()`，合并时间上相近的多个分析事件。
- **应当**在新的分析事件发生时使用 `AbortController` 取消等待中的 fetch 请求。
- **应当**检查批量合并的事件数量，避免超过 `fetchLater()` 的配额，目前每个源约为 64KB。
- **应当**用 `try/catch` 包裹 `fetchLater()` 调用，以处理配额错误。
- **应当**检测 `globalThis` 上是否存在 `fetchLater()`，并为不支持该 API 的浏览器提供回退策略。
- **不要**使用 `ReadableStream` 对象作为请求体，否则会报错。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

fetchLater 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 135（2025 年 4 月）和 Edge 135（2025 年 4 月）。
不支持的浏览器：Firefox 和 Safari。因此通常需要回退策略。

不过，考虑到该 API 在可靠性和性能方面的改进，浏览器支持时应当使用 `fetchLater()`。

<a id="fetchlater-polyfill"></a>

### `fetchLater()` polyfill

使用下面这个精简的 `fetchLater()` polyfill，在不支持的浏览器中尽可能贴近原 API 实现。

这个 polyfill 唯一显著的行为差异是：它不会等到用户离开页面才发送载荷，而是在页面的 `visibilityState` 变为 "hidden" 时发送，因为这是当前广泛可用、最可靠的会话结束信号。

```js
globalThis.fetchLater ??= function fetchLater(url, init = {}) {
  let timeoutHandle;
  let activated = false;

  function sendNow() {
    if (!(init.signal && init.signal.aborted)) {
      // Use fetch keepalive if the browser supports it or if custom fetch
      // parameters are specified (e.g. custom headers or methods).
      // Otherwise fall back to `navigator.sendBeacon()`.
      if (
        'keepalive' in Request.prototype ||
        init.method !== 'POST' ||
        init.headers
      ) {
        fetch(url, Object.assign({}, init, {keepalive: true}));
        activated = true;
      } else {
        activated = navigator.sendBeacon(url, init.body);
      }
    }
    destroy();
  }

  function destroy() {
    document.removeEventListener('visibilitychange', sendNow);
    clearTimeout(timeoutHandle);
  }

  if (document.visibilityState === 'hidden') {
    // If the beacon was created while the page is already hidden, send data
    // ASAP but wait until the next microtask to allow all sync code to run.
    queueMicrotask(sendNow);
  } else {
    document.addEventListener('visibilitychange', sendNow);

    if (typeof init.activateAfter === 'number' && init.activateAfter >= 0) {
      timeoutHandle = setTimeout(sendNow, init.activateAfter);
    }
  }

  if (init.signal) {
    init.signal.addEventListener('abort', destroy);
  }

  return {
    get activated() {
      return activated;
    },
  };
};
```
