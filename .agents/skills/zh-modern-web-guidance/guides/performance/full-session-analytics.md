<a id="reliably-measure-full-session-analytics-and-telemetry"></a>

# 可靠测量完整会话的分析与遥测数据

要可靠跟踪覆盖用户整次网页访问、而不只是截至页面加载时的分析、Core Web Vitals 和遥测数据，应使用 `fetchLater()` API。

在无需服务器响应、且发送时机并不紧急的情况下，`fetchLater()` API 是向服务器发送数据最可靠的方式，适用于用户分析、遥测、错误跟踪以及 Core Web Vitals 等性能指标。

在 `unload` 事件监听器中创建 `<img>` 像素之类的旧技巧非常不可靠，移动端尤其如此，还可能让页面无法进入 bfcache，进而损害性能。

<a id="how-to-implement"></a>

## 如何实现

1. **安排请求**：一旦相关数据可用，就调用 `fetchLater()` 并传入数据载荷，将其排入稍后发送的队列。

2. **按需更新载荷**：如果用户产生了更多数据，或状态发生变化，取消此前安排的请求，再次调用 `fetchLater()`，传入完整更新后的快照。

3. **其余交给浏览器处理**：当用户离开页面或关闭标签页时，浏览器会可靠地发送最近一次 `fetchLater()` 调用的载荷。

<a id="example-code"></a>

## 示例代码

下面的代码测量用户访问页面的会话时长，每隔 10 秒使用 `fetchLater()` 将包含更新后会话时长的新信标加入队列。

```javascript
const ANALYTICS_ENDPOINT = '/path/to/analytics/endpoint';

const sessionData = {
  duration: 0,
  id: crypto.randomUUID(),
};

let fetchLaterController = null;

function queueBeacon() {
  // Abort any pending beacons before creating a new one.
  if (fetchLaterController) {
    fetchLaterController.abort();
  }
  fetchLaterController = new AbortController();

  // Update session duration to the current page time.
  sessionData.duration = performance.now();

  // Schedule a fetch for the data payload to be sent later.
  // IMPORTANT: wrap the call in a try/catch to handle quota errors.
  try {
    fetchLater(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(sessionData),
      signal: fetchLaterController.signal,
    });
  } catch (error) {
    // Handle errors as needed.
  }
}

// Update the session data and queue a new beacon every 10 seconds.
setInterval(queueBeacon, 10000);
```

<a id="best-practices"></a>

## 最佳实践

- **应当**在无需响应、且无需立即发送数据的任何场景中，使用 `fetchLater()` 向服务器发送数据。
- **应当**在用户离开页面前数据可能还要更新时，使用 `AbortController` 取消等待中的 fetch。
- **应当**尽量减小载荷，避免超过配额，目前每个源约为 64KB。
- **应当**使用 `try/catch` 包裹 `fetchLater()` 调用，处理配额错误。
- **应当**检测 `globalThis` 上是否存在 `fetchLater()`，并为不支持该 API 的浏览器实现回退策略。
- **不要**使用 `ReadableStream` 对象作为请求体，否则会报错。

<a id="browser-support-and-fallback-strategies"></a>

## 浏览器支持与回退策略

fetchLater 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 135（2025 年 4 月）和 Edge 135（2025 年 4 月）。
不支持的浏览器：Firefox 和 Safari。

如果 `fetchLater()` 不符合你的 Baseline 目标，就需要回退策略。不过，考虑到该 API 带来的可靠性与性能收益，浏览器支持时应当使用 `fetchLater()`。

建议使用下面的 polyfill 作为回退，它在内部通过带 `keepalive` 的 `fetch()` 或 `navigator.sendBeacon()` 处理不支持的浏览器。你自己的代码**必须**直接调用 `fetchLater()`，绝不要自行调用 `fetch()`、`sendBeacon()` 或其他信标 API。

<a id="fetchlater-polyfill"></a>

### `fetchLater()` polyfill

使用下面这个精简的 `fetchLater()` polyfill，在不支持的浏览器中尽可能贴近原 API 实现。

这个 polyfill 唯一显著的行为差异是：它使用 `visibilitychange` 检测用户离开，而不依赖浏览器原生的卸载处理。这是内部实现细节，你的代码无需监听 `visibilitychange` 或其他页面生命周期事件；只需调用 `fetchLater()`，polyfill 会处理发送。

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
